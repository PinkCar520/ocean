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
      rpcGateway: { sendWorkspaceTool: jest.fn(), sendToCli: jest.fn() },
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
      mcpPool: {
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
        deps.mcpPool as never,
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
    expect(tools.local_powershell).toBeDefined();
    expect(tools.agp_intent_clarify).toBe('clarify');
    expect(tools.mcp_alpha).toBe('mcp-alpha');
    expect(deps.policyEvaluator.wrap).not.toHaveBeenCalled();
  });

  it('routes MCP tool discovery through the logical user/workspace scope', async () => {
    const { runtime, deps } = create();
    await runtime.buildTools({
      userId: 'employee-1',
      dbId: 'db-user-1',
      workspacePath: '/workspace/alpha',
      source: 'web',
      userMessage: 'hi',
    });
    expect(deps.mcpPool.getAITools).toHaveBeenCalledWith({
      userId: 'db-user-1',
      workspacePath: '/workspace/alpha',
    });
  });

  it('PowerShell requires a session and routes structured command arguments to the local CLI', async () => {
    const { runtime, deps } = create();
    const withoutSession = await runtime.buildTools({ userId: 'u1', source: 'web', userMessage: 'run ps' });
    await expect(withoutSession.local_powershell.execute({ command: 'Get-ChildItem' })).resolves.toMatchObject({
      error: expect.stringContaining('authenticated session'),
    });
    expect(deps.rpcGateway.sendToCli).not.toHaveBeenCalled();

    const withSession = await runtime.buildTools(
      { userId: 'u1', source: 'web', userMessage: 'run ps' },
      'sess_1',
    );
    await withSession.local_powershell.execute({ command: 'Get-ChildItem', cwd: 'src', timeout_ms: 30_000 });
    expect(deps.rpcGateway.sendToCli).toHaveBeenCalledWith('u1', 'powershell', {
      command: 'Get-ChildItem', cwd: 'src', timeout_ms: 30_000, sessionId: 'sess_1',
    });
    expect(deps.policyEvaluator.shouldWrap).toHaveBeenCalledWith('local_powershell', false);
  });

  it('routes notebook operations with a session and exposes ordered multimodal results', async () => {
    const { runtime, deps } = create();
    const withoutSession = await runtime.buildTools({ userId: 'u1', source: 'web', userMessage: 'read notebook' });
    await expect(withoutSession.local_notebook_read.execute({ path: 'n.ipynb' })).resolves.toMatchObject({ error: expect.stringContaining('session') });
    await expect(withoutSession.local_notebook_edit.execute({ path: 'n.ipynb' })).resolves.toMatchObject({ error: expect.stringContaining('session') });
    expect(deps.rpcGateway.sendWorkspaceTool).not.toHaveBeenCalled();

    const withSession = await runtime.buildTools({ userId: 'u1', source: 'web', userMessage: 'read notebook' }, 'sess_1');
    const notebook = { kind: 'notebook', parts: [{ type: 'text', text: 'source' }, { type: 'image', mediaType: 'image/png', base64: 'aGVsbG8=' }] };
    deps.rpcGateway.sendWorkspaceTool.mockResolvedValueOnce(notebook);
    const read = await withSession.local_notebook_read.execute({ path: 'n.ipynb' });
    expect(deps.rpcGateway.sendWorkspaceTool).toHaveBeenCalledWith('u1', 'sess_1', 'notebook_read', { path: 'n.ipynb' });
    expect(withSession.local_notebook_read.toModelOutput({ output: read })).toMatchObject({ type: 'content', value: [{ type: 'text', text: 'source' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } }] });
    await withSession.local_notebook_edit.execute({ path: 'n.ipynb', cell_id: 'c1', mode: 'replace', new_source: 'x' });
    expect(deps.rpcGateway.sendWorkspaceTool).toHaveBeenCalledWith('u1', 'sess_1', 'notebook_edit', { path: 'n.ipynb', cell_id: 'c1', mode: 'replace', new_source: 'x' });
    expect(deps.policyEvaluator.shouldWrap).toHaveBeenCalledWith('local_notebook_edit', false);
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
