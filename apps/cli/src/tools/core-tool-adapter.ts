import { asSchema } from 'ai';
import type { RuntimeHost, ToolDescriptor, ToolInvocation } from '@ocean/core';

/** Adapt existing CLI AI SDK tool definitions without moving local effects to Gateway. */
export function createCliToolHost(tools: Record<string, any>): {
  host: RuntimeHost;
  resolveTool(name: string): ToolDescriptor | undefined;
} {
  const resolveTool = (name: string): ToolDescriptor | undefined => {
    const tool = tools[name];
    if (!tool || typeof tool.execute !== 'function' || !tool.inputSchema) return undefined;
    return {
      name,
      host: 'local',
      validate: async input => {
        const validator = asSchema(tool.inputSchema).validate;
        if (!validator) throw new Error(`Tool ${name} has no input validator`);
        const parsed = await validator(input);
        if (!parsed.success) throw new Error(`Invalid input for tool ${name}`);
        return parsed.value;
      },
    };
  };
  const host: RuntimeHost = {
    execute: async (invocation: ToolInvocation) => {
      const tool = tools[invocation.toolName];
      if (!tool || typeof tool.execute !== 'function') throw new Error('Unknown local tool');
      return tool.execute(invocation.input, { toolCallId: invocation.id });
    },
  };
  return { host, resolveTool };
}
