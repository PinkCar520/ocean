import { replayRuntime, type RuntimeEvent, type RuntimeEventStore, type RuntimeSnapshot } from './runtime-contract.js';

/** Deterministic in-memory adapter for local runtimes and host contract tests.
 * Durable hosts implement the same compare-and-append interface with their own storage.
 */
export class MemoryRuntimeEventStore implements RuntimeEventStore {
  private readonly streams = new Map<string, RuntimeEvent[]>();

  async append(runId: string, expectedRevision: number, events: readonly RuntimeEvent[]): Promise<number> {
    const existing = this.streams.get(runId) ?? [];
    if (existing.length !== expectedRevision) throw new Error('Runtime revision conflict');
    if (events.length === 0) return existing.length;
    const combined = [...existing, ...events];
    replayRuntime(runId, combined); // Validate the entire transition before mutation.
    this.streams.set(runId, combined);
    return combined.length;
  }

  async read(runId: string): Promise<readonly RuntimeEvent[]> {
    return [...(this.streams.get(runId) ?? [])];
  }

  async snapshot(runId: string): Promise<RuntimeSnapshot> {
    return replayRuntime(runId, await this.read(runId));
  }
}
