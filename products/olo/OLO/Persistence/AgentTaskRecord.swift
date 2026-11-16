import Foundation
import SwiftData

/// SwiftData backing record for an `AgentTask`. Lives in the persistence
/// layer (iPhone body); the domain value stays in `AgentTask` (core) so it
/// is body-portable.
@Model
final class AgentTaskRecord {
    @Attribute(.unique) var id: UUID
    var statusRaw: String
    var rawIntent: String
    var planJSON: Data?
    var currentStepIndex: Int
    var summary: String
    var clarificationsJSON: Data?
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID, statusRaw: String, rawIntent: String, planJSON: Data?, currentStepIndex: Int, summary: String, clarificationsJSON: Data? = nil, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.statusRaw = statusRaw
        self.rawIntent = rawIntent
        self.planJSON = planJSON
        self.currentStepIndex = currentStepIndex
        self.summary = summary
        self.clarificationsJSON = clarificationsJSON
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension AgentTaskRecord {
    convenience init(from task: AgentTask) {
        let planJSON = try? JSONEncoder().encode(task.plan)
        self.init(
            id: task.id,
            statusRaw: task.status.rawValue,
            rawIntent: task.rawIntent,
            planJSON: planJSON,
            currentStepIndex: task.currentStepIndex,
            summary: task.summary,
            clarificationsJSON: try? JSONEncoder().encode(task.clarifications),
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
        )
    }

    var toModel: AgentTask {
        let plan: [AgentStep]
        if let data = planJSON, let decoded = try? JSONDecoder().decode([AgentStep].self, from: data) {
            plan = decoded
        } else {
            plan = []
        }
        let clarifications = clarificationsJSON.flatMap { try? JSONDecoder().decode([AgentClarification].self, from: $0) } ?? []
        return AgentTask(
            id: id,
            rawIntent: rawIntent,
            status: AgentTaskStatus(rawValue: statusRaw) ?? .understanding,
            plan: plan,
            currentStepIndex: currentStepIndex,
            summary: summary,
            clarifications: clarifications,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    func update(from task: AgentTask) {
        statusRaw = task.status.rawValue
        rawIntent = task.rawIntent
        planJSON = try? JSONEncoder().encode(task.plan)
        currentStepIndex = task.currentStepIndex
        summary = task.summary
        clarificationsJSON = try? JSONEncoder().encode(task.clarifications)
        updatedAt = task.updatedAt
    }
}
