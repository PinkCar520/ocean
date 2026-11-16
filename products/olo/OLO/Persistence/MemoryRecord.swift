import Foundation
import SwiftData

/// SwiftData backing record for a `MemoryItem`. The domain struct lives in
/// `MemoryItem` (device-agnostic core); we only encode/decode to/from this
/// class here so SwiftData macros stay at the iPhone body's persistence
/// layer.
@Model
final class MemoryRecord {
    @Attribute(.unique) var id: UUID
    var kindRaw: String
    var title: String
    var content: String
    var tags: [String]
    var sourceRaw: String
    var importanceRaw: String
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID, kindRaw: String, title: String, content: String, tags: [String], sourceRaw: String, importanceRaw: String, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.kindRaw = kindRaw
        self.title = title
        self.content = content
        self.tags = tags
        self.sourceRaw = sourceRaw
        self.importanceRaw = importanceRaw
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension MemoryRecord {
    convenience init(from item: MemoryItem) {
        self.init(
            id: item.id,
            kindRaw: item.kind.rawValue,
            title: item.title,
            content: item.content,
            tags: item.tags,
            sourceRaw: item.source.rawValue,
            importanceRaw: item.importance.rawValue,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        )
    }

    var toModel: MemoryItem {
        MemoryItem(
            id: id,
            kind: MemoryKind(rawValue: kindRaw) ?? .fact,
            title: title,
            content: content,
            tags: tags,
            source: MemorySource(rawValue: sourceRaw) ?? .explicit,
            importance: MemoryImportance(rawValue: importanceRaw) ?? .medium,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}
