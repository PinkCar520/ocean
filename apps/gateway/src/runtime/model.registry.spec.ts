import { ModelRegistry } from './model.registry';

jest.mock('../ai/model.factory', () => ({
  createChatModel: jest.fn(() => ({ provider: 'mock' })),
}));

describe('ModelRegistry (Agent Runtime 拆分)', () => {
  function create(config: Record<string, unknown>) {
    const configService = { get: jest.fn((k: string) => config[k]) };
    return new ModelRegistry(configService as never);
  }

  it('枚举配置的全部可用模型（过滤空 id）', () => {
    const registry = create({
      DEEPSEEK_MODEL: 'deepseek-chat',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5',
      GEMINI_MODEL: undefined,
      DASHSCOPE_MODEL: 'qwen-plus',
      OPENAI_MODEL: undefined,
      LOCAL_MODEL: 'local-qwen',
    });
    const models = registry.getAvailableModels();
    expect(models.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'claude-sonnet-4-5',
      'qwen-plus',
      'local-qwen',
    ]);
    expect(models[0]).toMatchObject({ provider: 'deepseek', icon: 'Sparkles' });
  });

  it('无任何配置时返回空清单', () => {
    const registry = create({});
    expect(registry.getAvailableModels()).toEqual([]);
  });

  it('getModel 委托 ai/model.factory 构造模型实例', () => {
    const registry = create({ ANTHROPIC_MODEL: 'claude-sonnet-4-5' });
    const model = registry.getModel('claude-sonnet-4-5');
    expect(model).toBeDefined();
  });
});
