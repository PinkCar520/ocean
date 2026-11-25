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
    func finish() async
    func setAutomaticEndpointing(_ enabled: Bool)
    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error>
    func stop() async
    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?)
}

extension VoiceCapture {
    func finish() async { await stop() }
    func setAutomaticEndpointing(_ enabled: Bool) {}
}

/// Each start owns a unique token and capture. Old completions cannot stop a new session.
@MainActor
final class AVVoiceService: VoiceService {
    private let permissions: any VoicePermissions
    private let makeCapture: @MainActor () -> any VoiceCapture
    private var automaticEndpointing = true
    func setAutomaticEndpointing(_ enabled: Bool) {
        automaticEndpointing = enabled
        capture?.setAutomaticEndpointing(enabled)
    }
    private var sessionID: UUID?
    private var captureReady = false
    private var finishRequested = false
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
        captureReady = false
        finishRequested = false
        do {
            let authorization = await permissions.request()
            try Task.checkCancellation()
            guard sessionID == id else { throw CancellationError() }
            guard authorization == .granted else { throw VoiceError.unauthorized }
            let newCapture = makeCapture()
            capture = newCapture
            newCapture.setLevelHandler(levelHandler)
            newCapture.setAutomaticEndpointing(automaticEndpointing)
            let source = try await newCapture.start()
            guard sessionID == id else {
                // Stop may have run while activation was suspended.
                await newCapture.stop()
                throw CancellationError()
            }
            try Task.checkCancellation()
            captureReady = true
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
            if finishRequested {
                Task { [weak self] in
                    guard let self, self.sessionID == id else { return }
                    await self.finish()
                }
            }
            return stream
        } catch {
            await stop(id: id)
            throw error
        }
    }

    func finish() async {
        guard sessionID != nil else { return }
        finishRequested = true
        guard captureReady else { return }
        await capture?.finish()
    }

    func stop() async {
        if let sessionID { await stop(id: sessionID) }
    }

    private func stop(id: UUID) async {
        guard sessionID == id else { return }
        sessionID = nil
        captureReady = false
        finishRequested = false
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
    private let onError: @Sendable (Error) -> Void
    private var closed = false
    private let lock = NSLock()
    private var levelHandler: (@Sendable (Float) -> Void)?

    init(_ continuation: AsyncStream<AnalyzerInput>.Continuation, inputFormat: AVAudioFormat, outputFormat: AVAudioFormat, onError: @escaping @Sendable (Error) -> Void) {
        self.continuation = continuation
        self.outputFormat = outputFormat
        self.converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        self.onError = onError
    }

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        lock.lock(); levelHandler = handler; lock.unlock()
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        guard !closed else { lock.unlock(); return }
        if let converter {
            let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * outputFormat.sampleRate / buffer.format.sampleRate)) + 256
            guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
                lock.unlock()
                onError(VoiceError.audioEngineFailed("无法分配语音分析缓冲区"))
                return
            }
            var supplied = false
            var error: NSError?
            let status = converter.convert(to: converted, error: &error) { _, inputStatus in
                if supplied { inputStatus.pointee = .noDataNow; return nil }
                supplied = true
                inputStatus.pointee = .haveData
                return buffer
            }
            if let error {
                closed = true
                continuation.finish()
                lock.unlock()
                onError(error)
                return
            }
            if status == .error {
                closed = true
                continuation.finish()
                lock.unlock()
                onError(VoiceError.audioEngineFailed("语音输入格式转换失败"))
                return
            }
            if converted.frameLength > 0 {
                continuation.yield(AnalyzerInput(buffer: converted))
            }
        } else {
            continuation.yield(AnalyzerInput(buffer: buffer))
        }
        let handler = levelHandler
        lock.unlock()
        guard let handler, let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return }
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += channels[0][index] * channels[0][index] }
        handler(min(1, sqrt(sum / Float(count)) * 8))
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        guard !closed else { return }
        closed = true
        continuation.finish()
    }
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
    private var endpointTask: Task<Void, Never>?
    private var finishing = false
    private var automaticEndpointing = true
    func setAutomaticEndpointing(_ enabled: Bool) {
        automaticEndpointing = enabled
        if !enabled { endpointTask?.cancel(); endpointTask = nil }
    }
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
            try session.setActive(true)
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
            let bridge = AnalyzerAudioBridge(audioContinuation, inputFormat: format, outputFormat: analysisFormat) { error in
                continuation.finish(throwing: error)
            }
            self.bridge = bridge
            bridge.setLevelHandler(levelHandler)
            resultsTask = Task { [weak self] in
                do {
                    var committed = ""
                    for try await result in transcriber.results {
                        let text = String(result.text.characters)
                        let combined = committed + text
                        continuation.yield(VoiceTranscript(text: combined, isFinal: false))
                        if result.isFinal { committed = combined }
                        self?.scheduleEndpoint()
                    }
                    if !committed.isEmpty { continuation.yield(VoiceTranscript(text: committed, isFinal: true)) }
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

    private func scheduleEndpoint() {
        guard automaticEndpointing, !finishing else { return }
        endpointTask?.cancel()
        endpointTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(1500)) } catch { return }
            await self?.finish()
        }
    }

    func finish() async {
        guard !finishing else { return }
        finishing = true
        endpointTask?.cancel()
        endpointTask = nil
        engine?.stop()
        if tapInstalled { engine?.inputNode.removeTap(onBus: 0) }
        tapInstalled = false
        bridge?.close()
        do {
            try await analyzer?.finalizeAndFinishThroughEndOfInput()
        } catch {
            await analyzer?.cancelAndFinishNow()
        }
    }

    func stop() async {
        endpointTask?.cancel()
        endpointTask = nil
        finishing = true
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
            do { try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
            catch { NSLog("OLO audio session deactivation failed: %@", error.localizedDescription) }
        }
        sessionActive = false
    }
}
