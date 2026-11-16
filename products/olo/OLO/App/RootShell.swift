import SwiftUI
import SwiftData

/// Top-level shell of the iPhone body. A 5-tab navigation surfaces the
/// seven brief pages: Home, Voice, Agent Activity, Memory, Settings live
/// as tabs; World and Actions are entered from Home (NavigationStack) so
/// the bar stays uncluttered while every page exists.
struct RootShell: View {
    @Environment(OLOCenter.self) private var center
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            TabView {
                Tab("Home", systemImage: "circle.fill") {
                    HomeView()
                }
                Tab("Voice", systemImage: "mic") {
                    VoiceView()
                }
                Tab("Activity", systemImage: "waveform") {
                    AgentActivityView()
                }
                Tab("Memory", systemImage: "brain.head.profile") {
                    MemoryView()
                }
                Tab("Settings", systemImage: "gearshape") {
                    SettingsView()
                }
            }
            .tint(.primary)
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
