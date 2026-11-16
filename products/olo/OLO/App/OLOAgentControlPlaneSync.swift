import Foundation

protocol AgentControlPlaneSyncing: Sendable {
    func capture(request: AgentRequest) async
    func startAction(
        taskID: UUID,
        actionID: String,
        requestID: String,
        toolID: String,
        arguments: [String: String]
    ) async
    func updateAction(
        actionID: String,
        status: String,
        providerRef: String?,
        evidence: [String: String],
        summary: String
    ) async
    func retryPending() async
}

extension AgentControlPlaneSyncing {
    func retryPending() async {}
}

actor OLOAgentControlPlaneSync: AgentControlPlaneSyncing {
    private struct PendingUpdate: Sendable {
        let status: String
        let providerRef: String?
        let evidence: [String: String]
        let summary: String
    }

    private struct PendingStart: Sendable {
        let actionID: String
        let requestID: String
        let toolID: String
        let arguments: [String: String]
    }

    private let client: OLOControlPlaneClient?
    private let ledger: OLOActionReceiptLedger
    private let subjectID: String
    private let bodyID: String
    private var readyTaskIDs: Set<UUID> = []
    private var pendingStarts: [UUID: [PendingStart]] = [:]
    private var readyActionIDs: Set<String> = []
    private var pendingUpdates: [String: [PendingUpdate]] = [:]
    private var intentByTaskID: [UUID: String] = [:]

    init(
        client: OLOControlPlaneClient?,
        ledger: OLOActionReceiptLedger,
        subjectID: String,
        bodyID: String
    ) {
        self.client = client
        self.ledger = ledger
        self.subjectID = subjectID
        self.bodyID = bodyID
    }

    @MainActor
    static func configuredFromEnvironment(
        ledger: OLOActionReceiptLedger,
        status: OLOControlPlaneStatus
    ) -> OLOAgentControlPlaneSync {
        let defaults = UserDefaults.standard
        let subjectID = stableIdentifier(key: "OLOControlPlaneSubjectID", prefix: "person", defaults: defaults)
        let bodyID = stableIdentifier(key: "OLOControlPlaneBodyID", prefix: "iphone", defaults: defaults)
        let client: OLOControlPlaneClient?
        if let rawURL = ProcessInfo.processInfo.environment["OLO_CONTROL_PLANE_URL"],
           let url = URL(string: rawURL),
           let scheme = url.scheme,
           ["http", "https"].contains(scheme) {
            let configured = OLOControlPlaneClient(baseURL: url, status: status)
            Task { await configured.retryPending() }
            client = configured
        } else {
            status.configure(endpoint: nil)
            client = nil
        }
        return OLOAgentControlPlaneSync(
            client: client,
            ledger: ledger,
            subjectID: subjectID,
            bodyID: bodyID
        )
    }

    func capture(request: AgentRequest) async {
        intentByTaskID[request.id] = request.input
        let taskID = "task_\(request.id.uuidString.lowercased())"
        var payload = ["inputSource": request.source.rawValue]
        if let location = request.context.locationSummary { payload["location"] = location }
        if let timeOfDay = request.context.timeOfDay { payload["timeOfDay"] = timeOfDay.rawValue }
        payload["upcomingEventCount"] = String(request.context.upcomingEventCount)
        let observation = OLOObservationContract(
            id: "obs_\(request.id.uuidString.lowercased())",
            schemaVersion: 1,
            subjectId: subjectID,
            kind: "agent.request.context",
            payload: payload,
            source: OLOObservationSourceContract(
                provider: "olo.ios",
                bodyId: bodyID,
                sourceRef: taskID
            ),
            observedAt: request.context.timestamp,
            receivedAt: .now,
            validUntil: request.context.timestamp.addingTimeInterval(3600),
            confidence: 1,
            sensitivity: .personal,
            permissionScope: "agent.request"
        )
        if let client {
            await client.enqueue(
                path: "/v1/observations",
                idempotencyKey: observation.id,
                body: observation
            )
            await client.enqueue(
                path: "/v1/intents",
                idempotencyKey: taskID,
                body: OLOIntentContract(id: taskID, subjectId: subjectID, rawIntent: request.input)
            )
        }
        readyTaskIDs.insert(request.id)
        let deferred = pendingStarts.removeValue(forKey: request.id) ?? []
        for start in deferred {
            await bootstrapAction(taskID: request.id, start: start)
        }
    }

    func startAction(
        taskID: UUID,
        actionID: String,
        requestID: String,
        toolID: String,
        arguments: [String: String]
    ) async {
        let start = PendingStart(
            actionID: actionID,
            requestID: requestID,
            toolID: toolID,
            arguments: arguments
        )
        guard readyTaskIDs.contains(taskID) else {
            pendingStarts[taskID, default: []].append(start)
            return
        }
        await bootstrapAction(taskID: taskID, start: start)
    }

    private func bootstrapAction(taskID: UUID, start: PendingStart) async {
        let actionID = start.actionID
        let capability = capabilityIdentifier(for: start.toolID)
        let taskContractID = "task_\(taskID.uuidString.lowercased())"
        let planID = "plan_\(taskID.uuidString.lowercased())"
        await ledger.begin(
            actionID: actionID,
            requestID: start.requestID,
            taskID: taskID,
            capability: capability,
            intent: intentByTaskID[taskID] ?? "OLO action"
        )
        if let client {
            await client.enqueue(
                path: "/v1/bodies/\(bodyID)/capabilities",
                body: OLOCapabilityContract(
                    capability: capability,
                    execution: "device",
                    sideEffect: "reversible_write",
                    supportsIdempotency: true,
                    supportsQuery: true,
                    supportsCancel: true
                )
            )
            await client.enqueue(
                path: "/v1/plans/\(planID)/decisions",
                body: OLOPermissionDecisionContract(
                    subjectId: subjectID,
                    capability: capability,
                    purpose: "user_requested_action",
                    planRevision: 1,
                    decision: "confirmed",
                    reason: "User confirmed the displayed local proposal"
                )
            )
            await client.enqueue(
                path: "/v1/actions",
                idempotencyKey: start.requestID,
                body: OLOActionCreateContract(
                    id: actionID,
                    requestId: start.requestID,
                    subjectId: subjectID,
                    taskId: taskContractID,
                    planId: planID,
                    planRevision: 1,
                    capability: capability,
                    arguments: start.arguments,
                    permissionDecision: "confirmed"
                )
            )
            await sendRemoteUpdate(
                actionID: actionID,
                update: PendingUpdate(
                    status: "submitted",
                    providerRef: nil,
                    evidence: [:],
                    summary: "Dispatched to the iPhone body"
                )
            )
        }
        readyActionIDs.insert(actionID)
        let deferred = pendingUpdates.removeValue(forKey: actionID) ?? []
        for update in deferred {
            await sendUpdate(actionID: actionID, update: update)
        }
    }

    func updateAction(
        actionID: String,
        status: String,
        providerRef: String?,
        evidence: [String: String],
        summary: String
    ) async {
        let update = PendingUpdate(
            status: status,
            providerRef: providerRef,
            evidence: evidence,
            summary: summary
        )
        guard readyActionIDs.contains(actionID) else {
            pendingUpdates[actionID, default: []].append(update)
            return
        }
        await sendUpdate(actionID: actionID, update: update)
    }

    func retryPending() async {
        await client?.retryPending()
    }

    private func sendUpdate(actionID: String, update: PendingUpdate) async {
        await ledger.update(
            actionID: actionID,
            status: update.status,
            providerRef: update.providerRef,
            evidence: update.evidence,
            summary: update.summary
        )
        await sendRemoteUpdate(actionID: actionID, update: update)
    }

    private func sendRemoteUpdate(actionID: String, update: PendingUpdate) async {
        guard let client else { return }
        await client.enqueue(
            path: "/v1/actions/\(actionID)/results",
            body: OLOActionResultContract(
                status: update.status,
                providerRef: update.providerRef,
                evidence: update.evidence,
                summary: update.summary
            )
        )
    }

    private func capabilityIdentifier(for toolID: String) -> String {
        switch toolID {
        case ReminderTool.identifier: "apple.reminders.create.v1"
        case "wake.alarm.schedule": "apple.alarms.schedule.v1"
        default: toolID
        }
    }

    private static func stableIdentifier(
        key: String,
        prefix: String,
        defaults: UserDefaults
    ) -> String {
        if let existing = defaults.string(forKey: key) { return existing }
        let created = "\(prefix)_\(UUID().uuidString.lowercased())"
        defaults.set(created, forKey: key)
        return created
    }
}
