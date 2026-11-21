import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { SharedConversationSnapshot, type Snapshot } from '../../../../components/SharedConversationSnapshot';

export const metadata: Metadata = {
  title: 'Shared conversation · Ocean',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharedChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const cookieStore = await cookies();
  const loginUrl = `/auth?next=${encodeURIComponent(`/shared/chat/${id}`)}`;
  if (!cookieStore.has('ocean_session')) redirect(loginUrl);

  const gateway = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  const response = await fetch(`${gateway}/api/conversation-shares/${id}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect(loginUrl);
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new Error('Could not load the conversation snapshot.');

  const { data: snapshot } = await response.json() as { data: Snapshot };
  return <SharedConversationSnapshot snapshot={snapshot} shareId={id} />;
}
