import Foundation

/// How valuable a memory is long-term. Drives the write/no-write decision
/// so OLO doesn't accumulate trivia from ordinary chat (Spec §15/§45).
///
/// - low:      ephemeral, do not save
/// - medium:   maybe useful, save allowed
/// - high:     long-term preference / relationship, save
/// - critical: user explicitly asked to remember, must save
public enum MemoryImportance: String, Codable, Sendable, CaseIterable {
    case low
    case medium
    case high
    case critical

    /// Whether a candidate at this level should be persisted.
    public var shouldPersist: Bool {
        switch self {
        case .low: false
        case .medium, .high, .critical: true
        }
    }
}
