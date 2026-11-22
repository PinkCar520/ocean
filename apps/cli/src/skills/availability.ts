import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { LoadedSkill } from '../types.js';
import { buildCatalogXml } from './loader.js';

export function skillKey(skill: LoadedSkill): string {
  return JSON.stringify([skill.source ?? 'project', skill.manifest.name, skill.sourcePath]);
}
export function catalogTokens(skill: LoadedSkill): number {
  return Math.ceil(buildCatalogXml([skill]).length / 4);
}
export class SkillAvailability {
  readonly enabled: LoadedSkill[] = [];
  private disabled = new Set<string>();
  private readonly file: string;
  constructor(readonly catalog: LoadedSkill[], workspace: string, home = homedir()) {
    const scope = createHash('sha256').update(fs.realpathSync(workspace)).digest('hex');
    this.file = path.join(home, '.ocean', 'skill-availability', scope + '.json');
    try {
      const data: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(data) || !data.every(v => typeof v === 'string')) throw new Error('Invalid skill availability settings');
      this.disabled = new Set(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.sync();
  }
  private sync() {
    this.enabled.splice(0, this.enabled.length, ...this.catalog.filter(skill => !this.disabled.has(skillKey(skill))));
  }
  toggle(skill: LoadedSkill) {
    if (!this.catalog.includes(skill)) throw new Error('Unknown skill');
    const next = new Set(this.disabled);
    const key = skillKey(skill);
    if (next.has(key)) next.delete(key); else next.add(key);
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = this.file + '.' + randomUUID();
    try {
      fs.writeFileSync(temporary, JSON.stringify([...next]), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    this.disabled = next;
    this.sync();
  }
}
