import { PromptComposer } from './prompt.composer';

describe('PromptComposer (Agent Runtime 拆分)', () => {
  function create(overrides: Record<string, any> = {}) {
    const deps = {
      configService: {
        get: jest.fn((k: string) =>
          k === 'SYSTEM_PROMPT_PATH' ? 'nonexistent_prompt.md' : undefined,
        ),
      },
      rpcGateway: { getOnlineUsers: jest.fn(() => ['cli-a', 'cli-b']) },
      skillLoader: {
        getSkill: jest.fn(),
        activate: jest.fn(),
        buildCatalogXml: jest.fn().mockResolvedValue('<catalog/>'),
        loadAiguide: jest.fn().mockResolvedValue(null),
      },
      skillResolver: {
        resolve: jest.fn().mockResolvedValue({ matchedSkills: [] }),
      },
      prisma: {
        userPreference: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      ...overrides,
    };
    return {
      composer: new PromptComposer(
        deps.configService as never,
        deps.rpcGateway as never,
        deps.skillLoader as never,
        deps.skillResolver as never,
        deps.prisma,
      ),
      deps,
    };
  }

  it('组装基础 Prompt：用户工号 + 在线 CLI 节点', async () => {
    const { composer } = create();
    const prompt = await composer.buildSystemPrompt({
      userId: 'w10001',
      source: 'web',
      userMessage: 'hi',
    });
    expect(prompt).toContain('当前登录用户工号: w10001');
    expect(prompt).toContain('当前在线的本地 CLI 节点: cli-a, cli-b');
  });

  it('注入 FastAPI 命中技能片段', async () => {
    const { composer, deps } = create();
    deps.skillResolver.resolve.mockResolvedValueOnce({
      injectedPrompt: '## 命中技能指令',
      matchedSkills: [{ id: 's1', name: 's1' }],
    });
    const prompt = await composer.buildSystemPrompt({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    expect(prompt).toContain('## 命中技能指令');
  });

  it('注入用户自定义指令（Custom Instructions）', async () => {
    const { composer, deps } = create();
    deps.prisma.userPreference.findFirst.mockResolvedValueOnce({
      customInstructions: '始终用简体中文回复，语气专业。',
    });
    const prompt = await composer.buildSystemPrompt({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    expect(prompt).toContain('用户个性化指令');
    expect(prompt).toContain('始终用简体中文回复');
  });

  it('显式选中的本地 Skill 注入 <injected_skills> 块', async () => {
    const { composer, deps } = create();
    deps.skillLoader.getSkill.mockResolvedValueOnce({
      name: 'banking',
      inquiries: [],
    });
    deps.skillLoader.activate.mockResolvedValueOnce('BANKING_RULES_CONTENT');
    const prompt = await composer.buildSystemPrompt({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
      skillIds: ['banking'],
    });
    expect(prompt).toContain('<injected_skills>');
    expect(prompt).toContain('BANKING_RULES_CONTENT');
    expect(prompt).not.toContain('<catalog/>'); // 显式技能时不注入全量 Catalog
  });

  it('无显式技能时注入全量 Skill Catalog', async () => {
    const { composer } = create();
    const prompt = await composer.buildSystemPrompt({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    expect(prompt).toContain('<catalog/>');
  });
});
