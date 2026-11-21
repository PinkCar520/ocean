import { z } from 'zod';
import type { MCPClientPool } from '../mcp/mcp-client.pool';
import { TerminalToolError, type Tool } from './tool.types';

const server = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const listSchema = z.object({ server, cursor: z.string().max(4096).optional() });
const readSchema = z.object({ server, uri: z.string().min(1).max(4096) });
const callSchema = z.object({
  server,
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  arguments: z.record(z.string(), z.unknown()).default({}),
}).strict();
const resourceServer = (input: Record<string, unknown>) => server.parse(input.server);

function capResourceResult(result: unknown) {
  const serialized = JSON.stringify(result);
  return serialized.length <= 80_000 ? result : { truncated: true, preview: serialized.slice(0, 80_000) };
}

export function createMcpResourceTools(pool: MCPClientPool): Tool[] {
  return [
    {
      name: 'mcp_list_tools',
      description: 'Discover tool names and input schemas from a connected MCP server.',
      effect: 'read',
      permissionServer: resourceServer,
      inputSchema: listSchema,
      async execute(input, ctx) {
        if (!ctx) throw new TerminalToolError('Missing authenticated MCP context.');
        const args = listSchema.parse(input);
        const page = await pool.listServerTools({ userId: ctx.userId }, args.server, args.cursor);
        return capResourceResult(page);
      },
    },
    {
      name: 'mcp_call_tool',
      description: 'Call a discovered tool from the current user’s MCP connection with the arguments its schema requires.',
      effect: 'non-idempotent-write',
      permissionServer: resourceServer,
      permissionName: (input) => {
        const args = callSchema.parse(input);
        return `mcp__${args.server}:${args.name}`;
      },
      inputSchema: callSchema,
      async execute(input, ctx) {
        if (!ctx) throw new TerminalToolError('Missing authenticated MCP context.');
        const args = callSchema.parse(input);
        try {
          return capResourceResult(await pool.callServerTool({ userId: ctx.userId }, args.server, args.name, args.arguments));
        } catch (error) {
          throw new TerminalToolError(error instanceof Error ? error.message : 'MCP tool call failed.');
        }
      },
    },
    {
      name: 'mcp_list_resources',
      description: 'List resources from a connected MCP server for the current Ocean user.',
      effect: 'read',
      permissionServer: resourceServer,
      inputSchema: listSchema,
      async execute(input, ctx) {
        if (!ctx) throw new TerminalToolError('Missing authenticated MCP context.');
        const args = listSchema.parse(input);
        return capResourceResult(await pool.listServerResources({ userId: ctx.userId }, args.server, args.cursor));
      },
    },
    {
      name: 'mcp_list_resource_templates',
      description: 'List URI templates for parameterized MCP resources available to the current Ocean user.',
      effect: 'read',
      permissionServer: resourceServer,
      inputSchema: listSchema,
      async execute(input, ctx) {
        if (!ctx) throw new TerminalToolError('Missing authenticated MCP context.');
        const args = listSchema.parse(input);
        return capResourceResult(await pool.listServerResourceTemplates({ userId: ctx.userId }, args.server, args.cursor));
      },
    },
    {
      name: 'mcp_read_resource',
      description: 'Read a resource URI from a connected MCP server for the current Ocean user.',
      effect: 'read',
      permissionServer: resourceServer,
      inputSchema: readSchema,
      async execute(input, ctx) {
        if (!ctx) throw new TerminalToolError('Missing authenticated MCP context.');
        const args = readSchema.parse(input);
        return capResourceResult(await pool.readServerResource({ userId: ctx.userId }, args.server, args.uri));
      },
    },
  ];
}
