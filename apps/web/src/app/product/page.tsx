import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductSiteShell } from '../../components/ProductSiteShell';

export const metadata: Metadata = {
  title: 'Ocean AI — Intelligent work, built around you',
  description: 'Explore Ocean AI: the workspace, developer agent, shared context, tool integrations and the roadmap toward a unified AI assistant.',
  openGraph: { title: 'Ocean AI', description: 'A practical AI agent for work, powered by a shared core.' },
};

const capabilities = [
  { title: 'Conversations & workspace', status: 'Available foundation', description: 'Use the web workspace to interact with Ocean and organize ongoing work.', href: '/app' },
  { title: 'Ocean Code', status: 'Active development', description: 'A terminal agent for coding tasks, tools, permissions and developer workflows.', href: '/code' },
  { title: 'Tools, Skills & MCP', status: 'Implementation varies', description: 'Connect external capabilities to agent workflows, subject to host support and permission rules.', href: '/code#code-capabilities' },
  { title: 'Persistent context', status: 'Architecture in progress', description: 'Build toward recoverable sessions and context continuity across supported hosts.', href: 'https://github.com/PinkCar520/ocean/tree/main/docs/architecture/v2' },
];

const comparison = [
  ['Conversation experience', 'Conversation UX, continuity, reliability'],
  ['Projects & knowledge', 'Organizing work and scoped context'],
  ['Artifacts & outputs', 'Useful, reviewable results rather than chat alone'],
  ['Research & discovery', 'Grounded answers and connected information'],
  ['Developer agent', 'Coding workflows, tool use and approvals'],
  ['Extensibility', 'Skills, MCP and integrations'],
];

export default function OceanAIPage() {
  return (
    <ProductSiteShell active="/product">
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 md:pt-32">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c94b1a]">Ocean AI · Product direction</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] md:text-7xl">Intelligent work, built around you.</h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-[#625b55]">Ocean AI is the practical product line: conversations, workspaces, coding agents and tools that help people get work done. We study mature products such as Claude to set a high bar for usability and capability—not to claim feature parity.</p>
        <div className="mt-9 flex flex-wrap gap-3"><Link href="/app" className="rounded-full bg-[#211e1b] px-7 py-3 font-semibold text-white hover:bg-[#c94b1a]">Open Ocean Workspace</Link><Link href="/code" className="rounded-full border border-[#d5cec6] px-7 py-3 font-semibold hover:border-[#c94b1a]">Explore Ocean Code</Link></div>
      </section>
      <section aria-labelledby="capabilities-title" className="border-y border-[#e7e1da] bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#c94b1a]">What we're building</p>
          <h2 id="capabilities-title" className="mt-4 text-4xl font-semibold tracking-tight">A useful AI product, not just a chat box.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">{capabilities.map(item => <article key={item.title} className="rounded-2xl border border-[#e7e1da] bg-[#fcfbf9] p-7"><p className="text-xs font-semibold uppercase tracking-wider text-[#ad522b]">{item.status}</p><h3 className="mt-3 text-2xl font-semibold">{item.title}</h3><p className="mt-3 leading-7 text-[#625b55]">{item.description}</p><Link href={item.href} className="mt-6 inline-block font-semibold text-[#aa461d] underline underline-offset-4">Explore this area</Link></article>)}</div>
        </div>
      </section>
      <section aria-labelledby="benchmark-title" className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-bold uppercase tracking-widest text-[#c94b1a]">Product benchmark</p>
        <h2 id="benchmark-title" className="mt-4 text-4xl font-semibold tracking-tight">Learn from Claude. Build Ocean's own experience.</h2>
        <p className="mt-5 max-w-3xl leading-8 text-[#625b55]">Claude is a reference for the breadth and quality of a modern AI product. The areas below are evaluation priorities, not claims that Ocean already matches them.</p>
        <div className="mt-9 grid gap-3 md:grid-cols-2">{comparison.map(([title,description]) => <div key={title} className="rounded-xl border border-[#e7e1da] p-5"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-[#625b55]">{description}</p></div>)}</div>
      </section>
      <section className="bg-[#211e1b] px-6 py-20 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-widest text-[#ff9a6e]">Beyond the screen</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">Today's product is the foundation for tomorrow's interactions.</h2><p className="mt-5 max-w-2xl leading-8 text-[#d6d0cb]">Ocean One explores how this intelligence could become context-aware and present in everyday environments—with user control at its center.</p><Link href="/one" className="mt-8 inline-block rounded-full bg-white px-7 py-3 font-semibold text-[#211e1b] hover:bg-[#ffe4d7]">Discover Ocean One</Link></div></section>
    </ProductSiteShell>
  );
}
