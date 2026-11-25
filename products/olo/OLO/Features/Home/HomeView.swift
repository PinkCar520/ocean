import SwiftUI
import SwiftData
import AVFoundation
import CoreMotion

/// OLO Home — the entry page of the iPhone body.
///
/// NOT a chat UI. The page is built around the OLO entity first; conversation
/// and controls come second. Gesture model matches the OLO One physical
/// prototype exactly: tap starts a conversation, long press wakes the agent,
/// long press uses push-to-talk; Privacy is the explicit software equivalent
/// of physically flipping OLO One over.
struct HomeView: View {
    @Environment(OLOCenter.self) private var center

    @State private var speech = OLOSpeechResponder()
    @State private var motionManager = CMMotionManager()
    @State private var faceDownSince: Date?
    @State private var systemVoiceLaunch = OLOVoiceLaunch.shared
    @State private var microphoneLevel: Float = 0
    @State private var isSpeaking = false
    @State private var voiceMode = false
    @State private var lastSpokenStatus: AgentTaskStatus?
    @State private var lastSpokenTaskID: UUID?
    @State private var showingAgentSheet = false
    @State private var showingTextInput = false
    @State private var showingWakePlanner = false
    @State private var showingSettings = false
    @State private var typedInput = ""
    @State private var toastText = ""
    @State private var toastShown = false
    @State private var listenTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase
    // Single tap is immediate; long press is a separate 350 ms gesture.
    @State private var pressActivated = false
    @State private var suppressNextTap = false
    @State private var pushToTalk = false
    @State private var capturedSpeech = ""
    @State private var listenGeneration = UUID()

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    entityStage(height: min(460, max(180, geometry.size.height)))
                        .frame(maxWidth: 520)
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: geometry.size.height, alignment: .center)
                .padding(.horizontal, 18)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .scrollIndicators(.hidden)
        // Render the profile entry directly in the Voice surface. A toolbar
        // attached inside TabView's outer NavigationStack is not reliable.
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 27, weight: .regular))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Profile and settings")
                .accessibilityIdentifier("olo.voice.settings")
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView()
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button {
                                showingSettings = false
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(.primary)
                                    .frame(width: 32, height: 32)
                            }
                            .accessibilityLabel("关闭")
                            .accessibilityIdentifier("olo.settings.dismiss")
                        }
                    }
            }
            .presentationDetents([.fraction(0.7)])
            .presentationDragIndicator(.visible)
        }
        .overlay(alignment: .top) {
            OLOToast(text: toastText, isShown: $toastShown)
                .padding(.top, 8)
                .allowsHitTesting(false)
        }
        .onAppear { handleSystemVoiceLaunch(); startFaceDownMonitoring() }
        .onChange(of: systemVoiceLaunch.requestID) { _, _ in
            handleSystemVoiceLaunch()
        }
        .onChange(of: center.voiceService != nil) { _, ready in
            if ready { handleSystemVoiceLaunch() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { startFaceDownMonitoring() }
            else { stopFaceDownMonitoring(); if phase == .background { standby() } }
        }
        .onChange(of: center.privacyMode) { _, enabled in
            if enabled { speech.stop(); standby(); center.state = .privacy }
            else if center.state == .privacy { center.state = .idle }
        }
        .onDisappear {
            stopFaceDownMonitoring()
            center.voiceService?.setLevelHandler(nil)
            microphoneLevel = 0
            voiceMode = false
            speech.stop()
            listenGeneration = UUID()
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

    @MainActor
    private func handleSystemVoiceLaunch() {
        // An App Intent may arrive before RootShell has installed the voice
        // service during a cold launch. Keep the one-shot request pending until
        // the service is actually ready; do not guess readiness with a timer.
        guard center.voiceService != nil else { return }
        if center.pendingFirstConversation {
            guard !center.privacyMode else { return }
            center.pendingFirstConversation = false
            startConversation()
            return
        }
        guard systemVoiceLaunch.consume() else { return }
        startConversation()
    }

    @MainActor
    private func startFaceDownMonitoring() {
        guard scenePhase == .active, motionManager.isDeviceMotionAvailable,
              !motionManager.isDeviceMotionActive else { return }
        faceDownSince = nil
        motionManager.deviceMotionUpdateInterval = 0.1
        motionManager.startDeviceMotionUpdates(to: .main) { motion, error in
            guard error == nil, let motion else { return }
            Task { @MainActor in
                guard scenePhase == .active else { return }
                let gravity = motion.gravity
                let faceDown = gravity.z > 0.85
                    && abs(gravity.x) < 0.45 && abs(gravity.y) < 0.45
                guard faceDown else { faceDownSince = nil; return }
                if faceDownSince == nil { faceDownSince = .now }
                guard !center.privacyMode, let since = faceDownSince,
                      Date().timeIntervalSince(since) >= 0.8 else { return }
                center.privacyMode = true
                faceDownSince = nil
                showToast("已翻转进入隐私模式 · 请在设置中手动关闭")
            }
        }
    }

    @MainActor
    private func stopFaceDownMonitoring() {
        motionManager.stopDeviceMotionUpdates()
        faceDownSince = nil
    }

    // MARK: - Sections

    private func entityStage(height: CGFloat) -> some View {
        ZStack {
            VStack(spacing: 18) {
                OLOEntityView(audioLevel: microphoneLevel, isResponding: isSpeaking)
                    .frame(maxHeight: max(100, height - 76))
                    .scaleEffect(min(1, max(0.4, (height - 76) / 320)))
                stateLabel
            }
            .animation(.easeInOut(duration: 0.25), value: voiceMode)
        }
        .frame(height: height)
        .accessibilityIdentifier("olo.entity")
        .contentShape(Rectangle())
        .onTapGesture {
            guard !suppressNextTap else {
                suppressNextTap = false
                return
            }
            startConversation()
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.35, maximumDistance: 20)
                .onEnded { _ in
                    pressActivated = true
                    suppressNextTap = true
                    startConversation(pushToTalk: true)
                }
                .sequenced(before: DragGesture(minimumDistance: 0))
                .onEnded { _ in
                    if pressActivated {
                        pressActivated = false
                        finishListening()
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(120))
                            suppressNextTap = false
                        }
                    }
                }
        )
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
        return AttributedString(stateName, attributes: bold)
    }

    // MARK: - Gesture dispatch

    /// Tap starts native voice capture; a second tap finalizes the utterance.
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
            voiceMode = false
            pushToTalk = false
            center.voiceService?.setLevelHandler(nil)
            showToast("语音服务暂不可用")
            return
        }
        withAnimation { center.state = .needYou }
        showToast("正在检查语音权限")
        center.liveTranscript = ""
        listenTask = Task {
            do {
                voice.setAutomaticEndpointing(!mode)
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
                showToast("需要麦克风权限")
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

    @MainActor
    private func finishListening() {
        guard center.state == .listening || center.state == .needYou else { return }
        center.voiceService?.setLevelHandler(nil)
        microphoneLevel = 0
        pushToTalk = false
        withAnimation { center.state = .thinking }
        Task {
            await center.voiceService?.finish()
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
        pressActivated = false
        suppressNextTap = false
        pushToTalk = false
        capturedSpeech = ""
        listenGeneration = UUID()
        listenTask?.cancel(); listenTask = nil
        Task { await center.voiceService?.stop() }
        center.liveTranscript = ""
        showingAgentSheet = false
        withAnimation { center.state = center.privacyMode ? .privacy : .idle }
        if !center.privacyMode { showToast("已回到待机") }
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
final class OLOSpeechResponder {
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var delegate: SpeechCompletionDelegate?
    @ObservationIgnored private var generation: UUID?

    func say(_ message: String, voiceChoice: FirstEncounterSession.VoiceChoice? = nil, onFinish: @escaping @MainActor () -> Void) {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        stop()
        let generation = UUID()
        self.generation = generation
        let completion = SpeechCompletionDelegate { [weak self] in
            guard let self, self.generation == generation else { return }
            self.generation = nil
            self.delegate = nil
            onFinish()
        }
        delegate = completion
        synthesizer.delegate = completion
        let utterance = AVSpeechUtterance(string: text)
        let preference = voiceChoice ?? UserDefaults.standard.string(forKey: "olo.encounter.voice.v1").flatMap(FirstEncounterSession.VoiceChoice.init(rawValue:))
        let gender: AVSpeechSynthesisVoiceGender? = preference.map { $0 == .masculine ? .male : .female }
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "zh-CN" }
        let key = "olo.voice.identifier.v1." + (preference?.rawValue ?? "default")
        let candidates = voices.filter { gender == nil || $0.gender == gender }
        let ranked = (candidates.isEmpty ? voices : candidates).sorted {
            if $0.quality.rawValue != $1.quality.rawValue {
                return $0.quality.rawValue > $1.quality.rawValue
            }
            return $0.identifier < $1.identifier
        }
        let stored = UserDefaults.standard.string(forKey: key)
        let selected = ranked.first { $0.identifier == stored } ?? ranked.first
        utterance.voice = selected ?? AVSpeechSynthesisVoice(language: "zh-CN")
        if let selected { UserDefaults.standard.set(selected.identifier, forKey: key) }
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }

    func stop() {
        generation = nil
        synthesizer.delegate = nil
        delegate = nil
        synthesizer.stopSpeaking(at: .immediate)
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
