@preconcurrency import AlarmKit
import AppIntents
import Foundation
import SwiftUI

struct WakeAlarmMetadata: AlarmMetadata {
    let commitmentID: String
}

enum WakeAlarmSystemState: Equatable, Sendable {
    case scheduled
    case alerting
    case unavailable
}

enum WakeAlarmError: LocalizedError {
    case denied
    case datePassed
    case verificationFailed
    case cancellationFailed

    var errorDescription: String? {
        switch self {
        case .denied: "OLO 没有创建系统闹钟的权限。"
        case .datePassed: "计算出的起床时间已经过去，请调整计划。"
        case .verificationFailed: "系统没有返回已创建的闹钟，请重试。"
        case .cancellationFailed: "系统仍然保留这个闹钟，请重试取消。"
        }
    }
}

protocol WakeAlarmManaging: Sendable {
    func schedule(plan: WakePlan, id: UUID, now: Date) async throws -> UUID
    func cancel(id: UUID) async throws
    func state(id: UUID) async throws -> WakeAlarmSystemState
}

actor WakeAlarmService: WakeAlarmManaging {
    private let manager = AlarmManager.shared

    func schedule(plan: WakePlan, id: UUID, now: Date = .now) async throws -> UUID {
        guard plan.wakeDate > now else { throw WakeAlarmError.datePassed }
        var authorization = manager.authorizationState
        if authorization == .notDetermined {
            authorization = try await manager.requestAuthorization()
        }
        guard authorization == .authorized else { throw WakeAlarmError.denied }

        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = .init(title: "该起床了 · \(plan.commitment.title)")
        } else {
            alert = .init(
                title: "该起床了 · \(plan.commitment.title)",
                stopButton: AlarmButton(text: "停止", textColor: .white, systemImageName: "stop.fill")
            )
        }
        let presentation = AlarmPresentation(alert: alert)
        let attributes = AlarmAttributes(
            presentation: presentation,
            metadata: WakeAlarmMetadata(commitmentID: plan.commitment.id),
            tintColor: .orange
        )
        let configuration = AlarmManager.AlarmConfiguration.alarm(
            schedule: .fixed(plan.wakeDate),
            attributes: attributes,
            stopIntent: WakeAlarmStoppedIntent(alarmID: id.uuidString)
        )
        _ = try await manager.schedule(id: id, configuration: configuration)
        guard try manager.alarms.contains(where: { $0.id == id }) else {
            throw WakeAlarmError.verificationFailed
        }
        return id
    }

    func cancel(id: UUID) throws {
        if try manager.alarms.contains(where: { $0.id == id }) {
            try manager.cancel(id: id)
        }
        guard try !manager.alarms.contains(where: { $0.id == id }) else {
            throw WakeAlarmError.cancellationFailed
        }
    }

    func state(id: UUID) throws -> WakeAlarmSystemState {
        guard let alarm = try manager.alarms.first(where: { $0.id == id }) else {
            return .unavailable
        }
        return alarm.state == .alerting ? .alerting : .scheduled
    }
}

struct WakeAlarmStoppedIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "记录已停止起床闹钟"
    static let description = IntentDescription("记录用户停止了 OLO 起床闹钟。")

    @Parameter(title: "Alarm ID")
    var alarmID: String

    init(alarmID: String) {
        self.alarmID = alarmID
    }

    init() {
        alarmID = ""
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) {
            try await JSONWakeRecordStore.shared.transition(alarmID: id, to: .stopped, at: .now)
        }
        return .result()
    }
}
