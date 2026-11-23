import AppIntents
import Foundation
import Observation

/// Foreground-only system entry. The app owns microphone permissions and audio.
struct TalkToOLOIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to OLO"
    static var description = IntentDescription("Start a voice conversation with OLO.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        OLOVoiceLaunch.shared.request()
        return .result()
    }
}

struct OLOAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TalkToOLOIntent(),
            phrases: ["Talk to \(.applicationName)", "Start talking to \(.applicationName)"],
            shortTitle: "Talk to OLO",
            systemImageName: "waveform"
        )
    }
}

/// An in-process, one-shot launch request. Never records audio in an extension.
@MainActor
@Observable
final class OLOVoiceLaunch {
    static let shared = OLOVoiceLaunch()
    private(set) var requestID = UUID()
    private(set) var pending = false

    func request() {
        pending = true
        requestID = UUID()
    }

    func consume() -> Bool {
        guard pending else { return false }
        pending = false
        return true
    }
}
