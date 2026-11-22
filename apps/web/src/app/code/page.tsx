import Link from 'next/link';
import { CopyCommandButton } from '../../components/CopyCommandButton';
import type { Metadata } from 'next';

const repository = 'https://github.com/PinkCar520/ocean';
export const metadata: Metadata = {
  title: 'Ocean Code',
  description: 'Explore the Ocean Code terminal agent, source code, runtime architecture, and setup documentation.',
  keywords: ['Ocean Code', 'AI coding agent', 'terminal agent', 'MCP', 'Skills'],
  twitter: { card: 'summary_large_image', title: 'Ocean Code — Terminal agent' },
  openGraph: { title: 'Ocean Code — Terminal agent', description: 'Bring an agent into your codebase.' },
};

export default function OceanCodePage() {
  return (
    <main className="min-h-screen bg-[#fcfbf9] text-[#1c1b1b]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:shadow-lg">Skip to main content</a>
      <header className="border-b border-black/10 px-6 py-5">
        <nav aria-label="Ocean Code" className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-tight">Ocean<span className="text-[#e9561b]">.</span></Link>
          <div className="flex items-center gap-5"><a href={repository} target="_blank" rel="noopener noreferrer" className="hidden text-sm font-medium text-[#6f6a65] hover:text-[#e9561b] md:inline">GitHub</a><Link href="/#ocean-code" className="hidden text-sm font-medium text-[#6f6a65] hover:text-[#e9561b] sm:inline">Product overview</Link><Link href="/app" className="rounded-full bg-[#1c1b1b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e9561b]">Open workspace</Link></div>
        </nav>
      </header>
      <section id="main-content" tabIndex={-1} aria-labelledby="code-hero-title" className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[#6f6a65]"><Link href="/" className="underline underline-offset-4 hover:text-[#e9561b] focus-visible:outline-2 focus-visible:outline-[#e9561b]">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">Ocean Code</span></nav>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#e9561b]">Ocean Code · Terminal agent</p>
        <h1 id="code-hero-title" className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl md:text-7xl">Bring an agent into your codebase.</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-[#6f6a65]">Explore Ocean Code, the terminal interface to the Ocean agent platform. Review the source and setup requirements before running it in your environment.</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href="#code-start" className="rounded-full border border-[#e9561b] px-6 py-3 font-semibold text-[#ba4b20] hover:bg-[#fff0e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]">Getting started</a>
          <a href={repository} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1c1b1b] px-6 py-3 font-semibold text-white hover:bg-[#e9561b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]" aria-label="Explore Ocean source code on GitHub">Explore source code</a>
          <a href={repository + '#readme'} target="_blank" rel="noopener noreferrer" className="rounded-full border border-black/20 px-6 py-3 font-semibold hover:border-[#e9561b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]">Read repository README</a>
        </div>
        <nav aria-label="On this page" className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[#6f6a65]">
          <a className="hover:text-[#e9561b] focus-visible:underline" href="#code-capabilities">Capabilities</a>
          <a className="hover:text-[#e9561b] focus-visible:underline" href="#code-architecture">Architecture</a>
          <a className="hover:text-[#e9561b] focus-visible:underline" href="#code-start">Getting started</a>
          <a className="hover:text-[#e9561b] focus-visible:underline" href="#code-resources">Resources</a>
          <a className="hover:text-[#e9561b] focus-visible:underline" href="#code-faq">FAQ</a>
        </nav>
        <div id="code-capabilities" className="mt-24 grid scroll-mt-24 gap-5 md:grid-cols-3" aria-label="Ocean Code capabilities and deployment considerations">
          {[
            { title: 'Work in a repository', body: 'Use the terminal host to explore code and work on development tasks, subject to configured tool permissions.' },
            { title: 'Continue a session', body: 'The shared runtime is designed around persistent sessions. Session persistence and recovery depend on the host and current implementation. Verify behavior in your deployment.' },
            { title: 'Extend your tools', body: 'Discover Skills and MCP integrations, then configure and explicitly authorize connections before use.' },
          ].map(item => <article key={item.title} className="rounded-3xl border border-[#e7e1dc] bg-white p-7"><h2 className="text-xl font-semibold">{item.title}</h2><p className="mt-4 leading-7 text-[#6f6a65]">{item.body}</p></article>)}
        </div>
        <section id="code-architecture" aria-labelledby="code-architecture-title" className="mt-24 scroll-mt-24 border-t border-black/10 pt-20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#e9561b]">Architecture</p>
          <h2 id="code-architecture-title" className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">One Agent Core. Multiple Hosts.</h2>
          <p className="mt-5 max-w-3xl leading-8 text-[#6f6a65]">Ocean Code is the CLI host. Ocean Workspace is the web host. Both are part of the project&apos;s shared runtime architecture; feature parity and production integration should be verified against the current source and tests.</p>
          <Link href="/#developers" className="mt-5 inline-block font-semibold text-[#ba4b20] underline underline-offset-4">Explore the architecture</Link>
        </section>
        <section aria-labelledby="code-commands-title" className="mt-24 rounded-3xl bg-[#1c1b1b] p-8 text-white md:p-12">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ff9c70]">Local development</p>
          <h2 id="code-commands-title" className="mt-3 text-3xl font-semibold">Try Ocean Code locally.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-[#d4cec8]">From a checked-out Ocean repository with dependencies and environment configured, use the CLI development command documented in the README.</p>
          <ol className="mt-7 space-y-4">
            {[
              { label: '1. Install workspace dependencies', command: 'pnpm install' },
              { label: '2. Create your local configuration', command: 'cp .env.example .env' },
              { label: '3. Start the CLI development host', command: 'pnpm --filter @ocean/cli dev' },
              { label: '4. Run CLI tests', command: 'pnpm --filter @ocean/cli test' },
            ].map(step => (
              <li key={step.command}>
                <p className="mb-2 text-sm text-[#d4cec8]">{step.label}</p>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/15 bg-black/30 px-5 py-4">
                  <code className="overflow-x-auto font-mono text-sm text-[#ffe5d8]">{step.command}</code>
                  <CopyCommandButton command={step.command} />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-[#bcb7b2]">Requires Node.js, pnpm, configured model credentials and any services required by your selected host.</p>
        </section>
        <section id="code-start" aria-labelledby="code-start-title" className="mt-24 scroll-mt-24 border-t border-black/10 pt-20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#e9561b]">Getting started</p>
          <h2 id="code-start-title" className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Start from the source.</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ['01', 'Review requirements', 'Read the repository documentation for supported Node.js versions, package management and host configuration.'],
              ['02', 'Configure your environment', 'Set up a supported model provider, keep credentials out of source control, and review tool permissions according to the documented configuration.'],
              ['03', 'Run and verify', 'Follow the current CLI instructions and confirm the capabilities you need in your environment.'],
            ].map(([number, title, body]) => <li key={number} className="rounded-2xl bg-[#f1eeea] p-6"><span className="text-sm font-bold text-[#e9561b]">{number}</span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-[#6f6a65]">{body}</p></li>)}
          </ol>
        </section>
        <section aria-labelledby="code-permissions" className="mt-24 rounded-3xl bg-[#1c1b1b] p-8 text-white md:p-12">
          <h2 id="code-permissions" className="text-3xl font-semibold">Your environment. Your permissions.</h2>
          <p className="mt-5 max-w-3xl leading-8 text-[#d4cec8]">Model access, file changes, shell execution and external integrations depend on how your installation is configured. Review commands and approvals before granting access to sensitive projects.</p>
          <a href={repository + '/issues'} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-[#ffad87] underline underline-offset-4">Report a non-sensitive issue on GitHub</a>
        </section>
        <section id="code-resources" aria-labelledby="code-resources-title" className="mt-24 scroll-mt-24 border-t border-black/10 pt-20">
          <h2 id="code-resources-title" className="text-3xl font-semibold">Developer resources</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              ['Source repository', repository],
              ['Setup and README', repository + '#readme'],
              ['Releases', repository + '/releases'],
              ['Issues and feedback', repository + '/issues'],
              ['Contributing', repository + '/blob/main/CONTRIBUTING.md'],
            ].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-[#e7e1dc] bg-white px-6 py-5 font-medium hover:border-[#e9561b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]">{label}<span aria-hidden="true">↗</span></a>)}
          </div>
        </section>
        <section id="code-faq" aria-labelledby="code-faq-title" className="mt-24 scroll-mt-24 border-t border-black/10 pt-20">
          <h2 id="code-faq-title" className="text-3xl font-semibold">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-[#e7e1dc]">
            {[
              ['Is Ocean Code a model?', 'No. It is a terminal agent interface. Configure a supported model provider and credentials separately.'],
              ['Are Skills and MCP servers enabled by default?', 'Not necessarily. Their availability depends on installation, configuration and permissions.'],
              ['Does Ocean Code share everything with the web workspace?', 'The architecture aims to share an Agent Core. Cross-host parity is an architecture goal, not a blanket guarantee. Verify behavior against the current implementation and tests.'],
            ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="cursor-pointer rounded font-semibold focus-visible:outline-2 focus-visible:outline-[#e9561b]">{question}</summary><p className="mt-4 max-w-3xl leading-7 text-[#6f6a65]">{answer}</p></details>)}
          </div>
        </section>
        <section className="mt-24 rounded-3xl bg-[#f0ebe5] p-8 md:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to explore Ocean?</h2>
          <p className="mt-4 max-w-2xl leading-7 text-[#6f6a65]">Start with the open-source CLI or open the Ocean web workspace.</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href={repository + '#readme'} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1c1b1b] px-6 py-3 font-semibold text-white hover:bg-[#e9561b]" aria-label="CLI documentation on GitHub (opens in a new tab)">CLI documentation</a><Link href="/app" className="rounded-full border border-black/20 px-6 py-3 font-semibold hover:border-[#e9561b]">Open workspace</Link></div>
        </section>
        <div className="mt-14 text-right"><a href="#main-content" className="text-sm font-semibold text-[#ba4b20] underline underline-offset-4">Back to top</a></div>
      </section>
    </main>
  );
}
