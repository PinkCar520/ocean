import Foundation
import Observation
@preconcurrency import WatchConnectivity

enum WakeConnectionError: LocalizedError {
    case unavailable, timeout, invalidReply
    var errorDescription: String? {
        switch self {
        case .unavailable: "尚未连接 iPhone。请打开配对 iPhone 上的 OLO，再刷新。"
        case .timeout: "尚未收到 iPhone 的核验结果。请刷新确认，勿重复创建闹钟。"
        case .invalidReply: "两端数据不匹配，请更新 OLO 后刷新。"
        }
    }
}

private final class WakeDataReply: @unchecked Sendable {
    let send: (Data) -> Void
    init(_ send: @escaping (Data) -> Void) { self.send = send }
}

/// Commands use live request/reply only; delayed background delivery must not
/// create an alarm after the user has abandoned an interaction.
@MainActor
@Observable
final class WakeConnectivity: NSObject, WCSessionDelegate, WakeCommandSending {
    static let shared = WakeConnectivity()
    private(set) var connectionMessage = "正在连接配对设备…"
    @ObservationIgnored var requestHandler: (@MainActor (WakeCommand) async -> WakeReply)?
    @ObservationIgnored var snapshotHandler: (@MainActor (WakeSharedSnapshot) -> Void)?
    @ObservationIgnored var onReady: (@MainActor () -> Void)?
    @ObservationIgnored private let session: WCSession? = WCSession.isSupported() ? .default : nil
    @ObservationIgnored private var latestData: Data?
    @ObservationIgnored private var pending: [UUID: CheckedContinuation<WakeReply, Error>] = [:]

    func activate() {
        guard let session else { connectionMessage = "此设备不支持配对同步"; return }
        session.delegate = self
        session.activate()
    }

    func publish(_ snapshot: WakeSharedSnapshot) {
        do {
            latestData = try JSONEncoder().encode(snapshot)
            try flush()
        } catch { connectionMessage = "同步失败：\(error.localizedDescription)" }
    }

    private func flush() throws {
        guard let session, session.activationState == .activated, let latestData else { return }
        #if os(iOS)
        guard session.isPaired, session.isWatchAppInstalled else { return }
        #endif
        try session.updateApplicationContext(["wake": latestData])
    }

    func send(_ command: WakeCommand) async throws -> WakeReply {
        guard let session, session.activationState == .activated, session.isReachable else {
            throw WakeConnectionError.unavailable
        }
        let data = try JSONEncoder().encode(command)
        return try await withCheckedThrowingContinuation { continuation in
            pending[command.id] = continuation
            session.sendMessageData(data, replyHandler: { [weak self] data in
                Task { @MainActor in
                    do {
                        let reply = try JSONDecoder().decode(WakeReply.self, from: data)
                        guard reply.commandID == command.id, reply.snapshot.version == 1 else {
                            throw WakeConnectionError.invalidReply
                        }
                        self?.complete(command.id, result: .success(reply))
                    } catch { self?.complete(command.id, result: .failure(error)) }
                }
            }, errorHandler: { [weak self] error in
                Task { @MainActor in self?.complete(command.id, result: .failure(error)) }
            })
            Task { [weak self] in
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                self?.complete(command.id, result: .failure(WakeConnectionError.timeout))
            }
        }
    }

    private func complete(_ id: UUID, result: Result<WakeReply, Error>) {
        pending.removeValue(forKey: id)?.resume(with: result)
    }

    private func receive(_ data: Data) {
        do {
            let snapshot = try JSONDecoder().decode(WakeSharedSnapshot.self, from: data)
            guard snapshot.version == 1 else { throw WakeConnectionError.invalidReply }
            snapshotHandler?(snapshot)
        } catch { connectionMessage = "无法读取同步计划：\(error.localizedDescription)" }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext["wake"] as? Data
        let reachable = session.isReachable
        Task { @MainActor in
            connectionMessage = error.map { "连接失败：\($0.localizedDescription)" }
                ?? (reachable ? "配对设备已连接" : "配对设备暂不可达；显示上次同步")
            if let context { receive(context) }
            do { try flush() } catch { connectionMessage = "同步失败：\(error.localizedDescription)" }
            if activationState == .activated { onReady?() }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            connectionMessage = reachable ? "配对设备已连接" : "配对设备暂不可达；显示上次同步"
            if reachable { onReady?() }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let data = applicationContext["wake"] as? Data else { return }
        Task { @MainActor in receive(data) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessageData messageData: Data, replyHandler: @escaping (Data) -> Void) {
        let callback = WakeDataReply(replyHandler)
        Task { @MainActor in
            do {
                let command = try JSONDecoder().decode(WakeCommand.self, from: messageData)
                guard let requestHandler else { callback.send(Data()); return }
                let reply = await requestHandler(command)
                callback.send(try JSONEncoder().encode(reply))
            } catch {
                connectionMessage = "无法处理配对请求：\(error.localizedDescription)"
                callback.send(Data())
            }
        }
    }

    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in
            do { try flush() } catch { connectionMessage = "同步失败：\(error.localizedDescription)" }
        }
    }
    #endif
}
