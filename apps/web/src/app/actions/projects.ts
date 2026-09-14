'use server';

import { revalidatePath } from 'next/cache';
import { mutateGateway } from './gateway';

export async function createProject(input: { name: string; category: string; description: string }) {
  const result = await mutateGateway<any>('/api/knowledge-projects', 'POST', input);
  revalidatePath('/app/projects');
  return result;
}

export async function deleteProject(id: string) {
  const result = await mutateGateway<any>(`/api/knowledge-projects/${encodeURIComponent(id)}`, 'DELETE');
  revalidatePath('/app/projects');
  return result;
}
