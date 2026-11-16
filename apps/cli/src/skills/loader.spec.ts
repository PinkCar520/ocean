import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSkillsFromDir } from './loader.js';

describe('CLI skill loader', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('loads valid skills and skips symlinked or oversized instruction files', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ocean-skills-'));
    const skillsDir = path.join(root, 'skills');
    const outside = path.join(root, 'outside');
    await mkdir(path.join(skillsDir, 'review'), { recursive: true });
    await mkdir(path.join(skillsDir, 'linked'), { recursive: true });
    await mkdir(path.join(skillsDir, 'large'), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(skillsDir, 'review', 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\nCheck the diff.');
    await writeFile(path.join(outside, 'SKILL.md'), '---\nname: secret\ndescription: Outside file\n---\nDo not load.');
    await symlink(path.join(outside, 'SKILL.md'), path.join(skillsDir, 'linked', 'SKILL.md'));
    await writeFile(path.join(skillsDir, 'large', 'SKILL.md'), `---\nname: large\ndescription: Large\n---\n${'x'.repeat(257 * 1024)}`);

    const skills = loadSkillsFromDir(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ manifest: { name: 'review' }, content: 'Check the diff.' });
  });
});
