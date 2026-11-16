import SwiftData
import Foundation

@MainActor
final class AgentTaskRepository: AgentTaskSaving {
    private let context: ModelContext
    init(context: ModelContext) { self.context = context }

    func save(_ task: AgentTask) throws {
        let id = task.id
        let query = FetchDescriptor<AgentTaskRecord>(predicate: #Predicate { $0.id == id })
        if let record = try context.fetch(query).first {
            record.update(from: task)
        } else {
            context.insert(AgentTaskRecord(from: task))
        }
        try context.save()
    }
}

