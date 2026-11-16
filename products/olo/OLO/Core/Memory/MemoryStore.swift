import Foundation

/// A single unit of long-term memory.
///
/// `source` records how it was captured (explicit "remember this",
/// inferred preference, event) so the user can later understand why a
/// memory exists and decide to keep or delete it.
public struct MemoryItem: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var kind: MemoryKind
    public var title: String
    public var content: String
    public var tags: [String]
    public var source: MemorySource
    public var importance: MemoryImportance
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        kind: MemoryKind,
        title: String,
        content: String,
        tags: [String] = [],
        source: MemorySource = .explicit,
        importance: MemoryImportance = .medium,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.content = content
        self.tags = tags
        self.source = source
        self.importance = importance
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum MemorySource: String, Codable, Sendable {
    case explicit       // user said "remember this"
    case inferred      // inferred from repeated behaviour (long-term only)
    case event         // derived from a high-value event
}

/// A device-agnostic store of OLO's long-term memory.
///
/// The default implementation is a SwiftData-backed store living on the
/// iPhone. The same protocol can later be backed by OLO One, cloud sync,
/// or any other body that shares the identity.
public protocol MemoryStore: AnyObject, Sendable {
    func fetchAll() async throws -> [MemoryItem]
    func fetch(kind: MemoryKind?) async throws -> [MemoryItem]
    func search(_ query: String) async throws -> [MemoryItem]
    func upsert(_ item: MemoryItem) async throws
    func delete(_ id: UUID) async throws
    func deleteAll() async throws
}

public extension MemoryStore {
    func fetchAll() async throws -> [MemoryItem] { try await fetch(kind: nil) }
}
