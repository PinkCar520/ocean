/**
 * MCP Server 配置类型定义
 */
export interface MCPServerConfig {
  /** 唯一标识符 */
  id: string;
  /** 展示名称 */
  name: string;
  /** 启动命令，e.g. 'node' */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 注入的环境变量（支持 ${VAR} 占位符，由 Gateway 从 process.env 自动替换） */
  env?: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
  /** 描述 */
  description?: string;
}

export interface MCPServerFileConfig {
  mcpServers: MCPServerConfig[];
}
