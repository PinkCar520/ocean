import { randomUUID } from 'node:crypto';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const controlReply = z.object({
  type: z.literal('control_response'),
  response: z.object({
    request_id: z.string(),
    subtype: z.enum(['success', 'error']),
    response: z.object({ mcp_response: JSONRPCMessageSchema.optional() }).optional(),
  }),
});

export class StdioSdkMcpHost {
  private readonly transports = new Map<string, SdkMcpTransport>();
  private closed = false;

  constructor(private readonly write: (event: object) => void) {}

  transport(name: string): Transport {
    if (this.closed) throw new Error('SDK MCP host is disconnected.');
    const transport = new SdkMcpTransport(name, this.write, () => {
      if (this.transports.get(name) === transport) this.transports.delete(name);
    });
    this.transports.set(name, transport);
    return transport;
  }

  receive(message: unknown): void {
    const parsed = controlReply.safeParse(message);
    if (!parsed.success) return;
    for (const transport of this.transports.values()) {
      if (transport.receive(parsed.data.response)) return;
    }
  }

  notify(name: string, message: unknown): boolean {
    const parsed = JSONRPCMessageSchema.safeParse(message);
    const transport = this.transports.get(name);
    if (!parsed.success || !transport || !('method' in parsed.data) || 'id' in parsed.data) return false;
    transport.onmessage?.(parsed.data);
    return true;
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.transports.values()].map(transport => transport.close()));
  }
}

class SdkMcpTransport implements Transport {
  onmessage?: Transport['onmessage'];
  onclose?: Transport['onclose'];
  private closed = false;
  private readonly pending = new Map<string, (response?: JSONRPCMessage) => void>();

  constructor(private readonly name: string, private readonly write: (event: object) => void, private readonly release: () => void) {}

  async start(): Promise<void> {
    if (this.closed) throw new Error('SDK MCP transport is closed.');
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('SDK MCP transport is closed.');
    const id = randomUUID();
    const event = { type: 'control_request', request_id: id, request: { subtype: 'mcp_message', server_name: this.name, message } };
    if (!('method' in message) || !('id' in message)) {
      this.write(event);
      return;
    }
    if (this.pending.size >= 128) throw new Error('Too many pending SDK MCP requests.');
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        finish();
        this.write({ type: 'control_cancel_request', request_id: id });
      };
      const timer = setTimeout(cancel, 60_000);
      const finish = (response?: JSONRPCMessage) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        if (!response || !('id' in response) || response.id !== message.id || 'method' in response) {
          reject(new Error('SDK MCP host did not return a matching response.'));
          return;
        }
        this.onmessage?.(response);
        resolve();
      };
      this.pending.set(id, finish);
      try { this.write(event); } catch { finish(); }
    });
  }

  receive(reply: z.infer<typeof controlReply>['response']): boolean {
    const finish = this.pending.get(reply.request_id);
    if (!finish) return false;
    finish(reply.subtype === 'success' ? reply.response?.mcp_response : undefined);
    return true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.release();
    for (const finish of this.pending.values()) finish();
    this.onclose?.();
  }
}
