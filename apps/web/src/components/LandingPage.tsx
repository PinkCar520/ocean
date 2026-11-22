'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Blocks, BookOpen, ChevronDown, Globe2, Cpu, GitBranch, History, Menu, Terminal, X } from 'lucide-react';

const repository = 'https://github.com/PinkCar520/ocean';
const documentation = `${repository}#readme`;

const navigationGroups = [
  { label: 'Product', columns: [
    { heading: 'Experience', links: [{ label: 'Ocean Workspace', href: '/app' }, { label: 'Conversations', href: '/app/chats' }, { label: 'Projects', href: '/app/projects' }] },
    { heading: 'Capabilities', links: [{ label: 'Agent Core', href: '/#product' }, { label: 'Skills', href: '/app/skills' }, { label: 'Workflows', href: '/app/workflows' }] },
    { heading: 'Explore', links: [{ label: 'Platform overview', href: '/#product' }, { label: 'Architecture', href: '/#developers' }] },
  ] },
  { label: 'Developers', columns: [
    { heading: 'Build', links: [{ label: 'Developer overview', href: '/#developers' }, { label: 'Source code', href: repository }, { label: 'Documentation', href: documentation }] },
    { heading: 'Architecture', links: [{ label: 'Shared Agent Core', href: '/#product' }, { label: 'CLI and Web hosts', href: '/#developers' }] },
  ] },
  { label: 'Resources', columns: [
    { heading: 'Learn', links: [{ label: 'Documentation', href: documentation }, { label: 'GitHub repository', href: repository }] },
    { heading: 'Get started', links: [{ label: 'Open workspace', href: '/app' }, { label: 'Sign in', href: '/auth' }] },
  ] },
];

// Social profiles can be activated later by setting their URL; unconfigured icons are intentionally inert.
const socialProfiles = [
  { label: 'GitHub', slug: 'github', url: repository },
  { label: 'X', slug: 'x', url: null },
  { label: 'YouTube', slug: 'youtube', url: null },
  { label: 'LinkedIn', slug: 'linkedin', url: null },
  { label: 'Instagram', slug: 'instagram', url: null },
  { label: 'Discord', slug: 'discord', url: null },
];

const footerGroups = [
  { heading: 'Product', links: [{ label: 'Ocean Workspace', href: '/app' }, { label: 'Conversations', href: '/app/chats' }, { label: 'Projects', href: '/app/projects' }, { label: 'Skills', href: '/app/skills' }] },
  { heading: 'Platform', links: [{ label: 'Agent Core', href: '/#product' }, { label: 'Architecture', href: '/#developers' }, { label: 'Workflows', href: '/app/workflows' }, { label: 'Integrations', href: '/app/integrations' }] },
  { heading: 'Developers', links: [{ label: 'Documentation', href: documentation }, { label: 'Source code', href: repository }, { label: 'Issues', href: `${repository}/issues` }, { label: 'Releases', href: `${repository}/releases` }] },
  { heading: 'Resources', links: [{ label: 'Get started', href: '/app' }, { label: 'Sign in', href: '/auth' }, { label: 'README', href: documentation }, { label: 'Contribute', href: `${repository}/blob/main/CONTRIBUTING.md` }] },
];

const capabilities = [
  {
    title: 'One Agent Core',
    description: 'A shared execution foundation for the CLI, web experience, and future hosts.',
    icon: Cpu,
  },
  {
    title: 'Persistent Sessions',
    description: 'Sessions are designed to survive beyond a single request or interface.',
    icon: History,
  },
  {
    title: 'Tools & Skills',
    description: 'Extend Ocean with tools, skills, and MCP integrations.',
    icon: Blocks,
  },
];

export function LandingPage() {
  const [prompt, setPrompt] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);

  function openWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The workspace owns authentication and execution. The landing page never
    // calls a model or simulates a response. A prompt is a navigation hint only.
    const target = prompt.trim()
      ? `/app?prompt=${encodeURIComponent(prompt.trim())}`
      : '/app';
    window.location.assign(target);
  }

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-[#1c1b1b] selection:bg-[#ffdfcf]">
      <header onMouseLeave={() => setActiveMenu(null)} className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#fcfbf9]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-6 px-6 md:px-10" aria-label="Main navigation">
          <Link href="/" className="text-2xl font-bold tracking-[-0.07em]" aria-label="Ocean home">Ocean<span className="text-[#ed5b20]">.</span></Link>
          <div className="hidden h-full items-center gap-8 text-sm font-medium text-[#4b4947] md:flex">
            {navigationGroups.map(group => (
              <button key={group.label} type="button"
                className={`flex h-full items-center gap-1.5 border-b-2 transition-colors ${activeMenu === group.label ? 'border-[#e9561b] text-[#e9561b]' : 'border-transparent hover:text-[#e9561b]'}`}
                aria-expanded={activeMenu === group.label} aria-controls="ocean-mega-menu"
                onMouseEnter={() => setActiveMenu(group.label)}
                onFocus={() => setActiveMenu(group.label)}
                onClick={() => setActiveMenu(activeMenu === group.label ? null : group.label)}>
                {group.label}<ChevronDown size={14} className={activeMenu === group.label ? 'rotate-180 transition-transform' : 'transition-transform'}/>
              </button>
            ))}
            <a href={repository} target="_blank" rel="noopener noreferrer" onMouseEnter={() => setActiveMenu(null)} className="inline-flex items-center gap-1.5 hover:text-[#e9561b]">GitHub <ArrowRight size={14}/></a>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/auth" className="rounded-full px-4 py-2.5 text-sm font-medium hover:bg-black/5">Log in</Link>
            <Link href="/app" className="rounded-full bg-[#1c1b1b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e9561b]">Open Ocean <ArrowRight className="ml-1 inline" size={15}/></Link>
          </div>
          <button type="button" className="rounded-lg p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={24}/> : <Menu size={24}/>}
          </button>
        </nav>
        {activeMenu && (
          <div id="ocean-mega-menu" className="absolute left-0 right-0 top-full hidden border-t border-black/[0.06] border-b border-[#e8e3df] bg-[#fcfbf9] shadow-[0_22px_45px_rgba(30,20,12,0.09)] md:block"
            onMouseEnter={() => setActiveMenu(activeMenu)}
            onMouseLeave={() => setActiveMenu(null)}
            onKeyDown={event => { if (event.key === 'Escape') setActiveMenu(null); }}>
            <div className="mx-auto grid max-w-7xl grid-cols-3 gap-10 px-10 py-10">
              {navigationGroups.find(group => group.label === activeMenu)?.columns.map(column => (
                <div key={column.heading} className="space-y-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#918b85]">{column.heading}</p>
                  <div className="flex flex-col gap-4">
                    {column.links.map(link => (
                      <a key={link.label} href={link.href} onClick={() => setActiveMenu(null)}
                        className="w-fit text-base font-medium text-[#292724] transition-colors hover:text-[#e9561b]">{link.label}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#eee9e5] bg-[#f7f5f1]">
              <div className="mx-auto flex max-w-7xl items-center justify-between px-10 py-3 text-xs text-[#77716c]">
                <span>One Agent Core · Multiple Hosts · Persistent Sessions</span>
                <Link href="/app" onClick={() => setActiveMenu(null)} className="font-semibold text-[#292724] hover:text-[#e9561b]">Open Ocean →</Link>
              </div>
            </div>
          </div>
        )}
        {menuOpen && (
          <div className="flex flex-col gap-1 border-t border-black/10 px-6 py-3 text-sm md:hidden">
            {navigationGroups.map(group => (
              <div key={group.label} className="border-b border-black/5">
                <button type="button" className="flex w-full items-center justify-between py-3 text-left font-medium"
                  aria-expanded={mobileGroup === group.label} onClick={() => setMobileGroup(mobileGroup === group.label ? null : group.label)}>
                  {group.label}<ChevronDown size={16} className={mobileGroup === group.label ? 'rotate-180' : ''}/>
                </button>
                {mobileGroup === group.label && <div className="flex flex-col gap-3 pb-4 pl-4">
                  {group.columns.flatMap(column => column.links).map(link => (
                    <a key={link.label} href={link.href} onClick={() => setMenuOpen(false)} className="text-[#77716c]">{link.label}</a>
                  ))}
                </div>}
              </div>
            ))}
            <a href={repository} className="py-3">GitHub</a>
            <Link href="/auth" className="py-3">Log in</Link>
            <Link href="/app" className="rounded-xl bg-[#1c1b1b] px-4 py-3 text-center text-white">Open Ocean</Link>
          </div>
        )}
      </header>

      <main>
        <section className="relative mx-auto flex min-h-[680px] max-w-6xl flex-col items-center justify-center px-6 pb-28 pt-28 text-center md:pt-36">
          <div className="mb-9 inline-flex items-center gap-2 rounded-full border border-[#e9e3df] bg-white px-4 py-2 text-xs font-semibold tracking-wide text-[#77716c]">
            <span className="h-2 w-2 rounded-full bg-[#e9561b]"/> THE OCEAN AGENT PLATFORM
          </div>
          <h1 className="max-w-5xl text-[clamp(3.25rem,7vw,6.5rem)] font-semibold leading-[1.06] tracking-[-0.065em]">
            One Agent.<br/><span className="text-[#e9561b]">Every Environment.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#77716c] md:text-xl">
            One shared intelligence across your tools and interfaces. Build, execute, and continue your work with Ocean.
          </p>
          <form onSubmit={openWorkspace} className="mt-12 w-full max-w-2xl rounded-[26px] border border-[#e8e2dd] bg-white p-4 text-left shadow-[0_18px_70px_rgba(39,26,16,0.07)] focus-within:border-[#e9561b]/50">
            <label htmlFor="ocean-prompt" className="sr-only">Your task for Ocean</label>
            <textarea id="ocean-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="What would you like to build?" rows={3} className="w-full resize-none bg-transparent px-2 py-1 text-base text-[#1c1b1b] outline-none placeholder:text-[#a7a19c]" />
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="pl-2 text-xs text-[#99918a]">Continue in the Ocean workspace</span>
              <button type="submit" aria-label="Continue to Ocean workspace" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1c1b1b] text-white transition-colors hover:bg-[#e9561b]"><ArrowUp size={21}/></button>
            </div>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="rounded-full border border-[#e8e2dd] bg-white px-5 py-2.5 text-sm font-medium hover:border-[#e9561b]">Explore Ocean <ArrowRight className="ml-1 inline" size={14}/></Link>
            <a href={repository} target="_blank" rel="noopener noreferrer" className="rounded-full px-5 py-2.5 text-sm font-medium hover:bg-black/5"><GitBranch className="mr-2 inline" size={16}/>View source</a>
          </div>
        </section>

        <section id="product" className="border-t border-[#eee9e5] bg-white px-6 py-28 scroll-mt-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">The platform</p>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">One core. Multiple ways to work.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#77716c]">Ocean brings execution, sessions, and extensibility into a shared architecture—not a collection of disconnected demos.</p>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {capabilities.map(({title, description, icon: Icon}) => (
                <article key={title} className="rounded-3xl border border-[#ece8e5] bg-[#fcfbf9] p-8">
                  <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0e9] text-[#e9561b]"><Icon size={24}/></div>
                  <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#77716c]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="developers" className="px-6 py-28 scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">For developers</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Built to be extended.</h2>
              <p className="mt-6 max-w-lg leading-8 text-[#77716c]">Explore the CLI, web host, shared runtime, and integration work in the open-source repository. Feature availability depends on your deployment and configuration.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#1c1b1b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e9561b]"><GitBranch size={17}/> Explore GitHub</a>
                <a href={documentation} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#ded8d3] px-6 py-3 text-sm font-semibold hover:bg-white"><BookOpen size={17}/> Read docs</a>
              </div>
            </div>
            <div className="rounded-3xl border border-[#302e2b] bg-[#1d1d1c] p-7 text-[#f4f0ec] shadow-xl md:p-10">
              <div className="mb-8 flex items-center gap-2 text-sm text-[#a9a29c]"><Terminal size={17}/> Ocean architecture</div>
              <div className="space-y-4 font-mono text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">CLI <span className="text-[#e9784b]">·</span> Web <span className="text-[#e9784b]">·</span> Other hosts</div>
                <div className="text-center text-[#e9784b]">↓</div>
                <div className="rounded-xl border border-[#e9784b]/40 bg-[#e9784b]/10 p-4 text-center">Shared Agent Core</div>
                <div className="text-center text-[#e9784b]">↓</div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">Sessions <span className="text-[#e9784b]">·</span> Tools <span className="text-[#e9784b]">·</span> Skills</div>
              </div>
              <p className="mt-6 text-xs leading-6 text-[#a9a29c]">Architecture direction; not a claim that every integration is production-ready.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#181817] px-6 pb-8 pt-20 text-[#f4f0eb]">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 border-b border-white/15 pb-20 lg:grid-cols-[1.1fr_2fr]">
            <div>
              <Link href="/" className="text-3xl font-bold tracking-[-0.07em]">Ocean<span className="text-[#e9561b]">.</span></Link>
              <p className="mt-5 max-w-xs text-sm leading-7 text-[#a8a39e]">One Agent Core.<br/>Multiple Hosts.<br/>Persistent Sessions.</p>
              <div className="mt-8 flex flex-wrap items-center gap-10" aria-label="Ocean social media">
                {socialProfiles.map(profile => {
                  const symbol = <img src={`/icons/social/${profile.slug}.svg`} alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 invert" />;
                  const className = "inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#d4d0cb] transition-opacity";
                  return profile.url
                    ? <a key={profile.label} href={profile.url} target="_blank" rel="noopener noreferrer" aria-label={profile.label} title={profile.label} className={`${className} hover:opacity-70`}>{symbol}</a>
                    : <span key={profile.label} aria-label={`${profile.label} — coming soon`} title={`${profile.label} · Coming soon`} className={`${className} cursor-default opacity-60`}>{symbol}</span>;
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4">
              {footerGroups.map(group => (
                <div key={group.heading}>
                  <h2 className="mb-6 text-xs font-semibold uppercase tracking-[0.12em] text-[#85817d]">{group.heading}</h2>
                  <ul className="space-y-4">
                    {group.links.map(link => (
                      <li key={link.label}><a href={link.href} className="text-sm leading-6 text-[#e6e2dd] transition-colors hover:text-[#f27b4a]">{link.label}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-6 pt-7 text-xs text-[#99938d] md:flex-row md:items-center md:justify-between">
            <span>© {new Date().getFullYear()} Ocean. Open-source project.</span>
            <div className="flex flex-wrap items-center gap-5">
              <a href={repository} target="_blank" rel="noopener noreferrer" className="hover:text-white">GitHub</a>
              <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer" className="hover:text-white">Feedback & issues</a>
              <div className="relative">
                <button type="button" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen} aria-label="Website language" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-[#e6e2dd] hover:border-white/50">
                  <Globe2 size={15}/> English <ChevronDown size={14} className={languageOpen ? 'rotate-180' : ''}/>
                </button>
                {languageOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-56 rounded-xl border border-white/15 bg-[#292827] p-2 shadow-xl">
                    <p className="px-3 py-2 text-xs text-[#a8a39e]">Website language</p>
                    <button type="button" onClick={() => setLanguageOpen(false)} className="w-full rounded-lg bg-white/10 px-3 py-2.5 text-left text-sm text-white">English · Current</button>
                    <p className="px-3 py-2 text-xs leading-5 text-[#a8a39e]">Additional translations are not available yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
