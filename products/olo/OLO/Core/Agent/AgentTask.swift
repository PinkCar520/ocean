import Foundation

/// The lifecycle status of an agent task.
///
/// Mirrors the Understand → Plan → Execute → Verify loop. Waiting for
/// user permission is a first-class state so the agent can pause safely
/// before acting on the world.
public enum AgentTaskStatus: String, Codable, Sendable, CaseIterable {
    case captured
    case needsInformation
    case partial
    case understanding
    case planning
    case waitingForPermission
    case executing
    case verifying
    case completed
    case failed
    case cancelled

    public var label: String {
        switch self {
        case .captured: "已接收"
        case .needsInformation: "需要补充信息"
        case .partial: "结果待核实"
        case .understanding: "Understanding"
        case .planning: "Planning"
        case .waitingForPermission: "Waiting for permission"
        case .executing: "Executing"
        case .verifying: "Verifying"
        case .completed: "Completed"
        case .failed: "Failed"
        case .cancelled: "Cancelled"
        }
    }

    public var isTerminal: Bool {
        switch self {
        case .completed, .failed, .cancelled, .partial: true
        default: false
        }
    }
}

/// A single, observable unit of agent work — one user intent taken to completion.
public struct AgentTask: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var rawIntent: String
    public var status: AgentTaskStatus
    public var plan: [AgentStep]
    public var currentStepIndex: Int
    public var summary: String
    public var clarifications: [AgentClarification]
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        rawIntent: String,
        status: AgentTaskStatus = .understanding,
        plan: [AgentStep] = [],
        currentStepIndex: Int = 0,
        summary: String = "",
        clarifications: [AgentClarification] = [],
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.rawIntent = rawIntent
        self.status = status
        self.plan = plan
        self.currentStepIndex = currentStepIndex
        self.summary = summary
        self.clarifications = clarifications
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public var currentStep: AgentStep? {
        guard plan.indices.contains(currentStepIndex) else { return nil }
        return plan[currentStepIndex]
    }
}

public struct AgentClarification: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public let question: String
    public let answer: String
    public let source: InputSource
    public let createdAt: Date

    public init(id: UUID = UUID(), question: String, answer: String, source: InputSource, createdAt: Date = .now) {
        self.id = id
        self.question = question
        self.answer = answer
        self.source = source
        self.createdAt = createdAt
    }
}

/// One step in an agent plan. The `type` describes *what kind* of step it
/// is (reasoning, retrieval, a tool call, confirmation, verification, or
/// the final response); `toolId` is only meaningful for `.toolCall` steps.
public struct AgentStep: Hashable, Codable, Sendable, Identifiable {
    public let id: UUID
    public let type: StepType
    public var toolId: String?
    public var arguments: [String: String]
    public var description: String
    public var resultSummary: String?
    public var status: AgentStepStatus

    public init(
        id: UUID = UUID(),
        type: StepType,
        toolId: String? = nil,
        arguments: [String: String] = [:],
        description: String = "",
        resultSummary: String? = nil,
        status: AgentStepStatus = .pending
    ) {
        self.id = id
        self.type = type
        self.toolId = toolId
        self.arguments = arguments
        self.description = description
        self.resultSummary = resultSummary
        self.status = status
    }
}

/// What kind of work a step performs (Spec §38).
public enum StepType: String, Codable, Sendable, CaseIterable {
    case reason
    case retrieveMemory
    case retrieveContext
    case toolCall
    case confirmation
    case verification
    case response
}

public enum AgentStepStatus: String, Codable, Sendable, CaseIterable {
    case pending, running, done, failed, skipped
}
