import AppIntents

// Shared App Intent declaration for the widget extension. Execution is
// requested in the containing app, which owns the microphone and voice UI.
struct TalkToOLOIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to OLO"
    static let description = IntentDescription("Start a voice conversation with OLO.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
