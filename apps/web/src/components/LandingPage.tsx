import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@ocean/ui/lib/utils';

export function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = () => {
    navigate('/app');
  };

  return (
    <div className="selection:bg-primary-fixed-dim selection:text-on-primary-fixed bg-surface text-on-surface font-sans min-h-screen">
      {/* TopNavBar */}
      <nav className={cn("fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl transition-all duration-300", scrolled ? "shadow-sm py-3" : "py-4")}>
        <div className="flex justify-between items-center px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-12">
            <a className="font-display text-xl font-bold tracking-tighter text-on-surface" href="#">Ocean</a>
            <div className="hidden md:flex gap-8 items-center">
              <a className="font-display text-label-sm tracking-tight text-primary font-bold border-b-2 border-primary pb-1 hover:text-primary transition-colors duration-300" href="#">Platform</a>
              <a className="font-display text-label-sm tracking-tight text-on-surface-variant hover:text-primary transition-colors duration-300" href="#">Skill Library</a>
              <a className="font-display text-label-sm tracking-tight text-on-surface-variant hover:text-primary transition-colors duration-300" href="#">Knowledge Graph</a>
              <a className="font-display text-label-sm tracking-tight text-on-surface-variant hover:text-primary transition-colors duration-300" href="#">Integrations</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="px-5 py-2 font-display text-label-sm text-primary transition-transform active:scale-95" onClick={handleGetStarted}>Request Demo</button>
            <button className="kinetic-gradient px-6 py-2.5 rounded-lg text-on-primary font-display text-label-sm font-semibold transition-transform active:scale-95" onClick={handleGetStarted}>Get Started</button>
          </div>
        </div>
      </nav>
      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-32">
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="z-10">
              <span className="inline-block py-1 px-3 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-[10px] font-bold uppercase tracking-widest mb-6">Enterprise AI Evolution</span>
              <h1 className="text-6xl md:text-7xl font-extrabold text-on-surface leading-[1.1] mb-8 font-display tracking-tight">
                Orchestrate Intelligence with <span className="text-primary">Ocean</span>
              </h1>
              <p className="text-xl text-on-surface-variant max-w-lg mb-10 leading-relaxed font-sans">
                The next-generation AI platform for enterprise workflow automation, knowledge management, and skill orchestration.
              </p>
              <div className="flex flex-wrap gap-4">
                <button className="kinetic-gradient px-8 py-4 rounded-lg text-on-primary font-display font-bold text-lg transition-all hover:shadow-xl hover:shadow-primary/20 active:scale-95" onClick={handleGetStarted}>Get Started</button>
                <button className="bg-surface-container-high px-8 py-4 rounded-lg text-on-surface font-display font-bold text-lg flex items-center gap-2 hover:bg-surface-container-highest transition-colors active:scale-95">
                  <span className="material-symbols-outlined text-[20px]">play_circle</span>
                  Watch Demo
                </button>
              </div>
            </div>
            <div className="relative group">
              <div className="absolute -inset-4 bg-primary-fixed/20 blur-3xl rounded-full opacity-50 group-hover:opacity-70 transition-opacity"></div>
              <img alt="Ocean Hero Visual" className="relative z-10 w-full h-auto rounded-2xl hero-mask" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKZkAWUyqtLYgvh8b0nX6eaa6XUyABuVyl8l9b5resxWZ3OadG4TwoVnd344pbOf13cRFBmoln28m_XW4cgGh6L95ZPmUSFAvtdAdI8WoFOVcarIzlGXEX-zk2BFkoLeVxWOK33K2BRIL6FzQ1JlooAtyzmU69N9DeXj350Xby2z6n9JAWjFk4njj54NWrjiTp9hLXmpLgY9VX2uPzd2dpg2Ll77gQ2g-ujsibHYMixL3dISPrhDDY1lehVcejP-UgGDO4439xJuo" />
            </div>
          </div>
        </section>
        {/* Feature: Workflow Orchestration */}
        <section className="py-32 bg-surface-container-low">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <div className="order-2 lg:order-1">
                <img alt="Autonomous Workflows Visualization" className="w-full h-auto rounded-2xl" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCiBAh1L2CCulYTlHohbSKC6MgrFypOXgLNPGM8ROoRTf3QkK7egbgpQgiMxh_iH6dgJLiE4noj7bCVM-aNubUUxELggUZTaFejYzKHCgR1yCXvPnzfX7gyrtcVccItq4VeECeHx-5g7Lazs8-Bpr3NwlAzHa4uVVOawtb9V7YuwMDs3Y9dYe5BdSOrn5FWqQ4u8jF6_KujDhxx6GH0m39I6R8UgnwNZ0O5pbB_CqPaSbHKRFmCD2_K0O-bm_txoRz55AmvchS8fR0" />
              </div>
              <div className="order-1 lg:order-2">
                <h2 className="text-4xl md:text-5xl font-bold mb-8 text-on-surface font-display tracking-tight">Autonomous Workflows</h2>
                <p className="text-lg text-on-surface-variant leading-relaxed mb-8 font-sans">
                  Transform fragmented development cycles into high-velocity engines. Ocean bridges the gap between your core tools, creating seamless AI-driven pipelines that manage complexity so your team can focus on innovation.
                </p>
                <ul className="space-y-6">
                  <li className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <span className="material-symbols-outlined text-primary">hub</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface mb-1 font-display">Tool Chain Synergy</h4>
                      <p className="text-sm text-on-surface-variant font-sans">Connect ZenTao project management, Jenkins CI/CD, and GitLab repositories into a single unified logic flow.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <span className="material-symbols-outlined text-primary">auto_mode</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface mb-1 font-display">Dynamic Escalation</h4>
                      <p className="text-sm text-on-surface-variant font-sans">AI agents autonomously detect blockers in GitLab and trigger immediate regression tests in Jenkins.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
        {/* Feature: Knowledge Graph */}
        <section className="py-32">
          <div className="max-w-7xl mx-auto px-8">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 font-display tracking-tight">Your Global Knowledge, Unified</h2>
              <p className="text-on-surface-variant text-lg font-sans">Break down information silos. Ocean maps your enterprise's collective intelligence into a living knowledge graph.</p>
            </div>
            <div className="relative bg-surface-container-lowest rounded-[2rem] p-8 md:p-16 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <div>
                  <img alt="Interconnected Knowledge Graph Visual" className="w-full h-auto" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDX-lO7GyQa7yPJBU6rQxg9gGFmBymTidMtY87nKQSIJzsT4Ci8JN_K8Uk8R6fs5AAUp2a6nk2wrPLCHwBXUWHLqnwx-Aa0fEf8S60PnEx1iLXoGV47KM8I6jP74QUllBP4ceYiJztoTnOcuyGrAvXCo6zu2-V68JG2kRQd2isXLgQXmiOYX7fO3L6rPvDRDyMv2KHHphKkpHV0U2Xg4Gse5HJotCAbp29B7PK83xnlnC1sIiHqIAxIWF_VppGnTiwCTcsX1AKpkIc" />
                </div>
                <div className="space-y-10">
                  <div className="bg-surface-container p-6 rounded-xl border-l-4 border-primary">
                    <h3 className="text-xl font-bold mb-3 font-display">RAG-Powered Retrieval</h3>
                    <p className="text-on-surface-variant text-sm font-sans">Advanced Retrieval-Augmented Generation that searches across Confluence pages, Notion workspaces, and Jira tickets with contextual accuracy.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 rounded-xl bg-surface">
                      <span className="material-symbols-outlined text-primary mb-4">analytics</span>
                      <h4 className="font-bold text-sm mb-2 font-display">Semantic Search</h4>
                      <p className="text-[12px] text-on-surface-variant font-sans">Find answers by intent, not just keywords, across all documentation.</p>
                    </div>
                    <div className="p-6 rounded-xl bg-surface">
                      <span className="material-symbols-outlined text-primary mb-4">insights</span>
                      <h4 className="font-bold text-sm mb-2 font-display">Relationship Mapping</h4>
                      <p className="text-[12px] text-on-surface-variant font-sans">Identify experts and project links automatically from data patterns.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Integration Section */}
        <section className="py-24 bg-surface-container-low border-y border-outline-variant/10">
          <div className="max-w-7xl mx-auto px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-12">
              <div className="md:w-1/3">
                <h3 className="text-2xl font-bold mb-4 font-display tracking-tight">Integrated with your tech stack.</h3>
                <p className="text-on-surface-variant text-sm font-sans">Ocean works where you work, plugging directly into the tools your team already uses daily.</p>
              </div>
              <div className="md:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="flex flex-col items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl">forum</span>
                  </div>
                  <span className="text-xs font-bold font-display uppercase tracking-wider">Slack</span>
                </div>
                <div className="flex flex-col items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl">terminal</span>
                  </div>
                  <span className="text-xs font-bold font-display uppercase tracking-wider">GitLab</span>
                </div>
                <div className="flex flex-col items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl">settings_applications</span>
                  </div>
                  <span className="text-xs font-bold font-display uppercase tracking-wider">Jenkins</span>
                </div>
                <div className="flex flex-col items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl">account_tree</span>
                  </div>
                  <span className="text-xs font-bold font-display uppercase tracking-wider">ZenTao</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Skill Library Section */}
        <section className="py-32">
          <div className="max-w-7xl mx-auto px-8">
            <div className="flex justify-between items-end mb-16">
              <div className="max-w-xl">
                <span className="text-primary font-bold text-xs uppercase tracking-widest mb-4 block">Expandable Capabilities</span>
                <h2 className="text-4xl font-bold mb-4 font-display tracking-tight">MCP Skill Library</h2>
                <p className="text-on-surface-variant font-sans">Equip your AI agents with specialized skills from our Model Context Protocol library. Deploy capabilities in seconds.</p>
              </div>
              <button className="text-primary font-bold flex items-center gap-2 hover:translate-x-1 transition-transform">
                Explore Full Library
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Skill Card 1 */}
              <div className="p-8 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
                  <span className="material-symbols-outlined text-primary">code</span>
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">Python Interpreter</h4>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Execute complex data analysis and math operations directly within the AI workflow environment.</p>
                <span className="text-[10px] font-bold py-1 px-2 rounded bg-surface-container text-outline">v2.4.0</span>
              </div>
              {/* Skill Card 2 */}
              <div className="p-8 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
                  <span className="material-symbols-outlined text-primary">database</span>
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">SQL Executor</h4>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Safe, read-only query execution across PostgreSQL, MySQL, and Snowflake databases.</p>
                <span className="text-[10px] font-bold py-1 px-2 rounded bg-surface-container text-outline">v1.1.2</span>
              </div>
              {/* Skill Card 3 */}
              <div className="p-8 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
                  <span className="material-symbols-outlined text-primary">notifications_active</span>
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">Slack Notifier</h4>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Keep your team informed by automatically routing AI insights and alerts to designated Slack channels.</p>
                <span className="text-[10px] font-bold py-1 px-2 rounded bg-surface-container text-outline">v3.0.1</span>
              </div>
            </div>
          </div>
        </section>
        {/* CTA Section */}
        <section className="py-32 px-8">
          <div className="max-w-5xl mx-auto kinetic-gradient rounded-[2.5rem] p-12 md:p-24 text-center text-on-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[100px] -mr-32 -mt-32 rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 blur-[80px] -ml-32 -mb-32 rounded-full"></div>
            <h2 className="text-4xl md:text-5xl font-bold mb-8 relative z-10 font-display tracking-tight">Ready to Orchestrate?</h2>
            <p className="text-on-primary/80 text-xl mb-12 max-w-2xl mx-auto relative z-10 font-sans">Join the leaders in AI-driven enterprise efficiency. Start your pilot program with Ocean today.</p>
            <div className="flex flex-wrap justify-center gap-6 relative z-10">
              <button className="bg-white text-primary px-10 py-4 rounded-lg font-bold text-lg hover:bg-surface-bright transition-colors font-display" onClick={handleGetStarted}>Get Started for Free</button>
              <button className="border border-white/30 text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors font-display">Book a Consultation</button>
            </div>
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer className="bg-surface-container-low w-full py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 px-8 max-w-7xl mx-auto border-t border-outline-variant/10 pt-12">
          <div className="col-span-1 md:col-span-1">
            <a className="font-display text-lg font-bold text-on-surface tracking-tighter" href="#">Ocean</a>
            <p className="mt-4 text-on-surface-variant font-sans text-label-sm max-w-xs leading-relaxed">
              Unlocking enterprise potential through advanced AI orchestration and autonomous workflows.
            </p>
          </div>
          <div>
            <h5 className="font-display text-label-sm font-bold mb-6 text-on-surface uppercase tracking-widest">Platform</h5>
            <ul className="space-y-4">
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">Documentation</a></li>
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">MCP Hub</a></li>
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">API Status</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-display text-label-sm font-bold mb-6 text-on-surface uppercase tracking-widest">Company</h5>
            <ul className="space-y-4">
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">About Us</a></li>
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">Careers</a></li>
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">Contact</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-display text-label-sm font-bold mb-6 text-on-surface uppercase tracking-widest">Legal</h5>
            <ul className="space-y-4">
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">Privacy Policy</a></li>
              <li><a className="font-sans text-label-sm text-on-surface-variant hover:text-primary underline transition-all" href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-8 mt-12 pt-8 border-t border-outline-variant/5">
          <p className="font-sans text-label-sm text-on-surface-variant">© 2024 Ocean Orchestration. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
