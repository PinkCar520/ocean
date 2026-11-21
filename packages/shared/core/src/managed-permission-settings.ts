import { lstatSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

export interface ManagedPermissionPaths {
  files: string[];
  required: boolean;
  invalid: boolean;
}

/** Ocean deployment locations for administrator-managed settings. */
export function getManagedPermissionPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ManagedPermissionPaths {
  const configured = env.OCEAN_MANAGED_SETTINGS_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? { files: [path.normalize(configured)], required: true, invalid: false }
      : { files: [], required: true, invalid: true };
  }

  const root = platform === 'darwin'
    ? '/Library/Application Support/Ocean'
    : platform === 'win32'
      ? path.join('C:\\Program Files', 'Ocean')
      : '/etc/ocean';
  const base = path.join(root, 'managed-settings.json');
  const dropIn = path.join(root, 'managed-settings.d');
  const files = [base];
  try {
    const stat = lstatSync(dropIn);
    if (!stat.isDirectory()) return { files, required: false, invalid: true };
    const names = readdirSync(dropIn).filter((name) => !name.startsWith('.') && name.endsWith('.json')).sort();
    if (names.length > 128) return { files, required: false, invalid: true };
    files.push(...names.map((name) => path.join(dropIn, name)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { files, required: false, invalid: true };
    }
  }
  return { files, required: false, invalid: false };
}
