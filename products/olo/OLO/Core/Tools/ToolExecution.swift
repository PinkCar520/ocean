import Foundation

/// A record of one tool execution within an agent task. Carries a unique
/// `executionId` so retries after a network drop don't double-create
/// side-effecting resources (Spec §34 idempotency).
public struct ToolExecution: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID            // executionId — unique per attempt-group
    public let toolId: String
    public var arguments: [String: String]
    public var state: ToolExecutionState
    public var resultSummary: String?
    public var startedAt: Date
    public var completedAt: Date?

    public init(
        id: UUID = UUID(),
        toolId: String,
        arguments: [String: String] = [:],
        state: ToolExecutionState = .pending,
        resultSummary: String? = nil,
        startedAt: Date = .now,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.toolId = toolId
        self.arguments = arguments
        self.state = state
        self.resultSummary = resultSummary
        self.startedAt = startedAt
        self.completedAt = completedAt
    }
}

public enum ToolExecutionState: String, Codable, Sendable, CaseIterable {
    case pending
    case running
    case succeeded
    case failed
    case timedOut
    case denied     // permission denied — must NOT auto-retry
    case cancelled
}
