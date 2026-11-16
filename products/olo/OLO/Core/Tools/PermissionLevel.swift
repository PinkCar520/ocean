import Foundation

/// A tool's permission boundary — what the agent may do *without* asking,
/// and what it must confirm first. Mirrors the Agent Spec §26/§27.
///
/// - read:     no confirmation (e.g. query weather)
/// - suggest:  agent may propose, never execute
/// - prepare:  may create drafts
/// - execute:  requires explicit user authorisation before acting
/// - financial: MVP disallowed
public enum PermissionLevel: String, Codable, Sendable, CaseIterable {
    case read
    case suggest
    case prepare
    case execute
    case financial

    /// Whether the agent must pause in `waitingForPermission` before
    /// running a tool at this level.
    public var requiresConfirmation: Bool {
        switch self {
        case .read, .suggest: false
        case .prepare, .execute, .financial: true
        }
    }

    /// MVP safety gate: financial actions are not permitted at all yet.
    public var allowedInMVP: Bool { self != .financial }
}
