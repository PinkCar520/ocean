'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface AuthenticateInput {
  mode: 'login' | 'register';
  email: string;
  password: string;
  name?: string;
}

interface AuthPayload {
  access_token?: string;
  user?: Record<string, unknown>;
  message?: string | string[];
}

export async function authenticate(input: AuthenticateInput) {
  const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  const endpoint = input.mode === 'login' ? 'login' : 'register';

  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for');
    const response = await fetch(`${gatewayUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': requestHeaders.get('user-agent') ?? '',
        ...(forwardedFor && { 'x-forwarded-for': forwardedFor }),
      },
      body: JSON.stringify(input.mode === 'login'
        ? { email: input.email, password: input.password }
        : { email: input.email, password: input.password, name: input.name }),
      cache: 'no-store',
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok || !payload.access_token || !payload.user) {
      const message = Array.isArray(payload.message) ? payload.message.join('; ') : payload.message;
      return { error: message || 'Authentication failed.' };
    }

    const cookieStore = await cookies();
    cookieStore.set('ocean_session', payload.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    return { user: payload.user };
  } catch {
    return { error: 'Ocean Gateway is unavailable.' };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ocean_session')?.value;
  if (token) {
    const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
    await fetch(`${gatewayUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }
  cookieStore.delete('ocean_session');
  redirect('/auth');
}
