import { ContextAssembler } from './context.assembler';

jest.mock('ai', () => ({
  convertToModelMessages: jest.fn((m: any) => m),
}));
jest.mock('../rag/rag.service', () => ({ RAGService: class {} }));

describe('ContextAssembler (Agent Runtime 拆分)', () => {
  function create(ragResults: any[] = []) {
    const ragService = {
      searchSimilarity: jest.fn().mockResolvedValue(ragResults),
    };
    return new ContextAssembler(ragService as never);
  }

  it('为缺失 parts 的消息补 text part（AI SDK 兼容）', () => {
    const assembler = create();
    const messages = assembler.sanitizeMessages([
      { role: 'user', content: '你好' },
      {
        role: 'assistant',
        content: '嗨',
        parts: [{ type: 'text', text: '嗨' }],
      },
      null,
    ]);
    expect(messages[0].parts).toEqual([{ type: 'text', text: '你好' }]);
    expect(messages[1].parts).toHaveLength(1);
    expect(messages[2]).toEqual({ role: 'user', content: '', parts: [] });
  });

  it('知识模式下在最后一条用户消息前注入 RAG 背景', async () => {
    const assembler = create([
      { title: '文档A', content: '银行转账限额为单笔 500 万', distance: 0.1 },
    ]);
    const messages = assembler.sanitizeMessages([
      { role: 'user', content: '转账限额多少？' },
    ]);
    const { injected } = await assembler.injectRagContext(
      messages,
      { userId: 'u1', source: 'web', userMessage: '转账限额多少？' },
      'knowledge',
    );
    expect(injected).toBe(true);
    expect(messages[0].content).toContain('银行转账限额为单笔 500 万');
    expect(messages[0].content).toContain('用户问题：转账限额多少？');
  });

  it('非搜索/知识模式不注入 RAG', async () => {
    const assembler = create();
    const messages = assembler.sanitizeMessages([
      { role: 'user', content: 'x' },
    ]);
    const { injected } = await assembler.injectRagContext(
      messages,
      { userId: 'u1', source: 'web', userMessage: 'x' },
      'none',
    );
    expect(injected).toBe(false);
  });
});
