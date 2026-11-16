import type { Metadata } from 'next';
import ServerOceanShell from '../../components/ServerOceanShell';

export const metadata: Metadata = {
  title: {
    default: 'Ocean',
    template: '%s · Ocean',
  },
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <ServerOceanShell preloadAll />
      {children}
    </>
  );
}
