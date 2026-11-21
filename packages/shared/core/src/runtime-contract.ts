import { createHash } from 'node:crypto';

/** Host-independent execution contract for Ocean's local-first Agent Core. */
export const RUNTIME_STATES = [
  'created', 'preparing_context', 'calling_model', 'validating_tools',
  'awaiting_approval', 'executing_tools', 'persisting_results',
  'completed', 'failed', 'cancelled', 'interrupted',
] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];
export interface RuntimeIdentity {
  sessionId: string;
  runId: string;
  /** A session may contain multiple runs, but each run has one stable identity. */
  stepId?: string;
}
export type RuntimeEvent = (
  | { type: 'run.created'; runId: string; at: string; sessionId?: string; schemaVersion?: 1 }
  | { type: 'run.transitioned'; runId: string; at: string; from: RuntimeState; to: RuntimeState }
  | { type: 'tool.proposed'; runId: string; at: string; invocationId: string; toolName: string; inputDigest: string }
  | { type: 'tool.prepared'; runId: string; at: string; invocation: ToolInvocation }
  | { type: 'tool.settled'; runId: string; at: string; invocationId: string; outcome: 'succeeded' | 'failed' | 'unknown'; result?: unknown }
  | { type: 'tool.reconciled'; runId: string; at: string; invocationId: string; outcome: 'succeeded' | 'failed'; result?: unknown }
  | { type: 'run.completion_verified'; runId: string; at: string; checks: readonly string[] }
  | { type: 'skill.activated'; runId: string; at: string; skillId: string; source: 'plugin' | 'user' | 'project'; allowedTools?: readonly string[] }
  | { type: 'tool.rejected'; runId: string; at: string; invocationId: string; toolName: string; reason: 'policy' | 'approval' | 'input' }
) & { schemaVersion?: 1 };
export interface ToolInvocation {
  id: string;
  runId: string;
  toolName: string;
  input: unknown;
  inputDigest: string;
  host: 'local' | 'remote';
}
export interface ToolExecutionRecord {
  invocation: ToolInvocation;
  outcome: 'succeeded' | 'failed' | 'unknown';
  result?: unknown;
  /** Persisted event revision for cross-host replay diagnostics. */
  revision: number;
}
export interface RuntimeSnapshot {
  runId: string;
  sessionId?: string;
  state: RuntimeState;
  revision: number;
  pendingTools: Readonly<Record<string, 'prepared' | 'succeeded' | 'failed' | 'unknown'>>;
  queuedTools: Readonly<Record<string, { toolName: string; inputDigest: string }>>;
  completionVerified: boolean;
  activeSkills: readonly string[];
  /** Null means the skill imposes no additional tool constraints. */
  skillToolConstraints: Readonly<Record<string, readonly string[] | null>>;
}
export interface RuntimeEventStore {
  append(runId: string, expectedRevision: number, events: readonly RuntimeEvent[]): Promise<number>;
  read(runId: string): Promise<readonly RuntimeEvent[]>;
}
export interface RuntimeHost {
  execute(invocation: ToolInvocation): Promise<unknown>;
}
const transitions: Readonly<Record<RuntimeState, readonly RuntimeState[]>> = {
  created: ['preparing_context', 'cancelled', 'interrupted'],
  preparing_context: ['calling_model', 'failed', 'cancelled', 'interrupted'],
  calling_model: ['validating_tools', 'persisting_results', 'completed', 'failed', 'cancelled', 'interrupted'],
  validating_tools: ['awaiting_approval', 'executing_tools', 'failed', 'cancelled', 'interrupted'],
  awaiting_approval: ['executing_tools', 'cancelled', 'interrupted'],
  executing_tools: ['persisting_results', 'failed', 'cancelled', 'interrupted'],
  persisting_results: ['preparing_context', 'completed', 'failed', 'cancelled', 'interrupted'],
  interrupted: ['preparing_context', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
};
export function canTransition(from: RuntimeState, to: RuntimeState): boolean {
  return transitions[from].includes(to);
}
/** Pure replay: the event stream is the authority, not the last UI message. */
export function replayRuntime(runId: string, events: readonly RuntimeEvent[]): RuntimeSnapshot {
  const pendingTools: Record<string, 'prepared' | 'succeeded' | 'failed' | 'unknown'> = {};
  const queuedTools: Record<string, { toolName: string; inputDigest: string }> = {};
  let state: RuntimeState = 'created';
  let revision = 0;
  let created = false;
  let sessionId: string | undefined;
  let completionVerified = false;
  const activeSkills = new Set<string>();
  const skillToolConstraints: Record<string, readonly string[] | null> = {};
  for (const event of events) {
    if (event.runId !== runId) throw new Error('Runtime event belongs to another run');
    if (event.schemaVersion !== undefined && event.schemaVersion !== 1) throw new Error('Unsupported runtime event schema');
    if (event.type === 'run.created') {
      if (created || revision !== 0) throw new Error('Duplicate run creation');
      if (event.sessionId !== undefined && !event.sessionId.trim()) throw new Error('Invalid runtime session identity');
      sessionId = event.sessionId;
      created = true;
    } else if (!created) {
      throw new Error('Runtime event stream missing creation');
    } else if (event.type === 'run.transitioned') {
      if (event.from !== state || !canTransition(state, event.to)) throw new Error('Invalid runtime transition');
      if (event.to === 'completed' && Object.values(pendingTools).some(value => value === 'prepared' || value === 'unknown'))
        throw new Error('Cannot complete with unsettled tools');
      if (event.to === 'completed' && !completionVerified) throw new Error('Completion requires independent verification');
      if (event.to !== 'completed') completionVerified = false;
      state = event.to;
    } else if (event.type === 'tool.proposed') {
      if (state !== 'validating_tools' || !event.invocationId.trim() ||
          !event.toolName.trim() || !/^[a-f0-9]{64}$/.test(event.inputDigest) ||
          Object.hasOwn(queuedTools, event.invocationId) ||
          Object.hasOwn(pendingTools, event.invocationId))
        throw new Error('Invalid queued tool proposal');
      queuedTools[event.invocationId] = { toolName: event.toolName, inputDigest: event.inputDigest };
    } else if (event.type === 'tool.prepared') {
      if (state !== 'executing_tools' || event.invocation.runId !== runId || pendingTools[event.invocation.id])
        throw new Error('Invalid tool preparation');
      if (createHash('sha256').update(JSON.stringify(event.invocation.input)).digest('hex') !== event.invocation.inputDigest)
        throw new Error('Tool invocation digest mismatch');
      if (queuedTools[event.invocation.id] && queuedTools[event.invocation.id].toolName !== event.invocation.toolName)
        throw new Error('Queued tool name mismatch');
      completionVerified = false;
      pendingTools[event.invocation.id] = 'prepared';
    } else if (event.type === 'tool.rejected') {
      if (!event.invocationId.trim() || !event.toolName.trim()) throw new Error('Invalid tool rejection event');
    } else if (event.type === 'skill.activated') {
      if (!event.skillId.trim() || state === 'completed' || state === 'failed' || state === 'cancelled')
        throw new Error('Invalid skill activation identity');
      if (event.allowedTools !== undefined &&
          (!Array.isArray(event.allowedTools) ||
           event.allowedTools.some(tool => typeof tool !== 'string' || !tool.trim())))
        throw new Error('Invalid skill tool constraints');
      activeSkills.add(event.skillId);
      skillToolConstraints[event.skillId] = event.allowedTools === undefined
        ? null : [...new Set(event.allowedTools)];
    } else if (event.type === 'run.completion_verified') {
      if ((state !== 'calling_model' && state !== 'persisting_results') ||
          completionVerified || !event.checks.length || event.checks.some(check => !check.trim()) ||
          Object.values(pendingTools).some(value => value === 'prepared' || value === 'unknown'))
        throw new Error('Invalid completion verification');
      completionVerified = true;
    } else if (event.type === 'tool.settled') {
      if (pendingTools[event.invocationId] !== 'prepared') throw new Error('Tool settlement without preparation');
      pendingTools[event.invocationId] = event.outcome;
    } else {
      if (pendingTools[event.invocationId] !== 'unknown') throw new Error('Only unknown tool outcomes can be reconciled');
      pendingTools[event.invocationId] = event.outcome;
    }
    revision++;
  }
  if (!created) throw new Error('Runtime event stream missing creation');
  return { runId, sessionId, state, revision, pendingTools, queuedTools, completionVerified, activeSkills: [...activeSkills], skillToolConstraints };
}
