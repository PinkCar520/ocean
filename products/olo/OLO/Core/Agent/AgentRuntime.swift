import Foundation

/// The agent runtime: turns a user intent into a planned, permission-aware,
/// verified course of action.
///
/// The protocol is device-agnostic — any body can host an agent runtime
/// against the same `OLOIdentity`, `MemoryStore` and `ContextProvider`.
/// The concrete runtime (Phase 7) wires an LLM service to the `Tool`s.
@MainActor
public protocol AgentRuntime: AnyObject {
    /// The tools this runtime may select from.
    var availableTools: [any Tool] { get }

    /// Begin processing a request. Returns the task immediately so a body
    /// can stream progress; completion happens via `events`. Conversation
    /// feeds the runtime through `AgentRequest`, keeping conversation and
    /// agent decoupled (Spec §36).
    func start(_ request: AgentRequest)

    /// Merge a follow-up answer into the current task rather than starting
    /// another task. Valid only while the task needs information.
    func provideInformation(_ answer: AgentRequest)

    /// Grant permission for a task currently in `waitingForPermission`.
    func grantPermission(for taskId: UUID)

    /// Cancel a task that is not yet terminal. Subsequent tool results
    /// must be ignored (Spec §31).
    func cancel(taskId: UUID)
}

public enum AgentEvent: Sendable {
    case taskUpdated(AgentTask)
    case stepStarted(AgentStep)
    case stepCompleted(AgentStep)
    case requiresPermission(AgentTask)
    case taskFailed(AgentTask, summary: String)
}

public enum TrustDecision: Sendable, Equatable {
    case run
    case confirm
    case deny(String)
}

public protocol TrustPolicy: Sendable {
    func decision(for permission: PermissionLevel) -> TrustDecision
}

/// Validation policy: registered reads may run, real-world writes require
/// confirmation, and financial actions remain unavailable.
public struct ValidationTrustPolicy: TrustPolicy {
    public init() {}
    public func decision(for permission: PermissionLevel) -> TrustDecision {
        switch permission {
        case .read: .run
        case .suggest: .deny("此能力当前只允许提出建议")
        case .prepare, .execute: .confirm
        case .financial: .deny("当前版本不允许金融操作")
        }
    }
}
