import React, { useState } from 'react';
import {
  ChevronRight, Sun, Moon, Globe,
  User, Edit2, CreditCard, Key,
  Plus, MoreVertical, TerminalSquare, Rocket, MonitorSmartphone, Shield
} from 'lucide-react';
import { PermissionManager } from './PermissionManager';
import { cn } from '../lib/utils';

type SettingsTab = 'general' | 'permissions' | 'profile' | 'api' | 'billing';

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const navItems: { key: SettingsTab; label: string; icon?: React.ReactNode }[] = [
    { key: 'general', label: 'General' },
    { key: 'permissions', label: 'Permissions', icon: <Shield className="w-4 h-4" /> },
    { key: 'profile', label: 'Profile' },
    { key: 'api', label: 'API Keys' },
    { key: 'billing', label: 'Billing' },
  ];
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-8 scroll-smooth">
        <header className="mb-12 max-w-4xl">
          <h2 className="text-4xl font-display font-extrabold tracking-tight text-foreground mb-2">Settings</h2>
          <p className="text-muted-foreground text-lg">Manage your account preferences, integrations, and workspace configuration.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl">
          
          {/* Left Column: Navigation */}
          <div className="lg:col-span-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 font-bold rounded-xl text-left transition-all',
                  activeTab === item.key
                    ? 'bg-card text-primary shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-border/50'
                    : 'text-muted-foreground font-semibold hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  {item.label}
                </span>
                {activeTab === item.key && <ChevronRight className="w-4 h-4" />}
              </button>
            ))}
          </div>

          {/* Right Column: Bento Grid Settings */}
          <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6">

            {activeTab === 'permissions' && (
              <section className="md:col-span-2">
                <PermissionManager />
              </section>
            )}

            {activeTab === 'general' && (
              <>
            
            {/* General Settings Card */}
            <section className="md:col-span-2 bg-card border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <MonitorSmartphone className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">General Preferences</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">App Theme</label>
                    <div className="flex gap-2 p-1.5 bg-muted rounded-xl border border-border/50">
                      <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-card rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] font-bold text-sm text-foreground transition-all">
                        <Sun className="w-4 h-4" /> Light
                      </button>
                      <button className="flex-1 flex items-center justify-center gap-2 py-2.5 text-muted-foreground hover:text-foreground font-semibold text-sm transition-all">
                        <Moon className="w-4 h-4" /> Dark
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Language</label>
                    <div className="relative">
                      <select className="w-full appearance-none bg-muted border border-border/50 rounded-xl px-4 py-3 text-sm font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer">
                        <option>English (US)</option>
                        <option>German (Deutsch)</option>
                        <option>French (Français)</option>
                      </select>
                      <ChevronRight className="w-4 h-4 absolute right-4 top-[14px] pointer-events-none text-muted-foreground rotate-90" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Profile Card */}
            <section className="bg-card border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">Profile Details</h3>
              </div>
              <div className="space-y-4">
                <div className="relative w-fit">
                  <img alt="Current Avatar" className="w-16 h-16 rounded-full object-cover border border-border" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZlDMJk1uJ8EtEfmEntgsXgBcR9mhEFXeDka0ijjlusU7sXkaU6rXBCekriVfEnq20OBpOcL7VNBYxRAhY5ThHGuowd1Ajaeb23aW8GAoGe2P0IIeSYL_A_X6IqmE_d60HEgUQbF89uuuNN8xOhQP5LjOpIoeWChh5LjqECpnBT9vwS5KUzDDuJ1A1DtL3miFpmyxWmfBzBGlr4bZmu5LeM4senixu13MU__wIlEA9yNW_yqWpFTNKixYdPp2-HWEs9rQOgc1RFmI" />
                  <button className="absolute bottom-0 -right-2 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-[#EC5B14]/20 border-2 border-white">
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Full Name</label>
                  <input className="w-full bg-muted border border-border/50 rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all" type="text" defaultValue="Marcus Thorne" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Email Address</label>
                  <input className="w-full bg-muted border border-border/50 rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all" type="email" defaultValue="m.thorne@ocean.ai" />
                </div>
                <button className="text-primary text-xs font-bold hover:underline">Change Password</button>
              </div>
            </section>

            {/* Billing Card */}
            <section className="bg-card border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">Subscription</h3>
              </div>
              <div className="p-5 bg-gradient-to-br from-[#EC5B14]/5 to-transparent rounded-2xl border border-primary/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mt-10 -mr-10"></div>
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <p className="text-primary font-bold text-lg leading-tight">Pro Enterprise</p>
                    <p className="text-xs font-semibold text-muted-foreground mt-1">$49/month • Billed Monthly</p>
                  </div>
                  <span className="bg-primary text-white text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wider shadow-sm">ACTIVE</span>
                </div>
                <div className="w-full bg-border/50 h-1.5 rounded-full overflow-hidden mb-2 relative z-10">
                  <div className="bg-primary h-full w-[65%] rounded-full"></div>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest relative z-10">650 / 1,000 queries used this month</p>
              </div>
              <button className="w-full py-3 bg-card border border-border rounded-xl text-sm font-bold text-foreground hover:bg-muted transition-colors shadow-sm">Manage Billing</button>
            </section>

            {/* API Keys Card */}
            <section className="md:col-span-2 bg-card border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-8 rounded-[24px] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Key className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-foreground">API &amp; Integrations</h3>
                </div>
                <button className="text-primary text-sm font-bold flex items-center gap-2 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> New Integration
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* API Item 1 */}
                <div className="flex flex-col justify-between p-5 bg-muted border border-border/50 rounded-[20px] transition-all hover:shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border/50 text-[#FC6D26]">
                        <TerminalSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">GitLab Integration</p>
                        <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">Last used 2 hours ago</p>
                      </div>
                    </div>
                    <button className="text-muted-foreground hover:bg-card hover:shadow-sm p-1.5 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <code className="bg-card border border-border/50 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold text-muted-foreground">••••••••••••4f2a</code>
                  </div>
                </div>

                {/* API Item 2 */}
                <div className="flex flex-col justify-between p-5 bg-muted border border-border/50 rounded-[20px] transition-all hover:shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border/50 text-[#00AEEF]">
                        <Rocket className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">ZenTao Intelligence</p>
                        <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">Connected since Feb 2024</p>
                      </div>
                    </div>
                    <button className="text-muted-foreground hover:bg-card hover:shadow-sm p-1.5 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <code className="bg-card border border-border/50 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold text-muted-foreground">••••••••••••92k1</code>
                  </div>
                </div>
              </div>
            </section>

            {/* Security Quick Actions */}
            <section className="md:col-span-2 flex flex-wrap gap-4 items-center justify-between pt-10 border-t border-border mt-4 mb-12">
              <div className="flex gap-4">
                <button className="px-6 py-2.5 rounded-full text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors uppercase tracking-widest border border-red-200">
                  Delete Workspace
                </button>
                <button className="px-6 py-2.5 rounded-full text-[11px] font-bold text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted transition-colors shadow-sm uppercase tracking-widest">
                  Download Data Export
                </button>
              </div>
              <button className="btn-kinetic px-8 py-3 rounded-xl text-sm font-bold text-white shadow-lg shadow-[#EC5B14]/20">
                Save All Changes
              </button>
            </section>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
