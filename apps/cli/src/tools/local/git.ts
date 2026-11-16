import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { LocalTool, LocalToolResponse } from '../base.js';
import { getGitStateFs, isSafeRefName } from '../../utils/git-fs.js';
import { SecurityEngine } from '../../utils/security.js';

const execFileAsync = promisify(execFile);

export interface GitParams {
  action: 'status' | 'log' | 'diff' | 'branch' | 'add' | 'commit' | 'push' | 'worktree_list' | 'worktree_add' | 'worktree_remove';
  args?: string | string[];
  paths?: string[];
  message?: string;
  remote?: string;
  branch?: string;
  name?: string;
}

/** Split legacy argument strings without evaluating shell syntax or expansions. */
export function tokenizeGitArgs(input: string): string[] {
  const args: string[] = [];
  let value = '';
  let quote: 'single' | 'double' | null = null;
  let escaped = false;
  for (const char of input) {
    if (escaped) { value += char; escaped = false; continue; }
    if (char === '\\' && quote !== 'single') { escaped = true; continue; }
    if (char === "'" && quote !== 'double') { quote = quote === 'single' ? null : 'single'; continue; }
    if (char === '"' && quote !== 'single') { quote = quote === 'double' ? null : 'double'; continue; }
    if (/\s/.test(char) && !quote) {
      if (value) { args.push(value); value = ''; }
      continue;
    }
    value += char;
  }
  if (escaped || quote) throw new Error('Unclosed quote or escape in Git arguments');
  if (value) args.push(value);
  return args;
}

export function buildGitArgs(params: GitParams): string[] {
  const legacy = typeof params.args === 'string' ? tokenizeGitArgs(params.args) : (params.args ?? []);
  const paths = params.paths ?? [];
  switch (params.action) {
    case 'status':
      if (legacy.some((arg) => !['--short', '--branch', '--porcelain'].includes(arg))) throw new Error('Unsupported git status option');
      return legacy.length ? legacy : ['--short', '--branch'];
    case 'log':
      if (legacy.some((arg) => !['--oneline', '--decorate', '--stat', '-n'].includes(arg) && !/^\d+$/.test(arg))) throw new Error('Unsupported git log option');
      return legacy.length ? legacy : ['-n', '10', '--oneline'];
    case 'diff':
      if (legacy.some((arg) => !['--cached', '--stat', '--name-only'].includes(arg))) throw new Error('Unsupported git diff option');
      return [...legacy, ...(paths.length ? ['--', ...paths] : [])];
    case 'branch':
      if (legacy.some((arg) => !['--show-current', '--list'].includes(arg))) throw new Error('Only branch listing is supported');
      return legacy.length ? legacy : ['--show-current'];
    case 'add':
      if (legacy.length || paths.length === 0) throw new Error('git add requires paths and does not accept raw options');
      return ['--', ...paths];
    case 'commit':
      if (legacy.length || !params.message?.trim()) throw new Error('git commit requires a message and does not accept raw options');
      return ['-m', params.message];
    case 'push':
      if (legacy.length || !params.remote || !params.branch || params.remote.startsWith('-') || params.branch.startsWith('-')) {
        throw new Error('git push requires an explicit remote and branch');
      }
      return [params.remote, params.branch];
    case 'worktree_list':
      if (legacy.length) throw new Error('worktree_list does not accept raw options');
      return ['list', '--porcelain'];
    case 'worktree_add':
      if (legacy.length || !params.name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(params.name)
        || !params.branch || !isSafeRefName(params.branch)) {
        throw new Error('worktree_add requires a safe name and branch');
      }
      return ['add', '-b', params.branch, path.join('.ocean', 'worktrees', params.name)];
    case 'worktree_remove':
      if (legacy.length || !params.name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(params.name)) {
        throw new Error('worktree_remove requires a safe worktree name');
      }
      return ['remove', path.join('.ocean', 'worktrees', params.name)];
  }
}

/**
 * GitTool - Provides structured Git information for Web UI rendering.
 */
export class GitTool extends LocalTool<GitParams, any> {
  readonly name = 'local_git';
  readonly description = 'Interact with local Git repository and return structured data.';

  constructor(private readonly workspaceRoot: string = process.cwd()) {
    super();
  }

  async execute(params: GitParams, context?: { signal?: AbortSignal }): Promise<LocalToolResponse<any>> {
    const cwd = path.resolve(this.workspaceRoot);
    const security = new SecurityEngine(cwd);

    try {
      const gitArgs = buildGitArgs(params);
      if (params.action === 'worktree_list') {
        const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd, timeout: 15_000, signal: context?.signal });
        const worktrees = stdout.trim().split(/\n\n/).filter(Boolean).map((entry) => {
          const fields = Object.fromEntries(entry.split('\n').map((line) => {
            const index = line.indexOf(' ');
            return index === -1 ? [line, true] : [line.slice(0, index), line.slice(index + 1)];
          }));
          return fields;
        });
        return { success: true, data: worktrees, uiHint: 'git' };
      }
      if (params.action === 'worktree_add' || params.action === 'worktree_remove') {
        const targetRelative = path.join('.ocean', 'worktrees', params.name!);
        const target = await security.resolveWorkspacePath(targetRelative);
        if (params.action === 'worktree_remove') {
          const allowedRoot = path.join(await security.resolveWorkspacePath('.ocean'), 'worktrees') + path.sep;
          const relative = path.relative(allowedRoot, target);
          if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error('Worktree path is outside the managed worktree directory');
          }
          gitArgs[1] = target;
        } else {
          await fs.mkdir(path.dirname(target), { recursive: true });
          gitArgs[gitArgs.length - 1] = target;
        }
        const { stdout, stderr } = await execFileAsync('git', ['worktree', ...gitArgs], { cwd, timeout: 30_000, signal: context?.signal });
        return { success: true, data: { raw: stdout || stderr, path: target }, uiHint: 'git' };
      }
      if (params.action === 'add') {
        const safePaths = await Promise.all((params.paths ?? []).map((item) => security.resolveWorkspacePath(item)));
        gitArgs.splice(1, gitArgs.length - 1, ...safePaths);
      } else if (params.action === 'diff' && params.paths?.length) {
        const safePaths = await Promise.all(params.paths.map((item) => security.resolveWorkspacePath(item)));
        gitArgs.splice(gitArgs.indexOf('--') + 1, safePaths.length, ...safePaths);
      }
      // For status, we combine FS reading with the porcelain output
      if (params.action === 'status') {
        const [state, { stdout: rawStatus }] = await Promise.all([
          getGitStateFs(cwd),
          execFileAsync('git', ['status', '--porcelain'], { cwd, signal: context?.signal })
        ]);

        if (!state) {
          return { success: false, error: 'Not a git repository' };
        }

        return {
          success: true,
          data: {
            isClean: rawStatus.trim() === '',
            branch: state.branch,
            sha: state.sha,
            gitDir: state.gitDir,
            cwd: cwd,
            isShallow: state.isShallow,
            raw: rawStatus
          },
          uiHint: 'git'
        };
      }

      // Default to exec for complex commands
      const { stdout, stderr } = await execFileAsync('git', [params.action, ...gitArgs], {
        cwd,
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        signal: context?.signal,
      });
      
      if (stderr && !stdout) {
        return { success: false, error: stderr };
      }

      return {
        success: true,
        data: {
          raw: stdout,
          command: ['git', params.action, ...gitArgs].map((part) => JSON.stringify(part)).join(' ')
        },
        uiHint: 'git'
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
