import Foundation

struct WakeCommitment: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let title: String
    let startDate: Date
    let location: String?
}

struct WakePlan: Codable, Equatable, Sendable {
    let commitment: WakeCommitment
    let wakeDate: Date
    let departureDate: Date
    let preparationMinutes: Int
    let travelMinutes: Int
    let arrivalBufferMinutes: Int

    static func make(
        commitment: WakeCommitment,
        preparationMinutes: Int,
        travelMinutes: Int,
        arrivalBufferMinutes: Int = 10
    ) -> WakePlan? {
        guard (0...240).contains(preparationMinutes),
              (0...360).contains(travelMinutes),
              (0...120).contains(arrivalBufferMinutes) else { return nil }
        let departure = commitment.startDate.addingTimeInterval(
            -TimeInterval((travelMinutes + arrivalBufferMinutes) * 60)
        )
        let wake = departure.addingTimeInterval(-TimeInterval(preparationMinutes * 60))
        return WakePlan(
            commitment: commitment,
            wakeDate: wake,
            departureDate: departure,
            preparationMinutes: preparationMinutes,
            travelMinutes: travelMinutes,
            arrivalBufferMinutes: arrivalBufferMinutes
        )
    }
}
