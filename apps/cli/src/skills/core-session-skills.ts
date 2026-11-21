import type { ModelMessage } from 'ai';
import type { LoadedSkill } from '../types.js';

export interface SessionSkillActivation {
  id: string;
  source: 'plugin' | 'user' | 'project';
  allowedTools?: readonly string[];
}

/** Skills are discovered by the host. Activation results can only identify a
 * discovered skill; transcript text cannot introduce tools or permissions.
 */
export function createSessionSkillPort(skills: readonly LoadedSkill[]) {
  const catalog = new Map(skills.map(skill => [skill.manifest.name, skill]));
  const describe = (name: string): SessionSkillActivation | undefined => {
    const skill = catalog.get(name);
    if (!skill) return undefined;
    const allowed = skill.manifest['allowed-tools'];
    return {
      id: skill.manifest.name,
      source: skill.source ?? 'project',
      ...(allowed === undefined ? {} : { allowedTools: [...allowed] }),
    };
  };
  const activatedSkill = (toolName: string, output: unknown): SessionSkillActivation | undefined => {
    if (toolName !== 'activate_skill' || !output || typeof output !== 'object' || Array.isArray(output))
      return undefined;
    const result = output as Record<string, unknown>;
    if (typeof result.skill !== 'string' || typeof result.sourcePath !== 'string' || result.error)
      return undefined;
    const skill = catalog.get(result.skill);
    if (!skill || skill.sourcePath !== result.sourcePath) return undefined;
    return describe(result.skill);
  };
  const restoreSkills = (messages: readonly ModelMessage[]): SessionSkillActivation[] => {
    const calls = new Map<string, string>();
    const active = new Map<string, SessionSkillActivation>();
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type === 'tool-call' && part.toolName === 'activate_skill' &&
            part.input && typeof part.input === 'object' && !Array.isArray(part.input)) {
          const name = (part.input as Record<string, unknown>).skill_name;
          if (typeof name === 'string' && !calls.has(part.toolCallId))
            calls.set(part.toolCallId, name);
        } else if (part.type === 'tool-result') {
          const requested = calls.get(part.toolCallId);
          if (!requested) continue;
          const output = part.output as unknown;
          const value = output && typeof output === 'object' && 'type' in output &&
            output.type === 'json' && 'value' in output ? output.value : output;
          const skill = activatedSkill('activate_skill', value);
          if (skill?.id === requested) active.set(skill.id, skill);
          calls.delete(part.toolCallId);
        }
      }
    }
    return [...active.values()];
  };
  return { activatedSkill, restoreSkills };
}
