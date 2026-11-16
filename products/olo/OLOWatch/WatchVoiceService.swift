import Foundation
#if canImport(WatchKit)
import WatchKit
#endif

/// Uses the watchOS system text-input controller. Choosing Dictation produces
/// real recognized text; OLO never substitutes voice-activity placeholders.
@MainActor
final class WatchVoiceService: VoiceService {
    private var isPresenting = false

    func isAvailable() async -> Bool {
        visibleController != nil
    }

    func requestAuthorization() async -> VoiceAuthorization {
        visibleController == nil ? .restricted : .granted
    }

    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error> {
        guard !isPresenting else { throw VoiceError.alreadyListening }
        guard let controller = visibleController else {
            throw VoiceError.unavailable("系统听写当前不可用")
        }
        isPresenting = true
        defer { isPresenting = false }
        let results = await controller.presentTextInputController(
            withSuggestions: ["根据明天的日程安排我起床", "明天几点叫醒我"],
            allowedInputMode: .plain
        )
        let (stream, continuation) = AsyncThrowingStream<VoiceTranscript, Error>.makeStream()
        if let text = results?.compactMap({ $0 as? String }).first,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            continuation.yield(VoiceTranscript(text: text, isFinal: true))
        }
        continuation.finish()
        return stream
    }

    func stop() async {
        guard isPresenting else { return }
        visibleController?.dismissTextInputController()
        isPresenting = false
    }

    private var visibleController: WKInterfaceController? {
        WKApplication.shared().visibleInterfaceController
    }
}
