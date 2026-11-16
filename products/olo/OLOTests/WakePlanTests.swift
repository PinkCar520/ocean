import XCTest
@testable import OLO

final class WakePlanTests: XCTestCase {
    func testRecognizesWakePlanningVoiceIntent() {
        for input in ["根据明天的日程安排我起床", "明天几点叫醒我？", "Set an alarm and wake me up"] {
            XCTAssertTrue(WakeVoiceIntent.matches(input), input)
        }
        for input in ["提醒我买牛奶", "我已经起床了", "", "今天天气怎么样"] {
            XCTAssertFalse(WakeVoiceIntent.matches(input), input)
        }
    }

    func testCalculatesWakeAndDepartureFromCommitment() throws {
        let event = WakeCommitment(id: "event", title: "Review", startDate: Date(timeIntervalSince1970: 10_000), location: nil)
        let plan = try XCTUnwrap(WakePlan.make(commitment: event, preparationMinutes: 47, travelMinutes: 53))
        XCTAssertEqual(plan.departureDate, event.startDate.addingTimeInterval(-63 * 60))
        XCTAssertEqual(plan.wakeDate, event.startDate.addingTimeInterval(-110 * 60))
    }

    func testRejectsEveryOutOfRangeInput() {
        let event = WakeCommitment(id: "event", title: "Review", startDate: .now, location: nil)
        XCTAssertNil(WakePlan.make(commitment: event, preparationMinutes: -1, travelMinutes: 30))
        XCTAssertNil(WakePlan.make(commitment: event, preparationMinutes: 241, travelMinutes: 30))
        XCTAssertNil(WakePlan.make(commitment: event, preparationMinutes: 30, travelMinutes: -1))
        XCTAssertNil(WakePlan.make(commitment: event, preparationMinutes: 30, travelMinutes: 361))
        XCTAssertNil(WakePlan.make(commitment: event, preparationMinutes: 30, travelMinutes: 30, arrivalBufferMinutes: 121))
    }

    func testWakeRecordRoundTripsAndTransitions() throws {
        let event = WakeCommitment(id: "event", title: "Review", startDate: Date(timeIntervalSince1970: 20_000), location: "Office")
        let plan = try XCTUnwrap(WakePlan.make(commitment: event, preparationMinutes: 30, travelMinutes: 20))
        let id = UUID()
        var record = WakeSessionRecord(plan: plan, alarmID: id, now: Date(timeIntervalSince1970: 1_000))
        record.transition(to: .awakeConfirmed, at: Date(timeIntervalSince1970: 2_000))
        let decoded = try JSONDecoder().decode(WakeSessionRecord.self, from: JSONEncoder().encode(record))
        XCTAssertEqual(decoded, record)
        XCTAssertEqual(decoded.state, .awakeConfirmed)
    }
}

@MainActor
final class WakePlannerControllerTests: XCTestCase {
    func testSchedulePersistsOnlyAfterVerifiedAlarm() async throws {
        let calendar = FakeWakeCalendar()
        let alarms = FakeWakeAlarms()
        let records = FakeWakeRecords()
        let controller = WakePlannerController(calendar: calendar, alarms: alarms, records: records)
        await controller.loadCommitment()
        await controller.schedule()
        guard case .scheduled(let id) = controller.status else { return XCTFail("Expected scheduled") }
        let saved = await records.load()
        let scheduleCount = await alarms.counts().schedule
        XCTAssertEqual(saved?.alarmID, id)
        XCTAssertEqual(scheduleCount, 1)
    }

    func testScheduleUsesSharedActionLifecycleAndVerificationReceipt() async throws {
        let sync = FakeControlPlaneSync()
        let controller = WakePlannerController(
            calendar: FakeWakeCalendar(),
            alarms: FakeWakeAlarms(),
            records: FakeWakeRecords()
        )
        controller.configure(controlPlaneSync: sync)

        await controller.loadCommitment()
        await controller.schedule()

        let events = await sync.recordedEvents()
        XCTAssertEqual(events.first, "capture")
        XCTAssertTrue(events.contains("start:wake.alarm.schedule"))
        XCTAssertTrue(events.contains("status:accepted"))
        XCTAssertTrue(events.contains("status:completed"))
        XCTAssertEqual(events.last, "status:verified")
        let evidence = await sync.lastEvidence()
        XCTAssertEqual(evidence["systemState"], "scheduled")
        XCTAssertNotNil(evidence["providerReadback"])
    }

    func testLocalActionReceiptSurvivesLedgerRestart() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appending(path: "olo-receipt-\(UUID().uuidString).json")
        let taskID = UUID()
        let ledger = OLOActionReceiptLedger(fileURL: fileURL)
        await ledger.begin(
            actionID: "act_test",
            requestID: "request_test",
            taskID: taskID,
            capability: "apple.alarms.schedule.v1",
            intent: "安排起床"
        )
        await ledger.update(
            actionID: "act_test",
            status: "verified",
            providerRef: "alarm_test",
            evidence: ["providerReadback": "alarm_test"],
            summary: "AlarmKit read-back verified"
        )

        let restarted = OLOActionReceiptLedger(fileURL: fileURL)
        let persisted = await restarted.all()
        let receipt = try XCTUnwrap(persisted.first)
        XCTAssertEqual(receipt.status, "verified")
        XCTAssertEqual(receipt.evidence["providerReadback"], "alarm_test")
        XCTAssertEqual(receipt.taskID, taskID)
    }

    func testDuplicateScheduleIsIgnored() async throws {
        let alarms = FakeWakeAlarms()
        let controller = WakePlannerController(calendar: FakeWakeCalendar(), alarms: alarms, records: FakeWakeRecords())
        await controller.loadCommitment()
        await controller.schedule()
        await controller.schedule()
        let scheduleCount = await alarms.counts().schedule
        XCTAssertEqual(scheduleCount, 1)
    }

    func testInitialPersistenceFailurePreventsScheduling() async {
        let alarms = FakeWakeAlarms()
        let records = FakeWakeRecords(failSave: true)
        let controller = WakePlannerController(calendar: FakeWakeCalendar(), alarms: alarms, records: records)
        await controller.loadCommitment()
        await controller.schedule()
        guard case .failed = controller.status else { return XCTFail("Expected failure") }
        let cancelCount = await alarms.counts().cancel
        XCTAssertEqual(cancelCount, 0)
    }

    func testConfirmAwakeCancelsAlarmAndPersistsState() async throws {
        let alarms = FakeWakeAlarms()
        let records = FakeWakeRecords()
        let controller = WakePlannerController(calendar: FakeWakeCalendar(), alarms: alarms, records: records)
        await controller.loadCommitment()
        await controller.schedule()
        await controller.confirmAwake()
        XCTAssertEqual(controller.status, .awakeConfirmed)
        let saved = await records.load()
        let cancelCount = await alarms.counts().cancel
        XCTAssertEqual(saved?.state, .awakeConfirmed)
        XCTAssertEqual(cancelCount, 1)
    }

    func testCancellationPersistsCancelledState() async {
        let alarms = FakeWakeAlarms()
        let records = FakeWakeRecords()
        let controller = WakePlannerController(calendar: FakeWakeCalendar(), alarms: alarms, records: records)
        await controller.loadCommitment()
        await controller.schedule()
        await controller.cancelAlarm()
        let saved = await records.load()
        let cancelCount = await alarms.counts().cancel
        XCTAssertEqual(saved?.state, .cancelled)
        XCTAssertEqual(controller.status, .ready)
        XCTAssertEqual(cancelCount, 1)
    }

    func testMissingSystemAlarmDoesNotInferAwake() async throws {
        let event = WakeCommitment(id: "event", title: "Review", startDate: .now.addingTimeInterval(10_000), location: nil)
        let plan = try XCTUnwrap(WakePlan.make(commitment: event, preparationMinutes: 30, travelMinutes: 20))
        let records = FakeWakeRecords(initialRecord: WakeSessionRecord(plan: plan, alarmID: UUID()))
        let controller = WakePlannerController(calendar: FakeWakeCalendar(), alarms: FakeWakeAlarms(), records: records)
        await controller.restore()
        let saved = await records.load()
        guard case .failed(let message) = controller.status else { return XCTFail("Expected failure") }
        XCTAssertTrue(message.contains("不会把它视为已醒"))
        XCTAssertNotEqual(saved?.state, .awakeConfirmed)
    }
}

private actor FakeWakeCalendar: WakeCalendarProviding {
    func nextCommitment(now: Date) -> WakeCommitment {
        WakeCommitment(id: "event", title: "Review", startDate: now.addingTimeInterval(10_000), location: nil)
    }
}

private actor FakeWakeAlarms: WakeAlarmManaging {
    private(set) var scheduleCount = 0
    private(set) var cancelCount = 0
    private var activeID: UUID?

    func schedule(plan: WakePlan, id: UUID, now: Date) -> UUID {
        scheduleCount += 1
        activeID = id
        return id
    }

    func cancel(id: UUID) {
        cancelCount += 1
        activeID = nil
    }

    func state(id: UUID) -> WakeAlarmSystemState {
        activeID == id ? .scheduled : .unavailable
    }

    func counts() -> (schedule: Int, cancel: Int) {
        (scheduleCount, cancelCount)
    }
}

private actor FakeWakeRecords: WakeRecordStoring {
    private var record: WakeSessionRecord?
    private let failSave: Bool

    init(initialRecord: WakeSessionRecord? = nil, failSave: Bool = false) {
        record = initialRecord
        self.failSave = failSave
    }
    func load() -> WakeSessionRecord? { record }
    func save(_ record: WakeSessionRecord) throws {
        if failSave { throw CocoaError(.fileWriteUnknown) }
        self.record = record
    }
    func clear() { record = nil }
    func transition(alarmID: UUID, to state: WakeLifecycleState, at date: Date) {
        guard var value = record, value.alarmID == alarmID else { return }
        value.transition(to: state, at: date)
        record = value
    }
}

private actor FakeControlPlaneSync: AgentControlPlaneSyncing {
    private var events: [String] = []
    private var evidence: [String: String] = [:]

    func capture(request: AgentRequest) {
        events.append("capture")
    }

    func startAction(
        taskID: UUID,
        actionID: String,
        requestID: String,
        toolID: String,
        arguments: [String: String]
    ) {
        events.append("start:\(toolID)")
    }

    func updateAction(
        actionID: String,
        status: String,
        providerRef: String?,
        evidence: [String: String],
        summary: String
    ) {
        events.append("status:\(status)")
        if !evidence.isEmpty { self.evidence = evidence }
    }

    func recordedEvents() -> [String] { events }
    func lastEvidence() -> [String: String] { evidence }
}
