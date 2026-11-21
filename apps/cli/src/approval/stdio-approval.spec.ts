import { describe, expect, it } from 'vitest';
import { StdioApproval } from './stdio-approval.js';

describe('stdio tool approval', () => {
  const response = (requestId: string, decision: object) => ({
    type: 'control_response',
    response: { request_id: requestId, subtype: 'success', response: decision },
  });

  it('correlates parallel replies with their exact tool calls', async () => {
    const messages: any[] = [];
    const host = new StdioApproval(event => messages.push(event));
    const first = host.request('file_write', { path: 'one' }, 'call-1');
    const second = host.request('file_write', { path: 'two' }, 'call-2');
    expect(messages[0].request).toEqual({
      subtype: 'can_use_tool', tool_name: 'file_write', input: { path: 'one' }, tool_use_id: 'call-1',
    });

    host.receive(response(messages[1].request_id, { behavior: 'allow', toolUseID: 'call-1' }));
    host.receive(response(messages[0].request_id, { behavior: 'allow', toolUseID: 'call-1', updatedInput: { path: 'revised' } }));
    await expect(first).resolves.toMatchObject({ permission: 'allow', updatedInput: { path: 'revised' } });
    await expect(second).resolves.toMatchObject({ permission: 'deny' });
  });

  it('cancels pending requests and ignores replies after interruption or EOF', async () => {
    const messages: any[] = [];
    const host = new StdioApproval(event => messages.push(event));
    const controller = new AbortController();
    const first = host.request('file_write', { path: 'one' }, 'call-1', controller.signal);
    const second = host.request('file_write', { path: 'two' }, 'call-2');
    controller.abort();
    host.receive(response(messages[0].request_id, { behavior: 'allow' }));
    expect(messages[2]).toEqual({ type: 'control_cancel_request', request_id: messages[0].request_id });
    await expect(first).resolves.toMatchObject({ permission: 'deny' });
    host.close();
    await expect(second).resolves.toMatchObject({ permission: 'deny' });
    await expect(host.request('file_write', {}, 'call-3')).resolves.toMatchObject({ permission: 'deny' });
  });

  it('expires an unanswered request', async () => {
    const messages: any[] = [];
    const host = new StdioApproval(event => messages.push(event), 5);
    await expect(host.request('file_write', {}, 'call-1')).resolves.toMatchObject({
      permission: 'deny', reason: 'Permission request expired.',
    });
    expect(messages[1]).toEqual({ type: 'control_cancel_request', request_id: messages[0].request_id });
  });
});
