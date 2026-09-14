'use client';

import '@ocean/ui/lib/i18n';
import { AuthPage } from '@ocean/ui/components/AuthPage';
import { useRouter } from 'next/navigation';
import { authenticate } from '../app/actions/auth';

export default function AuthClient() {
  const router = useRouter();

  return (
    <AuthPage
      authenticate={authenticate}
      onLoginSuccess={() => {
        const requestedPath = new URLSearchParams(window.location.search).get('next');
        const destination = requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
          ? requestedPath
          : '/app';
        router.replace(destination);
        router.refresh();
      }}
    />
  );
}
