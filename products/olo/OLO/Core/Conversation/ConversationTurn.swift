import Foundation

/// A single turn in an OLO conversation.
///
/// OLO is not a chat log app — turns exist primarily to carry intent and
/// responses, not to be archived wholesale. Long-term value is promoted
/// to `MemoryItem`; the rest is treated as ephemeral context.
public struct ConversationTurn: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public let role: Role
    public var text: String
    public var createdAt: Date
    public var linkedTaskId: UUID?

    public enum Role: String, Codable, Sendable {
        case user, olo
    }

    public init(
        id: UUID = UUID(),
        role: Role,
        text: String,
        createdAt: Date = .now,
        linkedTaskId: UUID? = nil
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.createdAt = createdAt
        self.linkedTaskId = linkedTaskId
    }
}
