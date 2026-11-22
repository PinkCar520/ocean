import SwiftUI
import SwiftData

/// Top-level shell of the iPhone body. Voice, Activity, Memory and Settings
/// are the four primary destinations. World lives under Settings and
/// Actions under Activity; the former Home entity surface is the Voice tab.
struct RootShell: View {
    @Environment(OLOCenter.self) private var center
    @Environment(\.modelContext) private var modelContext

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
