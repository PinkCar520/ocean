import Foundation

/// A transcript fragment from speech recognition.
///
/// `isFinal == false` means a live partial; `true` means recognition has
/// settled and the text is stable enough to hand to the agent.
public struct VoiceTranscript: Sendable, Hashable {
    public let text: String
    public let isFinal: Bool
    public init(text: String, isFinal: Bool) {
        self.text = text
        self.isFinal = isFinal
    }
}

/// The state of speech/microphone authorization on this body.
public enum VoiceAuthorization: Sendable, Equatable {
    case granted
    case denied
    case restricted
    case notDetermined
}

/// A device-agnostic voice input service (Spec §48: microphone → speech
/// recognition → AgentRequest). The protocol lives in Core so any body
/// can host a different implementation; the default iPhone implementation
/// (AVFoundation + Speech) lives in the Services layer.
/// UI-facing lifecycle coordinator; audio callbacks have separate ownership.
@MainActor
public protocol VoiceService: AnyObject, Sendable {
    /// Whether a recognizer for the current locale is available at all.
    func isAvailable() async -> Bool

    /// Request both microphone and speech-recognition authorization.
    func requestAuthorization() async -> VoiceAuthorization

    /// Start listening. Returns a stream of partial/final transcripts.
    /// Throws `VoiceError` if unauthorized or unavailable.
    func start() async throws -> AsyncThrowingStream<VoiceTranscript, Error>

    /// Enable automatic endpointing for tap-to-talk, disable for push-to-talk.
    func setAutomaticEndpointing(_ enabled: Bool)

    /// Finish input and drain final recognition results.
    func finish() async

    /// Stop listening and cancel the current capture.
    func stop() async

    /// Live normalized microphone level for the Voice UI.
    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?)
}

public extension VoiceService {
    func finish() async { await stop() }
    func setAutomaticEndpointing(_ enabled: Bool) {}
    func setLevelHandler(_ handler: (@Sendable (Float) -> Void)?) {}
}

public enum VoiceError: Error, Sendable {
    case unauthorized            // user denied mic or speech recognition
    case unavailable(String)     // no recognizer / no network for on-device
    case audioEngineFailed(String)
    case timeout                 // recognition exceeded the safety limit
    case alreadyListening
    case recognitionFailed(String)
    case interrupted
    case cancelled
}
