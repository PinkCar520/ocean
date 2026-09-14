import { describe, expect, it } from 'vitest';

import { createRunRequestSchema, leasedRunJobSchema, runEventSchema, runSnapshotSchema } from './index.js';

describe('run contracts', () => {
  it('accepts a scoped create-run request', () => {
    expect(
      createRunRequestSchema.parse({
        space: { id: 'space_1', type: 'work' },
        input: 'Summarize the project status',
      }),
    ).toEqual({
      space: { id: 'space_1', type: 'work' },
      input: 'Summarize the project status',
    });
  });

  it('rejects unknown fields at the service boundary', () => {
    expect(() =>
      createRunRequestSchema.parse({
        space: { id: 'space_1', type: 'life' },
        input: 'Plan a run',
        privileged: true,
      }),
    ).toThrow();
  });

  it('round-trips a sequenced run event', () => {
    const event = {
      id: 'event_1',
      runId: 'run_1',
      sequence: 0,
      occurredAt: '2026-09-14T10:18:03+08:00',
      type: 'run.status_changed',
      status: 'running',
    };

    expect(runEventSchema.parse(event)).toEqual(event);
  });

  it('validates a persisted run snapshot', () => {
    const occurredAt = '2026-09-14T10:18:03+08:00';
    const snapshot = {
      run: {
        id: 'run_1',
        userId: 'user_1',
        space: { id: 'space_1', type: 'code' },
        input: 'Review the repository',
        status: 'queued',
        idempotencyKey: null,
        metadata: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
      events: [{ id: 'event_1', runId: 'run_1', sequence: 0, occurredAt, type: 'run.created', status: 'queued' }],
    };

    expect(runSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('validates the versioned worker message envelope', () => {
    const job = {
      id: 'outbox_1',
      topic: 'run.requested',
      payload: { version: 1, runId: 'run_1', userId: 'user_1' },
      attempts: 1,
      lockedAt: '2026-09-14T04:30:00.000Z',
    };

    expect(leasedRunJobSchema.parse(job)).toEqual(job);
  });
});
