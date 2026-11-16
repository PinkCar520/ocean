import XCTest
@testable import OLO

@MainActor
private final class Permissions: VoicePermissions {
    var waits: [CheckedContinuation<VoiceAuthorization, Never>] = []
    func request() async -> VoiceAuthorization {
        await withCheckedContinuation { waits.append($0) }
    }
    func resolve(_ result: VoiceAuthorization) { waits.removeFirst().resume(returning: result) }
}

@MainActor
private final class Capture: VoiceCapture {
    var starts = 0
    var stops = 0
    let pair = AsyncThrowingStream<VoiceTranscript, Error>.makeStream()
    func start() throws -> AsyncThrowingStream<VoiceTranscript, Error> { starts += 1; return pair.stream }
    func stop() { stops += 1; pair.continuation.finish() }
}

@MainActor
final class VoiceLifecycleTests: XCTestCase {
    private func waitForRequest(_ permissions: Permissions) async {
        for _ in 0..<1000 {
            if !permissions.waits.isEmpty { return }
            await Task.yield()
        }
        XCTFail("Authorization was not requested")
    }

    func testStopDuringAuthorizationNeverStartsCapture() async {
        let permission = Permissions(), capture = Capture()
        let voice = AVVoiceService(permissions: permission, makeCapture: { capture })
        let start = Task { try await voice.start() }
        await waitForRequest(permission)
        await voice.stop()
        permission.resolve(.granted)
        do { _ = try await start.value; XCTFail("Cancelled start succeeded") } catch {}
        XCTAssertEqual(capture.starts, 0)
    }

    func testDeniedPermissionNeverStartsCapture() async {
        let permission = Permissions(), capture = Capture()
        let voice = AVVoiceService(permissions: permission, makeCapture: { capture })
        let start = Task { try await voice.start() }
        await waitForRequest(permission)
        permission.resolve(.denied)
        do { _ = try await start.value; XCTFail("Denied start succeeded") }
        catch VoiceError.unauthorized {} catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertEqual(capture.starts, 0)
    }

    func testOldTerminationDoesNotStopNewSession() async throws {
        let permission = Permissions(), first = Capture(), second = Capture()
        var captures = [first, second]
        let voice = AVVoiceService(permissions: permission, makeCapture: { captures.removeFirst() })
        let start1 = Task { try await voice.start() }
        await waitForRequest(permission); permission.resolve(.granted)
        let stream1 = try await start1.value
        await voice.stop()
        let start2 = Task { try await voice.start() }
        await waitForRequest(permission); permission.resolve(.granted)
        let stream2 = try await start2.value
        for try await _ in stream1 {}
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(second.stops, 0)
        second.pair.continuation.yield(.init(text: "new session", isFinal: true))
        var received = ""
        for try await value in stream2 { received = value.text }
        XCTAssertEqual(received, "new session")
        await voice.stop()
    }

    func testRecognitionErrorPropagates() async throws {
        let permission = Permissions(), capture = Capture()
        let voice = AVVoiceService(permissions: permission, makeCapture: { capture })
        let start = Task { try await voice.start() }
        await waitForRequest(permission); permission.resolve(.granted)
        let stream = try await start.value
        capture.pair.continuation.finish(throwing: VoiceError.recognitionFailed("test"))
        do { for try await _ in stream {}; XCTFail("Error was lost") }
        catch VoiceError.recognitionFailed(let message) { XCTAssertEqual(message, "test") }
        await voice.stop()
    }
}
