import XCTest
@testable import OLO

@MainActor
final class ControlledAgentRuntimeTests: XCTestCase {
    final class Store: AgentTaskSaving {
        var tasks: [AgentTask] = []
        var failCompleted = false
        var failExecuting = false
        func save(_ task: AgentTask) throws {
            if failCompleted && task.status == .completed { throw Failure.test }
            if failExecuting && task.status == .executing { throw Failure.test }
            tasks.append(task)
        }
    }
    enum Failure: Error { case test }
    struct StubUnderstanding: AgentUnderstanding {
        let result: AgentInterpretation
        func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation { result }
    }
    struct FailingUnderstanding: AgentUnderstanding {
        func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation { throw Failure.test }
    }
    struct SlowUnderstanding: AgentUnderstanding {
        func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation {
            try await Task.sleep(for: .seconds(10))
            throw Failure.test
        }
    }
    final class Executor: ReminderExecuting {
        var creates = 0
        var failVerify = false
        var authorization: CheckedContinuation<Void, any Error>?
        func authorize() async throws {
            try await withCheckedThrowingContinuation { authorization = $0 }
        }
        func create(_ intent: ReminderIntent) throws -> String { creates += 1; return "saved-id" }
        func verify(identifier: String, intent: ReminderIntent) throws {
            if failVerify { throw Failure.test }
        }
    }

    private func runtime(
        understanding: any AgentUnderstanding = RuleBasedAgentUnderstanding(),
        executor: Executor,
        store: Store
    ) -> ControlledAgentRuntime {
        let registry = ToolRegistry()
        registry.register(ReminderTool(executor: executor))
        return ControlledAgentRuntime(understanding: understanding, registry: registry, repository: store)
    }

    private func prepared(_ executor: Executor, _ store: Store) async -> ControlledAgentRuntime {
        let agent = runtime(executor: executor, store: store)
        agent.start(AgentRequest(input: "明天九点提醒我开会", source: .text, context: ContextSnapshot()))
        await waitUntil { agent.canConfirm }
        return agent
    }
    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<2000 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("Timed out waiting for lifecycle transition")
    }

    func testChineseTimeAndRejectAmbiguousInputs() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 8, hour: 8))!
        let intent = ReminderIntent.parse("明天九点提醒我开会", now: now, calendar: calendar)
        XCTAssertEqual(intent?.title, "开会")
        XCTAssertEqual(intent.map { calendar.component(.hour, from: $0.dueDate) }, 9)
        XCTAssertEqual(intent.map { calendar.component(.day, from: $0.dueDate) }, 9)
        XCTAssertEqual(ReminderIntent.parse("明天下午两点半提醒我喝水", now: now, calendar: calendar).map { calendar.component(.minute, from: $0.dueDate) }, 30)
        for text in ["提醒我买2个苹果", "今天七点提醒我开会", "明天25点提醒我开会", "每周九点提醒我开会", "明天九点和十点提醒我开会"] {
            XCTAssertNil(ReminderIntent.parse(text, now: now, calendar: calendar), text)
        }
    }

    func testRepeatedConfirmationCreatesOnceAndVerifies() async {
        let executor = Executor(), store = Store()
        let request = AgentRequest(input: "明天九点提醒我开会", source: .text, context: ContextSnapshot())
        let agent = runtime(executor: executor, store: store)
        agent.start(request)
        XCTAssertTrue(agent.canResume(request))
        await waitUntil { agent.canConfirm }
        agent.confirm()
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        executor.authorization?.resume()
        await waitUntil { agent.task?.status.isTerminal == true }
        XCTAssertEqual(executor.creates, 1)
        XCTAssertEqual(agent.task?.status, .completed)
        XCTAssertFalse(agent.canResume(request))
        XCTAssertTrue(store.tasks.contains { $0.status == .verifying })
        agent.confirm()
        XCTAssertEqual(executor.creates, 1)
    }

    func testCancelDuringAuthorizationDoesNotWrite() async {
        let executor = Executor(), store = Store()
        let agent = await prepared(executor, store)
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        agent.cancel()
        executor.authorization?.resume()
        for _ in 0..<50 { await Task.yield() }
        XCTAssertEqual(executor.creates, 0)
        XCTAssertEqual(agent.task?.status, .cancelled)
    }

    func testVerificationFailureDoesNotAllowBlindRetry() async {
        let executor = Executor(), store = Store()
        executor.failVerify = true
        let agent = await prepared(executor, store)
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        executor.authorization?.resume()
        await waitUntil { agent.task?.status.isTerminal == true }
        XCTAssertEqual(agent.task?.status, .partial)
        agent.retry()
        agent.confirm()
        XCTAssertEqual(executor.creates, 1)
    }

    func testHistoryFailureAfterCreationIsNotReportedAsExecutionFailure() async {
        let executor = Executor(), store = Store()
        store.failCompleted = true
        let agent = await prepared(executor, store)
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        executor.authorization?.resume()
        await waitUntil { agent.task?.status.isTerminal == true }
        XCTAssertEqual(agent.task?.status, .partial)
        XCTAssertNotNil(agent.persistenceError)
        agent.retryHistorySave()
        XCTAssertNil(agent.persistenceError)
        XCTAssertEqual(executor.creates, 1)
    }

    func testInitialSaveFailurePreventsExecutionAndLeavesRetryAvailable() async {
        let executor = Executor(), store = Store()
        let agent = await prepared(executor, store)
        store.failExecuting = true
        agent.confirm()
        XCTAssertEqual(executor.creates, 0)
        XCTAssertFalse(agent.isBusy)
        XCTAssertEqual(agent.task?.status, .failed)
        store.failExecuting = false
        agent.retry()
        XCTAssertTrue(agent.canConfirm)
    }

    func testPermissionDenialCanBeRetriedWithoutCreatingAnything() async {
        let executor = Executor(), store = Store()
        let agent = await prepared(executor, store)
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        executor.authorization?.resume(throwing: Failure.test)
        await waitUntil { agent.task?.status == .failed }
        XCTAssertEqual(executor.creates, 0)
        agent.retry()
        XCTAssertTrue(agent.canConfirm)
    }

    func testLateAuthorizationCannotChangeReplacementTask() async {
        let executor = Executor(), store = Store()
        let agent = await prepared(executor, store)
        agent.confirm()
        await waitUntil { executor.authorization != nil }
        agent.cancel()
        agent.start(AgentRequest(input: "明天十点提醒我喝水", source: .text, context: ContextSnapshot()))
        executor.authorization?.resume()
        await waitUntil { agent.title == "喝水" && agent.task?.status == .waitingForPermission }
        XCTAssertEqual(agent.title, "喝水")
        XCTAssertEqual(agent.task?.status, .waitingForPermission)
        XCTAssertEqual(executor.creates, 0)
    }

    func testModelCanRequestMissingTimeAndUserResolvesIt() async {
        let executor = Executor(), store = Store()
        let interpretation = AgentInterpretation(
            kind: .reminder,
            title: "去机场",
            dueDate: nil,
            missingFields: [.time],
            explanation: "知道事项，但没有准确时间。",
            source: .onDeviceModel
        )
        let agent = runtime(understanding: StubUnderstanding(result: interpretation), executor: executor, store: store)
        agent.start(AgentRequest(input: "下午提醒我去机场", source: .text, context: ContextSnapshot()))
        await waitUntil { agent.task?.status == .needsInformation }
        XCTAssertFalse(agent.canConfirm)
        XCTAssertEqual(agent.interpretationSource, .onDeviceModel)
        agent.updateDueDate(.now.addingTimeInterval(7200))
        XCTAssertEqual(agent.task?.status, .waitingForPermission)
        XCTAssertTrue(agent.canConfirm)
    }

    func testClarificationMergesIntoSameTask() async {
        let executor = Executor(), store = Store()
        let agent = runtime(executor: executor, store: store)
        let request = AgentRequest(input: "下午提醒我去机场", source: .text, context: ContextSnapshot())
        agent.start(request)
        await waitUntil { agent.task?.status == .needsInformation }
        XCTAssertEqual(agent.clarificationQuestion, "你希望几点提醒？")

        agent.provideInformation(AgentRequest(
            id: request.id,
            input: "三点半",
            source: .voice,
            context: ContextSnapshot()
        ))
        await waitUntil { agent.task?.status == .waitingForPermission }

        XCTAssertEqual(agent.task?.id, request.id)
        XCTAssertEqual(agent.task?.rawIntent, request.input)
        XCTAssertEqual(agent.task?.clarifications.count, 1)
        XCTAssertEqual(agent.task?.clarifications.first?.question, "你希望几点提醒？")
        XCTAssertEqual(agent.task?.clarifications.first?.answer, "三点半")
        XCTAssertEqual(agent.task?.clarifications.first?.source, .voice)
        XCTAssertEqual(agent.title, "去机场")
        XCTAssertEqual(Calendar.current.component(.hour, from: agent.dueDate), 15)
        XCTAssertEqual(Calendar.current.component(.minute, from: agent.dueDate), 30)
        XCTAssertTrue(agent.canConfirm)
    }

    func testUnsupportedIntentCannotReachReminderTool() async {
        let executor = Executor(), store = Store()
        let interpretation = AgentInterpretation(
            kind: .unsupported,
            title: nil,
            dueDate: nil,
            missingFields: [],
            explanation: "这不是提醒请求。",
            source: .onDeviceModel
        )
        let agent = runtime(understanding: StubUnderstanding(result: interpretation), executor: executor, store: store)
        agent.start(AgentRequest(input: "帮我查天气", source: .text, context: ContextSnapshot()))
        await waitUntil { agent.task?.status == .failed }
        XCTAssertFalse(agent.isReminderRequest)
        XCTAssertFalse(agent.canConfirm)
        XCTAssertEqual(executor.creates, 0)
    }

    func testModelFailureFallsBackToRules() async throws {
        let understanding = ResilientAgentUnderstanding(primary: FailingUnderstanding(), fallback: RuleBasedAgentUnderstanding())
        let result = try await understanding.understand(
            AgentRequest(input: "明天九点提醒我开会", source: .text, context: ContextSnapshot()),
            now: .now,
            timeZone: .current
        )
        XCTAssertEqual(result.kind, .reminder)
        XCTAssertEqual(result.source, .ruleFallback)
        XCTAssertTrue(result.explanation.contains("基础规则"))
    }

    func testUnderstandingTimeoutIsVisible() async {
        let understanding = TimedAgentUnderstanding(base: SlowUnderstanding(), timeout: .milliseconds(1))
        do {
            _ = try await understanding.understand(
                AgentRequest(input: "提醒我开会", source: .text, context: ContextSnapshot()),
                now: .now,
                timeZone: .current
            )
            XCTFail("Expected timeout")
        } catch AgentUnderstandingError.timedOut {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
