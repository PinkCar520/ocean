import SwiftUI
import SwiftData

/// OLO Home — the entry page of the iPhone body.
///
/// NOT a chat UI. The page is built around the OLO entity first; conversation
/// and controls come second. Gesture model matches the OLO One physical
/// prototype exactly: tap starts a conversation, long press wakes the agent,
/// double-tap returns to standby; Privacy is the explicit software equivalent
/// of physically flipping OLO One over.
struct HomeView: View {
    @Environment(OLOCenter.self) private var center

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

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                hero
                entityStage
                NavigationLink {
                    WorldView()
                } label: {
                    entryCard(
                        eyebrow: "OLO World",
                        title: "身体，是可调用的。",
                        detail: "OLO One 只是入口。未来它可以把意图交给机器人、汽车和家庭。",
                        icon: "globe"
                    )
                }
                NavigationLink {
                    ActionsView()
                } label: {
                    entryCard(
                        eyebrow: "Actions",
                        title: "最近的事。",
                        detail: "OLO 已经替你做完的，和正在做的。",
                        icon: "checkmark.circle"
                    )
                }
                .accessibilityIdentifier("actions.entry")
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .background(LinearGradient(colors: [Color(white: 0.95), Color(white: 0.87)], startPoint: .top, endPoint: .bottom))
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
            if enabled { standby() }
        }
        .onDisappear {
            tapDebounce?.cancel()
            listenTask?.cancel()
            Task { await center.voiceService?.stop() }
        }
        .onChange(of: center.agentRuntime?.task?.status) { _, status in
            guard let status else { return }
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

    private var hero: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("OLO One · Physical".uppercased())
                .font(.caption2)
                .tracking(1.4)
                .foregroundStyle(.secondary)
            Text("它一直在。")
                .font(.largeTitle.bold().lowercaseSmallCaps())
                .kerning(-1.2)
            Text("OLO 在合适的时机出现，其他时候安静陪伴。")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    private var entityStage: some View {
        ZStack {
            RadialGradient(
                colors: [Color.white, Color(white: 0.88), Color(white: 0.80)],
                center: .center,
                startRadius: 10,
                endRadius: 200
            )
            .clipShape(RoundedRectangle(cornerRadius: 34))
            // ground shadow under the orb — matches prototype stage:after
            .overlay(alignment: .bottom) {
                Ellipse()
                    .fill(.black.opacity(0.14))
                    .frame(width: 250, height: 35)
                    .blur(radius: 18)
                    .offset(y: -10)
            }

            VStack(spacing: 18) {
                OLOEntityView()
                stateLabel
            }
        }
        .frame(height: 460)
        .accessibilityIdentifier("olo.entity")
        .contentShape(Rectangle())
        // Order of attachment matters: long press fires the release-time
        // of tap only if minDuration elapses; double-tap beats single tap
        // via the 350 ms debounce.
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.6)
                .onEnded { _ in
                    longPressFired = true
                    tapDebounce?.cancel()
                    tapCount = 0
                    wakeAgent()
                }
        )
        .highPriorityGesture(
            TapGesture(count: 2)
                .onEnded { standby() }
        )
        .highPriorityGesture(
            TapGesture(count: 1)
                .onEnded { enqueueSingleTap() }
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
        var s = AttributedString(stateName, attributes: bold)

        return s
    }

    // MARK: - Rows / buttons

    private func contextRow(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 12)
    }

    private func iconBadge(_ system: String) -> some View {
        Image(systemName: system)
            .font(.callout)
            .frame(width: 32, height: 32)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 11))
    }

    private func entryCard(eyebrow: String, title: String, detail: String, icon: String) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon)
            VStack(alignment: .leading, spacing: 3) {
                Text(eyebrow.uppercased())
                    .font(.caption2)
                    .tracking(1.4)
                    .foregroundStyle(.secondary)
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    // MARK: - Gesture dispatch

    /// Disambiguate single- vs double-tap. First tap increments the counter
    /// and waits 350 ms; if a second tap arrives in that window the counter
    /// hits 2 and we cancel the pending single-tap action (the double-tap
    /// gesture already fired independently via highPriorityGesture).
    @MainActor
    private func enqueueSingleTap() {
        guard !longPressFired else { longPressFired = false; return }
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
    private func startConversation() {
        guard !center.privacyMode else {
            showToast("隐私模式下麦克风已暂停")
            return
        }
        if center.state == .listening {
            Task { await center.voiceService?.stop() }
            return
        }
        guard center.state == .idle || center.state == .done else { return }
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
                guard !center.privacyMode else { await voice.stop(); return }
                withAnimation { center.state = .listening }
                var partial = ""
                for try await transcript in stream {
                    try Task.checkCancellation()
                    if transcript.isFinal {
                        let final = transcript.text.isEmpty ? partial : transcript.text
                        await voice.stop()
                        await finishVoice(final)
                        return
                    } else {
                        partial = transcript.text
                        center.liveTranscript = partial
                    }
                }
                await finishVoice(partial)
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

    /// Long press is OLO's intentional invocation gesture. It starts the
    /// same real microphone → on-device speech-recognition path as tap.
    @MainActor
    private func wakeAgent() {
        guard !center.privacyMode else {
            showToast("隐私模式下 Agent 不会监听")
            return
        }
        guard center.agentRuntime?.isBusy != true else { showToast("任务正在处理，请到 Activity 查看"); return }
        center.lastVoiceRequest = nil
        showToast("请说出你需要 OLO 做什么")
        startConversation()
    }

    /// Double-tap — flip privacy mode.
    @MainActor
    private func togglePrivacy() {
        tapDebounce?.cancel(); tapCount = 0
        if !center.privacyMode {
            listenTask?.cancel()
            listenTask = nil
            Task { await center.voiceService?.stop() }
            center.liveTranscript = ""
            showingAgentSheet = false
            showingTextInput = false
            withAnimation { center.state = .idle }
        }
        withAnimation(.easeInOut(duration: 0.35)) {
            center.privacyMode.toggle()
        }
        showToast(center.privacyMode ? "视觉感知已关闭" : "隐私模式已关闭")
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
