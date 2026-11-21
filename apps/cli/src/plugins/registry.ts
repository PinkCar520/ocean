import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../utils/file-system.js';

const pluginId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const manifestSchema = z.object({
  id: pluginId,
  version: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  skills: z.string().min(1).max(512).optional(),
  agents: z.string().min(1).max(512).optional(),
  hooks: z.string().min(1).max(512).optional(),
}).strict();
const entrySchema = z.object({
  id: pluginId,
  version: z.string().min(1).max(80),
  source: z.string().refine(isAbsolute),
  enabled: z.boolean(),
}).strict();
const registrySchema = z.array(entrySchema).max(128);

type InstalledPlugin = z.infer<typeof entrySchema>;

function readJsonFile(file: string): unknown {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 128 * 1024 || (stat.mode & 0o022)) throw new Error('Unsafe plugin configuration file.');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function pluginManifest(source: string) {
  return manifestSchema.parse(readJsonFile(join(source, 'ocean-plugin.json')));
}

export function listPlugins(home = homedir()): InstalledPlugin[] {
  try {
    return registrySchema.parse(readJsonFile(join(home, '.ocean', 'plugins.json')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function pluginContributions(kind: 'skills' | 'agents' | 'hooks', home = homedir()): string[] {
  const directories: string[] = [];
  for (const entry of listPlugins(home)) {
    if (!entry.enabled) continue;
    try {
      if (realpathSync(entry.source) !== entry.source) throw new Error('Plugin source changed.');
      const manifest = pluginManifest(entry.source);
      if (manifest.id !== entry.id || manifest.version !== entry.version) throw new Error('Plugin metadata changed. Run ocean plugins update.');
      const configured = manifest[kind];
      if (!configured) continue;
      if (isAbsolute(configured)) throw new Error('Plugin contribution path must be relative.');
      const contribution = realpathSync(resolve(entry.source, configured));
      const scope = relative(entry.source, contribution);
      if (scope === '..' || scope.startsWith(`..${sep}`) || isAbsolute(scope)) throw new Error('Plugin contribution path is outside the package.');
      directories.push(contribution);
    } catch (error) {
      console.warn(`[Plugin ${entry.id}] ${(error as Error).message}`);
    }
  }
  return directories;
}

export async function updatePluginRegistry(
  update: (plugins: InstalledPlugin[]) => void,
  home = homedir(),
): Promise<InstalledPlugin[]> {
  const dir = join(home, '.ocean');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink()) throw new Error('Unsafe Ocean configuration directory.');
  const lock = join(dir, 'plugins.lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    const entries = listPlugins(home);
    update(entries);
    registrySchema.parse(entries);
    await atomicWriteFile(join(dir, 'plugins.json'), `${JSON.stringify(entries, null, 2)}\n`, { defaultMode: 0o600 });
    return entries;
  } finally {
    await rmdir(lock);
  }
}

export function readPluginSource(directory: string) {
  const source = realpathSync(directory);
  const manifest = pluginManifest(source);
  return { id: manifest.id, version: manifest.version, source };
}
