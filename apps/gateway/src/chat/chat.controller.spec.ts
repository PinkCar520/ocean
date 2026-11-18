import { BadRequestException } from '@nestjs/common';

jest.mock('@ocean/mcp-im', () => ({ UpChatHandler: class {} }));
jest.mock('../skill/skill.orchestrator', () => ({
  SkillOrchestrator: class {},
}));
jest.mock('../skill/skill.loader', () => ({ SkillLoader: class {} }));
jest.mock('./rpc.gateway', () => ({ RpcGateway: class {} }));
jest.mock('../session/session.service', () => ({ SessionService: class {} }));
jest.mock('../auth/user.service', () => ({ UserService: class {} }));
jest.mock('../space/space.service', () => ({ SpaceService: class {} }));
jest.mock('./chat.service', () => ({ ChatService: class {} }));
jest.mock('ai', () => ({
  createUIMessageStream: ({ execute }: any) =>
    new ReadableStream({
      start(controller) {
        Promise.resolve(
          execute({
            writer: {
              write: (chunk: unknown) => controller.enqueue(chunk),
            },
          }),
        ).then(
          () => controller.close(),
          (error) => controller.error(error),
        );
      },
    }),
  pipeUIMessageStreamToResponse: async ({ response, stream }: any) => {
    response.setHeaders(
      new Headers({ 'x-vercel-ai-ui-message-stream': 'v1' }),
    );
    response.writeHead(200);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(new TextEncoder().encode(JSON.stringify(value)));
    }
    response.end();
  },
}));

import { ChatController } from './chat.controller';
import type { ChatService } from './chat.service';

describe('ChatController contract boundaries', () => {
  const controller = new ChatController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('rejects an empty streaming chat request before writing a response', async () => {
    await expect(
      controller.handleChatStream({}, {}, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid title request', async () => {
    await expect(
      controller.generateTitle({ message: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid autocomplete request', async () => {
    await expect(
      controller.autocomplete({ prefix: 42 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists Run replies and sends the selected session branch as context', async () => {
    const history = [
      { id: 'user-1', role: 'user', content: 'first question' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'first answer',
        parentId: 'user-1',
      },
    ];
    const sessionService = {
      getSessionById: jest.fn().mockResolvedValue({ spaceId: 'work' }),
      getMessages: jest.fn().mockResolvedValue(history),
      addMessage: jest
        .fn()
        .mockResolvedValueOnce('user-2')
        .mockResolvedValueOnce('assistant-2'),
      updateSession: jest.fn(),
    };
    const runChatStream: ChatService['runChatStream'] = (
      _messages,
      _ctx,
      _modelId,
      _sessionId,
      onChunk,
    ) => {
      onChunk({ type: 'start' });
      onChunk({ type: 'text-start', id: 'run-output' });
      onChunk({
        type: 'text-delta',
        id: 'run-output',
        delta: 'follow-up answer',
      });
      onChunk({ type: 'text-end', id: 'run-output' });
      onChunk({ type: 'finish', finishReason: 'stop' });
      return Promise.resolve('follow-up answer');
    };
    const chatService = {
      isRunMode: jest.fn().mockReturnValue(true),
      runChatStream: jest.fn(runChatStream),
    };
    const controller = new ChatController(
      {} as never,
      {} as never,
      {} as never,
      sessionService as never,
      chatService as never,
      {} as never,
      {} as never,
    );
    const responseChunks: Uint8Array[] = [];
    const response = {
      setHeaders: jest.fn(),
      writeHead: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      destroyed: false,
      writableFinished: false,
      write: jest.fn((chunk: Uint8Array) => {
        responseChunks.push(chunk);
        return true;
      }),
      end: jest.fn(() => {
        response.writableFinished = true;
      }),
    };

    await controller.handleChatStream(
      {
        modelId: 'deepseek-flash',
        sessionId: 'session-1',
        parentId: 'assistant-1',
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'follow-up' }],
          },
        ],
      },
      { user: { dbId: 'user-db', workId: 'user-work' } },
      response as never,
    );

    expect(chatService.runChatStream.mock.calls[0][0]).toEqual([
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: 'follow-up' },
    ]);
    expect(sessionService.addMessage).toHaveBeenNthCalledWith(1, 'session-1', {
      role: 'user',
      content: 'follow-up',
      parentId: 'assistant-1',
      parts: [{ type: 'text', text: 'follow-up' }],
      attachments: undefined,
    });
    expect(sessionService.addMessage).toHaveBeenNthCalledWith(2, 'session-1', {
      role: 'assistant',
      content: 'follow-up answer',
      parentId: 'user-2',
      parts: [{ type: 'text', text: 'follow-up answer' }],
    });
    const responseBody = Buffer.concat(responseChunks).toString('utf8');
    expect(responseBody).toContain('"type":"text-delta"');
    expect(responseBody).toContain('"delta":"follow-up answer"');
    expect(responseBody).not.toContain('0:');
    expect(response.setHeaders.mock.calls[0][0].get('x-vercel-ai-ui-message-stream')).toBe('v1');
  });
});
