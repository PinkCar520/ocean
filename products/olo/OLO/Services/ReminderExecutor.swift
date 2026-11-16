import Foundation
import EventKit

@MainActor
final class ReminderExecutor: ReminderExecuting {
    private let store = EKEventStore()

    func authorize() async throws {
        switch EKEventStore.authorizationStatus(for: .reminder) {
        case .fullAccess: return
        case .notDetermined:
            guard try await store.requestFullAccessToReminders() else { throw ReminderExecutionError.permissionDenied }
        default: throw ReminderExecutionError.permissionDenied
        }
    }

    func create(_ intent: ReminderIntent) throws -> String {
        guard EKEventStore.authorizationStatus(for: .reminder) == .fullAccess else { throw ReminderExecutionError.permissionDenied }
        guard let calendar = store.defaultCalendarForNewReminders() else { throw ReminderExecutionError.noCalendar }
        let reminder = EKReminder(eventStore: store)
        reminder.title = intent.title
        reminder.calendar = calendar
        reminder.dueDateComponents = Calendar.current.dateComponents([.calendar, .timeZone, .year, .month, .day, .hour, .minute], from: intent.dueDate)
        reminder.addAlarm(EKAlarm(absoluteDate: intent.dueDate))
        try store.save(reminder, commit: true)
        return reminder.calendarItemIdentifier
    }

    func verify(identifier: String, intent: ReminderIntent) throws {
        guard let saved = store.calendarItem(withIdentifier: identifier) as? EKReminder,
              saved.title == intent.title,
              let components = saved.dueDateComponents,
              let date = Calendar.current.date(from: components),
              abs(date.timeIntervalSince(intent.dueDate)) < 60,
              saved.alarms?.contains(where: { alarm in
                  guard let date = alarm.absoluteDate else { return false }
                  return abs(date.timeIntervalSince(intent.dueDate)) < 60
              }) == true else { throw ReminderExecutionError.verificationFailed }
    }
}

private enum ReminderExecutionError: LocalizedError {
    case permissionDenied, noCalendar, verificationFailed
    var errorDescription: String? {
        switch self {
        case .permissionDenied: "需要在系统设置中允许 OLO 访问提醒事项"
        case .noCalendar: "没有可用的提醒事项列表"
        case .verificationFailed: "提醒已写入，但内容或闹钟未能核实；请在系统提醒事项中检查，勿重复创建"
        }
    }
}

