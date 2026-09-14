'use server';

import { cookies } from 'next/headers';

export async function mutateGateway<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const cookieStore = await cookies();
  const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  const response = await fetch(`${gatewayUrl}${path}`, {
    method,
    headers: {
      cookie: cookieStore.toString(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message.join('; ') : payload.message;
    throw new Error(message || `Gateway mutation failed with status ${response.status}.`);
  }

  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}
