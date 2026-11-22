import SwiftUI
import SwiftData
import AVFoundation

/// OLO Home — the entry page of the iPhone body.
///
/// NOT a chat UI. The page is built around the OLO entity first; conversation
/// and controls come second. Gesture model matches the OLO One physical
/// prototype exactly: tap starts a conversation, long press wakes the agent,
/// double-tap returns to standby; Privacy is the explicit software equivalent
/// of physically flipping OLO One over.
struct HomeView: View {
    @Environment(OLOCenter.self) private var center

    @State private var speech = OLOSpeechResponder()
    @State private var microphoneLevel: Float = 0
    @State private var isSpeaking = false
    @State private var voiceMode = false
    @State private var lastSpokenStatus: AgentTaskStatus?
    @State private var lastSpokenTaskID: UUID?
    @State private var showingAgentSheet = false
    @State private var showingTextInput = false
    @State private var showingWakePlanner = false
    @State private var typedInput = ""
    @State private var toastText = ""
    @State private var toastShown = false
    @State private var listenTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase
    // tap vs double-tap disambiguation — 350 ms matches the prototype
    @State private var tapCount = 0
    @State private var tapDebounce: Task<Void, Never>?
    // long-press tracking
    @State private var longPressFired = false
    @State private var pressStartedAt: Date?
    @State private var pressActivated = false
    @State private var pressActivationTask: Task<Void, Never>?
    @State private var pushToTalk = false
    @State private var capturedSpeech = ""
    @State private var listenGeneration = UUID()

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    entityStage
                        .frame(maxWidth: 520)
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: geometry.size.height, alignment: .center)
                .padding(.horizontal, 18)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .scrollIndicators(.hidden)
        .overlay(alignment: .top) {
            OLOToast(text: toastText, isShown: $toastShown)
                .padding(.top, 8)
                .allowsHitTesting(false)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { standby() }
        }
        .onChange(of: center.privacyMode) { _, enabled in
            if enabled { speech.stop(); standby() }
        }
        .onDisappear {
            center.voiceService?.setLevelHandler(nil)
            microphoneLevel = 0
            voiceMode = false
            speech.stop()
            pressActivationTask?.cancel()
            listenGeneration = UUID()
            tapDebounce?.cancel()
            listenTask?.cancel()
            Task { await center.voiceService?.stop() }
        }
        .onChange(of: center.agentRuntime?.task?.status) { _, status in
            guard let status else { return }
            announceAgentStatus(status)
            switch status {
            case .captured, .understanding, .planning: center.state = .thinking
            case .needsInformation, .waitingForPermission: center.state = .needYou
            case .executing, .verifying: center.state = .acting
            case .completed: center.state = .done
            case .failed, .partial: center.state = .error
            case .cancelled: center.state = .idle
            }
        }
        .sheet(isPresented: $showingAgentSheet, onDismiss: {
            if center.agentRuntime?.isBusy == false { center.agentRuntime?.cancel() }
        }) {
            if let agent = center.agentRuntime {
                ReminderConfirmationView(agent: agent)
            }
        }
        .sheet(isPresented: $showingTextInput) {
            TextInputSheet(
                text: $typedInput,
                onSubmit: submitTypedInput
            )
        }
        .sheet(isPresented: $showingWakePlanner) {
            NavigationStack {
                WakePlannerView(autoLoadCommitment: true)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("关闭") { showingWakePlanner = false }
                        }
                    }
            }
        }
    }

    // MARK: - Sections

    private var entityStage: some View {
        ZStack {
            VStack(spacing: 18) {
                OLOEntityView()
                stateLabel
                if voiceMode && !center.privacyMode {
                    voiceWaveform
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: voiceMode)
        }
        .frame(height: 460)
        .accessibilityIdentifier("olo.entity")
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in beginPressIfNeeded() }
                .onEnded { _ in endPress() }
        )
        .highPriorityGesture(
            TapGesture(count: 2)
                .onEnded {
                    tapDebounce?.cancel()
                    tapCount = 0
                    standby()
                }
        )
        .highPriorityGesture(
            TapGesture(count: 1)
                .onEnded { enqueueSingleTap() }
        )
    }

    private var voiceWaveform: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 4) {
                ForEach(0..<27, id: \.self) { index in
                    let phase = abs(sin(Double(index) * 0.73))
                    let amplitude = center.state == .listening
                        ? Double(microphoneLevel)
                        : (isSpeaking ? 0.36 : 0.08)
                    Capsule()
                        .fill(Color.primary.opacity(0.35 + phase * 0.5))
                        .frame(width: 3, height: 5 + 35 * amplitude * (0.25 + phase * 0.75))
                }
            }
            .frame(height: 45)
            .animation(.easeOut(duration: 0.12), value: microphoneLevel)
            Text(isSpeaking ? "正在回应" : center.state == .listening ? "正在聆听 · 点击结束" :
                 center.state == .thinking ? "正在思考" : "点击 OLO 继续对话")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("olo.voice.waveform")
    }

    private var stateLabel: some View {
        VStack(spacing: 6) {
            Text(labelText)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            // Live partial transcript from the voice service. Shown only
            // while OLO is listening / thinking, so the user sees what OLO
            // heard in real time — matches 1.html's live caption behaviour.
            if !center.liveTranscript.isEmpty
                && (center.state == .listening || center.state == .thinking)
            {
                Text("“\(center.liveTranscript)”")
                    .font(.caption)
                    .foregroundStyle(.primary.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: center.liveTranscript)
    }

    private var labelText: AttributedString {
        let stateName: String = {
            switch center.state {
            case .idle: center.privacyMode ? "隐私模式" : "待命"
            case .listening: "正在听"
            case .thinking: "正在理解"
            case .needYou: "等你决定"
            case .acting: "Agent 已唤醒"
            case .done: "完成"
            case .privacy: "隐私模式"
            case .powerOff: "已关机"
            case .error: "出问题了"
            }
        }()
        if center.privacyMode { return AttributedString(stateName) }
        var bold = AttributeContainer()
        bold.inlinePresentationIntent = .stronglyEmphasized
        var s = AttributedString(stateName, attributes: bold)

        return s
    }

    // MARK: - Gesture dispatch

    /// Disambiguate single- vs double-tap. First tap increments the counter
    /// and waits 350 ms; if a second tap arrives in that window the counter
    /// hits 2 and we cancel the pending single-tap action (the double-tap
    /// gesture already fired independently via highPriorityGesture).
    @MainActor
    private func enqueueSingleTap() {
        guard !longPressFired, !pressActivated else { longPressFired = false; return }
        tapCount += 1
        tapDebounce?.cancel()
        tapDebounce = Task {
            try? await Task.sleep(until: .now + .milliseconds(350), clock: .continuous)
            if Task.isCancelled { return }
            let count = tapCount
            tapCount = 0
            if count == 1 { startConversation() }
        }
    }

    /// Tap — start listening; if already listening, stop and settle.
    /// Falls back to text input when the voice service is not attached
    /// (e.g. running in a context where SFSpeechRecognizer is unavailable)
    /// so the user is never stuck with no way to talk to OLO. Matches
    /// 1.html where the primary input is a text panel.
    @MainActor
    private func startConversation(pushToTalk mode: Bool = false) {
        speech.stop()
        isSpeaking = false
        guard !center.privacyMode else {
            showToast("隐私模式下麦克风已暂停")
            return
        }
        if center.state == .listening || (center.state == .needYou && listenTask != nil) {
            if !mode { finishListening() }
            return
        }
        if isSpeaking { speech.stop(); isSpeaking = false }
        if center.state == .thinking || center.state == .needYou || center.state == .acting {
            // Stop the conversation UI, not a potentially committed external action.
            voiceMode = false
            speech.stop()
            showToast("已停止语音回应；任务状态请在 Activity 查看")
            return
        }
        guard center.state == .idle || center.state == .done || center.state == .error else { return }
        voiceMode = true
        pushToTalk = mode
        capturedSpeech = ""
        let generation = UUID()
        listenGeneration = generation
        center.voiceService?.setLevelHandler { level in
            Task { @MainActor in
                guard listenGeneration == generation else { return }
                microphoneLevel = level
            }
        }
        guard let voice = center.voiceService else {
            showingTextInput = true
            return
        }
        withAnimation { center.state = .needYou }
        showToast("正在检查语音权限")
        center.liveTranscript = ""
        listenTask = Task {
            do {
                let stream = try await voice.start()
                try Task.checkCancellation()
                guard !center.privacyMode, listenGeneration == generation else { await voice.stop(); return }
                withAnimation { center.state = .listening }
                var partial = ""
                for try await transcript in stream {
                    try Task.checkCancellation()
                    partial = transcript.text.isEmpty ? partial : transcript.text
                    capturedSpeech = partial
                    center.liveTranscript = partial
                    if transcript.isFinal && !pushToTalk {
                        await voice.stop()
                        if listenGeneration == generation && !pushToTalk { await finishVoice(partial) }
                        return
                    }
                }
                if listenGeneration == generation && !pushToTalk { await finishVoice(partial) }
            } catch is CancellationError {
                return
            } catch VoiceError.unauthorized {
                guard !Task.isCancelled else { return }
                center.liveTranscript = ""
                withAnimation { center.state = .idle }
                showToast("需要麦克风与语音识别权限")
            } catch VoiceError.unavailable(let message) {
                center.liveTranscript = ""
                withAnimation { center.state = .idle }
                showToast(message)
            } catch VoiceError.alreadyListening {
                await voice.stop()
                center.liveTranscript = ""
                withAnimation { center.state = .idle }
                showToast("语音服务已重置，请再轻触一次")
            } catch VoiceError.audioEngineFailed(let message) {
                center.liveTranscript = ""
                withAnimation { center.state = .idle }
                showToast(message)
            } catch {
                center.liveTranscript = ""
                withAnimation { center.state = .idle }
                showToast("语音出错，请重试")
            }
        }
    }

    /// Press-and-hold to talk. A hold only activates after 600ms.
    @MainActor
    private func beginPressIfNeeded() {
        guard pressStartedAt == nil else { return }
        pressStartedAt = .now
        pressActivated = false
        pressActivationTask?.cancel()
        pressActivationTask = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled, pressStartedAt != nil else { return }
            pressActivated = true
            longPressFired = true
            tapDebounce?.cancel()
            tapCount = 0
            startConversation(pushToTalk: true)
        }
    }

    @MainActor
    private func endPress() {
        pressStartedAt = nil
        pressActivationTask?.cancel()
        pressActivationTask = nil
        guard pressActivated else { return }
        pressActivated = false
        finishListening()
    }

    @MainActor
    private func finishListening() {
        guard center.state == .listening || center.state == .needYou else { return }
        let finalText = capturedSpeech.isEmpty ? center.liveTranscript : capturedSpeech
        listenGeneration = UUID()
        center.voiceService?.setLevelHandler(nil)
        microphoneLevel = 0
        listenTask?.cancel()
        listenTask = nil
        pushToTalk = false
        withAnimation { center.state = .thinking }
        Task {
            await center.voiceService?.stop()
            await finishVoice(finalText)
        }
    }

    @MainActor
    private func finishVoice(_ text: String) async {
        guard !Task.isCancelled, !center.privacyMode else {
            center.liveTranscript = ""
            withAnimation { center.state = .idle }
            return
        }
        withAnimation { center.state = .thinking }
        showToast("正在理解")
        guard !Task.isCancelled, !center.privacyMode else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            center.liveTranscript = ""
            withAnimation { center.state = .idle }
            showToast("没听清，再说一次")
            return
        }
        let request = AgentRequest(
            input: trimmed,
            source: .voice,
            context: ContextSnapshot()
        )
        center.lastVoiceRequest = request
        center.liveTranscript = ""
        // The remote capture path is opt-in and observational. The existing
        // local permission/confirmation flow remains authoritative.
        if let sync = center.controlPlaneSync {
            Task { await sync.captureVoiceTranscript(trimmed, sessionID: request.id) }
        }
        withAnimation { center.state = .idle }
        speak("好的，我来处理。")
        route(request)
    }

    /// Text input submission — mirrors the voice path but with
    /// `source: .text`. Same downstream flow: request is captured in
    /// `center.lastVoiceRequest`, state cycles through thinking → idle,
    /// and the native reminder confirmation sheet opens.
    @MainActor
    private func submitTypedInput() {
        let trimmed = typedInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            showToast("说点什么…")
            return
        }
        showingTextInput = false
        typedInput = ""
        withAnimation { center.state = .thinking }
        showToast("正在理解")
        let request = AgentRequest(input: trimmed, source: .text, context: ContextSnapshot())
        center.lastVoiceRequest = request
        center.state = .idle
        route(request)
    }

    @MainActor
    private func standby() {
        speech.stop()
        isSpeaking = false
        voiceMode = false
        microphoneLevel = 0
        center.voiceService?.setLevelHandler(nil)
        pressActivationTask?.cancel()
        pressActivationTask = nil
        pressStartedAt = nil
        pressActivated = false
        pushToTalk = false
        capturedSpeech = ""
        listenGeneration = UUID()
        tapDebounce?.cancel(); tapCount = 0
        listenTask?.cancel(); listenTask = nil
        Task { await center.voiceService?.stop() }
        center.liveTranscript = ""
        showingAgentSheet = false
        withAnimation { center.state = .idle }
        showToast("已回到待机")
    }

    @MainActor
    private func prepareAgent(_ request: AgentRequest) {
        lastSpokenStatus = nil
        lastSpokenTaskID = request.id
        guard let agent = center.agentRuntime else {
            showToast("任务服务尚未就绪")
            return
        }
        guard !agent.isBusy else { showToast("任务正在处理，请到 Activity 查看"); return }
        withAnimation { center.state = .thinking }
        agent.start(request)
        showingAgentSheet = true
    }

    @MainActor
    private func route(_ request: AgentRequest) {
        if WakeVoiceIntent.matches(request.input) {
            showToast("正在读取日程并准备起床计划")
            showingWakePlanner = true
        } else {
            prepareAgent(request)
        }
    }

    @MainActor
    private func announceAgentStatus(_ status: AgentTaskStatus) {
        guard !center.privacyMode, let task = center.agentRuntime?.task else { return }
        if lastSpokenTaskID != task.id {
            lastSpokenTaskID = task.id
            lastSpokenStatus = nil
        }
        guard lastSpokenStatus != status else { return }
        lastSpokenStatus = status
        switch status {
        case .needsInformation:
            speak(center.agentRuntime?.clarificationQuestion.isEmpty == false
                ? (center.agentRuntime?.clarificationQuestion ?? "")
                : task.summary)
        case .waitingForPermission:
            speak("请确认任务内容与执行权限。")
        case .completed:
            speak(task.summary.isEmpty ? "任务已完成。" : task.summary)
        case .failed:
            speak(task.summary.isEmpty ? "任务执行失败，请查看活动记录。" : task.summary)
        case .partial:
            speak("操作结果尚未核实，请先查看活动记录，不要重复执行。")
        case .cancelled:
            speech.stop()
            isSpeaking = false
        default:
            break
        }
    }

    @MainActor
    private func speak(_ text: String) {
        guard !center.privacyMode else { return }
        voiceMode = true
        isSpeaking = true
        speech.say(text) {
            isSpeaking = false
        }
    }

    @MainActor
    private func showToast(_ text: String) {
        toastText = text
        withAnimation { toastShown = true }
        Task {
            try? await Task.sleep(for: .seconds(1.9))
            withAnimation { toastShown = false }
        }
    }
}

#Preview {
    NavigationStack {
        HomeView()
    }
    .environment(OLOCenter())
}

@MainActor
@Observable
private final class OLOSpeechResponder {
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var delegate: SpeechCompletionDelegate?

    func say(_ message: String, onFinish: @escaping @MainActor () -> Void) {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        synthesizer.stopSpeaking(at: .immediate)
        let completion = SpeechCompletionDelegate(onFinish: onFinish)
        delegate = completion
        synthesizer.delegate = completion
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        synthesizer.delegate = nil
        delegate = nil
    }
}

@MainActor
private final class SpeechCompletionDelegate: NSObject, AVSpeechSynthesizerDelegate {
    let onFinish: @MainActor () -> Void
    init(onFinish: @escaping @MainActor () -> Void) { self.onFinish = onFinish }
    // AVSpeechSynthesizerDelegate is a nonisolated Objective-C protocol.
    // Hop to the main actor before touching SwiftUI-observed state.
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            self?.onFinish()
        }
    }
}
