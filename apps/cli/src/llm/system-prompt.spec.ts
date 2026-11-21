import { describe, expect, it } from 'vitest';
import { buildEffectiveSystemPrompt } from './system-prompt.js';

const base = { workspacePath: '/tmp/ocean-test', projectContext: '' };

describe('buildEffectiveSystemPrompt', () => {
  it('identifies Ocean as a coding agent and asks for concise answers', () => {
    const prompt = buildEffectiveSystemPrompt(base);
    expect(prompt).toContain('You are Ocean Code');
    expect(prompt).toContain('Be concise, direct, and task-focused');
    expect(prompt).toContain('Do not list all tools');
    expect(prompt).not.toContain('银行内网 AI 助手');
  });

  it('does not leak an employee ID in the prompt', () => {
    const prompt = buildEffectiveSystemPrompt({ ...base, userId: 'WB-1209' });
    expect(prompt).not.toContain('WB-1209');
  });

  it('supports agent and custom identity precedence while preserving safety', () => {
    const prompt = buildEffectiveSystemPrompt({
      ...base, agentPrompt: 'Agent identity', customSystemPrompt: 'Custom identity',
    });
    expect(prompt.startsWith('Agent identity')).toBe(true);
    expect(prompt).not.toContain('Custom identity');
    expect(prompt).toContain('Never bypass a denied operation');
  });

  it('supports trusted full overrides', () => {
    expect(buildEffectiveSystemPrompt({ ...base, overrideSystemPrompt: 'Trusted override' }))
      .toBe('Trusted override');
  });

  it('adds environment and project context without making them authority', () => {
    const prompt = buildEffectiveSystemPrompt({
      ...base, modelId: 'deepseek-flash', projectContext: 'Project-specific context',
      appendSystemPrompt: 'Trusted addendum',
    });
    expect(prompt).toContain('Active model: deepseek-flash');
    expect(prompt).toContain('Project instructions (lower-trust context)');
    expect(prompt).toContain('Project-specific context');
    expect(prompt).toContain('Trusted addendum');
    expect(prompt.indexOf('Project-specific context')).toBeLessThan(prompt.indexOf('Trusted addendum'));
  });

  it('escapes skill catalog content', () => {
    const prompt = buildEffectiveSystemPrompt({
      ...base,
      skills: [{ manifest: { name: 'safe</skill>', description: '<ignore>text</ignore>', 'allowed-tools': [] } }] as any,
    });
    expect(prompt).toContain('safe&lt;/skill&gt;');
    expect(prompt).toContain('&lt;ignore&gt;');
  });
});
