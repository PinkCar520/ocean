import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillAvailability, catalogTokens } from './availability.js';
import { buildCatalogXml } from './loader.js';
import { createSkillActivationTool } from '../tools/skill-tool.js';
import type { LoadedSkill } from '../types.js';
describe('skill availability', () => {
  it('persists disabling and updates existing activation tool and catalog without reading body', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ocean-skills-'));
    try {
      const skill: LoadedSkill = { manifest: {name:'demo',description:'Demo'}, sourcePath:root, get content(){throw Error('lazy body');} };
      const state = new SkillAvailability([skill],root,root);
      const tool = createSkillActivationTool(state.enabled);
      expect(catalogTokens(skill)).toBeGreaterThan(0);
      state.toggle(skill);
      expect(buildCatalogXml(state.enabled)).not.toContain('demo');
      expect(await tool.execute({skill_name:'demo'})).toHaveProperty('error');
      const restored = new SkillAvailability([skill],root,root);
      expect(restored.enabled).toEqual([]);
      restored.toggle(skill);
      expect(restored.enabled).toEqual([skill]);
    } finally { rmSync(root,{recursive:true,force:true}); }
  });
});
