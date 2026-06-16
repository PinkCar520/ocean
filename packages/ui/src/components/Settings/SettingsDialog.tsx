import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, User, Blocks, Bell, CreditCard, Sparkles, LogOut, Search, X, ShieldCheck, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { SettingsProvider, useSettings } from './SettingsContext';
import { SettingsDialogProps } from './types';
import { GeneralTab } from './tabs/GeneralTab';
import { InstructionsTab } from './tabs/InstructionsTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import { ProfileTab } from './tabs/ProfileTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { BillingTab } from './tabs/BillingTab';

function SettingsLayout({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { userProfile, isLoading, saveStatus } = useSettings();
  const [activeTab, setActiveTab] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');

  const navigation = [
    { id: 'general', label: t('user_center.tabs.general'), icon: Settings, group: 'preferences' },
    { id: 'instructions', label: t('user_center.tabs.instructions', 'Custom Instructions'), icon: Sparkles, group: 'preferences' },
    { id: 'permissions', label: t('user_center.tabs.permissions', 'Permissions'), icon: ShieldCheck, group: 'preferences' },
    { id: 'profile', label: t('user_center.tabs.profile'), icon: User, group: 'account' },
    { id: 'integrations', label: t('user_center.tabs.integrations'), icon: Blocks, group: 'account' },
    { id: 'billing', label: t('user_center.tabs.billing', 'Usage & Billing'), icon: CreditCard, group: 'account' },
  ];

  const filteredNav = navigation.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="w-full max-w-6xl h-[85vh] bg-card rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-border/50 relative"
      >
        {/* Left Sidebar */}
        <div className="w-full md:w-80 bg-muted/30 border-r border-border/50 flex flex-col relative z-10">
          <div className="p-8 pb-6">
            <h2 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
              <div className="bg-foreground text-background p-2 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              {t('user_center.title')}
            </h2>
            <div className="mt-8 relative group">
              <Search className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-[#EC5B14] transition-colors" />
              <input 
                type="text" 
                placeholder={t('user_center.search', 'Search settings...')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-muted/50 border border-transparent focus:bg-card focus:border-border/50 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8 scrollbar-hide">
            {['preferences', 'account'].map(group => {
              const items = filteredNav.filter(n => n.group === group);
              if (items.length === 0) return null;
              
              return (
                <div key={group}>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 px-2">
                    {group}
                  </h3>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 group relative",
                          activeTab === item.id 
                            ? "bg-card shadow-sm text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-8 before:bg-[#EC5B14] before:rounded-r-full" 
                            : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        )}
                      >
                        <item.icon className={cn(
                          "w-4 h-4 transition-colors",
                          activeTab === item.id ? "text-[#EC5B14]" : "group-hover:text-foreground"
                        )} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-border/50 bg-muted/10">
             <div className="flex items-center gap-3 mb-4 p-3 bg-card rounded-2xl shadow-sm border border-border/50">
                <div className="w-10 h-10 rounded-xl bg-[#EC5B14]/10 flex items-center justify-center text-[#EC5B14] font-black shadow-inner">
                  {userProfile?.name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 overflow-hidden">
                   <p className="text-sm font-bold text-foreground truncate">{userProfile?.name || 'User'}</p>
                   <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest truncate">{t('user_center.usage.pro_plan')}</p>
                </div>
             </div>
             <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors uppercase tracking-widest">
               <LogOut className="w-4 h-4" />
               Log Out
             </button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 bg-background flex flex-col relative overflow-hidden">
          <div className="absolute top-6 right-6 z-20">
            <button 
              onClick={onClose}
              className="p-3 hover:bg-muted rounded-2xl transition-all text-muted-foreground hover:text-foreground hover:rotate-90 duration-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 md:p-12 pb-32 scrollbar-hide">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-[#EC5B14]/30 border-t-[#EC5B14] rounded-full animate-spin" />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {activeTab === 'general' && <GeneralTab />}
                  {activeTab === 'instructions' && <InstructionsTab />}
                  {activeTab === 'permissions' && <PermissionsTab />}
                  {activeTab === 'profile' && <ProfileTab />}
                  {activeTab === 'integrations' && <IntegrationsTab />}
                  {activeTab === 'billing' && <BillingTab />}
                </motion.div>
              </AnimatePresence>
            )}

            <AnimatePresence>
              {saveStatus !== 'idle' && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-6 right-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card shadow-md border border-border/50 text-xs font-bold text-foreground z-10"
                >
                  {saveStatus === 'saving' ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : saveStatus === 'error' ? (
                    <X className="w-3 h-3 text-red-500" />
                  ) : (
                    <ShieldCheck className="w-3 h-3 text-green-500" />
                  )}
                  {saveStatus === 'saving' ? t('user_center.general.applying', 'Saving...') : saveStatus === 'error' ? t('user_center.general.error', 'Error') : t('user_center.general.saved', 'Saved')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function SettingsDialog({ isOpen, onClose, token }: SettingsDialogProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <SettingsProvider token={token}>
        <SettingsLayout onClose={onClose} />
      </SettingsProvider>
    </AnimatePresence>
  );
}
