import AppIntents
import Foundation
import Observation

/// Foreground-only system entry. The app owns microphone permissions and audio.
struct TalkToOLOIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to OLO"
    static let description = IntentDescription("Start a voice conversation with OLO.")
    static let openAppWhenRun: Bool = true

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

    /// Accept only the exact voice entry route. Do not interpret arbitrary
    /// external URLs as requests to activate the microphone.
    @discardableResult
    func request(for url: URL) -> Bool {
        guard url.scheme?.lowercased() == "olo",
              url.host?.lowercased() == "talk",
              url.path.isEmpty || url.path == "/",
              url.user == nil, url.password == nil,
              url.port == nil, url.query == nil, url.fragment == nil else {
            return false
        }
        request()
        return true
    }

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
