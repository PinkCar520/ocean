import { Info } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ChatMarkdown } from '@ocean/ui/components/chat/ChatMarkdown';
import OceanShell from '../App';
import { getOceanServerBootstrap, getSharedOriginalSession } from '../lib/server-session';

export type Snapshot = {
  title: string;
  createdAt: string;
  sharedBy?: string | null;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
};

export async function SharedConversationSnapshot({ snapshot, shareId }: { snapshot: Snapshot; shareId: string }) {
  const chinese = (await headers()).get('accept-language')?.toLowerCase().startsWith('zh');
  const locale = chinese ? 'zh-CN' : 'en';
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });

  const bootstrap = await getOceanServerBootstrap();
  const originalSession = bootstrap ? await getSharedOriginalSession(shareId) : null;
  const conversation = (
    <div lang={locale} className="flex min-h-0 flex-1 flex-col">
      <div className={bootstrap ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
        <section className="mx-auto w-full max-w-[800px] px-5 pb-10 pt-8 sm:px-8">
          <header className="mb-8 border-b border-border pb-5">
            <h1 className="break-words text-2xl font-semibold">{snapshot.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {chinese ? '只读会话快照' : 'Read-only conversation snapshot'}
              {' · '}
              <time dateTime={snapshot.createdAt}>{formatter.format(new Date(snapshot.createdAt))}</time>
            </p>
          </header>
          <aside aria-labelledby="shared-snapshot-notice" className="mb-7 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <Info aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <h2 id="shared-snapshot-notice" className="break-words text-sm font-medium">
                {snapshot.sharedBy
                  ? (chinese ? `由 ${snapshot.sharedBy} 分享` : `Shared by ${snapshot.sharedBy}`)
                  : (chinese ? '关于此共享会话' : 'About this shared conversation')}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {chinese
                  ? '这是会话的只读正文快照。内容可能未经核实或不适合所有读者，也不代表 Ocean 的观点。附件和工具输出未包含在此快照中。'
                  : 'This is a read-only snapshot of the conversation text. It may contain unverified or unsuitable content and does not represent Ocean’s views. Attachments and tool outputs are excluded.'}
              </p>
            </div>
          </aside>
          <div className="space-y-5">
            {snapshot.messages.map((message, index) => (
              <article key={index} aria-label={message.role === 'user' ? (chinese ? '用户' : 'User') : (chinese ? '助手' : 'Assistant')}
                className={message.role === 'user' ? 'flex justify-end' : 'min-w-0'}>
                <div className={message.role === 'user'
                  ? 'prose prose-slate prose-sm max-w-[85%] min-w-0 break-words rounded-[24px] border border-border/50 bg-muted/80 px-5 py-3 text-foreground'
                  : 'prose prose-slate prose-sm max-w-none break-words py-3 text-foreground'}>
                  <ChatMarkdown text={message.text} readOnly />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      {bootstrap && (
        <footer className="shrink-0 border-t border-border bg-background px-5 py-3">
          <div className="mx-auto flex max-w-[800px] flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{chinese ? '这是会话的只读分享快照。' : 'This is a read-only shared conversation snapshot.'}</span>
            {originalSession && (
              <Link className="rounded-lg bg-muted px-3 py-1.5 hover:bg-foreground/10" href={`/app/chat/${encodeURIComponent(originalSession)}`}>
                {chinese ? '打开原会话' : 'Open original chat'}
              </Link>
            )}
          </div>
        </footer>
      )}
    </div>
  );

  return bootstrap ? (
    <OceanShell
      initialAuthenticated
      initialUser={bootstrap.user}
      initialConversations={bootstrap.conversations}
      initialTab="chat"
      readOnlyConversation={conversation}
    />
  ) : conversation;
}
