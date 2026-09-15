export const OCEAN_SESSION_COOKIE = 'ocean_session';
export const OCEAN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator === -1) continue;
    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;

    const value = entry.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}
