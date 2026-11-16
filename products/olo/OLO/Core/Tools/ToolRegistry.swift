import Foundation

/// Resolves a tool by its identifier. The agent core knows tools only by
/// (name, description, schema, permission) and resolves through this
/// registry, so tool implementations can be swapped (iOS Calendar →
/// Google Calendar → Outlook) without touching the agent (Spec §18/§3.3).
@MainActor
public final class ToolRegistry {
    private var tools: [String: any Tool] = [:]

    public init() {}

    public func register(_ tool: any Tool) {
        tools[type(of: tool).identifier] = tool
    }

    public func tool(named name: String) -> (any Tool)? {
        tools[name]
    }

    public var all: [any Tool] {
        Array(tools.values)
    }

    public var availableDescriptors: [ToolDescriptor] {
        tools.values.map(ToolDescriptor.init)
    }
}

/// A tool's public-facing description, decoupled from its implementation.
/// This is what the planner / LLM sees (Spec §18).
public struct ToolDescriptor: Hashable, Sendable {
    public let id: String
    public let name: String
    public let summary: String
    public let parameters: [ToolParameter]
    public let permission: PermissionLevel

    @MainActor public init(tool: any Tool) {
        self.id = tool.id
        self.name = tool.name
        self.summary = tool.summary
        self.parameters = tool.parameterSchema
        self.permission = tool.permissionLevel
    }
}
