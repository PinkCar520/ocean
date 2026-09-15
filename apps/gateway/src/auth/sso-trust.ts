/**
 * sso-trust.ts —— Phase 7：SSO 可信代理边界。
 * SSO 头（x-sso-token / x-user-id）只允许来自可信代理的请求使用。
 * 未配置 SSO_TRUSTED_PROXY 时 SSO 头一律不可信（默认关闭）。
 */

export function ipv4ToUint(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** 解析信任配置：支持精确 IP（1.2.3.4）与 CIDR（10.0.0.0/8）。 */
export function parseTrustedProxyList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCidr(entry: string): { net: number; bits: number } | null {
  const slash = entry.indexOf('/');
  const ip = slash >= 0 ? entry.slice(0, slash) : entry;
  const bits = slash >= 0 ? Number(entry.slice(slash + 1)) : 32;
  const net = ipv4ToUint(ip);
  if (net === null || !Number.isInteger(bits) || bits < 0 || bits > 32)
    return null;
  return { net: net >>> 0, bits };
}

export function isIpInTrustList(ip: string, entries: string[]): boolean {
  const target = ipv4ToUint(ip);
  if (target === null) return false;
  for (const entry of entries) {
    const cidr = parseCidr(entry);
    if (!cidr) continue;
    const mask = cidr.bits === 0 ? 0 : (0xffffffff << (32 - cidr.bits)) >>> 0;
    if ((target & mask) === (cidr.net & mask)) return true;
  }
  return false;
}

/**
 * SSO 头是否可信：未配置信任列表 → 不可信（默认关闭）。
 * req.ip 由 Express 按 TRUST_PROXY 解析（main.ts 设置），反代之后是真实来源。
 */
export function isSsoRequestTrusted(
  ip: string | undefined,
  trustProxyRaw: string | undefined,
): boolean {
  if (!ip || !trustProxyRaw) return false;
  return isIpInTrustList(ip, parseTrustedProxyList(trustProxyRaw));
}
