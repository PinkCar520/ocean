import Foundation

/// A snapshot of the context surrounding the current user moment.
///
/// Context is what makes OLO proactive and situationally aware: time,
/// location, recent activity, calendar pressure. A body gathers what it
/// can; the agent reasons over it.
public struct ContextSnapshot: Codable, Sendable, Hashable {
    public var timestamp: Date
    public var locationSummary: String?
    public var timeOfDay: TimeOfDay?
    public var upcomingEventCount: Int
    public var notes: [String]

    public init(
        timestamp: Date = .now,
        locationSummary: String? = nil,
        timeOfDay: TimeOfDay? = nil,
        upcomingEventCount: Int = 0,
        notes: [String] = []
    ) {
        self.timestamp = timestamp
        self.locationSummary = locationSummary
        self.timeOfDay = timeOfDay
        self.upcomingEventCount = upcomingEventCount
        self.notes = notes
    }
}

public enum TimeOfDay: String, Codable, Sendable {
    case morning, afternoon, evening, night
}

/// Something a body can offer to enrich OLO's context.
public protocol ContextProvider: AnyObject, Sendable {
    func snapshot() async -> ContextSnapshot
}
