import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowRight, Link2Off } from 'lucide-react';

export default async function SharedConversationNotFound() {
  const chinese = (await headers()).get('accept-language')?.toLowerCase().startsWith('zh');

  return (
    <main lang={chinese ? 'zh-CN' : 'en'} className="min-h-dvh bg-background px-5 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 border-b border-border/70 py-5">
        <Image src="/logo.svg" alt="" width={32} height={24} unoptimized />
        <span className="font-display text-lg font-semibold">Ocean</span>
      </div>
      <section aria-labelledby="shared-unavailable" className="mx-auto flex max-w-lg flex-col items-center pb-12 pt-[clamp(3.5rem,13vh,9rem)] text-center">
        <div aria-hidden="true" className="mb-5 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Link2Off size={21} strokeWidth={1.75} />
        </div>
        <h1 id="shared-unavailable" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {chinese ? '无法查看共享会话' : 'Shared conversation unavailable'}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          {chinese
            ? '此链接可能已被撤销，或当前账号没有访问权限。你可以联系分享者获取有效链接。'
            : 'This link may have been revoked, or your account may not have access. Ask the person who shared it for a new link.'}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          {chinese ? '返回 Ocean 首页' : 'Go to Ocean home'}
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </section>
    </main>
  );
}
