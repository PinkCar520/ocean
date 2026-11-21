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
export type RuntimeEvent =
  | { type: 'run.created'; runId: string; at: string; sessionId?: string; schemaVersion?: 1 }
  | { type: 'run.transitioned'; runId: string; at: string; from: RuntimeState; to: RuntimeState }
  | { type: 'tool.prepared'; runId: string; at: string; invocation: ToolInvocation }
  | { type: 'tool.settled'; runId: string; at: string; invocationId: string; outcome: 'succeeded' | 'failed' | 'unknown'; result?: unknown }
  | { type: 'tool.reconciled'; runId: string; at: string; invocationId: string; outcome: 'succeeded' | 'failed'; result?: unknown };
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
}
export interface RuntimeEventStore {
  append(runId: string, expectedRevision: number, events: readonly RuntimeEvent[]): Promise<number>;
  read(runId: string): Promise<readonly RuntimeEvent[]>;
}
export interface RuntimeHost {
  execute(invocation: ToolInvocation): Promise<unknown>;
}
const transitions: Readonly<Record<RuntimeState, readonly RuntimeState[]>> = {
  created: ['preparing_context', 'cancelled'],
  preparing_context: ['calling_model', 'failed', 'cancelled', 'interrupted'],
  calling_model: ['validating_tools', 'completed', 'failed', 'cancelled', 'interrupted'],
  validating_tools: ['awaiting_approval', 'executing_tools', 'failed', 'cancelled'],
  awaiting_approval: ['executing_tools', 'cancelled', 'interrupted'],
  executing_tools: ['persisting_results', 'failed', 'cancelled', 'interrupted'],
  persisting_results: ['preparing_context', 'completed', 'failed', 'interrupted'],
  interrupted: ['preparing_context', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
};
export function canTransition(from: RuntimeState, to: RuntimeState): boolean {
  return transitions[from].includes(to);
}
/** Pure replay: the event stream is the authority, not the last UI message. */
export function replayRuntime(runId: string, events: readonly RuntimeEvent[]): RuntimeSnapshot {
  const pendingTools: Record<string, 'prepared' | 'succeeded' | 'failed' | 'unknown'> = {};
  let state: RuntimeState = 'created';
  let revision = 0;
  let created = false;
  let sessionId: string | undefined;
  for (const event of events) {
    if (event.runId !== runId) throw new Error('Runtime event belongs to another run');
    if (event.type === 'run.created') {
      if (created || revision !== 0) throw new Error('Duplicate run creation');
      if (event.schemaVersion !== undefined && event.schemaVersion !== 1) throw new Error('Unsupported runtime event schema');
      if (event.sessionId !== undefined && !event.sessionId.trim()) throw new Error('Invalid runtime session identity');
      sessionId = event.sessionId;
      created = true;
    } else if (!created) {
      throw new Error('Runtime event stream missing creation');
    } else if (event.type === 'run.transitioned') {
      if (event.from !== state || !canTransition(state, event.to)) throw new Error('Invalid runtime transition');
      if (event.to === 'completed' && Object.values(pendingTools).some(value => value === 'prepared' || value === 'unknown'))
        throw new Error('Cannot complete with unsettled tools');
      state = event.to;
    } else if (event.type === 'tool.prepared') {
      if (state !== 'executing_tools' || event.invocation.runId !== runId || pendingTools[event.invocation.id])
        throw new Error('Invalid tool preparation');
      pendingTools[event.invocation.id] = 'prepared';
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
  return { runId, sessionId, state, revision, pendingTools };
}
