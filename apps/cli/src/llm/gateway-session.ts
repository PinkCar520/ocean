import { remoteWorkspaceSnapshot } from '../commands/remote.js';

interface GatewaySessionOptions {
  gatewayUrl: string;
  apiKey: string;
  continueSession?: boolean;
  workspaceId?: string;
  signal?: AbortSignal;
}

/** Reuse the current user's latest CLI session or create a new one. */
export async function gatewayPrintSession(options: GatewaySessionOptions): Promise<string> {
  const url = `${options.gatewayUrl.replace(/\/$/, '')}/api/sessions`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': options.apiKey,
    Authorization: `Bearer ${options.apiKey}`,
  };

  if (options.continueSession) {
    const response = await fetch(url, { headers, signal: options.signal });
    if (!response.ok) throw new Error(`Gateway session list failed: HTTP ${response.status}`);
    const body = await response.json() as { data?: { id?: string; channel?: string; workspaceSnapshot?: { workspaceId?: string } }[] };
    if (!Array.isArray(body.data)) throw new Error('Invalid Gateway session list.');
    const latest = body.data.find((session) => session?.channel === 'cli'
      && typeof session.id === 'string' && session.id
      && (session.workspaceSnapshot?.workspaceId ?? undefined) === options.workspaceId);
    if (latest?.id) return latest.id;
  }

  const workspaceSnapshot = options.workspaceId ? await remoteWorkspaceSnapshot(options.workspaceId) : undefined;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ channel: 'cli', ...(workspaceSnapshot && { workspaceSnapshot }) }),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Gateway session creation failed: HTTP ${response.status}`);
  const body = await response.json() as { data?: { id?: string } };
  if (typeof body.data?.id !== 'string' || !body.data.id) throw new Error('Gateway did not return a session ID.');
  return body.data.id;
}
