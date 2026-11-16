import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';
import { SecurityEngine } from '../utils/security.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export function resolvePowerShellExecutable(platform = process.platform): string {
  if (platform === 'win32') return process.env.OCEAN_POWERSHELL_BIN || 'powershell.exe';
  return process.env.OCEAN_POWERSHELL_BIN || 'pwsh';
}

/** Execute a PowerShell command directly, without a second shell parser. */
export function createPowerShellTool(options: { executable?: string } = {}) {
  return {
    name: 'powershell',
    description: 'Run a PowerShell command in the workspace. Every command requires approval; use file_read/file_write/file_edit/grep/glob for direct file operations.',
    requiresApproval: true,
    inputSchema: z.object({
      command: z.string().min(1).max(100_000),
      cwd: z.string().optional(),
      timeout_ms: z.number().int().min(1_000).max(MAX_TIMEOUT_MS).optional(),
    }),
    async execute(input: { command: string; cwd?: string; timeout_ms?: number }, context: ToolContext): Promise<ToolResult> {
      const security = new SecurityEngine(context.cwd);
      const audit = security.auditPowerShellCommand(input.command);
      if (!audit.allowed) return { data: null, error: audit.reason ?? 'PowerShell command blocked by security policy', audit };

      let cwd: string;
      try {
        cwd = await security.resolveWorkspacePath(input.cwd || '.');
      } catch (error) {
        return { data: null, error: (error as Error).message, audit };
      }
      if (context.signal?.aborted) {
        throw context.signal.reason instanceof Error ? context.signal.reason : new Error('Tool execution cancelled.');
      }

      const executable = options.executable ?? resolvePowerShellExecutable();
      const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', input.command];
      try {
        const result = await execFileAsync(executable, args, {
          cwd,
          timeout: input.timeout_ms ?? DEFAULT_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
          signal: context.signal,
        });
        return {
          data: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 },
          audit,
          ui: {
            uiType: 'code_block',
            props: {
              command: input.command,
              output: [result.stdout, result.stderr && `[stderr]\n${result.stderr}`].filter(Boolean).join('\n').trim(),
              status: result.stderr ? 'warning' : 'success',
              language: 'powershell',
            },
          },
        };
      } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string; code?: number | string };
        const stdout = failure.stdout ?? '';
        const stderr = failure.stderr ?? failure.message;
        return {
          data: { stdout, stderr, exitCode: typeof failure.code === 'number' ? failure.code : null },
          error: failure.message,
          audit,
          ui: {
            uiType: 'code_block',
            props: {
              command: input.command,
              output: [stdout, stderr].filter(Boolean).join('\n').trim(),
              status: 'error',
              language: 'powershell',
            },
          },
        };
      }
    },
  };
}
