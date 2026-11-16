import Foundation

/// The kind of long-term memory an entry represents.
///
/// OLO does not persist every conversation. Only items that are explicit
/// ("remember this"), long-term preferences, important facts, person
/// relationships, and high-value events enter long-term memory.
public enum MemoryKind: String, Codable, CaseIterable, Sendable {
    case profile       // who the user is
    case preference    // long-term likes / dislikes
    case person        // people and relationships
    case place         // meaningful locations
    case event         // high-value events
    case fact          // important facts the user stated
    case episodic      // notable episodic memories
}
