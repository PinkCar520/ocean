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
      </section>
    </main>
  );
}
