import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/product', label: 'Ocean AI' },
  { href: '/code', label: 'Ocean Code' },
  { href: '/one', label: 'Ocean One' },
];

export function ProductSiteShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fcfbf9] text-[#211e1b]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:shadow-lg">Skip to main content</a>
      <header className="sticky top-0 z-40 border-b border-[#e7e1da] bg-[#fcfbf9]/95 backdrop-blur-xl">
        <nav aria-label="Product navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-2xl font-bold tracking-tight">Ocean<span className="text-[#e9561b]">.</span></Link>
          <div className="flex flex-wrap items-center gap-2 sm:gap-5">
            {links.map(link => <Link key={link.href} href={link.href} aria-current={active === link.href ? 'page' : undefined} className={`rounded-md px-2 py-2 text-sm font-medium transition-colors hover:text-[#c94b1a] focus-visible:outline-2 focus-visible:outline-[#e9561b] ${active === link.href ? 'text-[#c94b1a]' : 'text-[#645d57]'}`}>{link.label}</Link>)}
          </div>
          <Link href="/app" className="rounded-full bg-[#211e1b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c94b1a]">Open Workspace</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="mt-20 border-t border-[#e7e1da] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 text-sm text-[#645d57]">
          <span>Ocean · Building today's AI tools. Exploring tomorrow's interactions.</span>
          <div className="flex gap-5"><Link href="/product" className="hover:underline">Ocean AI</Link><Link href="/one" className="hover:underline">Ocean One</Link><a href="https://github.com/PinkCar520/ocean" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a></div>
        </div>
      </footer>
    </div>
  );
}
