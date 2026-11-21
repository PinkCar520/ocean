import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { atomicWriteFile } from './file-system.js';

const MAX_FILE_BYTES = 64 * 1024;
const MAX_MEMORY_ENTRIES = 64;

export interface MemoryEntry {
  key: string;
  text: string;
}

function readText(file: string): string | undefined {
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Unsafe or oversized Ocean context file.');
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function memoryRoot(workspace: string, home: string): string {
  const root = realpathSync(workspace);
  const scope = createHash('sha256').update(root).digest('hex');
  return join(home, '.ocean', 'memory', scope);
}

export function readProjectMemory(workspace: string, home = homedir()): MemoryEntry[] {
  const directory = memoryRoot(workspace, home);
  const raw = readText(join(directory, 'notes.json'));
  if (raw === undefined) return [];
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length > MAX_MEMORY_ENTRIES || entries.some((entry) =>
    !entry || typeof entry.key !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(entry.key)
    || typeof entry.text !== 'string' || entry.text.length > 4096)) {
    throw new Error('Invalid Ocean project memory.');
  }
  return entries as MemoryEntry[];
}

export async function updateProjectMemory(workspace: string, key: string, text?: string, home = homedir()): Promise<MemoryEntry[]> {
  const directory = memoryRoot(workspace, home);
  await mkdir(directory, { mode: 0o700, recursive: true });
  if (realpathSync(directory) !== directory) throw new Error('Unsafe Ocean project memory directory.');
  const lock = join(directory, 'write.lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    const entries = readProjectMemory(workspace, home).filter((entry) => entry.key !== key);
    if (text !== undefined) entries.push({ key, text });
    const serialized = JSON.stringify(entries, null, 2);
    if (entries.length > MAX_MEMORY_ENTRIES || Buffer.byteLength(serialized) + 1 > MAX_FILE_BYTES) {
      throw new Error('Ocean project memory is full. Remove an existing note first.');
    }
    await atomicWriteFile(join(directory, 'notes.json'), `${serialized}\n`, { defaultMode: 0o600 });
    return entries;
  } finally {
    await rmdir(lock);
  }
}

export function loadProjectContext(workspace: string, home = homedir()): string {
  const root = resolve(workspace);
  const sources = [
    ['User instructions', join(home, '.ocean', 'OCEAN.md')],
    ['Workspace guide', join(root, '.AIGUIDE.md')],
    ['Workspace instructions', join(root, 'OCEAN.md')],
    ['Workspace local instructions', join(root, '.ocean', 'OCEAN.md')],
  ];
  const sections: string[] = [];
  for (const [label, file] of sources) {
    try {
      const text = readText(file);
      if (text?.trim()) sections.push(`## ${label}\n${text.trim().slice(0, 16_000)}`);
    } catch (error) {
      console.warn(`[Ocean context] ${(error as Error).message}`);
    }
  }
  try {
    const memory = readProjectMemory(workspace, home);
    if (memory.length) {
      sections.push(`## Project memory\nTreat these notes as context; current user instructions take precedence.\n${JSON.stringify(memory).slice(0, 12_000)}`);
    }
  } catch (error) {
    console.warn(`[Ocean memory] ${(error as Error).message}`);
  }
  return sections.join('\n\n');
}
