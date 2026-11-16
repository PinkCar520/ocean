import Foundation
import Observation
import EventKit
@preconcurrency import AlarmKit

@MainActor
@Observable
final class WakePhoneCoordinator {
    let connection = WakeConnectivity.shared
    private(set) var authorizationMessage = "在 iPhone 授权一次，即可从 Watch 发起日程起床规划。"
    private(set) var requestingAuthorization = false
    private let planner: WakePlannerController
    @ObservationIgnored private var alarmUpdates: Task<Void, Never>?
    @ObservationIgnored var privacyEnabled: (@MainActor () -> Bool)?

    init(planner: WakePlannerController) {
        self.planner = planner
        planner.onChange = { [weak self] in self?.publish() }
        connection.requestHandler = { [weak self] command in
            guard let self else {
                return WakeReply(commandID: command.id, snapshot: planner.snapshot, error: "iPhone 正在启动，请重试。")
            }
            if self.privacyEnabled?() == true, command.kind == .prepare || command.kind == .confirm {
                return WakeReply(commandID: command.id, snapshot: planner.snapshot, error: "请先关闭 iPhone OLO 的隐私模式。")
            }
            // A watch request cannot present first-use authorization UI on a
            // background iPhone. The user grants these once in the phone app.
            if command.kind == .prepare, EKEventStore.authorizationStatus(for: .event) != .fullAccess {
                return WakeReply(commandID: command.id, snapshot: planner.snapshot,
                                 error: "请在 iPhone OLO → Settings → Watch 起床规划中授权日历和闹钟。")
            }
            if command.kind == .confirm, AlarmManager.shared.authorizationState != .authorized {
                return WakeReply(commandID: command.id, snapshot: planner.snapshot,
                                 error: "请在 iPhone OLO → Settings → Watch 起床规划中授权闹钟。")
            }
            return await planner.handle(command)
        }
        connection.onReady = { [weak self] in Task { await self?.refresh() } }
        connection.activate()
        alarmUpdates = Task { [weak self] in
            for await _ in AlarmManager.shared.alarmUpdates {
                guard !Task.isCancelled else { return }
                await self?.refresh()
            }
        }
        Task { [weak self] in await self?.refresh() }
    }

    func refresh() async {
        await planner.restore()
        do { try await planner.refreshAlarmState() }
        catch { authorizationMessage = "核对闹钟失败：\(error.localizedDescription)" }
        publish()
    }

    private func publish() { connection.publish(planner.snapshot) }

    func authorize() async {
        guard !requestingAuthorization else { return }
        requestingAuthorization = true
        defer { requestingAuthorization = false }
        do {
            let store = EKEventStore()
            let calendar = EKEventStore.authorizationStatus(for: .event) == .fullAccess
                ? true : try await store.requestFullAccessToEvents()
            guard calendar else { throw WakeCalendarError.denied }
            let manager = AlarmManager.shared
            let alarm = manager.authorizationState == .notDetermined
                ? try await manager.requestAuthorization() : manager.authorizationState
            guard alarm == .authorized else { throw WakeAlarmError.denied }
            authorizationMessage = "已授权。现在可以长按 Watch 上的 OLO，说“根据日程安排我起床”。"
        } catch { authorizationMessage = error.localizedDescription }
    }
}
