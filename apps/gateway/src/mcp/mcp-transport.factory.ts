/**
 * MCP 传输层抽象
 * 
 * 支持多种传输协议：
 * - Stdio: 本地子进程通信
 * - SSE: Server-Sent Events（远程服务器）
 * - HTTP: Streamable HTTP（远程服务器）
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPServerConfig, MCPTransportType } from './mcp.types';

export interface MCPTransport {
  type: MCPTransportType;
  connect(): Promise<void>;
  close(): Promise<void>;
}

/**
 * 创建 Stdio 传输
 */
export async function createStdioTransport(
  config: MCPServerConfig,
): Promise<StdioClientTransport> {
  if (!config.command) {
    throw new Error(`[stdio] Missing command for server ${config.id}`);
  }

  const resolvedEnv: Record<string, string> = {};
  for (const [key, val] of Object.entries(config.env || {})) {
    resolvedEnv[key] = val.replace(/\$\{(\w+)\}/g, (_, name) => {
      return process.env[name] || '';
    });
  }

  return new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: { ...process.env, ...resolvedEnv } as Record<string, string>,
  });
}

/**
 * 创建 SSE 传输
 * 
 * 使用示例：
 * ```typescript
 * const transport = await createSSETransport({
 *   id: 'remote-ai',
 *   url: 'https://mcp.example.com/sse',
 *   headers: {
 *     Authorization: 'Bearer token',
 *   },
 * });
 * ```
 */
export async function createSSETransport(
  config: MCPServerConfig,
): Promise<any> {
  if (!config.url) {
    throw new Error(`[sse] Missing URL for server ${config.id}`);
  }

  // 动态导入 SSE 客户端（避免在非 SSE 场景下加载）
  const { SSEClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/sse.js'
  );

  const resolvedHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(config.headers || {})) {
    resolvedHeaders[key] = val.replace(/\$\{(\w+)\}/g, (_, name) => {
      return process.env[name] || '';
    });
  }

  return new SSEClientTransport(
    new URL(config.url),
    {
      requestInit: {
        headers: resolvedHeaders,
      },
    },
  );
}

/**
 * 创建 Streamable HTTP 传输
 * 
 * 使用示例：
 * ```typescript
 * const transport = await createHTTPTransport({
 *   id: 'remote-ai',
 *   url: 'https://mcp.example.com/mcp',
 *   headers: {
 *     Authorization: 'Bearer token',
 *   },
 * });
 * ```
 */
export async function createHTTPTransport(
  config: MCPServerConfig,
): Promise<any> {
  if (!config.url) {
    throw new Error(`[http] Missing URL for server ${config.id}`);
  }

  // 动态导入 HTTP 客户端
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  const resolvedHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(config.headers || {})) {
    resolvedHeaders[key] = val.replace(/\$\{(\w+)\}/g, (_, name) => {
      return process.env[name] || '';
    });
  }

  return new StreamableHTTPClientTransport(
    new URL(config.url),
    {
      requestInit: {
        headers: resolvedHeaders,
      },
    },
  );
}

/**
 * 工厂方法：根据配置创建对应类型的传输
 */
export async function createTransport(
  config: MCPServerConfig,
): Promise<any> {
  const transportType = config.transport || 'stdio';

  switch (transportType) {
    case 'stdio':
      return createStdioTransport(config);
    case 'sse':
      return createSSETransport(config);
    case 'http':
      return createHTTPTransport(config);
    default:
      throw new Error(`Unsupported transport type: ${transportType}`);
  }
}
