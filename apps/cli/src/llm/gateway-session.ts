import { remoteWorkspaceSnapshot } from '../commands/remote.js';

interface GatewaySessionOptions {
  gatewayUrl: string;
  apiKey: string;
  continueSession?: boolean;
  resume?: string;
  forkSession?: boolean;
  forkAt?: string;
  workspaceId?: string;
  signal?: AbortSignal;
}

type GatewayConnection = Pick<GatewaySessionOptions, 'gatewayUrl' | 'apiKey' | 'signal'>;

export async function readGatewaySessions(connection: GatewayConnection, sessionId?: string, spaceId?: string) {
  const url = new URL(`${connection.gatewayUrl.replace(/\/$/, '')}/api/sessions`);
  if (sessionId !== undefined) url.pathname += `/${encodeURIComponent(sessionId)}/messages`;
  else if (spaceId) url.searchParams.set('spaceId', spaceId);
  const response = await fetch(url, {
    headers: { 'x-api-key': connection.apiKey, Authorization: `Bearer ${connection.apiKey}` },
    signal: connection.signal,
  });
  if (!response.ok) throw new Error(`Gateway session lookup failed: HTTP ${response.status}`);
  const body = await response.json() as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error('Invalid Gateway session response.');
  return body.data;
}

/** Reuse the current user's latest CLI session or create a new one. */
export async function gatewayPrintSession(options: GatewaySessionOptions): Promise<string> {
  const url = `${options.gatewayUrl.replace(/\/$/, '')}/api/sessions`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': options.apiKey,
    Authorization: `Bearer ${options.apiKey}`,
  };

  let sourceId = options.resume;
  if (options.continueSession) {
    const sessions = await readGatewaySessions(options) as {
      id?: string; channel?: string; workspaceSnapshot?: { workspaceId?: string };
    }[];
    const latest = sessions.find((session) => session?.channel === 'cli'
      && typeof session.id === 'string' && session.id
      && (session.workspaceSnapshot?.workspaceId ?? undefined) === options.workspaceId);
    sourceId = latest?.id;
  }

  if (sourceId && !options.forkSession) return sourceId;
  if (options.forkSession) {
    if (!sourceId) throw new Error('No Gateway session is available to fork.');
    const response = await fetch(`${url}/${encodeURIComponent(sourceId)}/fork`, {
      method: 'POST', headers, signal: options.signal,
      body: options.forkAt === undefined ? undefined : JSON.stringify({ messageId: options.forkAt }),
    });
    if (!response.ok) throw new Error(`Gateway session fork failed: HTTP ${response.status}`);
    const body = await response.json() as { data?: { id?: string } };
    if (typeof body.data?.id !== 'string' || !body.data.id) throw new Error('Gateway did not return a forked session ID.');
    return body.data.id;
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
