import SwiftUI
import SwiftData

/// OLO — Personal AI Identity with Memory, Context and Agent capabilities.
///
@main
struct OLOApp: App {
    @State private var center: OLOCenter
    @State private var modelContainer: ModelContainer?

    init() {
        let c = OLOCenter()
        self._center = State(initialValue: c)
        self._modelContainer = State(initialValue: nil)
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if let modelContainer {
                    RootShell()
                        .environment(center)
                        .modelContainer(modelContainer)
                } else {
                    Color.black.ignoresSafeArea()
                        .overlay { ProgressView() }
                        .task { await bootstrapPersistentContainer() }
                }
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
