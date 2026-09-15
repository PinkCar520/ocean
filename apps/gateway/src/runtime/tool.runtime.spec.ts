import { ToolRuntime } from './tool.runtime';

jest.mock('ai', () => ({
  tool: jest.fn((def: any) => ({ ...def, __mockAiTool: true })),
}));
jest.mock('../rag/rag.service', () => ({ RAGService: class {} }));

describe('ToolRuntime (Agent Runtime 拆分)', () => {
  function create(overrides: Record<string, any> = {}) {
    const deps = {
      zentaoService: {
        getBugInfo: jest.fn(),
        searchBugs: jest.fn(),
        resolveBug: jest.fn(),
      },
      rpcGateway: { sendToCli: jest.fn() },
      ragService: { searchSimilarity: jest.fn().mockResolvedValue([]) },
      tracingService: {
        traceCall: jest.fn(
          async (_n: string, _a: unknown, fn: (span: any) => Promise<any>) =>
            fn({ setAttribute: jest.fn() }),
        ),
      },
      skillLoader: {
        activate: jest.fn(),
        getSkill: jest.fn(),
        buildCatalogXml: jest.fn(),
        loadAiguide: jest.fn(),
      },
      interactiveManager: {
        getClarifyTool: jest.fn(() => ({ agp_intent_clarify: 'clarify' })),
      },
      mcpManager: {
        getAITools: jest.fn().mockResolvedValue({ mcp_alpha: 'mcp-alpha' }),
      },
      policyEvaluator: {
        shouldWrap: jest.fn((_n: string, isMcp: boolean) => isMcp),
        wrap: jest.fn((_n: string, def: any) => `wrapped:${def}`),
      },
      ...overrides,
    };
    return {
      runtime: new ToolRuntime(
        deps.zentaoService as never,
        deps.rpcGateway as never,
        deps.ragService as never,
        deps.tracingService as never,
        deps.skillLoader as never,
        deps.interactiveManager as never,
        deps.mcpManager as never,
        deps.policyEvaluator as never,
      ),
      deps,
    };
  }

  it('无会话模式：原子工具 + 澄清工具 + MCP 工具直接合并，不做审批包装', async () => {
    const { runtime, deps } = create();
    const tools = await runtime.buildTools({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    expect(tools.getBugInfo).toBeDefined();
    expect(tools.local_bash).toBeDefined();
    expect(tools.agp_intent_clarify).toBe('clarify');
    expect(tools.mcp_alpha).toBe('mcp-alpha');
    expect(deps.policyEvaluator.wrap).not.toHaveBeenCalled();
  });

  it('会话模式：MCP 工具按策略判定走审批包装', async () => {
    const { runtime, deps } = create();
    const tools = await runtime.buildTools(
      { userId: 'u1', source: 'web', userMessage: 'hi' },
      'sess_1',
    );
    expect(deps.policyEvaluator.shouldWrap).toHaveBeenCalledWith(
      'mcp_alpha',
      true,
    );
    expect(tools.mcp_alpha).toBe('wrapped:mcp-alpha');
  });

  it('activate_skill 委托 SkillLoader 加载技能', async () => {
    const { runtime, deps } = create();
    deps.skillLoader.activate.mockResolvedValueOnce('SKILL_CONTENT');
    const tools = await runtime.buildTools({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    const result = await tools.activate_skill.execute({
      skill_name: 'banking',
    });
    expect(deps.skillLoader.activate).toHaveBeenCalledWith('banking');
    expect(result).toMatchObject({
      message: 'Skill "banking" activated.',
      skill_content: 'SKILL_CONTENT',
    });
  });

  it('rag_search 工具经 tracing 包装返回结构化结果', async () => {
    const { runtime, deps } = create();
    deps.ragService.searchSimilarity.mockResolvedValueOnce([
      { title: 't', content: 'c', distance: 0.2 },
    ]);
    const tools = await runtime.buildTools({
      userId: 'u1',
      source: 'web',
      userMessage: 'hi',
    });
    const result = await tools.rag_search.execute({ query: 'q', limit: 5 });
    expect(result).toEqual({
      status: 'Success',
      results: [{ title: 't', content: 'c', score: 0.2 }],
    });
    expect(deps.tracingService.traceCall).toHaveBeenCalled();
  });
});
