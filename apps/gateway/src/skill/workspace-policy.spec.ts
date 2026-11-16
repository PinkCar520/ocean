import { WorkspacePolicies } from './workspace-policy';

describe('workspace policy leases', () => {
  it('preserves both server and CLI restrictions', () => {
    const policies = new WorkspacePolicies();
    const { id, version } = policies.register('owner', 'socket', { deny: ['file_read'] }, 0);
    expect(policies.evaluate('owner', id, version, 'file_read', {}, 'allow', 1)).toBe('deny');
    const allow = policies.register('owner', 'socket', { allow: ['*'] }, 0);
    expect(policies.evaluate('owner', allow.id, allow.version, 'unknown', {}, 'deny', 1)).toBe('deny');
    expect(policies.evaluate('owner', allow.id, allow.version, 'unknown', {}, 'ask', 1)).toBe('ask');
  });
  it('rejects forged, stale, updated and disconnected identities', () => {
    const policies = new WorkspacePolicies();
    const { id, version } = policies.register('owner', 'socket', {}, 0);
    for (const [owner, key, revision, now] of [['other', id, version, 1], ['owner', 'fake', version, 1], ['owner', id, 'old', 1], ['owner', id, version, 60000]] as const) {
      expect(policies.evaluate(owner, key, revision, 'file_read', {}, 'allow', now)).toBe('deny');
    }
    policies.revoke('socket');
    expect(policies.evaluate('owner', id, version, 'file_read', {}, 'allow', 1)).toBe('deny');
  });
});
