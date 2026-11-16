import Foundation
import OSLog

struct OLOLocalActionReceipt: Codable, Identifiable, Sendable, Hashable {
    var id: String { actionID }

    let actionID: String
    let requestID: String
    let taskID: UUID
    let capability: String
    let intent: String
    var status: String
    var summary: String
    var evidence: [String: String]
    var providerRef: String?
    let createdAt: Date
    var updatedAt: Date
}

/// Device-local, durable action history. It is authoritative for what the
/// iPhone observed and remains available when the Control Plane is disabled
/// or offline. Server synchronization is a separate best-effort concern.
actor OLOActionReceiptLedger {
    private static let logger = Logger(subsystem: "app.olo.action-receipt", category: "ledger")
    private let fileURL: URL
    private var receipts: [OLOLocalActionReceipt]

    init(fileURL: URL? = nil) {
        let resolvedURL = fileURL ?? Self.defaultURL()
        self.fileURL = resolvedURL
        if let data = try? Data(contentsOf: resolvedURL),
           let decoded = try? JSONDecoder().decode([OLOLocalActionReceipt].self, from: data) {
            receipts = decoded
        } else {
            receipts = []
        }
    }

    func begin(
        actionID: String,
        requestID: String,
        taskID: UUID,
        capability: String,
        intent: String,
        summary: String = "已提交到 iPhone 执行"
    ) {
        guard !receipts.contains(where: { $0.actionID == actionID }) else { return }
        let now = Date.now
        receipts.append(OLOLocalActionReceipt(
            actionID: actionID,
            requestID: requestID,
            taskID: taskID,
            capability: capability,
            intent: intent,
            status: "submitted",
            summary: summary,
            evidence: [:],
            providerRef: nil,
            createdAt: now,
            updatedAt: now
        ))
        persist()
    }

    func update(
        actionID: String,
        status: String,
        providerRef: String?,
        evidence: [String: String],
        summary: String
    ) {
        guard let index = receipts.firstIndex(where: { $0.actionID == actionID }) else { return }
        receipts[index].status = status
        receipts[index].providerRef = providerRef ?? receipts[index].providerRef
        if !evidence.isEmpty { receipts[index].evidence = evidence }
        receipts[index].summary = summary
        receipts[index].updatedAt = .now
        persist()
    }

    func all() -> [OLOLocalActionReceipt] {
        receipts.sorted { $0.updatedAt > $1.updatedAt }
    }

    private func persist() {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try JSONEncoder().encode(receipts).write(
                to: fileURL,
                options: [.atomic, .completeFileProtection]
            )
        } catch {
            Self.logger.error("Unable to persist local action receipt: \(String(describing: error), privacy: .public)")
        }
    }

    private static func defaultURL() -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appending(path: "OLO/action-receipts-v1.json")
    }
}
