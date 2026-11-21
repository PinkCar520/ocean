import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shared: vi.fn(async (options: any) => {
    options.onText?.('verified');
    return { text: 'verified', snapshot: { state: 'completed' } };
  }),
  legacy: vi.fn(),
}));
vi.mock('./llm/core-local-runtime.js', () => ({ runOceanCoreLocal: mocks.shared }));
vi.mock('./llm/chat.js', () => ({
  buildSystemPrompt: () => 'test system',
  TurnInterruptedError: class TurnInterruptedError extends Error {},
  runChatLoop: mocks.legacy,
  runChatLoopViaGateway: vi.fn(),
  normalizeApprovalHandler: (handler: unknown) => handler,
}));
vi.mock('./llm/model-router.js', () => ({
  createModelRouter: () => ({ getModel: () => ({}), listModels: () => [] }),
}));
vi.mock('./skills/loader.js', () => ({ discoverSkills: () => [] }));
vi.mock('./mcp/client.js', () => ({
  McpClientManager: class {
    async loadConfig() {}
    async connectAll() {}
    async disconnectAll() {}
  },
}));
vi.mock('./tools/index.js', () => ({ toAgentToolSet: async () => ({}) }));
vi.mock('./utils/permission-policy.js', () => ({
  PermissionPolicy: class {
    evaluate() { return 'allow'; }
    getPolicyVersion() { return 'v1'; }
  },
  defaultSessionPermissionGrants: {},
}));
vi.mock('./utils/lifecycle-hooks.js', () => ({
  LifecycleHooks: { load: () => ({ run: async () => ({ blocked: false }) }) },
}));
vi.mock('./utils/session-store.js', () => ({
  SessionStore: class {
    async create(workspace: string) { return { id: 'session', workspace, messages: [] }; }
    async save(_id: string, workspace: string, messages: unknown[]) {
      return { id: 'session', workspace, messages };
    }
  },
}));

import { runRepl } from './repl.js';

describe('real CLI print entrypoint routes through shared Agent Core', () => {
 it('dispatches the main persisted print request through AgentExecutionEngine host path', async () => {
  mocks.shared.mockClear();
  mocks.legacy.mockClear();
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    await runRepl({ userId: 'test-user', workspace: process.cwd(), singleQuery: 'hello', print: 'json' });
    expect(mocks.shared).toHaveBeenCalledOnce();
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.shared.mock.calls[0][0]).toMatchObject({
      sessionId: 'session', streaming: true, systemPrompt: 'test system',
    });
  } finally {
    output.mockRestore();
  }
 });
});
