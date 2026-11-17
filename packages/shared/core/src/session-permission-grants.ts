/** Exact, short-lived session grants. They never override deny rules. */
export interface SessionGrant {
  toolName: string;
  argsKey: string;
  expiresAt: number;
}

export function canonicalPermissionInput(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (input: unknown, depth: number): unknown => {
    if (depth > 20) throw new Error('Permission grant input is too deeply nested');
    if (input === undefined) return null;
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('Permission grant input contains a non-finite number');
      return input;
    }
    if (typeof input !== 'object') throw new Error('Permission grant input must be JSON-compatible');
    if (seen.has(input)) throw new Error('Permission grant input contains a cycle');
    seen.add(input);
    if (Array.isArray(input)) return input.map((item) => normalize(item, depth + 1));
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      output[key] = normalize((input as Record<string, unknown>)[key], depth + 1);
    }
    return output;
  };
  const serialized = JSON.stringify(normalize(value, 0));
  if (serialized.length > 64 * 1024) throw new Error('Permission grant input exceeds 64 KB');
  return serialized;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

export class SessionPermissionGrants {
  private readonly grants = new Map<string, SessionGrant>();

  grant(sessionId: string, toolName: string, args: unknown, ttlMs = DEFAULT_TTL_MS): void {
    this.validateIdentity(sessionId, toolName);
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) throw new Error('Invalid session grant TTL');
    this.grants.set(this.key(sessionId, toolName, args), {
      toolName,
      argsKey: canonicalPermissionInput(args),
      expiresAt: Date.now() + ttlMs,
    });
  }

  allows(sessionId: string | undefined, toolName: string, args: unknown): boolean {
    if (!sessionId) return false;
    const key = this.key(sessionId, toolName, args);
    const grant = this.grants.get(key);
    if (!grant) return false;
    if (grant.expiresAt <= Date.now()) {
      this.grants.delete(key);
      return false;
    }
    return true;
  }

  revoke(sessionId: string, toolName: string, args: unknown): boolean {
    if (!sessionId) return false;
    return this.grants.delete(this.key(sessionId, toolName, args));
  }

  clearSession(sessionId: string): number {
    const prefix = `${sessionId}\u0000`;
    let removed = 0;
    for (const key of [...this.grants.keys()]) {
      if (key.startsWith(prefix)) { this.grants.delete(key); removed += 1; }
    }
    return removed;
  }

  size(): number {
    return this.grants.size;
  }

  private key(sessionId: string, toolName: string, args: unknown): string {
    this.validateIdentity(sessionId, toolName);
    return `${sessionId}\u0000${toolName}\u0000${canonicalPermissionInput(args)}`;
  }

  private validateIdentity(sessionId: string, toolName: string): void {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 200) throw new Error('Invalid session id for permission grant');
    if (typeof toolName !== 'string' || toolName.length === 0 || toolName.length > 200) throw new Error('Invalid tool name for permission grant');
  }
}
