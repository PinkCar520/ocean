import { z } from 'zod';
import { lspInputSchema } from '@ocean/contracts';
import { DeviceRpcBroker } from './device-rpc.broker';
import { TerminalToolError, type Tool } from './tool.types';

const notebookPath = z.string().min(1).max(4096).refine(value => /\.ipynb$/i.test(value), 'Notebook path must end in .ipynb.');
const readSchema = z.object({ path: notebookPath }).strict();
const fileReadSchema = z.object({
  path: z.string().min(1).max(4096),
  offset: z.number().int().min(0).max(1_000_000).optional(),
  limit: z.number().int().min(1).max(1_000).optional(),
}).strict();
const filePath = z.string().min(1).max(4096);
const text = z.string().max(2 * 1024 * 1024);
const fileWriteSchema = z.object({ path: filePath, content: text }).strict();
const fileEditSchema = z.object({ path: filePath, old_string: text.min(1), new_string: text, replace_all: z.boolean().optional() }).strict();
const filePatchSchema = z.object({ path: filePath, edits: z.array(z.object({ old_string: text.min(1), new_string: text }).strict()).min(1).max(100) }).strict();
const editSchema = z.object({
  path: notebookPath,
  mode: z.enum(['replace', 'insert', 'delete']).default('replace'),
  cell_id: z.string().min(1).max(256).optional(),
  cell_type: z.enum(['code', 'markdown']).optional(),
  new_source: z.string().max(2 * 1024 * 1024).optional(),
}).strict().superRefine((value, context) => {
  if (value.mode !== 'insert' && !value.cell_id) context.addIssue({ code: 'custom', message: 'cell_id is required for replace and delete.' });
  if (value.mode === 'insert' && !value.cell_type) context.addIssue({ code: 'custom', message: 'cell_type is required for insert.' });
  if (value.mode !== 'delete' && value.new_source === undefined) context.addIssue({ code: 'custom', message: 'new_source is required for replace and insert.' });
});

export function createDeviceTools(broker: DeviceRpcBroker): Tool[] {
  return [
    {
      name: 'local_notebook_read',
      description: 'Read a Jupyter notebook on the connected local device. An owned conversation session is required.',
      inputSchema: readSchema,
      async execute(input, ctx) {
        const parsed = readSchema.safeParse(input);
        if (!parsed.success) throw new TerminalToolError(`Invalid notebook read: ${parsed.error.message}`);
        return broker.request('notebook_read', parsed.data, ctx);
      },
    },
    {
      name: 'local_notebook_edit',
      description: 'Replace, insert or delete a cell in a previously read local Jupyter notebook. Requires approval.',
      inputSchema: editSchema,
      requiresApproval: true,
      async execute(input, ctx) {
        const parsed = editSchema.safeParse(input);
        if (!parsed.success) throw new TerminalToolError(`Invalid notebook edit: ${parsed.error.message}`);
        return broker.request('notebook_edit', parsed.data, ctx);
      },
    },
    {
      name: 'local_file_read',
      description: 'Read a text file, image, or notebook from the connected local workspace. Supports 0-based line offset and limit for text.',
      inputSchema: fileReadSchema,
      async execute(input, ctx) {
        const parsed = fileReadSchema.safeParse(input);
        if (!parsed.success) throw new TerminalToolError(`Invalid file read: ${parsed.error.message}`);
        return broker.request('file_read', parsed.data, ctx);
      },
    },
    ...([
      ['local_file_write', 'file_write', fileWriteSchema, 'Create or overwrite a file in the connected workspace.'],
      ['local_file_edit', 'file_edit', fileEditSchema, 'Replace exact text in a connected workspace file.'],
      ['local_file_patch', 'file_patch', filePatchSchema, 'Apply multiple exact, non-overlapping replacements to a connected workspace file.'],
    ] as const).map(([name, method, schema, description]): Tool => ({
      name, description, inputSchema: schema, requiresApproval: true,
      async execute(input, ctx) {
        const parsed = schema.safeParse(input);
        if (!parsed.success) throw new TerminalToolError(`Invalid file operation: ${parsed.error.message}`);
        return broker.request(method, parsed.data, ctx);
      },
    })),
    {
      name: 'local_lsp',
      description: 'Use a configured local language server for code navigation in the connected workspace.',
      inputSchema: lspInputSchema,
      effect: 'read',
      async execute(input, ctx) {
        const parsed = lspInputSchema.safeParse(input);
        if (!parsed.success) throw new TerminalToolError(`Invalid language server request: ${parsed.error.message}`);
        return broker.request('lsp', parsed.data, ctx);
      },
    },
  ];
}
