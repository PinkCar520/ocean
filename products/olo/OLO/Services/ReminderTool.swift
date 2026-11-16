import Foundation

@MainActor
final class ReminderTool: VerifiableTool {
    nonisolated static let identifier = "reminder"
    let name = "系统提醒"
    let summary = "在 iPhone 的提醒事项中创建带闹钟的提醒"
    let parameterSchema = [
        ToolParameter(key: "title", description: "提醒事项"),
        ToolParameter(key: "dueDate", description: "ISO 8601 格式的未来时间")
    ]
    let permissionLevel: PermissionLevel = .execute

    private let executor: any ReminderExecuting

    init(executor: any ReminderExecuting) {
        self.executor = executor
    }

    func execute(arguments: [String: String]) async throws -> ToolResult {
        let intent = try intent(from: arguments)
        try await executor.authorize()
        try Task.checkCancellation()
        let identifier = try executor.create(intent)
        return ToolResult(summary: "已写入系统提醒", payload: ["identifier": identifier])
    }

    func verify(result: ToolResult, arguments: [String: String]) async throws {
        guard let identifier = result.payload["identifier"] else {
            throw ToolError.executionFailed("工具没有返回提醒标识")
        }
        try executor.verify(identifier: identifier, intent: intent(from: arguments))
    }

    private func intent(from arguments: [String: String]) throws -> ReminderIntent {
        guard let title = arguments["title"], !title.isEmpty else { throw ToolError.missingParameter("title") }
        guard let rawDate = arguments["dueDate"], let date = ISO8601DateFormatter().date(from: rawDate), date > .now else {
            throw ToolError.missingParameter("dueDate")
        }
        return ReminderIntent(title: title, dueDate: date)
    }
}
