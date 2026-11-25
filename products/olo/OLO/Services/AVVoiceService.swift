import AVFoundation
import Speech

@MainActor
protocol VoicePermissions {
    func request() async -> VoiceAuthorization
}

@MainActor
final class SystemVoicePermissions: VoicePermissions {
    // Coalesce Settings and Home requests into one system authorization flow.
    private var pending: Task<VoiceAuthorization, Never>?

    func request() async -> VoiceAuthorization {
        if let pending { return await pending.value }
        let task = Task { await Self.authorize() }
        pending = task
        let result = await task.value
        pending = nil
        return result
    }

    private static func authorize() async -> VoiceAuthorization {
        await AVAudioApplication.requestRecordPermission() ? .granted : .denied
    }
}

@MainActor
protocol VoiceCapture {
    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error>
    func stop() async
    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?)
}

/// Each start owns a unique token and capture. Old completions cannot stop a new session.
@MainActor
final class AVVoiceService: VoiceService {
    private let permissions: any VoicePermissions
    private let makeCapture: @MainActor () -> any VoiceCapture
    private var sessionID: UUID?
    private var capture: (any VoiceCapture)?
    private var timeout: Task<Void, Never>?
    private var levelHandler: (@Sendable (Float) -> Void)?

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        levelHandler = handler
        capture?.setLevelHandler(handler)
    }

    init(permissions: any VoicePermissions = SystemVoicePermissions(),
         makeCapture: @escaping @MainActor () -> any VoiceCapture = { SystemVoiceCapture() }) {
        self.permissions = permissions
        self.makeCapture = makeCapture
    }

    func isAvailable() async -> Bool {
        await SpeechTranscriber.supportedLocale(equivalentTo: .current) != nil
    }

    func requestAuthorization() async -> VoiceAuthorization { await permissions.request() }

    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error> {
        guard sessionID == nil else { throw VoiceError.alreadyListening }
        let id = UUID()
        sessionID = id
        do {
            let authorization = await permissions.request()
            try Task.checkCancellation()
            guard sessionID == id else { throw CancellationError() }
            guard authorization == .granted else { throw VoiceError.unauthorized }
            let newCapture = makeCapture()
            capture = newCapture
            newCapture.setLevelHandler(levelHandler)
            let source = try await newCapture.start()
            guard sessionID == id else {
                // Stop may have run while activation was suspended.
                await newCapture.stop()
                throw CancellationError()
            }
            try Task.checkCancellation()
            let (stream, continuation) = AsyncThrowingStream<VoiceTranscript, Error>.makeStream()
            let relay = Task { [weak self] in
                do {
                    for try await value in source {
                        try Task.checkCancellation()
                        continuation.yield(value)
                        if value.isFinal { break }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
                await self?.stop(id: id)
            }
            continuation.onTermination = { @Sendable [weak self] _ in
                relay.cancel()
                Task { @MainActor in await self?.stop(id: id) }
            }
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                continuation.finish(throwing: VoiceError.timeout)
                await self?.stop(id: id)
            }
            return stream
        } catch {
            await stop(id: id)
            throw error
        }
    }

    func stop() async {
        if let sessionID { await stop(id: sessionID) }
    }

    private func stop(id: UUID) async {
        guard sessionID == id else { return }
        sessionID = nil
        timeout?.cancel()
        timeout = nil
        let oldCapture = capture
        capture = nil
        await oldCapture?.stop()
    }
}

/// Session-local input bridge; the tap owns a copy before crossing the async boundary.
private final class AnalyzerAudioBridge: @unchecked Sendable {
    private let continuation: AsyncStream<AnalyzerInput>.Continuation
    private let converter: AVAudioConverter?
    private let outputFormat: AVAudioFormat
    private let lock = NSLock()
    private var levelHandler: (@Sendable (Float) -> Void)?

    init(_ continuation: AsyncStream<AnalyzerInput>.Continuation, inputFormat: AVAudioFormat, outputFormat: AVAudioFormat) throws {
        self.continuation = continuation
        self.outputFormat = outputFormat
        if inputFormat == outputFormat { converter = nil }
        else {
            guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
                throw VoiceError.audioEngineFailed("无法转换语音输入格式")
            }
            self.converter = converter
        }
    }

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        lock.lock(); levelHandler = handler; lock.unlock()
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return }
        copy.frameLength = buffer.frameLength
        let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        let destination = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        for (src, dst) in zip(source, destination) {
            if let from = src.mData, let to = dst.mData {
                memcpy(to, from, Int(min(src.mDataByteSize, dst.mDataByteSize)))
            }
        }
        if let converter {
            let capacity = AVAudioFrameCount(ceil(Double(copy.frameLength) * outputFormat.sampleRate / copy.format.sampleRate)) + 32
            guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            let status = converter.convert(to: converted, error: &error) { _, inputStatus in
                if supplied { inputStatus.pointee = .noDataNow; return nil }
                supplied = true
                inputStatus.pointee = .haveData
                return copy
            }
            if status != .error && converted.frameLength > 0 {
                continuation.yield(AnalyzerInput(buffer: converted))
            }
        } else {
            continuation.yield(AnalyzerInput(buffer: copy))
        }
        lock.lock(); let handler = levelHandler; lock.unlock()
        guard let handler, let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return }
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += channels[0][index] * channels[0][index] }
        handler(min(1, sqrt(sum / Float(count)) * 8))
    }

    func close() { continuation.finish() }
}

private nonisolated func analyzerTap(_ bridge: AnalyzerAudioBridge) -> AVAudioNodeTapBlock {
    { @Sendable buffer, _ in bridge.append(buffer) }
}

@MainActor
private final class SystemVoiceCapture: VoiceCapture {
    private var engine: AVAudioEngine?
    private var analyzer: SpeechAnalyzer?
    private var bridge: AnalyzerAudioBridge?
    private var analysisTask: Task<Void, Never>?
    private var resultsTask: Task<Void, Never>?
    private var tapInstalled = false
    private var sessionActive = false
    private var observers: [NSObjectProtocol] = []
    private var levelHandler: (@Sendable (Float) -> Void)?

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        levelHandler = handler
        bridge?.setLevelHandler(handler)
    }

    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error> {
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: .current) else {
            throw VoiceError.unavailable("当前语言的端侧语音识别不可用")
        }
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let detector = SpeechDetector()
        let modules: [any SpeechModule] = [detector, transcriber]
        if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
            try await request.downloadAndInstall()
        }
        try Task.checkCancellation()
        let analyzer = SpeechAnalyzer(modules: modules)
        self.analyzer = analyzer
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement)
            try await session.activate()
            sessionActive = true
            try Task.checkCancellation()
            let engine = AVAudioEngine()
            self.engine = engine
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw VoiceError.audioEngineFailed("没有可用的麦克风输入")
            }
            guard let analysisFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules, considering: format) else {
                throw VoiceError.audioEngineFailed("没有可用的语音分析格式")
            }
            try await analyzer.prepareToAnalyze(in: analysisFormat)
            try Task.checkCancellation()
            let (audio, audioContinuation) = AsyncStream<AnalyzerInput>.makeStream()
            let (stream, continuation) = AsyncThrowingStream<VoiceTranscript, Error>.makeStream()
            let bridge = try AnalyzerAudioBridge(audioContinuation, inputFormat: format, outputFormat: analysisFormat)
            self.bridge = bridge
            bridge.setLevelHandler(levelHandler)
            resultsTask = Task {
                do {
                    var committed = ""
                    for try await result in transcriber.results {
                        let text = String(result.text.characters)
                        let combined = committed + text
                        continuation.yield(VoiceTranscript(text: combined, isFinal: result.isFinal))
                        if result.isFinal { committed = combined }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            analysisTask = Task {
                do {
                    try await analyzer.start(inputSequence: audio)
                } catch { continuation.finish(throwing: error) }
            }
            input.installTap(onBus: 0, bufferSize: 1024, format: format, block: analyzerTap(bridge))
            tapInstalled = true
            for name in [AVAudioSession.interruptionNotification, AVAudioSession.mediaServicesWereResetNotification] {
                observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { @Sendable _ in
                    continuation.finish(throwing: VoiceError.interrupted)
                })
            }
            engine.prepare()
            try engine.start()
            return stream
        } catch {
            await stop()
            throw error
        }
    }

    func stop() async {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        engine?.stop()
        if tapInstalled { engine?.inputNode.removeTap(onBus: 0) }
        tapInstalled = false
        bridge?.close()
        analysisTask?.cancel()
        resultsTask?.cancel()
        await analyzer?.cancelAndFinishNow()
        bridge = nil
        analysisTask = nil
        resultsTask = nil
        analyzer = nil
        engine = nil
        if sessionActive {
            do { try await AVAudioSession.sharedInstance().deactivate(options: .notifyOthersOnDeactivation) }
            catch { NSLog("OLO audio session deactivation failed: %@", error.localizedDescription) }
        }
        sessionActive = false
    }
}
