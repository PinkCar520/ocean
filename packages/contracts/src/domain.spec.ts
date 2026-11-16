import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  actionCreateSchema,
  actionReceiptSchema,
  actionResultSchema,
  capabilitySchema,
  intentSchema,
  observationSchema,
  observationSourceSchema,
  permissionDecisionSchema,
  sensitivitySchema,
} from './index.js';

const schemaPath = fileURLToPath(
  new URL('../schemas/domain.schema.json', import.meta.url),
);
const domainSchema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
  $defs: Record<string, unknown>;
};

describe('OLO domain contract bindings', () => {
  it('covers every $defs entry in the shared JSON Schema', () => {
    expect(Object.keys(domainSchema.$defs).sort()).toEqual(
      [
        'Sensitivity',
        'Source',
        'Observation',
        'Intent',
        'Capability',
        'PermissionDecision',
        'ActionCreate',
        'ActionResult',
        'ActionReceipt',
      ].sort(),
    );
  });

  it('exposes a schema for each definition', () => {
    for (const schema of [
      sensitivitySchema,
      observationSourceSchema,
      observationSchema,
      intentSchema,
      capabilitySchema,
      permissionDecisionSchema,
      actionCreateSchema,
      actionResultSchema,
      actionReceiptSchema,
    ]) {
      expect(schema).toBeDefined();
    }
  });

  it('accepts a valid capability descriptor', () => {
    const descriptor = {
      capability: 'local.file_read',
      execution: 'device',
      sideEffect: 'read',
      supportsIdempotency: true,
      supportsQuery: true,
      supportsCancel: false,
    };

    expect(capabilitySchema.parse(descriptor)).toEqual(descriptor);
  });

  it('rejects an unknown side effect class', () => {
    const result = capabilitySchema.safeParse({
      capability: 'local.file_edit',
      execution: 'device',
      sideEffect: 'write',
      supportsIdempotency: true,
      supportsQuery: false,
      supportsCancel: false,
    });

    expect(result.success).toBe(false);
  });

  it('round-trips an action receipt', () => {
    const receipt = {
      actionId: 'act_01',
      requestId: 'req_01',
      capability: 'local.file_edit',
      status: 'verified',
      summary: 'edited file',
      evidence: { readBack: 'ok' },
      providerRef: null,
    };

    expect(actionReceiptSchema.parse(receipt)).toEqual({
      ...receipt,
      providerRef: null,
    });
  });
});
