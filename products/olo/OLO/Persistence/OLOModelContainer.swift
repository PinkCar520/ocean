import Foundation
import SwiftData

/// Builds the SwiftData `ModelContainer` for the iPhone body. If the
/// on-disk store is ever corrupted, it transparently falls back to an
/// in-memory store so the app still launches — future bodies may ship a
/// different persistence mechanism entirely; core types never depend on
/// `@Model`.
enum OLOModelContainer {
    static func make(inMemory: Bool) -> ModelContainer {
        let schema = Schema([MemoryRecord.self, AgentTaskRecord.self])
        let config = ModelConfiguration(
            nil,
            schema: schema,
            isStoredInMemoryOnly: inMemory,
            allowsSave: true,
            groupContainer: .none,
            cloudKitDatabase: .none
        )
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            // Best-effort recover: fall back to in-memory so OLO still boots.
            let fallbackSchema = Schema([MemoryRecord.self, AgentTaskRecord.self])
            return (try? ModelContainer(
                for: fallbackSchema,
                configurations: [ModelConfiguration(nil, schema: fallbackSchema, isStoredInMemoryOnly: true)]
            )) ?? ModelContainer.memoryOnly
        }
    }
}

private extension ModelContainer {
    static var memoryOnly: ModelContainer {
        let schema = Schema([MemoryRecord.self, AgentTaskRecord.self])
        // Deliberately force-try — if the fully in-memory store also fails
        // on startup we have no way to keep operating.
        return try! ModelContainer(
            for: schema,
            configurations: [ModelConfiguration(nil, schema: schema, isStoredInMemoryOnly: true)]
        )
    }
}
