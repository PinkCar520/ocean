import React from 'react';
import { 
  ChevronRight, Sun, Moon, Globe, 
  User, Edit2, CreditCard, Key, 
  Plus, MoreVertical, TerminalSquare, Rocket, MonitorSmartphone
} from 'lucide-react';

export function Settings() {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-[#FCF9F8]">
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-8 scroll-smooth">
        <header className="mb-12 max-w-4xl">
          <h2 className="text-4xl font-display font-extrabold tracking-tight text-[#1C1B1B] mb-2">Settings</h2>
          <p className="text-[#716B67] text-lg">Manage your account preferences, integrations, and workspace configuration.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl">
          
          {/* Left Column: Navigation */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex flex-col space-y-1">
              <button className="flex items-center justify-between px-4 py-3 bg-white text-[#EC5B14] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-[#E8E4E2]/50 font-bold rounded-xl text-left transition-all">
                General
                <ChevronRight className="w-4 h-4" />
              </button>
              <button className="flex items-center justify-between px-4 py-3 text-[#716B67] font-semibold hover:bg-[#F6F3F2] hover:text-[#1C1B1B] transition-all rounded-xl text-left">
                Profile
              </button>
              <button className="flex items-center justify-between px-4 py-3 text-[#716B67] font-semibold hover:bg-[#F6F3F2] hover:text-[#1C1B1B] transition-all rounded-xl text-left">
                API Keys
              </button>
              <button className="flex items-center justify-between px-4 py-3 text-[#716B67] font-semibold hover:bg-[#F6F3F2] hover:text-[#1C1B1B] transition-all rounded-xl text-left">
                Billing
              </button>
            </div>
          </div>

          {/* Right Column: Bento Grid Settings */}
          <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* General Settings Card */}
            <section className="md:col-span-2 bg-white border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-[#EC5B14]/10 p-2 rounded-lg text-[#EC5B14]">
                  <MonitorSmartphone className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-[#1C1B1B]">General Preferences</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#716B67] mb-2">App Theme</label>
                    <div className="flex gap-2 p-1.5 bg-[#F6F3F2] rounded-xl border border-[#E8E4E2]/50">
                      <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] font-bold text-sm text-[#1C1B1B] transition-all">
                        <Sun className="w-4 h-4" /> Light
                      </button>
                      <button className="flex-1 flex items-center justify-center gap-2 py-2.5 text-[#716B67] hover:text-[#1C1B1B] font-semibold text-sm transition-all">
                        <Moon className="w-4 h-4" /> Dark
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#716B67] mb-2">Language</label>
                    <div className="relative">
                      <select className="w-full appearance-none bg-[#F6F3F2] border border-[#E8E4E2]/50 rounded-xl px-4 py-3 text-sm font-semibold text-[#1C1B1B] focus:ring-2 focus:ring-[#EC5B14]/20 outline-none transition-all cursor-pointer">
                        <option>English (US)</option>
                        <option>German (Deutsch)</option>
                        <option>French (Français)</option>
                      </select>
                      <ChevronRight className="w-4 h-4 absolute right-4 top-[14px] pointer-events-none text-[#716B67] rotate-90" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Profile Card */}
            <section className="bg-white border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-[#EC5B14]/10 p-2 rounded-lg text-[#EC5B14]">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-[#1C1B1B]">Profile Details</h3>
              </div>
              <div className="space-y-4">
                <div className="relative w-fit">
                  <img alt="Current Avatar" className="w-16 h-16 rounded-full object-cover border border-[#E8E4E2]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZlDMJk1uJ8EtEfmEntgsXgBcR9mhEFXeDka0ijjlusU7sXkaU6rXBCekriVfEnq20OBpOcL7VNBYxRAhY5ThHGuowd1Ajaeb23aW8GAoGe2P0IIeSYL_A_X6IqmE_d60HEgUQbF89uuuNN8xOhQP5LjOpIoeWChh5LjqECpnBT9vwS5KUzDDuJ1A1DtL3miFpmyxWmfBzBGlr4bZmu5LeM4senixu13MU__wIlEA9yNW_yqWpFTNKixYdPp2-HWEs9rQOgc1RFmI" />
                  <button className="absolute bottom-0 -right-2 w-7 h-7 bg-[#EC5B14] text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-[#EC5B14]/20 border-2 border-white">
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#716B67] mb-1.5">Full Name</label>
                  <input className="w-full bg-[#F6F3F2] border border-[#E8E4E2]/50 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1C1B1B] focus:ring-2 focus:ring-[#EC5B14]/20 outline-none transition-all" type="text" defaultValue="Marcus Thorne" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#716B67] mb-1.5">Email Address</label>
                  <input className="w-full bg-[#F6F3F2] border border-[#E8E4E2]/50 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1C1B1B] focus:ring-2 focus:ring-[#EC5B14]/20 outline-none transition-all" type="email" defaultValue="m.thorne@uclaw.ai" />
                </div>
                <button className="text-[#EC5B14] text-xs font-bold hover:underline">Change Password</button>
              </div>
            </section>

            {/* Billing Card */}
            <section className="bg-white border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-[#EC5B14]/10 p-2 rounded-lg text-[#EC5B14]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-[#1C1B1B]">Subscription</h3>
              </div>
              <div className="p-5 bg-gradient-to-br from-[#EC5B14]/5 to-transparent rounded-2xl border border-[#EC5B14]/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#EC5B14]/5 rounded-full blur-2xl -mt-10 -mr-10"></div>
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <p className="text-[#EC5B14] font-bold text-lg leading-tight">Pro Enterprise</p>
                    <p className="text-xs font-semibold text-[#716B67] mt-1">$49/month • Billed Monthly</p>
                  </div>
                  <span className="bg-[#EC5B14] text-white text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wider shadow-sm">ACTIVE</span>
                </div>
                <div className="w-full bg-[#E8E4E2]/50 h-1.5 rounded-full overflow-hidden mb-2 relative z-10">
                  <div className="bg-[#EC5B14] h-full w-[65%] rounded-full"></div>
                </div>
                <p className="text-[10px] font-bold text-[#716B67] uppercase tracking-widest relative z-10">650 / 1,000 queries used this month</p>
              </div>
              <button className="w-full py-3 bg-white border border-[#E8E4E2] rounded-xl text-sm font-bold text-[#1C1B1B] hover:bg-[#F6F3F2] transition-colors shadow-sm">Manage Billing</button>
            </section>

            {/* API Keys Card */}
            <section className="md:col-span-2 bg-white border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#EC5B14]/10 p-2 rounded-lg text-[#EC5B14]">
                    <Key className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-[#1C1B1B]">API &amp; Integrations</h3>
                </div>
                <button className="text-[#EC5B14] text-sm font-bold flex items-center gap-2 hover:bg-[#EC5B14]/5 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> New Integration
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* API Item 1 */}
                <div className="flex flex-col justify-between p-5 bg-[#F6F3F2] border border-[#E8E4E2]/50 rounded-[20px] transition-all hover:shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm border border-[#E8E4E2]/50 text-[#FC6D26]">
                        <TerminalSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1C1B1B]">GitLab Integration</p>
                        <p className="text-[11px] font-semibold text-[#716B67] mt-0.5">Last used 2 hours ago</p>
                      </div>
                    </div>
                    <button className="text-[#716B67] hover:bg-white hover:shadow-sm p-1.5 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <code className="bg-white border border-[#E8E4E2]/50 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold text-[#716B67]">••••••••••••4f2a</code>
                  </div>
                </div>

                {/* API Item 2 */}
                <div className="flex flex-col justify-between p-5 bg-[#F6F3F2] border border-[#E8E4E2]/50 rounded-[20px] transition-all hover:shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm border border-[#E8E4E2]/50 text-[#00AEEF]">
                        <Rocket className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1C1B1B]">ZenTao Intelligence</p>
                        <p className="text-[11px] font-semibold text-[#716B67] mt-0.5">Connected since Feb 2024</p>
                      </div>
                    </div>
                    <button className="text-[#716B67] hover:bg-white hover:shadow-sm p-1.5 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <code className="bg-white border border-[#E8E4E2]/50 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold text-[#716B67]">••••••••••••92k1</code>
                  </div>
                </div>
              </div>
            </section>

            {/* Security Quick Actions */}
            <section className="md:col-span-2 flex flex-wrap gap-4 items-center justify-between pt-10 border-t border-[#E8E4E2] mt-4 mb-12">
              <div className="flex gap-4">
                <button className="px-6 py-2.5 rounded-full text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors uppercase tracking-widest border border-red-200">
                  Delete Workspace
                </button>
                <button className="px-6 py-2.5 rounded-full text-[11px] font-bold text-[#716B67] hover:text-[#1C1B1B] bg-white border border-[#E8E4E2] hover:bg-[#F6F3F2] transition-colors shadow-sm uppercase tracking-widest">
                  Download Data Export
                </button>
              </div>
              <button className="btn-kinetic px-8 py-3 rounded-xl text-sm font-bold text-white shadow-lg shadow-[#EC5B14]/20">
                Save All Changes
              </button>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
