import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, User, CreditCard, Key,
  MonitorSmartphone, Shield, Sparkles, X, Search,
  ShieldCheck, RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { SettingsProvider, useSettings } from './SettingsContext';
import type { SettingsDialogProps } from './types';
import { GeneralTab } from './tabs/GeneralTab';
import { InstructionsTab } from './tabs/InstructionsTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import { ProfileTab } from './tabs/ProfileTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { BillingTab } from './tabs/BillingTab';

function SettingsLayout({ onClose, onConversationsCleared }: { onClose: () => void; onConversationsCleared?: () => void }) {
  const { t } = useTranslation();
  const { isLoading, saveStatus } = useSettings();
  const [activeTab, setActiveTab] = useState('general');

  const navigation = [
    { id: 'general', label: t('user_center.tabs.general'), icon: MonitorSmartphone },
    { id: 'instructions', label: t('user_center.tabs.instructions', 'Custom Instructions'), icon: Sparkles },
    { id: 'permissions', label: t('user_center.tabs.permissions', 'Permissions'), icon: Shield },
    { id: 'profile', label: t('user_center.tabs.profile'), icon: User },
    { id: 'integrations', label: t('user_center.tabs.integrations'), icon: Key },
    { id: 'billing', label: t('user_center.tabs.billing'), icon: CreditCard },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative flex w-[1000px] h-[800px] max-w-[95vw] max-h-[95vh] bg-card rounded-2xl shadow-2xl overflow-hidden text-foreground border border-border/50"
      >
        {/* Close Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors z-[60] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Navigation */}
        <div className="w-[280px] bg-muted/30 border-r border-border/50 flex flex-col h-full shrink-0">
          <div className="p-6 pb-2">
            <div className="relative mb-6">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-background border border-border/50 rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 px-2">Settings</h3>
            <div className="flex flex-col space-y-1">
              {navigation.map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-3 rounded-xl text-left transition-all group text-sm",
                    activeTab === tab.id 
                      ? "bg-card text-primary shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-border/50 font-bold" 
                      : "text-muted-foreground font-medium hover:bg-muted hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    {tab.label}
                  </div>
                  <ChevronRight className={cn("w-4 h-4 transition-transform", activeTab === tab.id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0")} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative p-10 pb-24 scroll-smooth">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-[#EC5B14] rounded-full animate-spin" />
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
                {activeTab === 'billing' && <BillingTab onConversationsCleared={onConversationsCleared} />}
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
      </motion.div>
    </div>
  );
}

export function SettingsDialog({ isOpen, onClose, token, onProfileUpdate, onConversationsCleared }: SettingsDialogProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <SettingsProvider token={token} onProfileUpdate={onProfileUpdate}>
        <SettingsLayout onClose={onClose} onConversationsCleared={onConversationsCleared} />
      </SettingsProvider>
    </AnimatePresence>
  );
}
