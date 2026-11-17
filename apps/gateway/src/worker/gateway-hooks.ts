import type { ModelGateway } from '../ai/model-gateway';
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type GatewayHookEvent = 'PreToolUse' | 'PostToolUse' | 'ToolUseFailure' | 'UserPromptSubmit' | 'Stop';

interface HookCommand {
  type: 'command' | 'prompt' | 'http';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  prompt?: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

interface GatewayHookConfig {
  hooks?: Partial<Record<GatewayHookEvent, HookGroup[]>>;
  /** Hooks never run for a Space unless it is explicitly listed here. */
  trustedSpaces?: string[];
  allowedHttpHookUrls?: string[];
  httpHookAllowedEnvVars?: string[];
}

export interface HookRunResult {
  blocked: boolean;
  reason: string;
}

const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * GatewayHooks executes administrator-installed lifecycle hooks for Run/Worker
 * tool calls. It is disabled unless OCEAN_GATEWAY_HOOKS_FILE points at a
 * private file and the Run's Space is explicitly trusted. Project files are
 * never loaded automatically: the Worker must not execute repository code.
 */
@Injectable()
export class GatewayHooks {
  private readonly logger = new Logger(GatewayHooks.name);

  constructor(
    private config: GatewayHookConfig = {},
    private readonly cwd: string = process.cwd(),
    private readonly file?: string,
    private readonly model?: ModelGateway,
  ) {}

  static load(file = process.env.OCEAN_GATEWAY_HOOKS_FILE, model?: ModelGateway): GatewayHooks {
    if (!file) return new GatewayHooks({}, process.cwd(), undefined, model);
    try {
      const info = lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CONFIG_BYTES || (info.mode & 0o022)) {
        throw new Error('Unsafe Gateway hooks configuration');
      }
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as GatewayHookConfig;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid Gateway hooks configuration');
      return new GatewayHooks(parsed, process.cwd(), file, model);
    } catch (error) {
      throw error;
    }
  }

  /** Hooks are opt-in per Space, and only for administrators' own file. */
  private enabled(spaceId: string | undefined): boolean {
    return !!spaceId && Array.isArray(this.config.trustedSpaces) && this.config.trustedSpaces.includes(spaceId);
  }

  async run(
    event: GatewayHookEvent,
    input: Record<string, unknown>,
    options: { spaceId?: string; signal?: AbortSignal } = {},
  ): Promise<HookRunResult> {
    if (this.file) {
      // Re-open the administrator path on every invocation, including atomic replacements.
      // A removed or malformed file must never silently disable an installed gate.
      lstatSync(this.file);
      this.config = GatewayHooks.load(this.file, this.model).config;
    }
    if (!this.enabled(options.spaceId)) return { blocked: false, reason: '' };
    const spaceId = options.spaceId!;
    options.signal?.throwIfAborted();
    for (const group of this.config.hooks?.[event] ?? []) {
      if (group?.matcher && group.matcher !== '*' && !new RegExp(group.matcher).test(String(input.tool_name ?? ''))) continue;
      for (const hook of group?.hooks ?? []) {
        const seconds = hook.timeout ?? 10;
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) throw new Error('Invalid hook timeout');
        const result = hook.type === 'http'
          ? await this.executeHttp(hook, event, input, seconds, options.signal)
          : hook.type === 'prompt'
            ? await this.executePrompt(hook, event, input, seconds, options.signal)
          : hook.type === 'command' && typeof hook.command === 'string'
            ? await this.execute(hook.command, event, input, spaceId, seconds, options.signal)
            : (() => { throw new Error('Unsupported Gateway hook type'); })();
        if (result.code === 2) return { blocked: true, reason: result.stderr || 'Blocked by hook' };
        if (result.code !== 0) throw new Error(`Hook exited ${result.code}: ${result.stderr}`);
        if (!result.stdout.trim()) continue;
        let output: any;
        try { output = JSON.parse(result.stdout); } catch { throw new Error('Invalid hook JSON output'); }
        if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('Invalid hook JSON output');
        const specific = output.hookSpecificOutput;
        if (specific?.hookEventName && specific.hookEventName !== event) throw new Error('Hook event mismatch');
        if (output.decision === 'block' || output.continue === false || specific?.permissionDecision === 'deny' || specific?.permissionDecision === 'ask') {
          return { blocked: true, reason: output.reason || output.stopReason || specific?.permissionDecisionReason || 'Blocked by hook' };
        }
      }
    }
    return { blocked: false, reason: '' };
  }

  private async executePrompt(hook: HookCommand, event: GatewayHookEvent, input: Record<string, unknown>, seconds: number, signal?: AbortSignal) {
    if (!this.model || typeof hook.prompt !== 'string' || !hook.prompt.trim()) throw new Error('Prompt hook requires a model and prompt');
    const payload = JSON.stringify({ ...input, hook_event_name: event });
    const prompt = hook.prompt.includes('$ARGUMENTS') ? hook.prompt.replaceAll('$ARGUMENTS', payload) : `${hook.prompt}\n${payload}`;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    try {
      const result = await Promise.race([
        this.model.generate({ signal: controller.signal, messages: [{ role: 'user', text: `${prompt}\nReturn only JSON: {"ok": boolean, "reason": string}. Do not call tools.` }] }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { const error = new Error('Hook timeout'); controller.abort(error); reject(error); }, seconds * 1000);
          abort = () => { const error = signal?.reason ?? new Error('Hook cancelled'); controller.abort(error); reject(error); };
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        }),
      ]);
      if (result.toolCalls.length || Buffer.byteLength(result.text) > MAX_OUTPUT_BYTES) throw new Error('Invalid prompt hook response');
      const verdict = JSON.parse(result.text);
      if (!verdict || typeof verdict.ok !== 'boolean' || (verdict.reason !== undefined && typeof verdict.reason !== 'string')) throw new Error('Invalid prompt hook verdict');
      return { code: 0, stdout: JSON.stringify(verdict.ok ? {} : { decision: 'block', reason: verdict.reason || 'Blocked by prompt hook' }), stderr: '' };
    } finally { if (timer) clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
  }

  private async executeHttp(hook: HookCommand, event: GatewayHookEvent, input: Record<string, unknown>, seconds: number, signal?: AbortSignal) {
    const url = new URL(hook.url ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid HTTP hook URL');
    const patterns = this.config.allowedHttpHookUrls;
    if (patterns !== undefined) {
      if (!Array.isArray(patterns) || !patterns.every(pattern => typeof pattern === 'string')) throw new Error('Invalid HTTP hook URL policy');
      const allowed = patterns.some(pattern => {
        const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        return new RegExp(`^${expression}$`).test(url.href);
      });
      if (!allowed) throw new Error('HTTP hook URL not allowed');
    }
    const allowedVariables = this.config.httpHookAllowedEnvVars ?? [];
    if (!Array.isArray(allowedVariables) || !allowedVariables.every(name => typeof name === 'string')) throw new Error('Invalid HTTP hook environment policy');
    const allowed = new Set(allowedVariables);
    const headers: Record<string, string> = {};
    for (const [name, template] of Object.entries(hook.headers ?? {})) {
      if (typeof template !== 'string') throw new Error('Invalid HTTP hook header');
      headers[name] = template.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g,
        (_, braced, plain) => allowed.has(braced ?? plain) ? process.env[braced ?? plain] ?? '' : '').replace(/[\r\n\x00]/g, '');
    }
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error('Hook timeout')), seconds * 1000);
    try {
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, hook_event_name: event, cwd: this.cwd }),
      });
      if (!response.ok) throw new Error(`HTTP hook returned ${response.status}`);
      let size = 0;
      const chunks: Buffer[] = [];
      if (response.body) for await (const chunk of response.body as any) {
        size += chunk.byteLength;
        if (size > MAX_OUTPUT_BYTES) { controller.abort(); throw new Error('Hook output limit exceeded'); }
        chunks.push(Buffer.from(chunk));
      }
      return { code: 0, stdout: Buffer.concat(chunks).toString('utf8'), stderr: '' };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  private execute(
    command: string,
    event: GatewayHookEvent,
    input: Record<string, unknown>,
    spaceId: string,
    seconds: number,
    signal?: AbortSignal,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        cwd: this.cwd,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OCEAN_HOOK_EVENT: event, OCEAN_SPACE_ID: spaceId },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(); } };
      const kill = () => {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
        catch { /* already gone */ }
      };
      const abort = () => { kill(); finish(() => reject(signal?.reason ?? new Error('Hook cancelled'))); };
      const timer = setTimeout(() => { kill(); finish(() => reject(new Error('Hook timeout'))); }, seconds * 1000);
      const append = (value: Buffer, isError: boolean) => {
        if (isError) stderr += value.toString(); else stdout += value.toString();
        if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) { kill(); finish(() => reject(new Error('Hook output limit exceeded'))); }
      };
      child.stdout.on('data', (value: Buffer) => append(value, false));
      child.stderr.on('data', (value: Buffer) => append(value, true));
      child.stdin.on('error', () => { /* hook may not read stdin */ });
      child.on('error', (error) => finish(() => reject(error)));
      child.on('close', (code) => finish(() => resolve({ code, stdout, stderr })));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdin.end(JSON.stringify({ ...input, hook_event_name: event, cwd: this.cwd }));
    });
  }
}
