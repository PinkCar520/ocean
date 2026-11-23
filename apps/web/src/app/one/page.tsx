import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductSiteShell } from '../../components/ProductSiteShell';

export const metadata: Metadata = {
  title: 'Ocean One — Ambient intelligence, explored',
  description: 'Ocean One explores context-aware, permission-first ambient AI: sensing, understanding and acting across devices and environments.',
  openGraph: { title: 'Ocean One — Ambient intelligence', description: 'Exploring the next form of human–AI interaction.' },
};

const principles = [
  { number: '01', title: 'Perceive', subtitle: 'Understand the environment', description: 'With explicit permission, collect relevant signals such as device state, time, location or nearby context. No always-on collection is assumed.' },
  { number: '02', title: 'Understand', subtitle: 'Build situational context', description: 'Combine observations, personal preferences and current intent. Keep uncertainty visible rather than pretending the agent knows everything.' },
  { number: '03', title: 'Act', subtitle: 'Help at the right moment', description: 'Suggest next steps or coordinate supported tools. Require confirmation for consequential actions, with clear ways to stop or undo.' },
];

const scenarios = [
  { title: 'Leaving home', signal: 'Calendar + device state', action: 'Offer a departure checklist and suggest supported device actions.', control: 'Ask before controlling devices.' },
  { title: 'Focused work', signal: 'Active task + workspace context', action: 'Surface relevant files and next steps without requiring a new prompt.', control: 'Respect notification and context boundaries.' },
  { title: 'Daily routines', signal: 'Time + opted-in habits', action: 'Offer timely reminders and lightweight assistance.', control: 'Let people tune, pause or disable proactive behavior.' },
];

export default function OceanOnePage() {
  return (
    <ProductSiteShell active="/one">
      <section className="relative overflow-hidden bg-[#201e1c] px-6 py-24 text-white md:py-32">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-0 h-[430px] w-[430px] rounded-full bg-[#d95e2a]/25 blur-[95px] md:h-[620px] md:w-[620px]" />
        <div className="relative mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff9c70]">Ocean One · Exploratory concept</p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] md:text-7xl">What if intelligence understood the moment?</h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-[#d8d1ca]">Ocean One explores a future beyond opening an app and typing a prompt: an ambient AI companion that understands context, offers help when it matters and remains under your control.</p>
          <div className="mt-10 flex flex-wrap gap-3"><a href="#how-it-works" className="rounded-full bg-[#e9561b] px-7 py-3 font-semibold text-white hover:bg-[#cf4917]">Explore the concept</a><Link href="/product" className="rounded-full border border-white/30 px-7 py-3 font-semibold text-white hover:border-white">See Ocean AI today</Link></div>
          <p className="mt-9 max-w-2xl border-l-2 border-[#ff9c70] pl-4 text-sm leading-6 text-[#d8d1ca]">Research direction, not a released device. Hardware design, sensors, proactive behaviors and cross-device automations shown here are concepts, not shipping features.</p>
        </div>
      </section>
      <section id="how-it-works" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <p className="text-xs font-bold uppercase tracking-widest text-[#c94b1a]">The interaction model</p>
        <h2 id="how-title" className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">From asking for help to being understood.</h2>
        <p className="mt-5 max-w-3xl leading-8 text-[#625b55]">The goal is not constant interruption. It is relevant, timely assistance based on trusted context and clear permission boundaries.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">{principles.map(item => <article key={item.number} className="rounded-2xl border border-[#e7e1da] bg-white p-7"><span className="text-4xl font-semibold text-[#dc6536]">{item.number}</span><h3 className="mt-6 text-2xl font-semibold">{item.title}</h3><p className="mt-1 font-medium text-[#b44e23]">{item.subtitle}</p><p className="mt-4 leading-7 text-[#625b55]">{item.description}</p></article>)}</div>
      </section>
      <section aria-labelledby="scenarios-title" className="bg-[#f0ebe5] px-6 py-24"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-widest text-[#c94b1a]">Experience explorations</p><h2 id="scenarios-title" className="mt-4 text-4xl font-semibold tracking-tight">Everyday moments, reimagined.</h2><div className="mt-10 grid gap-5 md:grid-cols-3">{scenarios.map(item => <article key={item.title} className="rounded-2xl bg-white p-7"><h3 className="text-2xl font-semibold">{item.title}</h3><p className="mt-4 text-sm font-semibold text-[#b44e23]">Possible context · {item.signal}</p><p className="mt-4 leading-7 text-[#625b55]">{item.action}</p><p className="mt-6 border-t border-[#e7e1da] pt-4 text-sm text-[#625b55]"><strong className="text-[#211e1b]">User control:</strong> {item.control}</p></article>)}</div><p className="mt-6 text-sm text-[#625b55]">Illustrative scenarios only; integrations and device controls require future implementation and validation.</p></div></section>
      <section aria-labelledby="trust-title" className="mx-auto max-w-6xl px-6 py-24"><p className="text-xs font-bold uppercase tracking-widest text-[#c94b1a]">Designed around trust</p><h2 id="trust-title" className="mt-4 text-4xl font-semibold tracking-tight">Awareness requires boundaries.</h2><div className="mt-8 grid gap-5 md:grid-cols-2">{[['Opt-in sensing', 'Only access context and sensors that a person explicitly enables.'], ['Transparent reasoning', 'Explain what signals informed a suggestion, and surface uncertainty.'], ['Approval before action', 'Seek confirmation for device control, purchases and other consequential operations.'], ['Pause, revoke and delete', 'Design controls to stop observation and revoke permissions.']].map(([title,description]) => <div key={title} className="rounded-xl border border-[#e7e1da] p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 leading-7 text-[#625b55]">{description}</p></div>)}</div></section>
      <section className="bg-[#211e1b] px-6 py-20 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-widest text-[#ff9c70]">One intelligence, multiple environments</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">Ocean AI is the foundation. Ocean One is the exploration.</h2><p className="mt-5 max-w-2xl leading-8 text-[#d8d1ca]">A shared Agent Core can eventually connect conversations, context, tools and real-world interactions without forcing people to start over in each environment.</p><Link href="/product" className="mt-8 inline-block rounded-full bg-white px-7 py-3 font-semibold text-[#211e1b] hover:bg-[#ffe4d7]">Explore Ocean AI</Link></div></section>
    </ProductSiteShell>
  );
}
