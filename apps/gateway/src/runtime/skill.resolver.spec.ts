import { SkillResolver } from './skill.resolver';

describe('SkillResolver (第 4 条本地化)', () => {
  function create(overrides: {
    skills?: any[];
    queryRaw?: jest.Mock;
    createLog?: jest.Mock;
    fetchMock?: jest.Mock;
  }) {
    const prisma = {
      skill: {
        findMany: jest.fn().mockResolvedValue(
          overrides.skills ?? [
            {
              id: 'kw-1',
              slug: 'banking',
              name: '银行业务',
              description: '银行业务规则',
              content: '你是银行专家',
              triggerKws: ['转账', '对公'],
            },
            {
              id: 'exp-1',
              slug: 'pm',
              name: 'PM',
              description: '产品管理',
              content: '你是产品经理',
              triggerKws: ['需求'],
            },
            {
              id: 'emb-1',
              slug: 'legal',
              name: '法务',
              description: '法务审查',
              content: '你是法务专家',
              triggerKws: [],
            },
          ],
        ),
      },
      $queryRaw: overrides.queryRaw ?? jest.fn().mockResolvedValue([]),
      skillTriggerLog: {
        create: overrides.createLog ?? jest.fn().mockResolvedValue({}),
      },
    };
    const configService = { get: jest.fn(() => 'http://fastapi:8000') };
    (globalThis as any).fetch = overrides.fetchMock ?? jest.fn();
    return new SkillResolver(prisma as never, configService as never);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('关键词精确匹配命中并组装注入 Prompt + 落触发日志', async () => {
    const createLog = jest.fn().mockResolvedValue({});
    const resolver = create({ createLog });
    const result = await resolver.resolve(
      { userId: 'u1', source: 'web', userMessage: '请问对公转账怎么办理？' },
      'sess_1',
    );
    expect(result.injectedPrompt).toContain('<injected_skills>');
    expect(result.injectedPrompt).toContain('你是银行专家');
    expect(result.matchedSkills).toEqual([
      { id: 'kw-1', name: '银行业务', match_type: 'keyword' },
    ]);
    expect(createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'sess_1',
          triggeredIds: ['kw-1'],
          injectedTokens: expect.any(Number),
        }),
      }),
    );
  });

  it('显式 skillIds 命中（按 id 或 slug）', async () => {
    const resolver = create({});
    const result = await resolver.resolve({
      userId: 'u1',
      source: 'web',
      userMessage: '随便说说',
      skillIds: ['pm'],
    });
    expect(result.matchedSkills).toEqual([
      { id: 'exp-1', name: 'PM', match_type: 'explicit' },
    ]);
  });

  it('embedding 兜底：调用 Python Job + pgvector 匹配（score > 0.4 命中）', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    });
    const queryRaw = jest.fn().mockResolvedValue([
      { id: 'emb-1', name: '法务', content: '你是法务专家', score: 0.81 },
      { id: 'kw-1', name: '银行业务', content: '你是银行专家', score: 0.2 },
    ]);
    const resolver = create({ fetchMock, queryRaw });
    const result = await resolver.resolve({
      userId: 'u1',
      source: 'web',
      userMessage: '合同合规审查',
      skillIds: ['none'],
    });
    // 显式 'none' 无命中、关键词无命中 → 只有 embedding 命中（>0.4）
    expect(result.matchedSkills).toEqual([
      { id: 'emb-1', name: '法务', match_type: 'embedding (score: 0.81)' },
    ]);
    // embedding 请求体正确
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ text: '合同合规审查' });
    // pgvector 查询骨架正确（参数插值由 Prisma 引擎负责，真实冒烟覆盖）
    const sql = queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('SELECT id, name, content');
    expect(sql).toContain('FROM skills');
    expect(sql).toContain('LIMIT 2');
  });

  it('embedding Job 不可用（fetch 失败）时静默跳过语义匹配', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const queryRaw = jest.fn();
    const resolver = create({ fetchMock, queryRaw });
    const result = await resolver.resolve({
      userId: 'u1',
      source: 'web',
      userMessage: '合同合规审查',
    });
    expect(result.matchedSkills).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('无命中时返回空注入', async () => {
    const resolver = create({
      skills: [
        {
          id: 'a',
          slug: 'a',
          name: 'A',
          description: null,
          content: 'x',
          triggerKws: [],
        },
      ],
    });
    const result = await resolver.resolve({
      userId: 'u1',
      source: 'web',
      userMessage: '无关话题',
    });
    expect(result).toEqual({ injectedPrompt: undefined, matchedSkills: [] });
  });

  it('主流程异常（DB 不可用）时静默降级为空结果', async () => {
    const prisma = {
      skill: { findMany: jest.fn().mockRejectedValue(new Error('DB down')) },
      $queryRaw: jest.fn(),
      skillTriggerLog: { create: jest.fn() },
    };
    const resolver = new SkillResolver(
      prisma as never,
      { get: jest.fn() } as never,
    );
    expect(
      await resolver.resolve({ userId: 'u1', source: 'web', userMessage: 'x' }),
    ).toEqual({
      matchedSkills: [],
    });
  });
});
