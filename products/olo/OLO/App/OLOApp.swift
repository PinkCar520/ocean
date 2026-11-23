import SwiftUI
import SwiftData

/// OLO — Personal AI Identity with Memory, Context and Agent capabilities.
///
@main
struct OLOApp: App {
    @State private var center: OLOCenter
    @State private var modelContainer: ModelContainer?
    @State private var firstEncounter: FirstEncounterSession

    init() {
        let c = OLOCenter()
        self._center = State(initialValue: c)
        self._firstEncounter = State(initialValue: FirstEncounterSession())
        self._modelContainer = State(initialValue: nil)
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if let modelContainer {
                    Group {
                        if firstEncounter.isFinished {
                            RootShell()
                        } else {
                            FirstEncounterView(session: firstEncounter)
                        }
                    }
                    .environment(center)
                    .modelContainer(modelContainer)
                } else {
                    Color.black.ignoresSafeArea()
                        .overlay { ProgressView() }
                        .task { await bootstrapPersistentContainer() }
                }
            }
            .onOpenURL { url in
                OLOVoiceLaunch.shared.request(for: url)
            }
        }
    }

    // Persistence initialization is deferred to keep the initial view lightweight.
    private func bootstrapPersistentContainer() async {
        let container = await withCheckedContinuation { (cont: CheckedContinuation<ModelContainer, Never>) in
            Task.detached(priority: .userInitiated) {
                let built = OLOModelContainer.make(inMemory: false)
                cont.resume(returning: built)
            }
        }
        await MainActor.run { modelContainer = container }
    }
}
