import Foundation
import Observation
import OSLog

@MainActor
@Observable
final class OLOControlPlaneStatus {
    private(set) var endpoint: URL?
    private(set) var pendingCount = 0
    private(set) var lastSyncedAt: Date?
    private(set) var lastError: String?

    var isConfigured: Bool { endpoint != nil }

    func configure(endpoint: URL?, pendingCount: Int = 0) {
        self.endpoint = endpoint
        self.pendingCount = pendingCount
        if endpoint == nil { lastError = nil }
    }

    func queued(_ count: Int) {
        pendingCount = count
    }

    func synced(_ count: Int) {
        pendingCount = count
        lastSyncedAt = .now
        lastError = nil
    }

    func failed(_ message: String, pendingCount: Int) {
        self.pendingCount = pendingCount
        lastError = message
    }
}

enum OLOControlPlaneError: Error, LocalizedError {
    case invalidResponse
    case server(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "OLO Control Plane 返回了无效响应"
        case .server(let statusCode): "OLO Control Plane 请求失败（HTTP \(statusCode)）"
        }
    }
}

private struct OLOQueuedControlPlaneRequest: Codable, Identifiable, Sendable {
    let id: UUID
    let path: String
    let method: String
    let idempotencyKey: String?
    let body: Data?
}

/// Durable best-effort synchronization. Local Apple actions never wait for this
/// actor; failed requests remain in an Application Support outbox for retry.
actor OLOControlPlaneClient {
    private static let logger = Logger(subsystem: "app.olo.control-plane", category: "sync")
    private let baseURL: URL
    private let session: URLSession
    private let outboxURL: URL
    private let status: OLOControlPlaneStatus?
    private var pending: [OLOQueuedControlPlaneRequest]
    private var isFlushing = false

    init(
        baseURL: URL,
        session: URLSession = .shared,
        outboxURL: URL? = nil,
        status: OLOControlPlaneStatus? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.status = status
        let resolvedURL = outboxURL ?? Self.defaultOutboxURL()
        self.outboxURL = resolvedURL
        if FileManager.default.fileExists(atPath: resolvedURL.path) {
            do {
                self.pending = try JSONDecoder().decode(
                    [OLOQueuedControlPlaneRequest].self,
                    from: Data(contentsOf: resolvedURL)
                )
            } catch {
                Self.logger.error("Unable to read control-plane outbox: \(String(describing: error), privacy: .public)")
                self.pending = []
            }
        } else {
            self.pending = []
        }
        let initialCount = pending.count
        Task { @MainActor in status?.configure(endpoint: baseURL, pendingCount: initialCount) }
    }

    func enqueue<T: Encodable & Sendable>(
        path: String,
        method: String = "POST",
        idempotencyKey: String? = nil,
        body: T
    ) async {
        do {
            let request = OLOQueuedControlPlaneRequest(
                id: UUID(),
                path: path,
                method: method,
                idempotencyKey: idempotencyKey,
                body: try Self.encode(body)
            )
            pending.append(request)
            try persist()
            await status?.queued(pending.count)
            Task { await retryPending() }
        } catch {
            Self.logger.error("Unable to persist control-plane request: \(String(describing: error), privacy: .public)")
            await status?.failed(error.localizedDescription, pendingCount: pending.count)
        }
    }

    func flush() async throws {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }
        while let item = pending.first {
            var request = URLRequest(url: baseURL.appending(path: item.path))
            request.httpMethod = item.method
            request.httpBody = item.body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let key = item.idempotencyKey {
                request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
            }
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw OLOControlPlaneError.invalidResponse
            }
            guard 200..<300 ~= http.statusCode else {
                throw OLOControlPlaneError.server(statusCode: http.statusCode)
            }
            pending.removeFirst()
            try persist()
            await status?.synced(pending.count)
        }
    }

    func retryPending() async {
        do {
            try await flush()
        } catch {
            Self.logger.error("Control-plane sync deferred: \(String(describing: error), privacy: .public)")
            await status?.failed(error.localizedDescription, pendingCount: pending.count)
        }
    }

    func receipt(actionID: String) async throws -> OLOActionReceiptContract {
        let url = baseURL.appending(path: "/v1/actions/\(actionID)/receipt")
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw OLOControlPlaneError.invalidResponse
        }
        guard 200..<300 ~= http.statusCode else {
            throw OLOControlPlaneError.server(statusCode: http.statusCode)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(OLOActionReceiptContract.self, from: data)
    }

    private func persist() throws {
        let directory = outboxURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(pending).write(
            to: outboxURL,
            options: [.atomic, .completeFileProtection]
        )
    }

    private static func defaultOutboxURL() -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appending(path: "OLO/control-plane-outbox-v1.json")
    }

    private static func encode<T: Encodable>(_ body: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(body)
    }
}
