import SwiftUI
import SwiftData

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


/// A first encounter, not a feature tour. The user can meet OLO without
/// creating an account, granting permissions, or disclosing personal details.
/// Voice permissions remain contextual to the first actual voice interaction.
private struct OLOFirstMeetingView: View {
    @Environment(OLOCenter.self) private var center
    @AppStorage("olo.profile.displayName") private var savedName = ""
    @State private var stage = 0
    @State private var preferredName = ""
    @FocusState private var nameFocused: Bool
    let onComplete: () -> Void

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                HStack {
                    Text("OLO")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .tracking(2.5)
                    Spacer()
                    Button("跳过") { onComplete() }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("olo.onboarding.skip")
                }
                .padding(.horizontal, 28)
                .padding(.top, 20)

                Spacer(minLength: 16)

                // The same living entity used on the home screen, not a
                // separate illustration that would teach the wrong identity.
                OLOEntityView(audioLevel: 0, isResponding: false)
                    .frame(maxWidth: 360)
                    .frame(height: min(proxy.size.height * 0.38, 300))
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)

                VStack(spacing: 16) {
                    Text(stage == 0 ? "你好，我是 OLO。" :
                         stage == 1 ? "我该怎么称呼你？" :
                         "我们从一件小事开始。")
                        .font(.system(size: 30, weight: .medium, design: .rounded))
                        .multilineTextAlignment(.center)
                        .contentTransition(.opacity)

                    Text(stage == 0
                         ? "你不需要学习怎样使用我。我们可以慢慢认识。"
                         : stage == 1
                         ? "可以留空。以后随时能在设置中修改。"
                         : "轻触我的眼睛，开始说话；也可以先用文字。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    if stage == 1 {
                        TextField("你喜欢的称呼（可选）", text: $preferredName)
                            .textContentType(.nickname)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .focused($nameFocused)
                            .submitLabel(.done)
                            .onSubmit(advance)
                            .padding(16)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityIdentifier("olo.onboarding.name")
                            .padding(.top, 8)
                    }

                    if stage == 2 {
                        Label("麦克风权限仅在你开始语音交流时请求", systemImage: "hand.raised")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.top, 8)
                    }
                }
                .frame(maxWidth: 400)
                .padding(.horizontal, 28)
                .animation(.easeInOut(duration: 0.25), value: stage)

                Spacer(minLength: 24)

                Button(action: advance) {
                    Text(stage == 2 ? "认识 OLO" : "继续")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 17)
                }
                .buttonStyle(.borderedProminent)
                .tint(.primary)
                .accessibilityIdentifier("olo.onboarding.continue")
                .padding(.horizontal, 28)

                Text(stage == 2 ? "你的资料由你决定，OLO 不会自动读取其他 App 的内容。" : "无需账号 · 无需预先授权")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 16)
                    .padding(.bottom, 28)
                    .padding(.horizontal, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        }
        .interactiveDismissDisabled()
    }

    private func advance() {
        switch stage {
        case 0:
            withAnimation { stage = 1 }
        case 1:
            let name = preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty { savedName = String(name.prefix(60)) }
            nameFocused = false
            withAnimation { stage = 2 }
        default:
            onComplete()
        }
    }
}
