'use server';

import { revalidatePath } from 'next/cache';
import { mutateGateway } from './gateway';

export async function createSession(title: string) {
  const result = await mutateGateway<any>('/api/sessions', 'POST', { channel: 'web', title });
  revalidatePath('/app', 'layout');
  return result;
}

export async function renameSession(id: string, title: string) {
  const result = await mutateGateway<any>(`/api/sessions/${encodeURIComponent(id)}`, 'PATCH', { title });
  revalidatePath('/app', 'layout');
  return result;
}

export async function deleteSession(id: string) {
  const result = await mutateGateway<any>(`/api/sessions/${encodeURIComponent(id)}`, 'DELETE');
  revalidatePath('/app', 'layout');
  return result;
}
