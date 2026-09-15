import { BadRequestException } from '@nestjs/common';

jest.mock('@ocean/mcp-im', () => ({ UpChatHandler: class {} }));
jest.mock('../skill/skill.orchestrator', () => ({ SkillOrchestrator: class {} }));
jest.mock('../skill/skill.loader', () => ({ SkillLoader: class {} }));
jest.mock('./rpc.gateway', () => ({ RpcGateway: class {} }));
jest.mock('../session/session.service', () => ({ SessionService: class {} }));
jest.mock('./chat.service', () => ({ ChatService: class {} }));

import { ChatController } from './chat.controller';

describe('ChatController contract boundaries', () => {
  const controller = new ChatController({} as never, {} as never, {} as never, {} as never, {} as never);

  it('rejects an empty streaming chat request before writing a response', async () => {
    await expect(
      controller.handleChatStream({}, {} as never, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid title request', async () => {
    await expect(controller.generateTitle({ message: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an invalid autocomplete request', async () => {
    await expect(controller.autocomplete({ prefix: 42 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
