'use server';

import { revalidatePath } from 'next/cache';
import { mutateGateway } from './gateway';

export async function installSkill(id: string) {
  const result = await mutateGateway<any>(`/api/skills/${encodeURIComponent(id)}/install`, 'POST');
  revalidatePath('/app/skills');
  return result;
}

export async function uninstallSkill(id: string) {
  const result = await mutateGateway<any>(`/api/skills/${encodeURIComponent(id)}/install`, 'DELETE');
  revalidatePath('/app/skills');
  return result;
}
