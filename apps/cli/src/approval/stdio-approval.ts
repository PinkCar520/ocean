import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PermissionHookOutcome } from '@ocean/core/permission-policy';

const responseSchema = z.object({
  type: z.literal('control_response'),
  response: z.object({
    request_id: z.string().min(1).max(200),
    subtype: z.enum(['success', 'error']),
    response: z.unknown().optional(),
  }),
});

const decisionSchema = z.discriminatedUnion('behavior', [
  z.object({
    behavior: z.literal('allow'),
    updatedInput: z.record(z.string(), z.unknown()).optional(),
    updatedPermissions: z.array(z.unknown()).optional(),
    toolUseID: z.string().optional(),
  }),
  z.object({
    behavior: z.literal('deny'),
    message: z.string().optional(),
    interrupt: z.boolean().optional(),
    toolUseID: z.string().optional(),
  }),
]);

const deny = (reason: string): PermissionHookOutcome => ({ blocked: true, reason, permission: 'deny' });

export class StdioApproval {
  private closed = false;
  private readonly pending = new Map<string, (response?: unknown) => void>();

  constructor(private readonly write: (event: object) => void, private readonly timeoutMs = 5 * 60_000) {}

  request(name: string, input: Record<string, unknown>, toolCallId: string | undefined, signal?: AbortSignal): Promise<PermissionHookOutcome> {
    if (this.closed || signal?.aborted) return Promise.resolve(deny('Permission request cancelled.'));
    const requestId = randomUUID();
    const toolUseId = toolCallId ?? requestId;
    return new Promise(resolve => {
      const finish = (outcome: PermissionHookOutcome, cancelled = false) => {
        if (!this.pending.delete(requestId)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(outcome);
        if (cancelled && !this.closed) this.write({ type: 'control_cancel_request', request_id: requestId });
      };
      const abort = () => finish(deny('Permission request cancelled.'), true);
      const timer = setTimeout(() => finish(deny('Permission request expired.'), true), this.timeoutMs);
      this.pending.set(requestId, raw => {
        const decision = decisionSchema.safeParse(raw);
        if (!decision.success || (decision.data.toolUseID && decision.data.toolUseID !== toolUseId)) {
          finish(deny('Permission host did not authorize this call.'));
        } else if (decision.data.behavior === 'allow') {
          finish({ blocked: false, reason: '', permission: 'allow', updatedInput: decision.data.updatedInput && Object.keys(decision.data.updatedInput).length ? decision.data.updatedInput : undefined, updatedPermissions: decision.data.updatedPermissions });
        } else {
          finish({ ...deny(decision.data.message ?? 'Permission denied by host.'), interrupt: decision.data.interrupt });
        }
      });
      signal?.addEventListener('abort', abort, { once: true });
      this.write({
        type: 'control_request',
        request_id: requestId,
        request: { subtype: 'can_use_tool', tool_name: name, input, tool_use_id: toolUseId },
      });
    });
  }

  receive(message: unknown): void {
    const parsed = responseSchema.safeParse(message);
    if (!parsed.success) return;
    const { request_id, subtype, response } = parsed.data.response;
    this.pending.get(request_id)?.(subtype === 'success' ? response : undefined);
  }

  close(): void {
    this.closed = true;
    for (const finish of this.pending.values()) finish();
  }
}
