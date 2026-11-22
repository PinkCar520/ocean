'use client';

import { FormEvent, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Blocks, BookOpen, ChevronDown, Globe2, Cpu, History, Menu, Terminal, X, FolderKanban, MessagesSquare, PlugZap, ShieldCheck } from 'lucide-react';

const repository = 'https://github.com/PinkCar520/ocean';
const documentation = `${repository}#readme`;

const navigationGroups = [
  { label: 'Product', columns: [
    { heading: 'Experience', links: [{ label: 'Ocean Workspace', href: '/app' }, { label: 'Ocean Code', href: '/code' }, { label: 'Conversations', href: '/app/chats' }, { label: 'Projects', href: '/app/projects' }] },
    { heading: 'Capabilities', links: [{ label: 'Agent Core', href: '/#product' }, { label: 'Ocean Code', href: '/code' }, { label: 'Capabilities', href: '/#features' }, { label: 'Skills', href: '/app/skills' }, { label: 'Workflows', href: '/app/workflows' }] },
    { heading: 'Explore', links: [{ label: 'Platform overview', href: '/#product' }, { label: 'Capability explorer', href: '/#features' }, { label: 'What you can do', href: '/#use-cases' }, { label: 'Architecture', href: '/#developers' }] },
  ] },
  { label: 'Developers', columns: [
    { heading: 'Build', links: [{ label: 'Ocean Code CLI', href: '/code' }, { label: 'Developer overview', href: '/#developers' }, { label: 'CLI setup', href: '/code#code-commands' }, { label: 'Source code', href: repository }, { label: 'Documentation', href: documentation }] },
    { heading: 'Architecture', links: [{ label: 'Shared Agent Core', href: '/#product' }, { label: 'CLI and Web hosts', href: '/#developers' }] },
  ] },
  { label: 'Resources', columns: [
    { heading: 'Learn', links: [{ label: 'Documentation', href: documentation }, { label: 'FAQ', href: '/#faq' }, { label: 'Releases', href: `${repository}/releases` }, { label: 'Report an issue', href: `${repository}/issues/new` }, { label: 'Contributing guide', href: `${repository}/blob/main/CONTRIBUTING.md` }, { label: 'Source code', href: repository }] },
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
  { heading: 'Developers', links: [{ label: 'Ocean Code setup', href: '/code#code-commands' }, { label: 'Documentation', href: documentation }, { label: 'Source code', href: repository }, { label: 'Issues', href: `${repository}/issues` }, { label: 'Releases', href: `${repository}/releases` }] },
  { heading: 'Resources', links: [{ label: 'Get started', href: '/#get-started' }, { label: 'FAQ', href: '/#faq' }, { label: 'Sign in', href: '/auth' }, { label: 'README', href: documentation }, { label: 'Contribute', href: `${repository}/blob/main/CONTRIBUTING.md` }] },
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

const useCases = [
  {
    eyebrow: 'BUILD',
    title: 'Turn an idea into working code.',
    description: 'Bring a task into the Ocean workspace, then continue the work in a conversation. Explore the CLI and its source in the open repository.',
    icon: Terminal,
    href: '/app',
    action: 'Open workspace',
  },
  {
    eyebrow: 'ORGANIZE',
    title: 'Keep work in context.',
    description: 'Use conversations and projects to organize ongoing work rather than treating every task as a fresh start.',
    icon: FolderKanban,
    href: '/app/projects',
    action: 'Explore projects',
  },
  {
    eyebrow: 'EXTEND',
    title: 'Connect the tools you need.',
    description: 'Discover Skills and integrations in the workspace. Available connections depend on your deployment and configuration.',
    icon: PlugZap,
    href: '/app/integrations',
    action: 'Explore integrations',
  },
];

const productSurfaces = [
  { name: 'Ocean Code', tag: 'TERMINAL', title: 'Work directly in your codebase.', description: 'Explore the terminal agent, its configuration and available commands in the open-source repository.', href: '/code', action: 'Explore Ocean Code', icon: Terminal },
  { name: 'Ocean Workspace', tag: 'WEB', title: 'A home for conversations and projects.', description: 'Move from a question to an ongoing conversation, with access to projects and the features enabled on your host.', href: '/app', action: 'Open workspace', icon: MessagesSquare },
  { name: 'Skills & MCP', tag: 'EXTENSIONS', title: 'Extend the agent on your terms.', description: 'Discover supported Skills and integrations. Configure connections and review permissions before use.', href: '/app/integrations', action: 'Explore integrations', icon: PlugZap },
] as const;

const taskExamples = [
  { label: 'Build', prompt: 'Help me plan and implement a small web application, starting with the project structure.' },
  { label: 'Debug', prompt: 'Investigate a failing test, identify the root cause, and suggest a minimal fix.' },
  { label: 'Understand', prompt: 'Explain the architecture of this project and identify its main entry points.' },
  { label: 'Plan', prompt: 'Break this feature into an implementation plan with testable milestones.' },
  { label: 'Review', prompt: 'Review this code change for correctness, security risks, and missing tests.' },
  { label: 'Document', prompt: 'Help me write clear documentation for this project, including setup and usage.' },
];

const featureDetails = [
  { id: 'sessions', label: 'Sessions', heading: 'Keep the thread of your work.', body: 'Organize conversations and revisit ongoing work in the Ocean workspace. Persistence and cross-host continuity depend on the deployed runtime.', steps: ['Start a conversation', 'Return to your history', 'Continue with the available context'], href: '/app/chats', action: 'Explore conversations' },
  { id: 'skills', label: 'Skills', heading: 'Bring specialized instructions to the task.', body: 'Discover Skills from the workspace and review the open-source implementation. Skill availability varies by installation.', steps: ['Browse available Skills', 'Review the skill configuration', 'Use supported capabilities in your environment'], href: '/app/skills', action: 'Explore Skills' },
  { id: 'integrations', label: 'Integrations', heading: 'Connect the tools around your work.', body: 'Explore integrations and MCP configuration. A connection must be installed and configured before Ocean can use it.', steps: ['Discover integrations', 'Configure supported connections', 'Review permissions before use'], href: '/app/integrations', action: 'Explore integrations' },
  { id: 'developers', label: 'Developer tools', heading: 'See how Ocean is built.', body: 'Inspect the CLI, Web host and shared Agent Core in the repository. The public source is the reference for implementation status.', steps: ['Read the repository overview', 'Inspect the host architecture', 'Follow the setup instructions'], href: documentation, action: 'Read developer docs' },
] as const;

const commonQuestions = [
  { question: 'Is Ocean an AI model?', answer: 'Ocean is an agent application and execution architecture, not a foundation model. Model availability depends on your deployment configuration.' },
  { question: 'Can I use Ocean from the terminal?', answer: 'Ocean includes a CLI. Review the repository README for current setup requirements and supported commands.' },
  { question: 'Do Skills and MCP connections work automatically?', answer: 'No. Extensions must be available, configured and permitted in your environment before they can be used.' },
  { question: 'Will a task started here run immediately?', answer: 'No. The homepage passes your prompt to the workspace. Authentication and actual execution happen there.' },
  { question: 'Where should I report a security vulnerability?', answer: 'Check the repository security policy or use GitHub private vulnerability reporting if enabled. Avoid publishing sensitive exploit details in a public issue.' },
  { question: 'Where can I report a problem?', answer: 'Use the public GitHub issue tracker to report reproducible problems and suggest improvements.' },
  { question: 'Where can I review the license?', answer: 'See the repository license file and applicable notices before reusing or redistributing Ocean code.' },
  { question: 'Is every capability production ready?', answer: 'No. Review the current source, release notes and deployment configuration to understand which capabilities are available and tested.' },
] as const;

const waysToWork = [
  {
    title: 'Talk through a task',
    description: 'Start with a question, refine the request, and keep the discussion in a conversation.',
    icon: MessagesSquare,
    href: '/app/chats',
    action: 'Conversations',
  },
  {
    title: 'Give Ocean more capabilities',
    description: 'Find Skills and integration settings without leaving the workspace.',
    icon: Blocks,
    href: '/app/skills',
    action: 'Explore Skills',
  },
  {
    title: 'Understand the system',
    description: 'Review the architecture, source code, and project status before relying on a capability.',
    icon: ShieldCheck,
    href: documentation,
    action: 'Read documentation',
  },
];

export function LandingPage() {
  const [prompt, setPrompt] = useState('');
  const [activeFeature, setActiveFeature] = useState<(typeof featureDetails)[number]['id']>('sessions');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);

  function selectFeatureWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? featureDetails.length - 1 :
      (index + (event.key === 'ArrowRight' ? 1 : -1) + featureDetails.length) % featureDetails.length;
    const next = featureDetails[nextIndex];
    setActiveFeature(next.id);
    document.getElementById(`feature-tab-${next.id}`)?.focus();
  }

  function openWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The workspace owns authentication and execution. The landing page never
    // calls a model or simulates a response. A prompt is a navigation hint only.
    const target = prompt.trim()
      ? `/app?prompt=${encodeURIComponent(prompt.trim().slice(0, 8000))}`
      : '/app';
    window.location.assign(target);
  }

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-[#1c1b1b] selection:bg-[#ffdfcf]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:shadow-lg">Skip to main content</a>
      <header onKeyDown={event => { if (event.key === "Escape") { setActiveMenu(null); setMenuOpen(false); setMobileGroup(null); } }} onMouseLeave={() => setActiveMenu(null)} className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#fcfbf9]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-6 px-6 md:px-10" aria-label="Main navigation">
          <Link href="/" className="text-2xl font-bold tracking-[-0.07em]" aria-label="Ocean home">Ocean<span className="text-[#ed5b20]">.</span></Link>
          <div className="hidden h-full items-center gap-8 text-sm font-medium text-[#4b4947] md:flex">
            {navigationGroups.map(group => (
              <button key={group.label} type="button"
                className={`flex h-full items-center gap-1.5 border-b-2 transition-colors ${activeMenu === group.label ? 'border-[#e9561b] text-[#e9561b]' : 'border-transparent hover:text-[#e9561b]'}`}
                aria-expanded={activeMenu === group.label} aria-haspopup="true" aria-controls="ocean-mega-menu"
                onMouseEnter={() => setActiveMenu(group.label)}
                onFocus={() => setActiveMenu(group.label)}
                onClick={() => setActiveMenu(activeMenu === group.label ? null : group.label)}>
                {group.label}<ChevronDown size={14} className={activeMenu === group.label ? 'rotate-180 transition-transform' : 'transition-transform'}/>
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/auth" className="rounded-full px-4 py-2.5 text-sm font-medium hover:bg-black/5">Log in</Link>
            <Link href="/app" className="rounded-full bg-[#1c1b1b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e9561b]">Open Ocean <ArrowRight className="ml-1 inline" size={15}/></Link>
          </div>
          <button type="button" className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b] md:hidden" onClick={() => { setMenuOpen(!menuOpen); setActiveMenu(null); }} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="ocean-mobile-navigation">
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
          <div id="ocean-mobile-navigation" role="navigation" aria-label="Mobile navigation" className="flex flex-col gap-1 border-t border-black/10 px-6 py-3 text-sm md:hidden">
            {navigationGroups.map(group => (
              <div key={group.label} className="border-b border-black/5">
                <button type="button" className="flex w-full items-center justify-between py-3 text-left font-medium"
                  aria-expanded={mobileGroup === group.label} onClick={() => setMobileGroup(mobileGroup === group.label ? null : group.label)}>
                  {group.label}<ChevronDown size={16} className={mobileGroup === group.label ? 'rotate-180' : ''}/>
                </button>
                {mobileGroup === group.label && <div className="flex flex-col gap-3 pb-4 pl-4">
                  {group.columns.flatMap(column => column.links).map(link => (
                    <a key={link.label} href={link.href} onClick={() => { setMenuOpen(false); setMobileGroup(null); }} className="rounded text-[#77716c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]">{link.label}</a>
                  ))}
                </div>}
              </div>
            ))}
            <Link href="/auth" className="py-3">Log in</Link>
            <Link href="/app" className="rounded-xl bg-[#1c1b1b] px-4 py-3 text-center text-white">Open Ocean</Link>
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
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
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Try an example task">
            {taskExamples.map(example => (
              <button key={example.label} type="button" aria-pressed={prompt === example.prompt} title={`Use ${example.label} example`} onClick={() => { setPrompt(example.prompt); document.getElementById("ocean-prompt")?.focus(); }}
                className="rounded-full border border-[#e8e2dd] bg-white px-4 py-2 text-sm font-medium text-[#5b5550] transition-colors hover:border-[#e9561b] hover:text-[#b34e28] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]">
                {example.label}
              </button>
            ))}
          </div>
          <form onSubmit={openWorkspace} className="mt-5 w-full max-w-2xl rounded-[26px] border border-[#e8e2dd] bg-white p-4 text-left shadow-[0_18px_70px_rgba(39,26,16,0.07)] focus-within:border-[#e9561b]/50">
            <label htmlFor="ocean-prompt" className="sr-only">Your task for Ocean</label>
            <textarea id="ocean-prompt" aria-describedby="ocean-prompt-hint" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={8000} placeholder="What would you like to build?" rows={3} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="w-full resize-none bg-transparent px-2 py-1 text-base text-[#1c1b1b] outline-none placeholder:text-[#a7a19c]" />
            <div className="flex items-center justify-between gap-3 pt-2">
              <span id="ocean-prompt-hint" aria-live="off" className="pl-2 text-xs text-[#99918a]">Continue in Ocean · {prompt.length.toLocaleString()}/8,000</span>
              <button type="submit" aria-label="Continue to Ocean workspace" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1c1b1b] text-white transition-colors hover:bg-[#e9561b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b]"><ArrowUp size={21}/></button>
            </div>
          </form>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-[#99918a]">Your draft opens in the Ocean workspace for review. Nothing is sent to a model from this page. Your text remains editable before you send it. Press Ctrl+Enter (or ⌘+Enter on Mac) to continue. You can also use the arrow button.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="rounded-full border border-[#e8e2dd] bg-white px-5 py-2.5 text-sm font-medium hover:border-[#e9561b]">Explore Ocean <ArrowRight className="ml-1 inline" size={14}/></Link>
          </div>
        </section>

        <section id="ocean-code" className="scroll-mt-20 border-t border-[#eee9e5] bg-[#171716] px-6 py-24 text-[#f7f4f0] md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff9c70]">Meet Ocean</p>
            <div className="mt-5 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">One platform. The tools you already use.</h2>
              <p className="max-w-sm text-sm leading-7 text-[#b5ada6]">Discover the real product surfaces behind Ocean, from terminal workflows to the web workspace.</p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {productSurfaces.map(({name, tag, title, description, href, action, icon: Icon}) => (
                <article key={name} className="flex flex-col rounded-[28px] border border-white/15 bg-white/[0.045] p-7 transition-colors hover:border-[#ed865b]/50">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-[#ff9c70]"><Icon size={23}/></span>
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-[#a9a29c]">{tag}</span>
                  </div>
                  <p className="mt-9 text-sm font-semibold text-[#ff9c70]">{name}</p>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.04em]">{title}</h3>
                  <p className="mt-4 flex-1 text-sm leading-7 text-[#b5ada6]">{description}</p>
                  <a href={href} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[#ff9c70]">{action}<ArrowRight size={16}/></a>
                </article>
              ))}
            </div>
            <div className="mt-8 rounded-[24px] border border-white/10 bg-[#222120] px-6 py-5 md:flex md:items-center md:justify-between md:gap-6">
              <div><p className="text-sm font-semibold">Built in the open</p><p className="mt-1 text-xs leading-6 text-[#b5ada6]">Review the source and development status before adopting a capability.</p></div>
              <a href={repository} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#ff9c70] hover:underline md:mt-0">View on GitHub <ArrowRight size={16}/></a>
            </div>
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

        <section id="use-cases" className="scroll-mt-20 border-t border-[#eee9e5] bg-[#f5f2ee] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">What you can do</p>
            <div className="mt-5 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Less setup. More progress.</h2>
              <p className="max-w-sm text-sm leading-7 text-[#77716c]">Start with the work you want to do. Find the right Ocean surface as you go.</p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {useCases.map(({ eyebrow, title, description, icon: Icon, href, action }) => (
                <article key={title} className="flex flex-col rounded-[28px] border border-[#e7e1dc] bg-white p-8 shadow-[0_10px_30px_rgba(30,20,12,0.025)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-[0.15em] text-[#a15c42]">{eyebrow}</span>
                    <Icon size={24} className="text-[#e9561b]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-14 text-2xl font-semibold leading-tight tracking-[-0.04em]">{title}</h3>
                  <p className="mt-4 flex-1 text-sm leading-7 text-[#77716c]">{description}</p>
                  <Link href={href} className="mt-10 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#b34e28] hover:underline">{action}<ArrowRight size={16} /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 border-t border-[#eee9e5] bg-[#fcfbf9] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">Explore capabilities</p>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Discover how Ocean fits your work.</h2>
            <p className="mt-5 max-w-2xl leading-7 text-[#77716c]">Choose a capability to see a practical path into the workspace. These are product entry points, not simulated AI demos. Availability depends on deployment and configured permissions.</p>
            <div className="mt-10 flex flex-wrap gap-2" role="tablist" aria-label="Ocean capabilities">
              {featureDetails.map((feature, index) => (
                <button key={feature.id} id={`feature-tab-${feature.id}`} type="button" role="tab"
                  aria-selected={activeFeature === feature.id} aria-controls="feature-panel" tabIndex={activeFeature === feature.id ? 0 : -1}
                  onKeyDown={event => selectFeatureWithKeyboard(event, index)}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9561b] ${activeFeature === feature.id ? 'bg-[#1c1b1b] text-white' : 'border border-[#e7e1dc] bg-white text-[#5b5550] hover:border-[#e9561b]'}`}>
                  {feature.label}
                </button>
              ))}
            </div>
            {featureDetails.filter(feature => feature.id === activeFeature).map(feature => (
              <div key={feature.id} id="feature-panel" role="tabpanel" tabIndex={0} aria-labelledby={`feature-tab-${feature.id}`}
                className="mt-7 grid gap-10 rounded-[30px] border border-[#e7e1dc] bg-white p-8 md:grid-cols-2 md:p-12">
                <div>
                  <h3 className="text-3xl font-semibold tracking-[-0.045em]">{feature.heading}</h3>
                  <p className="mt-5 max-w-lg text-sm leading-7 text-[#77716c]">{feature.body}</p>
                  <a href={feature.href} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#1c1b1b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#e9561b]">
                    {feature.action}<ArrowRight size={16}/>
                  </a>
                </div>
                <ol className="space-y-4" aria-label="Getting started steps">
                  {feature.steps.map((step, index) => (
                    <li key={step} className="flex items-center gap-4 rounded-2xl bg-[#f7f4f0] px-5 py-5 text-sm font-medium text-[#39332f]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffe6d8] font-semibold text-[#b34e28]">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section id="ways-to-work" className="scroll-mt-20 bg-white px-6 py-24 md:py-28">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">Make it yours</p>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Work your way with Ocean.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#77716c]">From the first conversation to a longer-running project, discover the workspace features and developer tools.</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {waysToWork.map(({ title, description, icon: Icon, href, action }) => (
                <article key={title} className="border-t border-[#ddd7d1] pt-7">
                  <Icon size={23} className="text-[#e9561b]" aria-hidden="true" />
                  <h3 className="mt-7 text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-3 min-h-[84px] text-sm leading-7 text-[#77716c]">{description}</p>
                  <a href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:text-[#e9561b]">{action}<ArrowRight size={16} /></a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="get-started" className="scroll-mt-20 border-t border-[#eee9e5] bg-[#191817] px-6 py-24 text-[#f8f5f2] md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff9c70]">Get started</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Start where you work.</h2>
              <p className="mt-5 max-w-lg leading-8 text-[#b5ada6]">Use the web workspace or explore the CLI source and installation instructions. Ocean's available capabilities depend on the running host and configuration.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app" className="inline-flex items-center gap-2 rounded-full bg-[#f8f5f2] px-6 py-3 text-sm font-semibold text-[#1c1b1b] hover:bg-[#ffe4d6]">Open workspace <ArrowRight size={16}/></Link>
                <a href={documentation} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:border-[#ff9c70]">CLI setup guide <BookOpen size={16}/></a>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/15 bg-white/[0.045] p-7 md:p-9">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.15em] text-[#b5ada6]">Choose your entry point</p>
              <div className="space-y-4">
                <Link href="/app" className="group flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-5 hover:border-[#ff9c70]">
                  <span><span className="block font-semibold">Ocean Web</span><span className="mt-1 block text-xs text-[#b5ada6]">Conversations, projects and workspace tools</span></span><ArrowRight size={18} className="text-[#ff9c70]"/>
                </Link>
                <a href={documentation} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-5 hover:border-[#ff9c70]">
                  <span><span className="block font-semibold">Ocean CLI</span><span className="mt-1 block text-xs text-[#b5ada6]">Explore terminal setup and source</span></span><ArrowRight size={18} className="text-[#ff9c70]"/>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-[#eee9e5] bg-white px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">Frequently asked questions</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Good questions, clear answers.</h2>
            <div className="mt-10 divide-y divide-[#e9e4df] border-y border-[#e9e4df]">
              {commonQuestions.map(item => (
                <details key={item.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 rounded-lg text-base font-semibold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9561b]">
                    {item.question}<ChevronDown size={20} className="shrink-0 text-[#a15c42] transition-transform group-open:rotate-180"/>
                  </summary>
                  <p className="max-w-2xl pb-2 pt-4 text-sm leading-7 text-[#77716c]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="developers" className="px-6 py-28 scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9561b]">For developers</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Built to be extended.</h2>
              <p className="mt-6 max-w-lg leading-8 text-[#77716c]">Explore the CLI, web host, shared runtime, and integration work in the open-source repository. Feature availability depends on your deployment, installed integrations, and granted permissions.</p>
              <div className="mt-8 flex flex-wrap gap-3">
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
                  const symbol = <img src={`/icons/social/${profile.slug}.svg`} alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 invert" loading="lazy" />;
                  const className = "inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#d4d0cb] transition-opacity";
                  return profile.url
                    ? <a key={profile.label} href={profile.url} target="_blank" rel="noopener noreferrer" aria-label={profile.label} title={profile.label} className={`${className} hover:opacity-70 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9c70]`}>{symbol}</a>
                    : <span key={profile.label} role="img" aria-label={`${profile.label} — coming soon`} title={`${profile.label} · Coming soon`} className={`${className} cursor-default opacity-60`}>{symbol}</span>;
                })}
              </div>
              <p className="mt-3 text-xs text-[#a8a39e]">Other social channels are coming soon.</p>
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
              <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer" className="hover:text-white">Feedback & issues (GitHub)</a>
              <div className="relative">
                <button type="button" onClick={() => setLanguageOpen(!languageOpen)} onKeyDown={event => { if (event.key === "Escape") setLanguageOpen(false); }} aria-expanded={languageOpen} aria-label="Website language" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-[#e6e2dd] hover:border-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9c70]">
                  <Globe2 size={15}/> English <ChevronDown size={14} className={languageOpen ? 'rotate-180' : ''}/>
                </button>
                {languageOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-56 rounded-xl border border-white/15 bg-[#292827] p-2 shadow-xl">
                    <p className="px-3 py-2 text-xs text-[#a8a39e]">Website language</p>
                    <button type="button" aria-current="true" aria-label="English, current website language" onClick={() => setLanguageOpen(false)} className="w-full rounded-lg bg-white/10 px-3 py-2.5 text-left text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9c70]">English · Current</button>
                    <p className="px-3 py-2 text-xs leading-5 text-[#a8a39e]">This public website is currently in English. Other languages are planned; workspace language preferences are separate.</p>
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
