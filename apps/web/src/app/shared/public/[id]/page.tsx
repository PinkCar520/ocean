import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SharedConversationSnapshot, type Snapshot } from '../../../../components/SharedConversationSnapshot';

export const metadata: Metadata = {
  title: 'Shared conversation · Ocean',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PublicSharedChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const gateway = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  const response = await fetch(`${gateway}/api/public-conversation-shares/${id}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Could not load the conversation snapshot.');
  const { data: snapshot } = await response.json() as { data: Snapshot };
  return <SharedConversationSnapshot snapshot={snapshot} shareId={id} />;
}
