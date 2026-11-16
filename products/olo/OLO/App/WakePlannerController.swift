import Foundation
import Observation

@MainActor
@Observable
final class WakePlannerController {
    enum Status: Equatable {
        case idle, loading, ready, scheduling, cancelling, awakeConfirmed
        case scheduled(UUID), alerting(UUID), stopped(UUID), failed(String)
    }

    var preparationMinutes = 47 { didSet { invalidateProposal() } }
    var travelMinutes = 45 { didSet { invalidateProposal() } }
    private(set) var commitment: WakeCommitment?
    private(set) var record: WakeSessionRecord?
    private(set) var proposal: WakeProposal?
    private(set) var status: Status = .idle { didSet { onChange?() } }
    private(set) var isBusy = false
    @ObservationIgnored var onChange: (@MainActor () -> Void)?
    @ObservationIgnored private var restored = false
    @ObservationIgnored private var controlPlaneSync: (any AgentControlPlaneSyncing)?
    private let calendar: any WakeCalendarProviding
    private let alarms: any WakeAlarmManaging
    private let records: any WakeRecordStoring

    init(calendar: any WakeCalendarProviding = WakeCalendarService(),
         alarms: any WakeAlarmManaging = WakeAlarmService(),
         records: any WakeRecordStoring = JSONWakeRecordStore.shared) {
        self.calendar = calendar
        self.alarms = alarms
        self.records = records
    }

    func configure(controlPlaneSync: (any AgentControlPlaneSyncing)?) {
        self.controlPlaneSync = controlPlaneSync
    }

    var plan: WakePlan? {
        commitment.flatMap {
            WakePlan.make(commitment: $0, preparationMinutes: preparationMinutes, travelMinutes: travelMinutes)
        }
    }

    var hasActiveAlarm: Bool {
        guard let state = record?.state else { return false }
        return state != .awakeConfirmed && state != .cancelled
    }

    var message: String {
        switch status {
        case .idle: "长按 OLO，说出你的起床安排。"
        case .loading: "正在读取日程…"
        case .ready: record?.state == .cancelled ? "闹钟已取消" : "请核对起床时间与准备、通勤时长。"
        case .scheduling: "正在创建并核验闹钟…"
        case .scheduled: "系统闹钟已创建并核验"
        case .alerting: "起床闹钟正在响"
        case .stopped: "闹钟已停止，等待你确认醒来。"
        case .cancelling: "正在更新并核验闹钟…"
        case .awakeConfirmed: "已确认醒来，SR-001 完成"
        case .failed(let message): message
        }
    }

    var snapshot: WakeSharedSnapshot {
        WakeSharedSnapshot(proposal: proposal, record: record, message: message, busy: isBusy)
    }

    func restore() async {
        guard !restored, !isBusy else { return }
        isBusy = true
        defer { isBusy = false; onChange?() }
        do {
            if let saved = try await records.load() { apply(saved); try await reconcile() }
            restored = true
        } catch { status = .failed("无法恢复起床计划：\(error.localizedDescription)") }
    }

    func loadCommitment() async {
        await restore()
        guard restored, !isBusy, !hasActiveAlarm else { return }
        isBusy = true
        defer { isBusy = false; onChange?() }
        status = .loading
        proposal = nil
        do {
            commitment = try await calendar.nextCommitment(now: .now)
            if let plan { proposal = WakeProposal(plan: plan) }
            status = .ready
        } catch {
            commitment = nil
            status = .failed(error.localizedDescription)
        }
    }

    func schedule() async {
        await restore()
        guard restored, !isBusy, !hasActiveAlarm, let plan else { return }
        if proposal?.plan != plan { proposal = WakeProposal(plan: plan) }
        guard let proposal, proposal.expiresAt > .now else {
            status = .failed("这份计划已过期，请重新读取日程并核对。")
            return
        }
        isBusy = true
        defer { isBusy = false; onChange?() }
        status = .scheduling
        let id = UUID()
        var saved = WakeSessionRecord(plan: plan, alarmID: id)
        saved.proposalID = proposal.id
        saved.state = .scheduling
        do {
            // Reserve a durable identity before touching AlarmKit. A crash or
            // lost reply cannot cause a retry to create a second alarm.
            try await records.save(saved)
        } catch {
            status = .failed("无法保存计划，未创建闹钟：\(error.localizedDescription)")
            return
        }
        record = saved
        await beginActionReceipt(for: saved)
        var systemAlarmVerified = false
        do {
            _ = try await alarms.schedule(plan: plan, id: id, now: .now)
            systemAlarmVerified = true
            saved.transition(to: .scheduled)
            try await records.save(saved)
            record = saved
            self.proposal = nil
            status = .scheduled(id)
            await recordVerifiedAction(for: saved)
        } catch {
            let original = error.localizedDescription
            do {
                try await alarms.cancel(id: id)
                // 'saved' may have reached scheduled before its save failed.
                saved.transition(to: .cancelled)
                try await records.save(saved)
                record = saved
                status = .failed("未能完成计划，闹钟已取消：\(original)")
                await recordFailedAction(
                    for: saved,
                    systemAlarmVerified: systemAlarmVerified,
                    compensationVerified: true,
                    summary: original
                )
            } catch {
                status = .failed("闹钟结果待核对，请先取消或刷新，勿重复创建：\(error.localizedDescription)")
                await recordFailedAction(
                    for: saved,
                    systemAlarmVerified: systemAlarmVerified,
                    compensationVerified: false,
                    summary: error.localizedDescription
                )
            }
        }
    }

    func refreshAlarmState() async throws {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false; onChange?() }
        do {
            try await reconcile()
        } catch {
            status = .failed("无法核对闹钟：\(error.localizedDescription)")
            throw error
        }
    }

    private func reconcile() async throws {
        guard var saved = try await records.load() else { return }
        // Completed records must not overwrite a new uncommitted proposal.
        if proposal != nil, saved.state == .cancelled || saved.state == .awakeConfirmed { return }
        apply(saved)
        switch saved.state {
        case .awakeConfirmed: status = .awakeConfirmed; return
        case .cancelled: status = .ready; return
        case .stopped: status = .stopped(saved.alarmID); return
        default: break
        }
        switch try await alarms.state(id: saved.alarmID) {
        case .scheduled:
            if saved.state == .scheduling {
                saved.transition(to: .scheduled)
                try await records.save(saved)
                record = saved
            }
            status = .scheduled(saved.alarmID)
        case .alerting:
            try await records.transition(alarmID: saved.alarmID, to: .alerting, at: .now)
            // Re-read because an AppIntent may have stopped the alarm meanwhile.
            if let latest = try await records.load() {
                record = latest
                status = latest.state == .stopped ? .stopped(saved.alarmID) : .alerting(saved.alarmID)
            }
        case .unavailable:
            status = .failed("系统中已找不到这个闹钟。OLO 不会把它视为已醒，请确认醒来或取消这份计划。")
        }
    }

    func cancelAlarm() async { await finish(as: .cancelled) }
    func confirmAwake() async { await finish(as: .awakeConfirmed) }

    private func finish(as state: WakeLifecycleState) async {
        guard !isBusy, hasActiveAlarm, var saved = record else { return }
        isBusy = true
        defer { isBusy = false; onChange?() }
        status = .cancelling
        do {
            try await alarms.cancel(id: saved.alarmID)
            saved.transition(to: state)
            try await records.save(saved)
            record = saved
            proposal = nil
            status = state == .awakeConfirmed ? .awakeConfirmed : .ready
        } catch { status = .failed("未能更新闹钟，请重试：\(error.localizedDescription)") }
    }

    func resetCompletedPlan() async {
        guard !isBusy, !hasActiveAlarm else { return }
        isBusy = true
        defer { isBusy = false; onChange?() }
        do {
            try await records.clear()
            record = nil
            commitment = nil
            proposal = nil
            status = .idle
        } catch { status = .failed("无法清除已完成计划：\(error.localizedDescription)") }
    }

    /// All remote writes enter the same serialized execution boundary as iPhone.
    func handle(_ command: WakeCommand) async -> WakeReply {
        await restore()
        func reply(_ error: String? = nil) -> WakeReply {
            WakeReply(commandID: command.id, snapshot: snapshot, error: error)
        }
        guard command.version == 1 else { return reply("请更新两端的 OLO。") }
        guard command.kind == .refresh || abs(command.createdAt.timeIntervalSinceNow) < 120 else {
            return reply("操作已过期，请刷新后重新确认。")
        }
        guard !isBusy else { return reply("计划正在处理，请稍后刷新。") }
        switch command.kind {
        case .refresh:
            do { try await refreshAlarmState() } catch { return reply(message) }
        case .prepare:
            guard let input = command.input, input.count <= 1000, WakeVoiceIntent.matches(input) else {
                return reply("请说“根据日程安排我起床”。目前只处理日程起床规划。")
            }
            if hasActiveAlarm {
                do { try await refreshAlarmState() } catch { return reply(message) }
            } else { await loadCommitment() }
        case .adjust:
            guard !hasActiveAlarm, let current = proposal, command.proposalID == current.id,
                  let preparation = command.preparationMinutes, let travel = command.travelMinutes,
                  (0...240).contains(preparation), (0...360).contains(travel) else {
                return reply("计划已改变，请刷新后重新调整。")
            }
            preparationMinutes = preparation
            travelMinutes = travel
        case .confirm:
            if let id = command.proposalID, record?.proposalID == id {
                return reply() // Replay, including after cancellation or restart.
            }
            guard let current = proposal, current.id == command.proposalID,
                  current.plan == plan, current.expiresAt > .now else {
                return reply("计划已改变或过期，请重新读取并核对。")
            }
            await schedule()
        case .cancel, .awake:
            guard let saved = record, saved.alarmID == command.alarmID else {
                return reply("这条操作不属于当前闹钟，请刷新。")
            }
            if hasActiveAlarm {
                if command.kind == .cancel { await cancelAlarm() } else { await confirmAwake() }
            }
        }
        if case .failed = status { return reply(message) }
        return reply()
    }

    private func invalidateProposal() {
        guard !hasActiveAlarm, !isBusy, let plan else { return }
        proposal = WakeProposal(plan: plan)
        onChange?()
    }

    private func apply(_ saved: WakeSessionRecord) {
        record = saved
        commitment = saved.commitment
        preparationMinutes = saved.preparationMinutes
        travelMinutes = saved.travelMinutes
        proposal = nil
    }

    private func beginActionReceipt(for record: WakeSessionRecord) async {
        guard let controlPlaneSync, let proposalID = record.proposalID else { return }
        let request = AgentRequest(
            id: proposalID,
            input: "根据日程安排起床：\(record.commitment.title)",
            source: .system,
            context: ContextSnapshot(
                timestamp: record.createdAt,
                locationSummary: record.commitment.location,
                upcomingEventCount: 1,
                notes: ["wakeDate=\(record.wakeDate.ISO8601Format())"]
            )
        )
        await controlPlaneSync.capture(request: request)
        await controlPlaneSync.startAction(
            taskID: proposalID,
            actionID: actionID(for: record),
            requestID: "request_wake_\(record.alarmID.uuidString.lowercased())",
            toolID: "wake.alarm.schedule",
            arguments: [
                "alarmID": record.alarmID.uuidString.lowercased(),
                "commitmentID": record.commitment.id,
                "commitmentTitle": record.commitment.title,
                "wakeDate": record.wakeDate.ISO8601Format(),
                "departureDate": record.departureDate.ISO8601Format()
            ]
        )
    }

    private func recordVerifiedAction(for record: WakeSessionRecord) async {
        guard let controlPlaneSync else { return }
        let actionID = actionID(for: record)
        let providerRef = record.alarmID.uuidString.lowercased()
        await controlPlaneSync.updateAction(
            actionID: actionID,
            status: "accepted",
            providerRef: providerRef,
            evidence: [:],
            summary: "AlarmKit accepted the wake alarm"
        )
        await controlPlaneSync.updateAction(
            actionID: actionID,
            status: "completed",
            providerRef: providerRef,
            evidence: [:],
            summary: "AlarmKit created the wake alarm"
        )
        await controlPlaneSync.updateAction(
            actionID: actionID,
            status: "verified",
            providerRef: providerRef,
            evidence: [
                "alarmID": providerRef,
                "providerReadback": providerRef,
                "systemState": "scheduled",
                "wakeDate": record.wakeDate.ISO8601Format()
            ],
            summary: "Verified by AlarmKit UUID read-back"
        )
    }

    private func recordFailedAction(
        for record: WakeSessionRecord,
        systemAlarmVerified: Bool,
        compensationVerified: Bool,
        summary: String
    ) async {
        guard let controlPlaneSync else { return }
        let actionID = actionID(for: record)
        let providerRef = systemAlarmVerified ? record.alarmID.uuidString.lowercased() : nil
        if systemAlarmVerified {
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "accepted",
                providerRef: providerRef,
                evidence: [:],
                summary: "AlarmKit accepted the wake alarm before local persistence failed"
            )
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "completed",
                providerRef: providerRef,
                evidence: [:],
                summary: "AlarmKit created the wake alarm before compensation"
            )
        }
        let status = systemAlarmVerified || !compensationVerified ? "outcome_unknown" : "rejected"
        await controlPlaneSync.updateAction(
            actionID: actionID,
            status: status,
            providerRef: providerRef,
            evidence: ["compensationVerified": String(compensationVerified)],
            summary: summary
        )
    }

    private func actionID(for record: WakeSessionRecord) -> String {
        "act_wake_\(record.alarmID.uuidString.lowercased())"
    }
}
