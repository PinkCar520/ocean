import SwiftUI
import SwiftData
import AVFoundation

/// Top-level shell of the iPhone body. Voice, Activity and Memory are
/// primary destinations. Settings is accessed from Voice's top-right toolbar.
struct RootShell: View {
    @Environment(OLOCenter.self) private var center
    @Environment(\.modelContext) private var modelContext
    @AppStorage("olo.onboarding.firstMeeting.completed") private var hasMetOLO = false

    var body: some View {
        NavigationStack {
            TabView {
                Tab("Voice", systemImage: "mic") {
                    HomeView()
                }
                Tab("Activity", systemImage: "waveform") {
                    AgentActivityView()
                }
                Tab("Memory", systemImage: "brain.head.profile") {
                    MemoryView()
                }
            }
            .tint(.primary)
        }
        .fullScreenCover(isPresented: Binding(
            get: { !hasMetOLO },
            set: { if !$0 { hasMetOLO = true } }
        )) {
            OLOFirstMeetingView {
                hasMetOLO = true
            }
            .environment(center)
        }
        .task {
            if center.agentRuntime == nil {
                let understanding = ResilientAgentUnderstanding(
                    primary: TimedAgentUnderstanding(base: FoundationModelAgentUnderstanding()),
                    fallback: RuleBasedAgentUnderstanding()
                )
                let registry = ToolRegistry()
                registry.register(ReminderTool(executor: ReminderExecutor()))
                let controlPlaneSync = OLOAgentControlPlaneSync.configuredFromEnvironment(
                    ledger: center.actionReceiptLedger,
                    status: center.controlPlaneStatus
                )
                center.controlPlaneSync = controlPlaneSync
                center.wakePlanner.configure(controlPlaneSync: controlPlaneSync)
                center.agentRuntime = ControlledAgentRuntime(
                    understanding: understanding,
                    registry: registry,
                    repository: AgentTaskRepository(context: modelContext),
                    controlPlaneSync: controlPlaneSync
                )
            }
            // Construct the UI-facing service once per app session.
            if center.voiceService == nil {
                center.voiceService = AVVoiceService()
            }
        }
    }
}

#Preview {
    RootShell()
        .environment(OLOCenter())
}


/// First meeting is voice-led. Text entry is deliberately not the default.
/// A single explicit tap starts listening and triggers iOS permission prompts
/// in context; OLO never records or listens before that action.
private struct OLOFirstMeetingView: View {
    @Environment(OLOCenter.self) private var center
    @AppStorage("olo.profile.displayName") private var savedName = ""
    @State private var stage = 0
    @State private var isListening = false
    @State private var heard = ""
    @State private var errorMessage: String?
    @State private var listenTask: Task<Void, Never>?
    @State private var speech = AVSpeechSynthesizer()
    @State private var listenID = UUID()
    let onComplete: () -> Void

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                HStack {
                    Text("OLO")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .tracking(2.5)
                    Spacer()
                    Button("稍后再聊") { finish() }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("olo.onboarding.skip")
                }
                .padding(.horizontal, 28)
                .padding(.top, 20)

                Spacer(minLength: 16)
                OLOEntityView(audioLevel: 0, isResponding: speech.isSpeaking)
                    .frame(maxWidth: 360)
                    .frame(height: min(proxy.size.height * 0.38, 300))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                VStack(spacing: 14) {
                    Text(stage == 0 ? "你好，我是 OLO。" :
                         stage == 1 ? "我该怎么称呼你？" :
                         "很高兴认识你。")
                        .font(.system(size: 30, weight: .medium, design: .rounded))
                        .multilineTextAlignment(.center)
                    Text(stage == 0 ? "我们可以从一次简单的对话开始。" :
                         stage == 1 ? "告诉我你的称呼，或者说「先不用」。" :
                         "接下来，你可以直接告诉我想做的事。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    if isListening {
                        Label("正在聆听", systemImage: "waveform")
                            .foregroundStyle(.primary)
                            .accessibilityIdentifier("olo.onboarding.listening")
                    }
                    if !heard.isEmpty {
                        Text("“\(heard)”")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: 400)
                .padding(.horizontal, 28)

                Spacer(minLength: 24)
                Button {
                    if stage == 0 {
                        stage = 1
                        speak("我该怎么称呼你？你也可以说，先不用。")
                    } else if stage == 1 {
                        if isListening { stopListening() } else { beginListening() }
                    } else {
                        finish()
                    }
                } label: {
                    Label(stage == 0 ? "开始认识" :
                          stage == 1 ? (isListening ? "结束聆听" : "回答 OLO") :
                          "开始使用 OLO",
                          systemImage: stage == 1 ? "mic" : "arrow.right")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 17)
                }
                .buttonStyle(.borderedProminent)
                .tint(.primary)
                .accessibilityIdentifier("olo.onboarding.continue")
                .padding(.horizontal, 28)

                if stage == 1 {
                    Button("暂时不告诉你") { advanceWithoutName() }
                        .font(.subheadline)
                        .padding(.top, 12)
                        .accessibilityIdentifier("olo.onboarding.noName")
                }
                Text("麦克风与语音识别权限只在你主动回答时请求")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
                    .padding(.bottom, 28)
                    .padding(.horizontal, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        }
        .interactiveDismissDisabled()
        .onAppear { speak("你好，我是 OLO。我们可以慢慢认识。") }
        .onDisappear { cancelListening(); speech.stopSpeaking(at: .immediate) }
    }

    private func speak(_ message: String) {
        speech.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: message)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = 0.48
        speech.speak(utterance)
    }

    private func beginListening() {
        guard let voice = center.voiceService else {
            errorMessage = "语音服务尚未就绪，请稍后重试。"
            return
        }
        speech.stopSpeaking(at: .immediate)
        errorMessage = nil
        heard = ""
        isListening = true
        let id = UUID()
        listenID = id
        listenTask = Task {
            do {
                let stream = try await voice.start()
                for try await transcript in stream {
                    guard listenID == id else { break }
                    if !transcript.text.isEmpty { heard = transcript.text }
                    if transcript.isFinal { break }
                }
                guard listenID == id else { return }
                await voice.stop()
                isListening = false
                listenTask = nil
                processResponse()
            } catch {
                guard listenID == id else { return }
                await voice.stop()
                isListening = false
                listenTask = nil
                errorMessage = "没有听清，或者语音权限尚未开启。你可以重试或跳过。"
            }
        }
    }

    private func stopListening() {
        let old = listenTask
        listenID = UUID()
        old?.cancel()
        listenTask = nil
        isListening = false
        Task { await center.voiceService?.stop() }
        processResponse()
    }

    private func processResponse() {
        let answer = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !answer.isEmpty else {
            errorMessage = "没听清，你可以再说一次。"
            return
        }
        let skipWords = ["先不用", "不用", "跳过", "不告诉", "随便"]
        if !skipWords.contains(where: { answer.contains($0) }) {
            let normalized = answer
                .replacingOccurrences(of: "叫我", with: "")
                .replacingOccurrences(of: "我叫", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalized.isEmpty && normalized.count <= 30 {
                savedName = normalized
            }
        }
        stage = 2
        speak(savedName.isEmpty ? "好的，我们慢慢认识。" : "好的，很高兴认识你。")
    }

    private func advanceWithoutName() {
        cancelListening()
        stage = 2
        speak("没关系，我们可以慢慢认识。")
    }

    private func cancelListening() {
        listenID = UUID()
        listenTask?.cancel()
        listenTask = nil
        isListening = false
        Task { await center.voiceService?.stop() }
    }

    private func finish() {
        cancelListening()
        speech.stopSpeaking(at: .immediate)
        onComplete()
    }
}
