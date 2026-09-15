import { SkillResolver } from './skill.resolver';

describe('SkillResolver (Agent Runtime 拆分)', () => {
  function create(fetchMock: jest.Mock) {
    const configService = { get: jest.fn(() => 'http://fastapi:8000') };
    (globalThis as any).fetch = fetchMock;
    return new SkillResolver(configService as never);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('调用 FastAPI resolve 并返回注入 Prompt 与命中技能', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        injected_prompt: '## 银行业务规则技能',
        matched_skills: [{ id: 'banking', name: 'banking', match_type: 'keyword' }],
      }),
    });
    const resolver = create(fetchMock);
    const result = await resolver.resolve(
      { userId: 'u1', source: 'web', userMessage: '对公转账流程', skillIds: ['s1'] },
      'sess_1',
    );
    expect(result.injectedPrompt).toContain('银行业务规则');
    expect(result.matchedSkills[0]).toMatchObject({ id: 'banking' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body).toMatchObject({
      message: '对公转账流程',
      session_id: 'sess_1',
      skill_ids: ['s1'],
    });
  });

  it('FastAPI 非 2xx 时静默降级为空结果', async () => {
    const resolver = create(jest.fn().mockResolvedValue({ ok: false, statusText: 'ERR' }));
    expect(await resolver.resolve({ userId: 'u1', source: 'web', userMessage: 'x' })).toEqual({ matchedSkills: [] });
  });

  it('网络异常时静默降级为空结果', async () => {
    const resolver = create(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await resolver.resolve({ userId: 'u1', source: 'web', userMessage: 'x' })).toEqual({ matchedSkills: [] });
  });
});
