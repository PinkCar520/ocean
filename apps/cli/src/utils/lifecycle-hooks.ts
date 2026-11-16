import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export type HookEvent = 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'ToolUseFailure';
type HookConfig = Partial<Record<HookEvent, Array<{ matcher?: string; hooks: Array<{ type: 'command' | 'prompt'; command?: string; prompt?: string; timeout?: number }> }>>>;

export class LifecycleHooks {
  constructor(private readonly config: HookConfig, private readonly cwd: string, private readonly options: {
    evaluatePrompt?: (prompt: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;
  } = {}) {}
  /** Only explicitly installed personal configuration is executable; never load repository hooks. */
  static load(cwd: string, home = homedir()): LifecycleHooks {
    const file = join(home, '.ocean', 'hooks.json');
    try {
      const stats = lstatSync(file);
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 256 * 1024 || (stats.mode & 0o022)) throw new Error('Unsafe personal hooks configuration');
      const config = JSON.parse(readFileSync(file, 'utf8'));
      const hooks: HookConfig = config.hooks ?? {};
      const projectFile = join(cwd, '.ocean', 'hooks.json');
      try {
        const info = lstatSync(projectFile);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('Unsafe project hooks');
        const raw = readFileSync(projectFile, 'utf8');
        const digest = createHash('sha256').update(raw).digest('hex');
        // Personal configuration must authorize this exact workspace and file content.
        if (config.trustedProjects?.[realpathSync(cwd)] === digest) {
          const project: HookConfig = JSON.parse(raw).hooks ?? {};
          for (const event of Object.keys(project) as HookEvent[]) hooks[event] = [...(hooks[event] ?? []), ...(project[event] ?? [])];
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      return new LifecycleHooks(hooks, cwd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new LifecycleHooks({}, cwd);
      throw error;
    }
  }
  async run(event: HookEvent, input: Record<string, unknown>, signal?: AbortSignal): Promise<{ blocked: boolean; reason: string }> {
    signal?.throwIfAborted();
    for (const group of this.config[event] ?? []) {
      if (group.matcher && group.matcher !== '*' && !new RegExp(group.matcher).test(String(input.tool_name ?? ''))) continue;
      for (const hook of group.hooks) {
        if (!['command', 'prompt'].includes(hook.type)) throw new Error('Unsupported hook');
        const seconds = hook.timeout ?? 10;
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) throw new Error('Invalid hook timeout');
        if (hook.type === 'prompt') {
          if (!this.options.evaluatePrompt || typeof hook.prompt !== 'string') throw new Error('Prompt hook evaluator unavailable');
          const controller = new AbortController();
          const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
          const timer = setTimeout(() => controller.abort(new Error('Hook timeout')), seconds * 1000);
          let abort!: () => void;
          try {
            const output = await Promise.race([
              this.options.evaluatePrompt(hook.prompt, { ...input, hook_event_name: event, cwd: this.cwd }, combined),
              new Promise<never>((_, reject) => { abort = () => reject(combined.reason); combined.addEventListener('abort', abort, { once: true }); if (combined.aborted) abort(); }),
            ]);
            combined.throwIfAborted();
            if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('Invalid hook JSON output');
            const specific = output.hookSpecificOutput as Record<string, unknown> | undefined;
            if (specific?.hookEventName && specific.hookEventName !== event) throw new Error('Hook event mismatch');
            if (output.decision === 'block' || output.continue === false || ['deny', 'ask'].includes(String(specific?.permissionDecision))) return { blocked: true, reason: String(output.reason ?? output.stopReason ?? specific?.permissionDecisionReason ?? 'Blocked by hook') };
          } finally { clearTimeout(timer); combined.removeEventListener('abort', abort); }
          continue;
        }
        if (typeof hook.command !== 'string') throw new Error('Invalid command hook');
        const command = hook.command;
        const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
          const child = spawn(command, { shell: true, cwd: this.cwd, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '', stderr = '';
          const kill = () => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
          const abort = () => { kill(); reject(signal?.reason ?? new Error('Hook cancelled')); };
          const timer = setTimeout(() => { kill(); reject(new Error('Hook timeout')); }, seconds * 1000);
          const append = (value: Buffer, isError: boolean) => {
            if (isError) stderr += value.toString(); else stdout += value.toString();
            if (stdout.length + stderr.length > 256 * 1024) { kill(); reject(new Error('Hook output limit exceeded')); }
          };
          child.stdout.on('data', (value) => append(value, false));
          child.stderr.on('data', (value) => append(value, true));
          child.stdin.on('error', () => {});
          child.on('error', reject);
          child.on('close', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve({ code, stdout, stderr }); });
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
          child.stdin.end(JSON.stringify({ ...input, hook_event_name: event, cwd: this.cwd }));
        });
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
}
