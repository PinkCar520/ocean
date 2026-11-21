import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverSkills, loadSkillsFromDir } from './loader.js';

describe('CLI skill loader', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('merges user and project skills with project precedence and loads bodies on demand', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ocean-skills-'));
    const home = path.join(root, 'home');
    const workspace = path.join(root, 'workspace');
    for (const [base, body] of [[home, 'user'], [workspace, 'project']]) {
      const dir = path.join(base, '.ocean/skills/review');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `---
name: review
description: Review code
---
${body}`);
    }
    const skills = discoverSkills(workspace, home);
    expect(skills).toHaveLength(1);
    await writeFile(path.join(workspace, '.ocean/skills/review/SKILL.md'), `---
name: review
description: Review code
---
updated`);
    expect(skills[0].content).toBe('updated');
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
  it('rejects ambiguous same-priority skill names instead of silently overriding', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ocean-skills-'));
    const home = path.join(root, 'home');
    const workspace = path.join(root, 'workspace');
    await mkdir(home, { recursive: true });
    for (const directory of ['.claude/skills/review', '.ocean/skills/review']) {
      const target = path.join(workspace, directory);
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'SKILL.md'), '---\nname: review\ndescription: Review\n---\nInstructions');
    }
    expect(() => discoverSkills(workspace, home)).toThrow('Conflicting skill definitions');
  });

  it('parses quoted and multiline YAML and rejects invalid typed manifests', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ocean-skills-'));
    const skillsDir = path.join(root, 'skills');
    const valid = path.join(skillsDir, 'valid');
    const invalid = path.join(skillsDir, 'invalid');
    await mkdir(valid, { recursive: true });
    await mkdir(invalid, { recursive: true });
    await writeFile(path.join(valid, 'SKILL.md'), [
      '---', 'name: "review"', 'description: >', '  Review code', '  carefully',
      'allowed-tools:', '  - "file_read"', '  - "grep"', '---', 'Do the review.',
    ].join('\n'));
    await writeFile(path.join(invalid, 'SKILL.md'), [
      '---', 'name: invalid', 'description: 42', 'allowed-tools: [file_read]', '---', 'Do not load.',
    ].join('\n'));
    const skills = loadSkillsFromDir(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest).toMatchObject({
      name: 'review', description: 'Review code carefully', 'allowed-tools': ['file_read', 'grep'],
    });
  });

});
