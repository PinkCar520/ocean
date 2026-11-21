import { z } from 'zod';

export const lspInputSchema = z.object({
  operation: z.enum(['definition', 'references', 'hover', 'documentSymbols', 'workspaceSymbols',
    'implementation', 'prepareCallHierarchy', 'incomingCalls', 'outgoingCalls']),
  path: z.string().min(1).max(4096),
  line: z.number().int().min(1).optional(),
  character: z.number().int().min(1).optional(),
  query: z.string().max(512).optional(),
}).strict();

export type LspInput = z.infer<typeof lspInputSchema>;
