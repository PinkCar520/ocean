import Foundation
import Observation

@MainActor
protocol WakeCommandSending {
    func send(_ command: WakeCommand) async throws -> WakeReply
}

/// The companion displays phone-owned state. It cannot schedule locally or
/// turn a transport acknowledgement into a successful alarm result.
@MainActor
@Observable
final class WakeCompanionController {
    private(set) var snapshot: WakeSharedSnapshot?
    private(set) var isBusy = false
    private(set) var error: String?
    private let sender: any WakeCommandSending

    init(sender: any WakeCommandSending) { self.sender = sender }

    func receive(_ value: WakeSharedSnapshot) {
        guard value.version == 1, value.sentAt >= (snapshot?.sentAt ?? .distantPast) else { return }
        snapshot = value
    }

    func refresh() async { await perform(WakeCommand(kind: .refresh)) }
    func prepare(_ text: String) async {
        await perform(WakeCommand(kind: .prepare, input: text))
    }
    func adjust(preparation: Int, travel: Int) async {
        guard let proposal = snapshot?.proposal else { return }
        await perform(WakeCommand(kind: .adjust, proposalID: proposal.id,
                                  preparationMinutes: preparation, travelMinutes: travel))
    }
    func confirm() async {
        guard let proposal = snapshot?.proposal else { return }
        await perform(WakeCommand(kind: .confirm, proposalID: proposal.id))
    }
    func cancel() async { await finish(.cancel) }
    func awake() async { await finish(.awake) }
    private func finish(_ kind: WakeCommandKind) async {
        guard let record = snapshot?.record else { return }
        await perform(WakeCommand(kind: kind, alarmID: record.alarmID))
    }

    private func perform(_ command: WakeCommand) async {
        guard !isBusy else { return }
        isBusy = true
        error = nil
        defer { isBusy = false }
        do {
            let reply = try await sender.send(command)
            guard reply.commandID == command.id, reply.snapshot.version == 1 else {
                error = "收到的结果与本次操作不匹配，请刷新。"
                return
            }
            receive(reply.snapshot)
            error = reply.error
        } catch {
            self.error = "未核验本次操作：\(error.localizedDescription)"
        }
    }
}
