import AppIntents
import Foundation

// The Control extension opens a foreground URL route. Only the containing
// application owns microphone permissions, voice capture, and the voice UI.
struct TalkToOLOIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to OLO"
    static let description = IntentDescription("Start a voice conversation with OLO.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & OpensIntent {
        // The extension cannot access the containing app's in-memory state.
        // Open a documented URL route handled by the foreground app instead.
        guard let url = URL(string: "olo://talk") else { throw TalkToOLOLaunchError.invalidURL }
        return .result(opensIntent: OpenURLIntent(url))
    }
}

private enum TalkToOLOLaunchError: Error {
    case invalidURL
}
