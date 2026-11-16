import SwiftUI
#if canImport(WatchKit)
import WatchKit
#endif

/// OLOWatch — the OLO on your wrist.
///
/// The watch app is intentionally minimal: it only shows the OLO entity.
/// The watch face *is* the OLO One — a black orb with the OLO logo, a
/// camera dot, and a status bar that animates with OLO's state.
///
/// Gesture model matches the OLO One physical prototype:
///   • 轻触 (tap)        — open system dictation
///   • 长按 (long press) — open system dictation for an intentional task
///   • 双击 (double tap) — flip Privacy mode
@main
struct OLOWatchApp: App {
    @State private var center = WatchOLOCenter(voice: WatchVoiceService())

    var body: some Scene {
        WindowGroup {
            WatchHomeView()
                .environment(center)
        }
    }
}

/// Minimal presentation hub for the watch body. The watch keeps a tiny,
/// self-contained slice of OLO's identity + state — enough to drive the
/// entity without dragging in SwiftData, voice services or the agent
/// runtime (which belong to the iPhone body today).
@MainActor
@Observable
final class WatchOLOCenter {
    var state: OLOState = .idle
    var privacyMode: Bool = false

    /// Injected voice service (real microphone + SFSpeechRecognizer).
    let voice: VoiceService?

    init(voice: VoiceService? = nil) {
        self.voice = voice
    }

    /// Update state + trigger the corresponding haptic feedback.
    func setState(_ newState: OLOState, animated: Bool = true) {
        let old = state
        if animated {
            withAnimation { state = newState }
        } else {
            state = newState
        }
        // Haptic feedback for state transitions (PRD §6.3).
        if old != newState {
            haptic(for: newState)
        }
    }

    /// Watch-specific haptic pattern per OLOState.
    private func haptic(for state: OLOState) {
        #if canImport(WatchKit)
        let device = WKInterfaceDevice.current()
        switch state {
        case .listening:
            device.play(.start)          // gentle — "I'm listening"
        case .thinking:
            device.play(.click)          // subtle — "processing"
        case .acting:
            device.play(.click)          // action — "acting now"
        case .needYou:
            device.play(.directionUp)    // attention — "need your input"
        case .done:
            device.play(.success)        // completion — "done"
        case .privacy:
            device.play(.stop)           // — "sensors off"
        case .powerOff:
            device.play(.stop)           // — "power off"
        case .error:
            device.play(.failure)        // — "something went wrong"
        case .idle:
            break                        // returning to standby — no haptic
        }
        #endif
    }
}
