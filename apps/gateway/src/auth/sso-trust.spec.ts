import { ipv4ToUint, parseTrustedProxyList, isIpInTrustList, isSsoRequestTrusted } from './sso-trust';

describe('sso-trust (Phase 7 SSO trusted proxy boundary)', () => {
  it('ipv4ToUint converts and rejects invalid input', () => {
    expect(ipv4ToUint('10.0.0.1')).toBe((10 << 24) | 1);
    expect(ipv4ToUint('not-an-ip')).toBeNull();
    expect(ipv4ToUint('1.2.3.999')).toBeNull();
  });

  it('parses exact IPs and CIDRs', () => {
    expect(parseTrustedProxyList('10.0.0.0/8, 192.168.1.5')).toEqual(['10.0.0.0/8', '192.168.1.5']);
    expect(parseTrustedProxyList(undefined)).toEqual([]);
  });

  it('matches exact IP', () => {
    expect(isIpInTrustList('192.168.1.5', ['192.168.1.5'])).toBe(true);
    expect(isIpInTrustList('192.168.1.6', ['192.168.1.5'])).toBe(false);
  });

  it('matches CIDR prefix', () => {
    expect(isIpInTrustList('10.99.1.2', ['10.0.0.0/8'])).toBe(true);
    expect(isIpInTrustList('11.0.0.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('handles /32 and /0', () => {
    expect(isIpInTrustList('1.2.3.4', ['1.2.3.4/32'])).toBe(true);
    expect(isIpInTrustList('9.9.9.9', ['0.0.0.0/0'])).toBe(true);
  });

  it('SSO request is untrusted without config (default off)', () => {
    expect(isSsoRequestTrusted('127.0.0.1', undefined)).toBe(false);
    expect(isSsoRequestTrusted('127.0.0.1', '')).toBe(false);
  });

  it('SSO request trusted only when ip in list', () => {
    expect(isSsoRequestTrusted('127.0.0.1', '127.0.0.1, 10.0.0.0/8')).toBe(true);
    expect(isSsoRequestTrusted('203.0.113.9', '127.0.0.1, 10.0.0.0/8')).toBe(false);
  });
});
