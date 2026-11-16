import Foundation

/// Where an agent request originated. Conversation is one input source;
/// proactive triggers and system events are others (Spec §5).
public enum InputSource: String, Codable, Sendable, CaseIterable {
    case voice
    case text
    case proactive
    case system
}

/// A request handed to the agent runtime. Conversation feeds the agent via
/// this type — conversation and agent are deliberately separated so one
/// conversation can spawn many agent tasks (Spec §36).
public struct AgentRequest: Identifiable, Sendable, Hashable {
    public let id: UUID
    public var input: String
    public var source: InputSource
    public var context: ContextSnapshot
    public var conversationId: UUID?

    public init(
        id: UUID = UUID(),
        input: String,
        source: InputSource,
        context: ContextSnapshot,
        conversationId: UUID? = nil
    ) {
        self.id = id
        self.input = input
        self.source = source
        self.context = context
        self.conversationId = conversationId
    }
}

/// The outcome of an agent run. Never fabricates success: if any tool
/// failed, `state` reflects it and the response says so (Spec §6/§44).
public struct AgentResult: Sendable {
    public let requestId: UUID
    public let response: String
    public let state: AgentTaskStatus
    public let executedTools: [ToolExecution]
    public let memoriesCreated: [MemoryItem]

    public init(
        requestId: UUID,
        response: String,
        state: AgentTaskStatus,
        executedTools: [ToolExecution] = [],
        memoriesCreated: [MemoryItem] = []
    ) {
        self.requestId = requestId
        self.response = response
        self.state = state
        self.executedTools = executedTools
        self.memoriesCreated = memoriesCreated
    }
}
