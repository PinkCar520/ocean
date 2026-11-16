jest.mock('ai', () => ({ streamText: jest.fn() }));
jest.mock('./model.factory', () => ({ createChatModel: jest.fn() }));
import { toUiMessage } from './ai-sdk-model-gateway';

it('feeds notebook text and images back as multimodal tool content', () => {
  const message = toUiMessage({ role: 'tool', toolCallId: 'call', toolName: 'local_notebook_read', result: {
    kind: 'notebook', parts: [{ type: 'text', text: 'cell' }, { type: 'image', mediaType: 'image/png', base64: 'aGVsbG8=' }],
  } });
  expect(message.content[0]).toMatchObject({ output: { type: 'content', value: [
    { type: 'text', text: 'cell' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } },
  ] } });
});

it('feeds device image reads back as multimodal tool content', () => {
  const message = toUiMessage({ role: 'tool', toolCallId: 'call', toolName: 'local_file_read', result: {
    kind: 'image', path: 'image.png', mediaType: 'image/png', base64: 'aGVsbG8=',
  } });
  expect(message.content[0]).toMatchObject({ output: { type: 'content', value: [
    { type: 'text', text: 'Image: image.png' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } },
  ] } });
});
