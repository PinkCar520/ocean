import EventKit
import Foundation

enum WakeCalendarError: LocalizedError {
    case denied
    case noUpcomingCommitment

    var errorDescription: String? {
        switch self {
        case .denied: "OLO 没有日历访问权限。请在系统设置中允许后重试。"
        case .noUpcomingCommitment: "未来七天没有可用于起床规划的日程。"
        }
    }
}

protocol WakeCalendarProviding: Sendable {
    func nextCommitment(now: Date) async throws -> WakeCommitment
}

actor WakeCalendarService: WakeCalendarProviding {
    private let store = EKEventStore()

    func nextCommitment(now: Date = .now) async throws -> WakeCommitment {
        let status = EKEventStore.authorizationStatus(for: .event)
        let granted: Bool
        switch status {
        case .fullAccess: granted = true
        case .notDetermined: granted = try await store.requestFullAccessToEvents()
        default: granted = false
        }
        guard granted else { throw WakeCalendarError.denied }
        let end = Calendar.current.date(byAdding: .day, value: 7, to: now) ?? now
        let predicate = store.predicateForEvents(withStart: now, end: end, calendars: nil)
        guard let event = store.events(matching: predicate)
            .filter({ !$0.isAllDay && $0.startDate > now })
            .sorted(by: { $0.startDate < $1.startDate })
            .first else { throw WakeCalendarError.noUpcomingCommitment }
        return WakeCommitment(
            id: event.eventIdentifier ?? UUID().uuidString,
            title: event.title ?? "日程",
            startDate: event.startDate,
            location: event.location
        )
    }
}
