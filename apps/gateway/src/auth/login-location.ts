import { BlockList, isIP } from 'node:net';

const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3],
] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv4');
}
nonPublic.addSubnet('2001:db8::', 32, 'ipv6');

export async function resolveLoginLocation(clientIp?: string): Promise<string | undefined> {
  const endpoint = process.env.LOGIN_GEOIP_URL;
  const ip = clientIp?.replace(/^::ffff:/i, '');
  if (!endpoint || !ip) return;

  const family = isIP(ip);
  if (
    !family ||
    (family === 6 && !/^[23]/.test(ip)) ||
    nonPublic.check(ip, family === 4 ? 'ipv4' : 'ipv6')
  ) return;

  try {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || base.username || base.password) return;
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${encodeURIComponent(ip)}`;
    const response = await fetch(base, {
      signal: AbortSignal.timeout(1000),
      redirect: 'error',
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data || data.success === false) return;
    const parts = [data.city, data.region, data.country]
      .filter((part): part is string => typeof part === 'string' && !!part.trim())
      .map((part) => part.trim().slice(0, 80));
    return [...new Set(parts)].join(', ') || undefined;
  } catch {
    return;
  }
}
