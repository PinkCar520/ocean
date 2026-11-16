import Foundation

/// The persistent identity of OLO — the "person", not the "body".
///
/// OLO is designed so that the same identity can inhabit many bodies
/// (iPhone today; OLO One, Robot, Vehicle, Home later). This protocol
/// describes the identity itself, decoupled from any specific UI or device.
///
/// Concrete storage (SwiftData today, remote sync later) is provided by
/// an `OLOIdentityStore`. The protocol stays device-agnostic.
public struct OLOIdentity: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var pronouns: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        name: String = "OLO",
        pronouns: String = "they/them",
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.pronouns = pronouns
        self.createdAt = createdAt
    }
}

/// The behavioural state OLO is currently expressing to a body (e.g. the iPhone UI).
///
/// This is *presentation* state, not the agent's internal task status. A body
/// (screen, robot, speaker) renders these states however fits its medium.
/// Aligns with PRD §6.3 — 8 canonical states + `error` for failures.
public enum OLOState: String, Sendable, CaseIterable {
    case idle
    case listening
    case thinking
    case acting
    case needYou
    case done
    case privacy
    case powerOff
    case error

    public var label: String {
        switch self {
        case .idle: "Standby"
        case .listening: "Listening"
        case .thinking: "Thinking"
        case .acting: "Acting"
        case .needYou: "Need You"
        case .done: "Done"
        case .privacy: "Privacy"
        case .powerOff: "Power Off"
        case .error: "Error"
        }
    }
}
