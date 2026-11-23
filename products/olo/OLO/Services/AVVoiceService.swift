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
        guard await AVAudioApplication.requestRecordPermission() else { return .denied }
        let status: SFSpeechRecognizerAuthorizationStatus
        if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            status = await speechPermission()
        } else {
            status = SFSpeechRecognizer.authorizationStatus()
        }
        switch status {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }
}

private nonisolated func speechPermission() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { @Sendable status in
            continuation.resume(returning: status)
        }
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
        SFSpeechRecognizer(locale: .current)?.isAvailable ?? false
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
            try Task.checkCancellation()
            guard sessionID == id else { throw CancellationError() }
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
                self?.stop(id: id)
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

/// Session-local callback bridge. The lock serializes append/endAudio and close.
/// No callback touches the MainActor capture or a later session's bridge.
private final class AudioBridge: @unchecked Sendable {
    private let lock = NSLock()
    private let request: SFSpeechAudioBufferRecognitionRequest
    private let continuation: AsyncThrowingStream<VoiceTranscript, Error>.Continuation
    private var closed = false
    private var levelHandler: (@Sendable (Float) -> Void)?

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        lock.lock(); levelHandler = handler; lock.unlock()
    }

    init(request: SFSpeechAudioBufferRecognitionRequest,
         continuation: AsyncThrowingStream<VoiceTranscript, Error>.Continuation) {
        self.request = request
        self.continuation = continuation
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        guard !closed else { lock.unlock(); return }
        request.append(buffer)
        let handler = levelHandler
        lock.unlock()
        guard let handler, let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return }
        let samples = channels[0]
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += samples[index] * samples[index] }
        let rms = sqrt(sum / Float(count))
        handler(min(1, rms * 8))
    }

    func receive(_ result: SFSpeechRecognitionResult?, error: Error?) {
        lock.lock()
        let active = !closed
        lock.unlock()
        guard active else { return }
        if let error {
            continuation.finish(throwing: VoiceError.recognitionFailed(error.localizedDescription))
        } else if let result {
            continuation.yield(VoiceTranscript(text: result.bestTranscription.formattedString,
                                                isFinal: result.isFinal))
            if result.isFinal { continuation.finish() }
        }
    }

    func close() {
        lock.lock()
        guard !closed else { lock.unlock(); return }
        closed = true
        request.endAudio()
        lock.unlock()
        continuation.finish()
    }
}

private nonisolated func audioTap(_ bridge: AudioBridge) -> AVAudioNodeTapBlock {
    { @Sendable buffer, _ in bridge.append(buffer) }
}

private nonisolated func recognitionHandler(_ bridge: AudioBridge)
    -> @Sendable (SFSpeechRecognitionResult?, Error?) -> Void {
    { result, error in bridge.receive(result, error: error) }
}

@MainActor
private final class SystemVoiceCapture: VoiceCapture {
    private var engine: AVAudioEngine?
    private var task: SFSpeechRecognitionTask?
    private var bridge: AudioBridge?
    private var tapInstalled = false
    private var sessionActive = false
    private var observers: [NSObjectProtocol] = []
    private var levelHandler: (@Sendable (Float) -> Void)?

    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {
        levelHandler = handler
        bridge?.setLevelHandler(handler)
    }

    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error> {
        guard let recognizer = SFSpeechRecognizer(locale: .current), recognizer.isAvailable else {
            throw VoiceError.unavailable("当前语言的语音识别不可用")
        }
        guard recognizer.supportsOnDeviceRecognition else {
            throw VoiceError.unavailable("当前设备或语言不支持本地语音识别")
        }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement)
            let activated = try await session.activate()
            guard activated else { throw VoiceError.audioEngineFailed("无法激活音频会话") }
            sessionActive = true
            try Task.checkCancellation()
            let engine = AVAudioEngine()
            self.engine = engine
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw VoiceError.audioEngineFailed("没有可用的麦克风输入")
            }
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = true
            let (stream, continuation) = AsyncThrowingStream<VoiceTranscript, Error>.makeStream()
            let bridge = AudioBridge(request: request, continuation: continuation)
            self.bridge = bridge
            bridge.setLevelHandler(levelHandler)
            task = recognizer.recognitionTask(with: request, resultHandler: recognitionHandler(bridge))
            input.installTap(onBus: 0, bufferSize: 1024, format: format, block: audioTap(bridge))
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
        task?.cancel()
        bridge = nil
        task = nil
        engine = nil
        if sessionActive {
            do { _ = try await AVAudioSession.sharedInstance().deactivate() }
            catch { NSLog("OLO audio session deactivation failed: %@", error.localizedDescription) }
        }
        sessionActive = false
    }
}
