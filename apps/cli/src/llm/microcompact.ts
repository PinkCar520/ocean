import type { ModelMessage } from 'ai';

/** Ephemeral replacement for stale tool output; durable history remains intact. */
export const MICROCOMPACT_MARKER = '[Older tool output cleared; re-run the tool if needed]';

export interface MicrocompactOptions {
  keepRecent?: number;
  minChars?: number;
}

const ELIGIBLE_TOOLS = new Set([
  'read', 'read_file', 'file_read', 'bash', 'shell', 'exec',
  'grep', 'glob', 'search', 'web_search', 'web_fetch',
]);

/** Replace only completed, successful, large text results from known tools. */
export function microcompactMessages(
  messages: ModelMessage[],
  options: MicrocompactOptions = {},
): ModelMessage[] {
  const keepRecent = options.keepRecent ?? 2;
  const minChars = options.minChars ?? 1200;
  if (!Number.isSafeInteger(keepRecent) || keepRecent < 0 ||
      !Number.isSafeInteger(minChars) || minChars < 1) {
    throw new Error('Invalid microcompact options');
  }
  const calls = new Map<string, string>();
  const completed: Array<{ index: number; partIndex: number }> = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!Array.isArray(message.content)) continue;
    for (let j = 0; j < message.content.length; j++) {
      const part = message.content[j];
      if (part.type === 'tool-call') calls.set(part.toolCallId, part.toolName);
      else if (part.type === 'tool-result' && message.role === 'tool' &&
        calls.get(part.toolCallId) === part.toolName && ELIGIBLE_TOOLS.has(part.toolName) &&
        part.output.type === 'text' &&
        part.output.value.length >= minChars &&
        part.output.value !== MICROCOMPACT_MARKER) {
        completed.push({ index: i, partIndex: j });
      }
    }
  }
  if (completed.length <= keepRecent) return messages;
  const toClear = new Set(completed.slice(0, completed.length - keepRecent)
    .map(item => `${item.index}:${item.partIndex}`));
  return messages.map((message, i) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) return message;
    if (!message.content.some((_, j) => toClear.has(`${i}:${j}`))) return message;
    return {
      ...message,
      content: message.content.map((part, j) => {
        if (!toClear.has(`${i}:${j}`) || part.type !== 'tool-result') return part;
        return { ...part, output: { type: 'text' as const, value: MICROCOMPACT_MARKER } };
      }),
    };
  });
}
