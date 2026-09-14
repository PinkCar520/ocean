const { streamText } = require('ai');
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
async function test() {
  const result = streamText({ model: mockModel, messages: [{ role: 'user', content: 'hi' }] });
  console.log(Object.keys(result));
}
test();
