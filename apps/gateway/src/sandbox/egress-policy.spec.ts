import { EgressPolicy } from './egress-policy';

describe('EgressPolicy (Phase 4.7 egress allowlist)', () => {
  it('defaults to deny-everything with an empty allowlist', () => {
    const policy = new EgressPolicy([]);
    expect(policy.checkUrl('https://example.com').allowed).toBe(false);
    expect(policy.checkUrl('http://127.0.0.1/x').allowed).toBe(false);
  });

  it('matches exact hosts, ignoring protocol, port, case and path', () => {
    const policy = new EgressPolicy(['gitlab.example.com']);
    expect(policy.checkUrl('https://gitlab.example.com/proj/1').allowed).toBe(true);
    expect(policy.checkUrl('http://GITLAB.EXAMPLE.COM:8080/x').allowed).toBe(true);
    expect(policy.checkUrl('https://example.com').allowed).toBe(false);
    expect(policy.checkUrl('https://sub.gitlab.example.com').allowed).toBe(false);
  });

  it('suffix rule `.example.com` matches the base host and all subdomains', () => {
    const policy = new EgressPolicy(['.example.com']);
    expect(policy.checkUrl('https://example.com').allowed).toBe(true);
    expect(policy.checkUrl('https://gitlab.example.com').allowed).toBe(true);
    expect(policy.checkUrl('https://a.b.example.com').allowed).toBe(true);
    expect(policy.checkUrl('https://notexample.com').allowed).toBe(false);
    expect(policy.checkUrl('https://example.com.evil.io').allowed).toBe(false);
  });

  it('rejects non-http(s) schemes and invalid URLs', () => {
    const policy = new EgressPolicy(['example.com']);
    expect(policy.checkUrl('ftp://example.com/file').allowed).toBe(false);
    expect(policy.checkUrl('file:///etc/passwd').allowed).toBe(false);
    expect(policy.checkUrl('not a url').allowed).toBe(false);
    expect(policy.checkUrl(null).allowed).toBe(false);
  });

  it('fromEnv parses comma-separated SANDBOX_EGRESS_ALLOWLIST', () => {
    const policy = EgressPolicy.fromEnv({
      SANDBOX_EGRESS_ALLOWLIST: ' example.com , .corp.internal ',
    } as NodeJS.ProcessEnv);
    expect(policy.checkUrl('https://example.com').allowed).toBe(true);
    expect(policy.checkUrl('https://jenkins.corp.internal').allowed).toBe(true);
    expect(policy.checkUrl('https://other.com').allowed).toBe(false);
  });
});
