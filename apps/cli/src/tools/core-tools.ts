// Core tool implementations

import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob as globFn } from 'glob';
import { SecurityEngine } from '../utils/security.js';
import { atomicWriteFile } from '../utils/file-system.js';
import { readLargeTextRange } from '../utils/read-large-text.js';
import { imageMediaType } from '../utils/image-formats.js';
import { readNotebook } from '../utils/read-notebook.js';
import { notebookDigest, type NotebookSnapshots } from '../utils/notebook-snapshots.js';

const execAsync = promisify(exec);
const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_READ_LINES = 1_000;
const MAX_READ_CHARS = 100_000;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function throwIfAborted(context: ToolContext): void {
  if (context.signal?.aborted) {
    throw context.signal.reason instanceof Error
      ? context.signal.reason
      : new Error('Tool execution cancelled.');
  }
}

// ─── Bash Tool ────────────────────────────────────────────────

export function createBashTool() {
  return {
    name: 'bash',
    description: 'Execute shell commands. For Git: 1. NEVER update git config. 2. NEVER skip hooks (--no-verify) unless requested. 3. ALWAYS create NEW commits, NEVER --amend. 4. DO NOT commit secrets (.env). 5. Avoid interactive commands.',
    requiresApproval: true, // 本地执行 shell 前需用户在对话窗口批准（对齐 Codex trust 模型）
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute'),
      cwd: z.string().optional().describe('Working directory (defaults to context cwd)'),
    }),
    async execute(input: { command: string; cwd?: string }, ctx: ToolContext): Promise<ToolResult> {
      const security = new SecurityEngine(ctx.cwd);
      let workDir: string;
      try {
        workDir = await security.resolveWorkspacePath(input.cwd || '.');
      } catch (error) {
        return { data: null, error: (error as Error).message };
      }
      const verdict = security.auditCommand(input.command);
      if (!verdict.allowed) return { data: null, error: verdict.reason ?? 'Command blocked by security policy' };

      try {
        const { stdout, stderr } = await execAsync(input.command, {
          cwd: workDir,
          timeout: 120000, // 2 min timeout
          maxBuffer: 1024 * 1024 * 5, // 5MB
          signal: ctx.signal,
        });
        
        const output = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
        
        return {
          data: { stdout, stderr },
          ui: {
            uiType: 'code_block',
            props: {
              command: input.command,
              output: output.trim(),
              status: stderr ? 'warning' as const : 'success' as const,
              language: 'bash',
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'code_block',
            props: {
              command: input.command,
              output: err.message,
              status: 'error' as const,
              language: 'bash',
            },
          },
        };
      }
    },
  };
}

// ─── File Read Tool ───────────────────────────────────────────

export function createFileReadTool(notebookSnapshots?: NotebookSnapshots) {
  return {
    name: 'file_read',
    description: `Read a workspace UTF-8 text file, Jupyter notebook, or PNG, JPEG, GIF, or WebP image. offset is a 0-based text line number; limit is at most ${MAX_READ_LINES} lines. For text files over ${MAX_READ_BYTES / 1024 / 1024} MB, supply an explicit limit. Images and notebooks have a ${MAX_READ_BYTES / 1024 / 1024} MB limit. Text output is capped at ${MAX_READ_CHARS} characters.`,
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative path to the file'),
      offset: z.number().int().min(0).max(1_000_000).optional().describe('Starting line number (0-based)'),
      limit: z.number().int().min(1).max(MAX_READ_LINES).optional().describe(`Maximum number of lines to read (up to ${MAX_READ_LINES})`),
    }),
    toModelOutput({ output }: { output: ToolResult }) {
      if (output?.data?.kind === 'notebook') {
        if (output.data.parts.length === 0) return { type: 'text' as const, value: 'Notebook contains no cells.' };
        return { type: 'content' as const, value: output.data.parts.map((part: any) => part.type === 'text'
          ? { type: 'text' as const, text: part.text }
          : { type: 'file' as const, mediaType: part.mediaType, data: { type: 'data' as const, data: part.base64 } }) };
      }
      if (output?.data?.kind === 'image') {
        return {
          type: 'content' as const,
          value: [
            { type: 'text' as const, text: `Image: ${output.data.path}` },
            { type: 'file' as const, mediaType: output.data.mediaType, data: { type: 'data' as const, data: output.data.base64 } },
          ],
        };
      }
      return { type: 'json' as const, value: output as any };
    },
    async execute(input: { path: string; offset?: number; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
      let filePath = input.path;
      try {
        throwIfAborted(ctx);
        filePath = await new SecurityEngine(ctx.cwd).resolveReadablePath(input.path);
        const handle = await fs.open(filePath, 'r');
        let bytes: Buffer;
        try {
          const info = await handle.stat();
          if (!info.isFile()) throw new Error('Path is not a regular file.');
          if (info.size > MAX_READ_BYTES) {
            if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) && path.extname(filePath).toLowerCase() !== '.ipynb' && input.limit !== undefined) {
              const data = await readLargeTextRange(handle, input.offset ?? 0, input.limit, MAX_READ_CHARS, ctx.signal);
              return {
                data: { ...data, path: filePath },
                ui: { uiType: 'file_preview', props: { path: filePath, content: data.content, status: 'success' } },
              };
            }
            throw new Error(`File exceeds the ${MAX_READ_BYTES / 1024 / 1024} MB text read limit; split or narrow the file before reading.`);
          }

          // Bound the actual read as well as the initial stat, in case a file grows while being read.
          const boundedBytes = Buffer.alloc(MAX_READ_BYTES + 1);
          let bytesRead = 0;
          while (bytesRead < boundedBytes.length) {
            throwIfAborted(ctx);
            const result = await handle.read(boundedBytes, bytesRead, boundedBytes.length - bytesRead, bytesRead);
            if (result.bytesRead === 0) break;
            bytesRead += result.bytesRead;
          }
          if (bytesRead > MAX_READ_BYTES) {
            throw new Error(`File exceeds the ${MAX_READ_BYTES / 1024 / 1024} MB text read limit; split or narrow the file before reading.`);
          }
          bytes = boundedBytes.subarray(0, bytesRead);
        } finally {
          await handle.close();
        }
        throwIfAborted(ctx);
        if (IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
          if (input.offset !== undefined || input.limit !== undefined) throw new Error('Line ranges cannot be used with images.');
          const mediaType = imageMediaType(bytes);
          if (!mediaType) throw new Error('Unsupported or invalid image format.');
          return {
            data: { kind: 'image', path: filePath, mediaType, size: bytes.length, base64: bytes.toString('base64') },
            ui: { uiType: 'file_preview', props: { path: filePath, content: `[${mediaType} image, ${bytes.length} bytes]`, status: 'success' } },
          };
        }
        if (bytes.includes(0)) throw new Error('Binary files cannot be read as text.');

        let decoded: string;
        try {
          decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new Error('File is not valid UTF-8 text.');
        }
        if (path.extname(filePath).toLowerCase() === '.ipynb') {
          if (input.offset !== undefined || input.limit !== undefined) throw new Error('Line ranges cannot be used with notebooks.');
          const data = { ...readNotebook(decoded, MAX_READ_CHARS), path: filePath };
          notebookSnapshots?.set(ctx.sessionId, filePath, notebookDigest(bytes));
          return { data, ui: { uiType: 'file_preview', props: { path: filePath, content: `[Notebook: ${data.cellCount} cells]`, status: 'success' } } };
        }
        const allLines = decoded.split(/\r?\n/);
        const start = input.offset ?? 0;
        const requestedCount = input.limit ?? MAX_READ_LINES;
        const end = Math.min(start + requestedCount, allLines.length);
        let content = allLines.slice(start, end).join('\n');
        const characterTruncated = content.length > MAX_READ_CHARS;
        if (characterTruncated) content = content.slice(0, MAX_READ_CHARS);
        const truncated = end < allLines.length || characterTruncated;

        return {
          data: { content, path: filePath, offset: start, linesRead: Math.max(0, Math.min(end - start, requestedCount)), totalLines: allLines.length, truncated: start > 0 || truncated },
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content,
              status: 'success' as const,
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content: '',
              status: 'error' as const,
              error: err.message,
            },
          },
        };
      }
    },
  };
}

// ─── File Write Tool ──────────────────────────────────────────

export function createFileWriteTool() {
  return {
    name: 'file_write',
    description: 'Create a new file or overwrite an existing file. Use with caution as this will overwrite without warning.',
    requiresApproval: true,
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative path to the file'),
      content: z.string().describe('Content to write'),
    }),
    async execute(input: { path: string; content: string }, ctx: ToolContext): Promise<ToolResult> {
      let filePath: string;
      try {
        filePath = await new SecurityEngine(ctx.cwd).resolveWorkspacePath(input.path);
      } catch (err) {
        return { data: null, error: (err as Error).message };
      }

      try {
        // Ensure parent directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        throwIfAborted(ctx);
        await atomicWriteFile(filePath, input.content);
        
        return {
          data: { path: filePath, bytesWritten: input.content.length },
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content: input.content,
              status: 'success' as const,
              action: 'created' as const,
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content: '',
              status: 'error' as const,
              error: err.message,
            },
          },
        };
      }
    },
  };
}

// ─── File Edit Tool ───────────────────────────────────────────

export function createFileEditTool() {
  return {
    name: 'file_edit',
    description: 'Edit an existing file by replacing specific text. Requires exact match of the old_string.',
    requiresApproval: true,
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative path to the file'),
      old_string: z.string().min(1).describe('Exact text to find and replace (must match exactly)'),
      new_string: z.string().describe('New text to replace with'),
      replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
    }),
    async execute(input: { path: string; old_string: string; new_string: string; replace_all?: boolean }, ctx: ToolContext): Promise<ToolResult> {
      let filePath: string;
      try {
        throwIfAborted(ctx);
        filePath = await new SecurityEngine(ctx.cwd).resolveReadablePath(input.path);
      } catch (err) {
        return { data: null, error: (err as Error).message };
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        
        const occurrences = content.split(input.old_string).length - 1;
        if (occurrences === 0) {
          return {
            data: null,
            error: `String not found in ${filePath}`,
            ui: {
              uiType: 'file_preview',
              props: {
                path: filePath,
                content: '',
                status: 'error' as const,
                error: `The exact string to replace was not found in the file.`,
              },
            },
          };
        }
        if (!input.replace_all && occurrences > 1) {
          return { data: null, error: `Match is ambiguous (${occurrences} occurrences). Provide a larger unique old_string or set replace_all.` };
        }

        const newContent = input.replace_all
          ? content.split(input.old_string).join(input.new_string)
          : content.replace(input.old_string, input.new_string);

        throwIfAborted(ctx);
        await atomicWriteFile(filePath, newContent);

        return {
          data: { path: filePath, replaced: true },
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content: newContent,
              status: 'success' as const,
              action: 'edited' as const,
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'file_preview',
            props: {
              path: filePath,
              content: '',
              status: 'error' as const,
              error: err.message,
            },
          },
        };
      }
    },
  };
}

// ─── Exact Multi-Edit Tool ────────────────────────────────────

export function createFilePatchTool() {
  return {
    name: 'file_patch',
    description: 'Apply multiple exact, non-overlapping edits to one workspace file atomically.',
    requiresApproval: true,
    inputSchema: z.object({
      path: z.string().describe('Workspace-relative file path'),
      edits: z.array(z.object({
        old_string: z.string().min(1),
        new_string: z.string(),
      })).min(1).max(100).describe('Exact replacements; every old_string must occur exactly once'),
    }),
    async execute(input: {
      path: string;
      edits: Array<{ old_string: string; new_string: string }>;
    }, ctx: ToolContext): Promise<ToolResult> {
      let filePath: string;
      try {
        throwIfAborted(ctx);
        filePath = await new SecurityEngine(ctx.cwd).resolveReadablePath(input.path);
      } catch (error) {
        return { data: null, error: (error as Error).message };
      }

      try {
        const original = await fs.readFile(filePath, 'utf-8');
        const matches = input.edits.map((edit) => {
          let offset = original.indexOf(edit.old_string);
          if (offset < 0) throw new Error(`Patch anchor not found in ${input.path}`);
          if (original.indexOf(edit.old_string, offset + 1) >= 0) {
            throw new Error(`Patch anchor is ambiguous in ${input.path}`);
          }
          return { start: offset, end: offset + edit.old_string.length, ...edit };
        }).sort((a, b) => a.start - b.start);

        for (let index = 1; index < matches.length; index += 1) {
          if (matches[index].start < matches[index - 1].end) {
            throw new Error('Patch edits overlap; split them into separate calls.');
          }
        }

        let updated = original;
        for (const match of matches.reverse()) {
          updated = updated.slice(0, match.start) + match.new_string + updated.slice(match.end);
        }
        throwIfAborted(ctx);
        await atomicWriteFile(filePath, updated);
        return {
          data: { path: filePath, appliedEdits: matches.length },
          ui: {
            uiType: 'diff_viewer',
            props: {
              path: filePath,
              diff: input.edits.flatMap(({ old_string, new_string }) => [
                { type: 'deletion', content: old_string },
                { type: 'addition', content: new_string },
              ]),
              status: 'success',
            },
          },
        };
      } catch (error) {
        return { data: null, error: (error as Error).message };
      }
    },
  };
}

// ─── Grep Tool ────────────────────────────────────────────────

export function createGrepTool() {
  return {
    name: 'grep',
    description: 'Search file contents using regex patterns. Similar to grep -r.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory or file to search in (defaults to cwd)'),
      glob: z.string().optional().describe('File glob pattern to filter (e.g. "*.ts")'),
      limit: z.number().optional().describe('Limit number of results'),
    }),
    async execute(input: { pattern: string; path?: string; glob?: string; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
      const security = new SecurityEngine(ctx.cwd);
      const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
      try {
        const searchPath = await security.resolveWorkspacePath(input.path || '.');
        const stat = await fs.stat(searchPath);
        const files = stat.isFile()
          ? [searchPath]
          : (await globFn(input.glob || '**/*', {
              cwd: searchPath,
              nodir: true,
              ignore: ['**/.git/**', '**/node_modules/**', '**/.ocean/worktrees/**'],
            })).map((file) => path.join(searchPath, file));
        const matcher = new RegExp(input.pattern);
        const matches: string[] = [];
        for (const file of files) {
          throwIfAborted(ctx);
          if (matches.length >= limit) break;
          const safeFile = await security.resolveReadablePath(file);
          const info = await fs.stat(safeFile);
          if (info.size > 1_000_000) continue;
          const text = await fs.readFile(safeFile, 'utf-8').catch(() => '');
          text.split(/\r?\n/).forEach((line, index) => {
            matcher.lastIndex = 0;
            if (matches.length < limit && matcher.test(line)) {
              matches.push(`${path.relative(ctx.cwd, safeFile)}:${index + 1}:${line}`);
            }
          });
        }

        return {
          data: { matches, count: matches.length },
          ui: {
            uiType: 'code_block',
            props: {
              command: `grep ${JSON.stringify(input.pattern)} ${input.glob || ''}`,
              output: matches.join('\n') || 'No matches found',
              status: matches.length > 0 ? 'success' as const : 'warning' as const,
              language: 'text',
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'code_block',
            props: {
              command: `grep "${input.pattern}"`,
              output: err.message,
              status: 'error' as const,
              language: 'text',
            },
          },
        };
      }
    },
  };
}

// ─── Glob Tool ────────────────────────────────────────────────

export function createGlobTool() {
  return {
    name: 'glob',
    description: 'Fast file pattern matching. Similar to glob "*.ts" or "**/*.tsx".',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.ts")'),
      path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
    }),
    async execute(input: { pattern: string; path?: string }, ctx: ToolContext): Promise<ToolResult> {
      try {
        const security = new SecurityEngine(ctx.cwd);
        const searchPath = await security.resolveWorkspacePath(input.path || '.');
        const matches = await globFn(input.pattern, {
          cwd: searchPath,
          nodir: true,
          ignore: ['**/.git/**', '**/node_modules/**', '**/.ocean/worktrees/**'],
        });
        const safeMatches: string[] = [];
        for (const match of matches) {
          try {
            await security.resolveReadablePath(path.join(searchPath, match));
            safeMatches.push(match);
          } catch {
            // Ignore symlinks that resolve outside the workspace.
          }
        }

        return {
          data: { files: safeMatches, count: safeMatches.length },
          ui: {
            uiType: 'code_block',
            props: {
              command: `glob "${input.pattern}"`,
              output: safeMatches.length > 0
                ? safeMatches.map(f => `- ${f}`).join('\n')
                : 'No files matched the pattern',
              status: safeMatches.length > 0 ? 'success' as const : 'warning' as const,
              language: 'text',
            },
          },
        };
      } catch (err: any) {
        return {
          data: null,
          error: err.message,
          ui: {
            uiType: 'code_block',
            props: {
              command: `glob "${input.pattern}"`,
              output: err.message,
              status: 'error' as const,
              language: 'text',
            },
          },
        };
      }
    },
  };
}
