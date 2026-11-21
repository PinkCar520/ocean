/** Skill metadata is untrusted instructions, never a source of permissions. */
export interface SkillDescriptor {
  id: string;
  name: string;
  source: 'plugin' | 'user' | 'project';
  allowedTools?: readonly string[];
}
export interface SkillActivation {
  skillId: string;
  source: SkillDescriptor['source'];
  activatedAt: string;
  allowedTools: readonly string[];
}
/** Explicit project > user > plugin precedence; equal-priority conflicts fail. */
export function resolveSkills(skills: readonly SkillDescriptor[]): SkillDescriptor[] {
  const rank = { plugin: 0, user: 1, project: 2 } as const;
  const selected = new Map<string, SkillDescriptor>();
  for (const skill of skills) {
    if (!skill.id.trim() || !skill.name.trim()) throw new Error('Invalid skill identity');
    const existing = selected.get(skill.name);
    if (existing && existing.source === skill.source && existing.id !== skill.id)
      throw new Error('Conflicting skill definitions at the same precedence');
    if (!existing || rank[skill.source] > rank[existing.source]) selected.set(skill.name, skill);
  }
  return [...selected.values()];
}
/** Intersection only: a Skill cannot grant tools forbidden by the host. */
export function skillAllowedTools(skill: SkillDescriptor, hostAllowed: readonly string[]): string[] {
  const permitted = new Set(hostAllowed);
  return skill.allowedTools === undefined
    ? [...permitted]
    : [...new Set(skill.allowedTools)].filter(tool => permitted.has(tool));
}
