import { SubagentRunsService } from './subagent-runs.service';
describe('Subagent input boundary', () => {
  it('rejects unbounded or missing child identities before touching persistence', async () => {
    const service = new SubagentRunsService({} as any, {} as any);
    await expect(
      service.create('parent', 'user', {
        toolCallId: '',
        agent: 'a',
        prompt: 'p',
      }),
    ).rejects.toThrow();
    await expect(
      service.create('parent', 'user', {
        toolCallId: 'c',
        agent: 'a',
        prompt: 'x'.repeat(100001),
      }),
    ).rejects.toThrow();
  });
});
