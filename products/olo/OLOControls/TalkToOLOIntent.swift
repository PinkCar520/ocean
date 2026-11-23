import AppIntents

// Shared App Intent declaration for the widget extension. Execution is
// requested in the containing app, which owns the microphone and voice UI.
struct TalkToOLOIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to OLO"
    static var description = IntentDescription("Start a voice conversation with OLO.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
