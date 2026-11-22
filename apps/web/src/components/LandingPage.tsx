'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Blocks, BookOpen, Cpu, Github, History, Menu, Terminal, X } from 'lucide-react';

const repository = 'https://github.com/PinkCar520/ocean';
const documentation = `${repository}#readme`;

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
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#fcfbf9]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-6 px-6 md:px-10" aria-label="Main navigation">
          <Link href="/" className="text-2xl font-bold tracking-[-0.07em]" aria-label="Ocean home">Ocean<span className="text-[#ed5b20]">.</span></Link>
          <div className="hidden items-center gap-9 text-sm font-medium text-[#4b4947] md:flex">
            <a href="#product" className="hover:text-[#e9561b]">Product</a>
            <a href="#developers" className="hover:text-[#e9561b]">Developers</a>
            <a href={documentation} target="_blank" rel="noopener noreferrer" className="hover:text-[#e9561b]">Docs</a>
            <a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#e9561b]">GitHub <ArrowRight size={14}/></a>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/auth" className="rounded-full px-4 py-2.5 text-sm font-medium hover:bg-black/5">Log in</Link>
            <Link href="/app" className="rounded-full bg-[#1c1b1b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e9561b]">Open Ocean <ArrowRight className="ml-1 inline" size={15}/></Link>
          </div>
          <button type="button" className="rounded-lg p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={24}/> : <Menu size={24}/>}
          </button>
        </nav>
        {menuOpen && (
          <div className="flex flex-col gap-1 border-t border-black/10 px-6 py-3 text-sm md:hidden">
            <a href="#product" onClick={() => setMenuOpen(false)} className="py-3">Product</a>
            <a href="#developers" onClick={() => setMenuOpen(false)} className="py-3">Developers</a>
            <a href={documentation} className="py-3">Docs</a>
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
            <a href={repository} target="_blank" rel="noopener noreferrer" className="rounded-full px-5 py-2.5 text-sm font-medium hover:bg-black/5"><Github className="mr-2 inline" size={16}/>View source</a>
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
                <a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#1c1b1b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e9561b]"><Github size={17}/> Explore GitHub</a>
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

      <footer className="border-t border-[#eae5e0] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 text-sm text-[#77716c] md:flex-row md:items-center">
          <Link href="/" className="text-lg font-bold tracking-tight text-[#1c1b1b]">Ocean<span className="text-[#e9561b]">.</span></Link>
          <p>One Agent Core. Multiple Hosts. Persistent Sessions.</p>
          <div className="flex gap-5"><Link href="/app" className="hover:text-[#e9561b]">Workspace</Link><a href={documentation} className="hover:text-[#e9561b]">Docs</a><a href={repository} className="hover:text-[#e9561b]">GitHub</a></div>
        </div>
      </footer>
    </div>
  );
}
