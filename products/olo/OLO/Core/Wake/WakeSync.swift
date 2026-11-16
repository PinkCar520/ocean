import Foundation

struct WakeProposal: Codable, Equatable, Sendable {
    let id: UUID
    let plan: WakePlan
    let expiresAt: Date

    init(plan: WakePlan, now: Date = .now) {
        id = UUID()
        self.plan = plan
        expiresAt = min(plan.wakeDate, now.addingTimeInterval(15 * 60))
    }
}

enum WakeCommandKind: String, Codable, Sendable {
    case refresh, prepare, adjust, confirm, cancel, awake
}

/// Commands name the exact proposal or alarm the person saw. They are never
/// queued for later execution when a phone is unreachable.
struct WakeCommand: Codable, Sendable {
    var version = 1
    var id = UUID()
    var createdAt = Date.now
    let kind: WakeCommandKind
    var proposalID: UUID?
    var alarmID: UUID?
    var input: String?
    var preparationMinutes: Int?
    var travelMinutes: Int?
}

struct WakeSharedSnapshot: Codable, Equatable, Sendable {
    var version = 1
    var sentAt = Date.now
    let proposal: WakeProposal?
    let record: WakeSessionRecord?
    let message: String
    let busy: Bool

    var hasActiveAlarm: Bool {
        guard let state = record?.state else { return false }
        return state != .cancelled && state != .awakeConfirmed
    }
}

struct WakeReply: Codable, Sendable {
    let commandID: UUID
    let snapshot: WakeSharedSnapshot
    var error: String?
}
