import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import { MICROCOMPACT_MARKER, microcompactMessages } from './microcompact.js';

function transcript(): ModelMessage[] {
  const messages: ModelMessage[] = [{ role: 'user', content: 'Investigate and fix' }];
  for (let i = 0; i < 5; i++) {
    messages.push(
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `call-${i}`, toolName: 'bash', input: { command: `inspect ${i}` } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: `call-${i}`, toolName: 'bash', output: { type: 'text', value: `output-${i}:${'x'.repeat(1600)}` } }] },
    );
  }
  return messages;
}

describe('microcompact', () => {
  it('clears old tool outputs while preserving IDs, inputs, recent outputs and durable history', () => {
    const original = transcript();
    const before = JSON.stringify(original);
    const compacted = microcompactMessages(original);
    expect(compacted).not.toBe(original);
    for (let i = 0; i < 5; i++) {
      const result = compacted[2 + i * 2];
      expect(result.role).toBe('tool');
      if (result.role !== 'tool') throw new Error('unexpected role');
      const part = result.content[0];
      expect(part.type).toBe('tool-result');
      if (part.type !== 'tool-result' || part.output.type !== 'text') throw new Error('unexpected output');
      expect(part.toolCallId).toBe(`call-${i}`);
      expect(part.output.value).toBe(i < 3 ? MICROCOMPACT_MARKER : `output-${i}:${'x'.repeat(1600)}`);
      expect(compacted[1 + i * 2]).toEqual(original[1 + i * 2]);
    }
    expect(JSON.stringify(original)).toBe(before);
    expect(microcompactMessages(compacted)).toBe(compacted);
  });

  it('does not touch unknown tools, errors, small results or unfinished calls', () => {
    const messages: ModelMessage[] = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: '1', toolName: 'payment', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'payment', output: { type: 'text', value: 'x'.repeat(2000) } }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: '2', toolName: 'bash', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '2', toolName: 'bash', output: { type: 'error-text', value: 'x'.repeat(2000) } }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: '3', toolName: 'bash', input: {} }] },
    ];
    expect(microcompactMessages(messages, { keepRecent: 0 })).toBe(messages);
  });

  it('rejects invalid retention settings', () => {
    expect(() => microcompactMessages([], { keepRecent: -1 })).toThrow('Invalid');
    expect(() => microcompactMessages([], { minChars: 0 })).toThrow('Invalid');
  });
});
