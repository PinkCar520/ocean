import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { readProjectMemory, updateProjectMemory } from '../utils/project-context.js';

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('save'), key: keySchema, text: z.string().trim().min(1).max(4096) }),
  z.object({ action: z.literal('forget'), key: keySchema }),
]);

export function createMemoryTool(): ToolDefinition<z.infer<typeof schema>> {
  return {
    name: 'project_memory',
    description: 'List, save or forget Ocean project notes for future sessions. Only save durable project facts or preferences the user asks you to remember. Never store credentials.',
    inputSchema: schema,
    async execute(input, context) {
      if (input.action === 'list') return { notes: readProjectMemory(context.cwd) };
      const notes = await updateProjectMemory(context.cwd, input.key, input.action === 'save' ? input.text : undefined);
      return { key: input.key, saved: input.action === 'save', count: notes.length };
    },
  };
}
