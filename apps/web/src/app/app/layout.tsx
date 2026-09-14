import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOceanServerUser } from '../../lib/server-session';

export const metadata: Metadata = {
  title: {
    default: 'Ocean',
    template: '%s · Ocean',
  },
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getOceanServerUser();
  if (!user) redirect('/auth');
  return children;
}
