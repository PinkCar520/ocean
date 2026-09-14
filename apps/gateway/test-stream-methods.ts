import { streamText } from 'ai';

async function test() {
  const mockModel = {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock',
    defaultObjectGenerationMode: 'json',
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-delta', textDelta: 'Hello ' });
            controller.enqueue({ type: 'text-delta', textDelta: 'World' });
            controller.close();
          }
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    }
  };
  const result = streamText({ model: mockModel as any, messages: [{ role: 'user', content: 'hi' }] });
  console.log('Result methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(result)));
  console.log('Result properties:', Object.keys(result));
}
test().catch(console.error);
