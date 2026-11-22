import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import type { LoadedSkill } from '../types.js';
import { createSessionSkillPort } from './core-session-skills.js';

const skill: LoadedSkill = {
  manifest: { name: 'review', description: 'Reviews code', 'allowed-tools': ['file_read'] },
  sourcePath: '/workspace/.ocean/skills/review',
  source: 'project',
  content: 'Review instructions',
};

describe('durable session Skill activation', () => {
 it('accepts only successful activation output matching a discovered skill', () => {
  const port = createSessionSkillPort([skill]);
  expect(port.activatedSkill('activate_skill', {
   skill: 'review', sourcePath: skill.sourcePath,
  })).toEqual({ id: 'review', source: 'project', allowedTools: ['file_read'] });
  expect(port.activatedSkill('shell', { skill: 'review', sourcePath: skill.sourcePath })).toBeUndefined();
  expect(port.activatedSkill('activate_skill', { skill: 'review', sourcePath: '/malicious' })).toBeUndefined();
  expect(port.activatedSkill('activate_skill', { error: 'denied', skill: 'review', sourcePath: skill.sourcePath })).toBeUndefined();
 });
 it('reconstructs restrictions only from correctly paired durable tool calls and results', () => {
  const port = createSessionSkillPort([skill]);
  const messages = [
    { role: 'user', content: 'review the code' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'activate_skill', input: { skill_name: 'review' } }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'activate_skill',
      output: { type: 'json', value: { skill: 'review', sourcePath: skill.sourcePath } } }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'b', toolName: 'activate_skill', input: { skill_name: 'unrelated' } }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'b', toolName: 'activate_skill',
      output: { type: 'json', value: { skill: 'review', sourcePath: skill.sourcePath } } }] },
  ] as ModelMessage[];
  expect(port.restoreSkills(messages)).toEqual([
   { id: 'review', source: 'project', allowedTools: ['file_read'] },
  ]);
 });
 it('does not elevate tool permissions from untrusted skill output', () => {
  const port = createSessionSkillPort([skill]);
  const result = port.activatedSkill('activate_skill', {
   skill: 'review', sourcePath: skill.sourcePath, allowedTools: ['shell', 'admin'],
  });
  expect(result?.allowedTools).toEqual(['file_read']);
 });
});
