import Foundation
import Observation
import SwiftUI

/// The hub that wires OLO's device-agnostic Core to a specific body
/// (the iPhone app, today). Every body hosts an `OLOCenter`; the same
/// `OLOIdentity`, `MemoryStore`, `AgentRuntime`, etc. can be carried to
/// a future body with a different host.
///
/// `@Observable` — modern iOS 26 observation. If `swift-plugin-server`
/// reports malformed under a nested sandbox (Trae, CI), that's a host
/// issue, not something the source code should downgrade for.
@Observable
@MainActor
final class OLOCenter {
    let actionReceiptLedger = OLOActionReceiptLedger()
    let controlPlaneStatus = OLOControlPlaneStatus()
    let wakePlanner: WakePlannerController
    var identity: OLOIdentity

    /// Current presentation state of OLO on this body. Drives the entity animation.
    var state: OLOState

    /// Privacy mode: OLO stops visual sensing and the entity inverts. Not an
    /// `OLOState` — it's a switch the user can toggle any time, independent of
    /// what OLO is currently doing (matches the OLO One physical prototype).
    var privacyMode: Bool

    // Service slots — filled in as phases land.
    var memoryStore: (any MemoryStore)?
    var contextProvider: (any ContextProvider)?
    var agentRuntime: ControlledAgentRuntime?
    var controlPlaneSync: (any AgentControlPlaneSyncing)?
    var voiceService: (any VoiceService)?

    /// Live partial transcript from the voice service, shown under the entity.
    var liveTranscript: String

    /// The most recent request handed to the controlled Agent understanding layer.
    var lastVoiceRequest: AgentRequest?

    init(identity: OLOIdentity = OLOIdentity(), state: OLOState = .idle) {
        self.identity = identity
        self.wakePlanner = WakePlannerController()
        self.state = state
        self.privacyMode = false
        self.liveTranscript = ""
    }

    /// Wire up services for a body. Later phases call this as features
    /// come online.
    func attach(
        memory: (any MemoryStore)? = nil,
        context: (any ContextProvider)? = nil,
        agent: ControlledAgentRuntime? = nil,
        voice: (any VoiceService)? = nil
    ) {
        self.memoryStore = memory
        self.contextProvider = context
        self.agentRuntime = agent
        self.voiceService = voice
    }
}
