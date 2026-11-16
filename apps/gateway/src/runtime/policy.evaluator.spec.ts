import { PolicyEvaluator } from './policy.evaluator';

jest.mock('../skill/interactive.manager', () => ({
  InteractiveManager: class {},
}));

describe('PolicyEvaluator (Agent Runtime 拆分)', () => {
  function create() {
    const interactiveManager = {
      wrapHighRiskTool: jest.fn((n: string, d: any) => ({
        wrapped: n,
        def: d,
      })),
    };
    return {
      evaluator: new PolicyEvaluator(interactiveManager as never),
      interactiveManager,
    };
  }

  it('本地文件写与 Shell 执行恒为高危', () => {
    const { evaluator } = create();
    expect(evaluator.shouldWrap('local_file_edit', false)).toBe(true);
    expect(evaluator.shouldWrap('local_bash', false)).toBe(true);
    expect(evaluator.shouldWrap('local_powershell', false)).toBe(true);
    expect(evaluator.shouldWrap('local_notebook_edit', false)).toBe(true);
    expect(evaluator.shouldWrap('local_notebook_read', false)).toBe(true);
  });

  it('MCP 工具默认全部拦截（保守策略）', () => {
    const { evaluator } = create();
    expect(evaluator.shouldWrap('any_mcp_tool', true)).toBe(true);
  });

  it('只读工具免审批，本地写/执行工具需要审批', () => {
    const { evaluator } = create();
    expect(evaluator.shouldWrap('local_file_read', false)).toBe(true);
    expect(evaluator.shouldWrap('local_git', false)).toBe(true);
    expect(evaluator.shouldWrap('local_powershell', false)).toBe(true);
  });

  it('unknown tools require approval', () => {
    expect(create().evaluator.shouldWrap('unknown_tool', false)).toBe(true);
  });

  it('wrap 委托 InteractiveManager 生成阻断包装', () => {
    const { evaluator, interactiveManager } = create();
    const def = { description: 'd' };
    const wrapped = evaluator.wrap('local_bash', def, 'sess_1', 'u1');
    expect(interactiveManager.wrapHighRiskTool).toHaveBeenCalledWith(
      'local_bash',
      def,
      'sess_1',
      'u1',
    );
    expect(wrapped).toEqual({ wrapped: 'local_bash', def });
  });
});
