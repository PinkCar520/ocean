import type { RuntimeHost, ToolDescriptor, ToolInvocation } from '@ocean/core';
import { ToolRegistry } from './tool.registry';
import type { ToolContext } from './tool.types';

/** Gateway host adapter for the same Tool Runtime contract used by CLI. */
export function createGatewayToolHost(registry: ToolRegistry, context: ToolContext): {
  host: RuntimeHost;
  resolveTool(name: string): ToolDescriptor | undefined;
} {
  return {
    resolveTool: name => registry.getDescriptor(name),
    host: {
      execute: async (invocation: ToolInvocation) => {
        if (invocation.runId !== context.runId || invocation.host !== 'remote')
          throw new Error('Gateway tool invocation context mismatch');
        const tool = registry.get(invocation.toolName);
        if (!tool) throw new Error('Unknown Gateway tool');
        return tool.execute(invocation.input as Record<string, unknown>, {
          ...context,
          toolCallId: invocation.id,
        });
      },
    },
  };
}
