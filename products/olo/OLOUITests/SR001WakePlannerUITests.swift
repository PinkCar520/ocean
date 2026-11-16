import XCTest

@MainActor
final class SR001WakePlannerUITests: XCTestCase {
    func testActionsShowsOfflineReceiptAndSyncSurface() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 3))
        let entry = app.buttons["actions.entry"]
        for _ in 0..<5 where !entry.isHittable { app.swipeUp() }
        XCTAssertTrue(entry.isHittable)
        entry.tap()

        XCTAssertTrue(app.navigationBars["Actions"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["仅本地执行记录"].exists)
        XCTAssertTrue(app.staticTexts["Control Plane"].exists)
    }

    func testDebugViewOpensRealWakePlannerAndReportsCalendarResult() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 3))
        app.tabBars.buttons["Settings"].tap()
        let entry = app.buttons["wake.debug.entry"]
        for _ in 0..<4 where !entry.isHittable { app.swipeUp() }
        XCTAssertTrue(entry.isHittable)
        entry.tap()

        XCTAssertTrue(app.navigationBars["起床计划"].waitForExistence(timeout: 3))
        let readCalendar = app.buttons["读取下一项日程"]
        XCTAssertTrue(readCalendar.exists)
        readCalendar.tap()

        let outcome = app.staticTexts["未来七天没有可用于起床规划的日程。"]
        XCTAssertTrue(outcome.waitForExistence(timeout: 5))
    }
}
