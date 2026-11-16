import Foundation

enum WakeLifecycleState: String, Codable, Equatable, Sendable {
    case scheduling
    case scheduled
    case alerting
    case stopped
    case awakeConfirmed
    case cancelled
}

struct WakeSessionRecord: Codable, Equatable, Sendable {
    var proposalID: UUID?
    let alarmID: UUID
    let commitment: WakeCommitment
    let wakeDate: Date
    let departureDate: Date
    let preparationMinutes: Int
    let travelMinutes: Int
    let arrivalBufferMinutes: Int
    let createdAt: Date
    var updatedAt: Date
    var state: WakeLifecycleState

    init(plan: WakePlan, alarmID: UUID, now: Date = .now) {
        self.alarmID = alarmID
        commitment = plan.commitment
        wakeDate = plan.wakeDate
        departureDate = plan.departureDate
        preparationMinutes = plan.preparationMinutes
        travelMinutes = plan.travelMinutes
        arrivalBufferMinutes = plan.arrivalBufferMinutes
        createdAt = now
        updatedAt = now
        state = .scheduled
    }

    mutating func transition(to state: WakeLifecycleState, at date: Date = .now) {
        // A late system Stop callback must never undo an explicit terminal result.
        guard self.state != .awakeConfirmed && self.state != .cancelled else { return }
        self.state = state
        updatedAt = date
    }
}
