/**
 * MCP Server 配置类型定义
 */

// ──────────────────────────────────────────────
// MCP 协议基础类型
// ──────────────────────────────────────────────

/** MCP 资源定义 */
export interface MCPResource {
  /** 资源 URI，例如 zentao://bugs/123 */
  uri: string;
  /** 资源名称 */
  name: string;
  /** 资源描述 */
  description?: string;
  /** MIME 类型，例如 application/json */
  mimeType?: string;
  /** 所属 MCP Server ID */
  serverId?: string;
}

/** MCP 资源模板，支持 URI 参数 */
export interface MCPResourceTemplate {
  /** 模板 URI，例如 zentao://bugs/{bugId} */
  uriTemplate: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 所属 MCP Server ID */
  serverId?: string;
}

/** MCP 读取的资源内容 */
export interface MCPResourceContents {
  /** 资源 URI */
  uri: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 文本内容 */
  text?: string;
  /** 二进制内容（Base64） */
  blob?: string;
}

/** MCP 提示词定义 */
export interface MCPPrompt {
  /** 提示词名称 */
  name: string;
  /** 提示词描述 */
  description?: string;
  /** 提示词模板内容 */
  template?: string;
  /** 变量定义 */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  /** 所属 MCP Server ID */
  serverId?: string;
}

/** MCP 征求（Elicitation）请求 */
export interface MCPElicitationRequest {
  /** 征求 ID */
  id: string;
  /** 征求消息 */
  message: string;
  /** 请求的表单 schema（JSON Schema 格式） */
  requestedSchema: Record<string, unknown>;
  /** 所属 MCP Server ID */
  serverId: string;
}

/** MCP 征求响应 */
export interface MCPElicitationResponse {
  /** 征求 ID */
  id: string;
  /** 用户操作: "submit" | "cancel" | "reject" */
  action: 'submit' | 'cancel' | 'reject';
  /** 用户填写的内容（仅 action 为 "submit" 时有效） */
  content?: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// MCP Server 配置类型
// ──────────────────────────────────────────────

/** MCP Server 传输层类型 */
export type MCPTransportType = 'stdio' | 'sse' | 'http';

/** MCP Server 审批模式 */
export type MCPApprovalMode = 'always' | 'selective' | 'never';

/** MCP Server 审批配置 */
export interface MCPApprovalConfig {
  /** 审批模式 */
  mode: MCPApprovalMode;
  /** 白名单工具（selective 模式下免确认） */
  allowedTools?: string[];
  /** 黑名单工具（任何模式下都禁止） */
  disallowedTools?: string[];
  /** 工具名模式匹配（glob） */
  patterns?: string[];
}

/** MCP Server 配置 */
export interface MCPServerConfig {
  /** 唯一标识符 */
  id: string;
  /** 展示名称 */
  name: string;
  /** 启动命令，e.g. 'node'（仅 stdio 模式需要） */
  command?: string;
  /** 命令参数（仅 stdio 模式需要） */
  args?: string[];
  /** 远程 URL（仅 sse/http 模式需要） */
  url?: string;
  /** 自定义请求头（仅 sse/http 模式需要，支持 ${VAR} 占位符） */
  headers?: Record<string, string>;
  /** 注入的环境变量（支持 ${VAR} 占位符，由 Gateway 从 process.env 自动替换） */
  env?: Record<string, string>;
  /** 传输层类型 */
  transport?: MCPTransportType;
  /** 是否启用 */
  enabled: boolean;
  /** 是否已审批 */
  approved?: boolean;
  /** 描述 */
  description?: string;
  /** 审批配置 */
  approval?: MCPApprovalConfig;
}

export interface MCPServerFileConfig {
  /** 已启用的服务器列表 */
  mcpServers: MCPServerConfig[];
  /** 自动批准的服务器 ID 列表 */
  enabledMcpjsonServers?: string[];
  /** 明确禁用的服务器 ID 列表 */
  disabledMcpjsonServers?: string[];
}
