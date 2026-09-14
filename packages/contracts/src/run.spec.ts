import { describe, expect, it } from 'vitest';

import { createRunRequestSchema, runEventSchema } from './index.js';

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
});
