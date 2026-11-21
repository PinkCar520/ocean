import { spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { lspInputSchema } from '@ocean/contracts';
import type { ToolDefinition } from '../types.js';
import { SecurityEngine } from '../utils/security.js';

const operations = {
  definition: 'textDocument/definition',
  references: 'textDocument/references',
  hover: 'textDocument/hover',
  documentSymbols: 'textDocument/documentSymbol',
  workspaceSymbols: 'workspace/symbol',
  implementation: 'textDocument/implementation',
  prepareCallHierarchy: 'textDocument/prepareCallHierarchy',
  incomingCalls: 'callHierarchy/incomingCalls',
  outgoingCalls: 'callHierarchy/outgoingCalls',
} as const;

const settingsSchema = z.array(z.object({
  command: z.string().refine(isAbsolute),
  args: z.array(z.string()).max(64).default([]),
  languages: z.record(z.string().regex(/^\.[\w+-]+$/), z.string().min(1)),
})).max(32);

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

function loadLanguageServers() {
  const file = join(homedir(), '.ocean', 'lsp.json');
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.size > 64 * 1024 || (info.mode & 0o022)) {
      throw new Error('Unsafe language server settings.');
    }
    return settingsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Minimal, sequential JSON-RPC transport for one language server invocation. */
async function runLanguageServer(
  server: z.infer<typeof settingsSchema>[number],
  workspace: string,
  execute: (request: (method: string, params: unknown) => Promise<unknown>, notify: (method: string, params?: unknown) => void) => Promise<unknown>,
  parentSignal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(20_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  signal.throwIfAborted();
  const child = spawn(server.command, server.args, {
    cwd: workspace,
    stdio: ['pipe', 'pipe', 'ignore'],
    detached: process.platform !== 'win32',
  });

  const stop = () => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch {
      // The process may already have exited.
    }
  };
  signal.addEventListener('abort', stop, { once: true });
  child.stdin.on('error', stop);
  child.on('error', (error) => child.stdout.destroy(error));
  const stream = child.stdout[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  let nextId = 0;

  const send = (fields: object) => {
    signal.throwIfAborted();
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...fields }));
    child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };

  async function receive(): Promise<Record<string, unknown>> {
    for (;;) {
      signal.throwIfAborted();
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        if (headerEnd > 8192) throw new Error('Invalid language server header.');
        const header = buffer.subarray(0, headerEnd).toString('ascii');
        const length = Number(/^Content-Length:\s*(\d+)\s*$/im.exec(header)?.[1]);
        if (!Number.isSafeInteger(length) || length < 1 || length > MAX_FRAME_BYTES) {
          throw new Error('Invalid language server response length.');
        }
        const start = headerEnd + 4;
        if (buffer.length >= start + length) {
          const message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
          buffer = buffer.subarray(start + length);
          if (message?.jsonrpc !== '2.0') throw new Error('Invalid language server response.');
          return message;
        }
      } else if (buffer.length > 8192) {
        throw new Error('Invalid language server header.');
      }
      const chunk = await stream.next();
      if (chunk.done) {
        signal.throwIfAborted();
        throw new Error('Language server closed before replying.');
      }
      buffer = Buffer.concat([buffer, chunk.value]);
    }
  }

  const request = async (method: string, params: unknown) => {
    const id = ++nextId;
    send({ id, method, params });
    for (;;) {
      const message = await receive();
      if (typeof message.method === 'string') {
        if (typeof message.id === 'number' || typeof message.id === 'string') {
          send({ id: message.id, error: { code: -32601, message: 'Client method not supported' } });
        }
        continue;
      }
      if (message.id !== id) continue;
      if (message.error) throw new Error(`Language server rejected ${method}.`);
      return message.result;
    }
  };
  const notify = (method: string, params?: unknown) => send({ method, params });

  try {
    const uri = pathToFileURL(workspace).href;
    await request('initialize', {
      processId: process.pid,
      rootUri: uri,
      workspaceFolders: [{ uri, name: 'Ocean workspace' }],
      capabilities: { general: { positionEncodings: ['utf-16'] } },
    });
    notify('initialized', {});
    const result = await execute(request, notify);
    return result;
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
  }
}

export function createLspTool(): ToolDefinition<import('@ocean/contracts').LspInput> {
  return {
    name: 'lsp',
    description: 'Navigate code using a configured language server. Supports definitions, references, hover, symbols, implementations and call hierarchy. Positions are one-based.',
    inputSchema: lspInputSchema,
    async execute(input, context) {
      const file = await new SecurityEngine(context.cwd).resolveWorkspacePath(input.path);
      const uri = pathToFileURL(file).href;
      const extension = extname(file).toLowerCase();
      const server = loadLanguageServers().find((candidate) => Object.hasOwn(candidate.languages, extension));
      if (!server) return { error: `No language server configured for ${extension || 'this file type'}.` };
      const handle = await open(file, 'r');
      let text: string;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) throw new Error('Invalid or oversized language server document.');
        const data = Buffer.alloc(info.size + 1);
        const { bytesRead } = await handle.read(data, 0, data.length, 0);
        if (bytesRead > info.size) throw new Error('Document changed while opening it.');
        text = data.subarray(0, bytesRead).toString('utf8');
      } finally {
        await handle.close();
      }

      const result = await runLanguageServer(server, context.cwd, async (request, notify) => {
        const textDocument = { uri };
        notify('textDocument/didOpen', { textDocument: { uri, languageId: server.languages[extension], version: 1, text } });
        if (input.operation === 'workspaceSymbols') return request(operations.workspaceSymbols, { query: input.query ?? '' });
        if (input.operation === 'documentSymbols') return request(operations.documentSymbols, { textDocument });
        if (!input.line || !input.character) throw new Error('This operation requires line and character.');
        const position = { line: input.line - 1, character: input.character - 1 };
        if (input.operation === 'incomingCalls' || input.operation === 'outgoingCalls') {
          const items = await request(operations.prepareCallHierarchy, { textDocument, position });
          if (!Array.isArray(items) || items.length === 0) return [];
          if (items.length !== 1) throw new Error('Position identifies multiple call hierarchy items.');
          return request(operations[input.operation], { item: items[0] });
        }
        const params = input.operation === 'references'
          ? { textDocument, position, context: { includeDeclaration: true } }
          : { textDocument, position };
        return request(operations[input.operation], params);
      }, context.signal);

      const serialized = JSON.stringify(result ?? null);
      return { data: serialized.length <= 80_000 ? { result: result ?? null }
        : { truncated: true, preview: serialized.slice(0, 80_000) } };
    },
  };
}
