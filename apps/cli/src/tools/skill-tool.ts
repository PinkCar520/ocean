import { z } from 'zod';
import type { LoadedSkill } from '../types.js';

/** Expose loaded, versioned workspace skills through an explicit model tool. */
export function createSkillActivationTool(skills: LoadedSkill[]) {
  return {
    name: 'activate_skill',
    description: 'Load the full instructions for one of the listed Ocean skills.',
    inputSchema: z.object({
      skill_name: z.string().min(1).describe('Name from the available skills list'),
    }),
    async execute(input: { skill_name: string }) {
      const skill = skills.find((item) => item.manifest.name === input.skill_name);
      if (!skill) return { error: `Skill "${input.skill_name}" is not available in this workspace.` };
      return {
        skill: skill.manifest.name,
        instructions: skill.content,
        sourcePath: skill.sourcePath,
      };
    },
  };
}
