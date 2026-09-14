import AuthClient from '../../components/AuthClient';
import { redirect } from 'next/navigation';
import { getOceanServerUser } from '../../lib/server-session';

export const metadata = {
  title: '登录 · Ocean',
};

export const dynamic = 'force-dynamic';

export default async function AuthPage() {
  const user = await getOceanServerUser();
  if (user) redirect('/app');
  return <AuthClient />;
}
