import Link from 'next/link';
import type { Metadata } from 'next';

const repository = 'https://github.com/PinkCar520/ocean';
export const metadata: Metadata = {
  title: 'Ocean Code',
  description: 'Explore the Ocean Code terminal agent, source code, runtime architecture, and setup documentation.',
};

export default function OceanCodePage() {
  return (
    <main className="min-h-screen bg-[#fcfbf9] text-[#1c1b1b]">
      <header className="border-b border-black/10 px-6 py-5">
        <nav aria-label="Ocean Code" className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-tight">Ocean<span className="text-[#e9561b]">.</span></Link>
          <Link href="/app" className="rounded-full bg-[#1c1b1b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e9561b]">Open workspace</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#e9561b]">Ocean Code · Terminal agent</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.06em] md:text-7xl">Bring an agent into your codebase.</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-[#6f6a65]">Explore Ocean Code, the terminal interface to the Ocean agent platform. Review the source and setup requirements before running it in your environment.</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href={repository} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1c1b1b] px-6 py-3 font-semibold text-white hover:bg-[#e9561b]">Explore source code</a>
          <a href={repository + '#readme'} target="_blank" rel="noopener noreferrer" className="rounded-full border border-black/20 px-6 py-3 font-semibold hover:border-[#e9561b]">Read setup guide</a>
        </div>
        <div className="mt-24 grid gap-5 md:grid-cols-3" aria-label="Ocean Code capabilities">
          {[
            { title: 'Work in a repository', body: 'Use the terminal host to explore code and work on development tasks, subject to configured tool permissions.' },
            { title: 'Continue a session', body: 'The shared runtime is designed around persistent sessions. Check the deployment and current implementation for supported recovery behavior.' },
            { title: 'Extend your tools', body: 'Discover Skills and MCP integrations, then configure and approve connections before they are used.' },
          ].map(item => <article key={item.title} className="rounded-3xl border border-[#e7e1dc] bg-white p-7"><h2 className="text-xl font-semibold">{item.title}</h2><p className="mt-4 leading-7 text-[#6f6a65]">{item.body}</p></article>)}
        </div>
        <section aria-labelledby="code-architecture" className="mt-24 border-t border-black/10 pt-20">
          <p className="text-xs font-bold uppercase tracking-widest text-[#e9561b]">Architecture</p>
          <h2 id="code-architecture" className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">One Agent Core. Multiple Hosts.</h2>
          <p className="mt-5 max-w-3xl leading-8 text-[#6f6a65]">Ocean Code is the CLI host. Ocean Workspace is the web host. Both are part of the project&apos;s shared runtime architecture; feature parity and production integration should be verified against the current source and tests.</p>
          <Link href="/#developers" className="mt-5 inline-block font-semibold text-[#ba4b20] underline underline-offset-4">Explore the architecture</Link>
        </section>
      </section>
    </main>
  );
}
