import Foundation

protocol WakeRecordStoring: Sendable {
    func load() async throws -> WakeSessionRecord?
    func save(_ record: WakeSessionRecord) async throws
    func clear() async throws
    func transition(alarmID: UUID, to state: WakeLifecycleState, at date: Date) async throws
}

actor JSONWakeRecordStore: WakeRecordStoring {
    static let shared = JSONWakeRecordStore()

    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("OLO", isDirectory: true)
            self.fileURL = directory.appendingPathComponent("sr-001-wake-session.json")
        }
    }

    func load() throws -> WakeSessionRecord? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return try decoder.decode(WakeSessionRecord.self, from: Data(contentsOf: fileURL))
    }

    func save(_ record: WakeSessionRecord) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try encoder.encode(record).write(to: fileURL, options: .atomic)
    }

    func clear() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }

    func transition(alarmID: UUID, to state: WakeLifecycleState, at date: Date = .now) throws {
        guard var record = try load(), record.alarmID == alarmID else { return }
        record.transition(to: state, at: date)
        try save(record)
    }
}
