import { createHash, randomUUID } from 'node:crypto';
import { evaluatePermission, isPermissionSettings, normalizeRules, PermissionAction, PermissionSettings } from '@ocean/core';

/** Server-issued, owner-bound policy leases. Paths are never accepted. */
export class WorkspacePolicies {
  private readonly leases = new Map<string, { owner: string; connection: string; version: string; expires: number; settings: PermissionSettings }>();
  register(owner: string, connection: string, settings: PermissionSettings, now = Date.now()) {
    if (!owner || !connection || !isPermissionSettings(settings)) throw new Error('Invalid workspace policy');
    const id = randomUUID();
    const version = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
    this.leases.set(id, { owner, connection, version, expires: now + 60_000, settings: JSON.parse(JSON.stringify(settings)) });
    return { id, version };
  }
  revoke(connection: string) {
    for (const [id, lease] of this.leases) if (lease.connection === connection) this.leases.delete(id);
  }
  evaluate(owner: string, id: string, version: string, tool: string, args: unknown, server: PermissionAction, now = Date.now()): PermissionAction {
    const lease = this.leases.get(id);
    if (server === 'deny' || !lease || lease.owner !== owner || lease.version !== version || lease.expires <= now) return 'deny';
    const local = evaluatePermission(tool, lease.settings, normalizeRules(lease.settings), args);
    if (local === 'deny') return 'deny';
    return server === 'ask' || local === 'ask' ? 'ask' : 'allow';
  }
}
