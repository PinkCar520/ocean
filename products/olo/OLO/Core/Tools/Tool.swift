import Foundation

/// A capability OLO can use to act on the world (or a body).
///
/// Phase 1 ships five tools: Reminder, Calendar, Weather, WebSearch, Notes.
/// Each tool declares its own argument schema and is executed asynchronously.
@MainActor
public protocol Tool: AnyObject {
    /// Stable identifier, e.g. "reminder".
    static var identifier: String { get }
    var id: String { get }
    var name: String { get }
    var summary: String { get }

    /// Arguments the tool expects, described as a simple schema for the
    /// planner / LLM to fill. Keys are field names; values describe them.
    var parameterSchema: [ToolParameter] { get }

    /// Permission boundary for this tool — what the agent may do without
    /// asking, and what must be confirmed first (Spec §17/§26).
    var permissionLevel: PermissionLevel { get }

    /// Execute the tool with JSON-encoded arguments.
    func execute(arguments: [String: String]) async throws -> ToolResult
}

/// Tools with real-world side effects return a receipt and verify it through
/// a separate read path. The runtime owns the transition between both steps.
@MainActor
public protocol VerifiableTool: Tool {
    func verify(result: ToolResult, arguments: [String: String]) async throws
}

public extension Tool {
    var id: String { Self.identifier }
    /// Read-only tools default to no confirmation needed.
    var permissionLevel: PermissionLevel { .read }
}

public struct ToolParameter: Hashable, Sendable, Codable {
    public let key: String
    public let description: String
    public let required: Bool
    public init(key: String, description: String, required: Bool = true) {
        self.key = key
        self.description = description
        self.required = required
    }
}

public struct ToolResult: Sendable, Hashable {
    public let summary: String           // human-readable, used in the activity stream
    public let payload: [String: String] // structured fields for the agent to reason over
    public init(summary: String, payload: [String: String] = [:]) {
        self.summary = summary
        self.payload = payload
    }
}

public enum ToolError: Error, Sendable {
    case missingParameter(String)
    case permissionDenied
    case unavailable(String)
    case executionFailed(String)
}
