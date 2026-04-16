import { readFileSync, statSync } from 'node:fs';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, resolve, dirname, sep } from 'node:path';

/**
 * Validates that a ref/branch name is safe.
 * Ported from Claude Code's gitFilesystem.ts
 */
export function isSafeRefName(name: string): boolean {
  if (!name || name.startsWith('-') || name.startsWith('/')) {
    return false;
  }
  if (name.includes('..')) {
    return false;
  }
  if (name.split('/').some(c => c === '.' || c === '')) {
    return false;
  }
  return /^[a-zA-Z0-9/._+@-]+$/.test(name);
}

/**
 * Validates that a string is a git SHA.
 */
export function isValidGitSha(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s);
}

/**
 * Finds the git root by walking up from startPath.
 * Ported from Claude Code's git.ts
 */
export function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);
  const root = current.substring(0, current.indexOf(sep) + 1) || sep;

  while (current !== root) {
    try {
      const gitPath = join(current, '.git');
      const st = statSync(gitPath);
      if (st.isDirectory() || st.isFile()) {
        return current;
      }
    } catch {
      // .git doesn't exist at this level
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Check root
  try {
    const gitPath = join(root, '.git');
    const st = statSync(gitPath);
    if (st.isDirectory() || st.isFile()) return root;
  } catch {}

  return null;
}

/**
 * Resolves the actual .git directory (handles worktrees/submodules).
 */
export async function resolveGitDir(startPath: string): Promise<string | null> {
  const root = findGitRoot(startPath);
  if (!root) return null;

  const gitPath = join(root, '.git');
  try {
    const st = await stat(gitPath);
    if (st.isFile()) {
      const content = (await readFile(gitPath, 'utf-8')).trim();
      if (content.startsWith('gitdir:')) {
        return resolve(root, content.slice(7).trim());
      }
    }
    return gitPath;
  } catch {
    return null;
  }
}

/**
 * Read the commondir for worktrees.
 */
export async function getCommonDir(gitDir: string): Promise<string | null> {
  try {
    const content = (await readFile(join(gitDir, 'commondir'), 'utf-8')).trim();
    return resolve(gitDir, content);
  } catch {
    return null;
  }
}

/**
 * Parse .git/HEAD.
 */
export async function readGitHead(gitDir: string): Promise<
  { type: 'branch'; name: string } | { type: 'detached'; sha: string } | null
> {
  try {
    const content = (await readFile(join(gitDir, 'HEAD'), 'utf-8')).trim();
    if (content.startsWith('ref:')) {
      const ref = content.slice(4).trim();
      if (ref.startsWith('refs/heads/')) {
        const name = ref.slice(11);
        if (!isSafeRefName(name)) return null;
        return { type: 'branch', name };
      }
      return null;
    }
    if (!isValidGitSha(content)) return null;
    return { type: 'detached', sha: content };
  } catch {
    return null;
  }
}

/**
 * Resolve a ref to a SHA.
 */
export async function resolveRef(gitDir: string, ref: string): Promise<string | null> {
  // Try loose ref
  try {
    const content = (await readFile(join(gitDir, ref), 'utf-8')).trim();
    if (content.startsWith('ref:')) {
      return resolveRef(gitDir, content.slice(4).trim());
    }
    if (isValidGitSha(content)) return content;
  } catch {}

  // Try packed-refs
  try {
    const packed = await readFile(join(gitDir, 'packed-refs'), 'utf-8');
    for (const line of packed.split('\n')) {
      if (line.startsWith('#') || line.startsWith('^')) continue;
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      if (line.slice(spaceIdx + 1) === ref) {
        const sha = line.slice(0, spaceIdx);
        return isValidGitSha(sha) ? sha : null;
      }
    }
  } catch {}

  return null;
}

/**
 * Structured Git State using FS only.
 */
export async function getGitStateFs(cwd: string) {
  const gitDir = await resolveGitDir(cwd);
  if (!gitDir) return null;

  const head = await readGitHead(gitDir);
  const commonDir = (await getCommonDir(gitDir)) ?? gitDir;

  let branch = 'HEAD';
  let sha = '';

  if (head?.type === 'branch') {
    branch = head.name;
    sha = (await resolveRef(commonDir, `refs/heads/${branch}`)) ?? '';
  } else if (head?.type === 'detached') {
    sha = head.sha;
  }

  // Check if shallow
  let isShallow = false;
  try {
    await stat(join(commonDir, 'shallow'));
    isShallow = true;
  } catch {}

  return {
    gitDir,
    commonDir,
    branch,
    sha,
    isShallow,
  };
}
