import { describe, expect, it } from 'vitest';

import { chatRequestSchema } from './index.js';

describe('chat compatibility contract', () => {
  it('accepts the current AI SDK request shape', () => {
    const request = {
      id: 'session_1',
      messages: [{ id: 'message_1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      modelId: 'gpt-5',
      sessionId: 'session_1',
      search: false,
      knowledge: true,
      parentId: null,
    };

    expect(chatRequestSchema.parse(request)).toEqual(request);
  });

  it('keeps unknown transport metadata during the compatibility window', () => {
    const request = { text: 'Hello', transportVersion: 2 };

    expect(chatRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects an empty request', () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });
});
