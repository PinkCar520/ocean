import type { LanguageModelMiddleware } from 'ai';

/** Chat-completions tool messages cannot carry image parts; attach them to the next user message. */
export const chatImageMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  async transformParams({ params }) {
    const prompt: typeof params.prompt = [];
    let images: Array<{ type: 'file'; mediaType: string; data: { type: 'url'; url: URL } }> = [];
    const flush = () => {
      if (images.length) {
        prompt.push({ role: 'user', content: [{ type: 'text', text: 'Images returned by the preceding tool calls:' }, ...images] });
        images = [];
      }
    };
    for (const message of params.prompt) {
      if (message.role !== 'tool') {
        flush();
        prompt.push(message);
        continue;
      }
      prompt.push({ ...message, content: message.content.map(part => {
        if (part.type !== 'tool-result' || part.output.type !== 'content') return part;
        const value = part.output.value.map(item => {
          if (item.type !== 'file' || !item.mediaType.startsWith('image/') || item.data.type !== 'data') return item;
          const data = typeof item.data.data === 'string' ? item.data.data : Buffer.from(item.data.data).toString('base64');
          images.push({ type: 'file', mediaType: item.mediaType, data: { type: 'url', url: new URL(`data:${item.mediaType};base64,${data}`) } });
          return { type: 'text' as const, text: `Image attached after tool results (${item.mediaType}).` };
        });
        return { ...part, output: { ...part.output, value } };
      }) });
    }
    flush();
    return { ...params, prompt };
  },
};
