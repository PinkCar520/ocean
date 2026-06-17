import React, { useState, useEffect } from 'react';
import {
  Settings, HelpCircle, LogOut, ChevronRight, Globe, Check, Zap, Sparkles, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateSettings?: () => void;
  onUpgradeClick?: () => void;
  onLogout?: () => void;
  user?: any;
}

export function SettingsModal({ isOpen, onClose, onNavigateSettings, onUpgradeClick, onLogout, user }: SettingsModalProps) {
  const { i18n, t } = useTranslation();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const languages = [
    { code: 'zh', label: '简体中文' },
    { code: 'en', label: 'English (US)' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Invisible Overlay for click-outside to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[50]"
          />

          {/* Popover Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10, originX: 0, originY: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed left-3 bottom-[72px] w-[260px] bg-card rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] p-4 flex flex-col gap-1 z-[60] border border-border"
          >
            {/* User Profile Header */}
            <div className="flex items-center gap-3 mb-4">
              <img
                src={user?.avatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuA0oS2KtsdNSGQoheV6v31oxAq-NhwZzQ47xg8__EJhv8OqGKGnZL3wep9OPHmM8x2Ik6mpZYLUp_nlIoldi6DXVNzDnTDsq10ls1jkUj-t_evdmGKwkn_t5xfFRgHK6-mmcStkVS-zdI45IF3rmBL3mH9KmAB8N9AvKqU-Dv45N0-NNrOIrD2ZlsGh9MmfkPMjEPcNRAJQVNa20KRYE9eY-Svv7Taq6vVmmqM9HxckuxqA9UWUSYJjawCeP6JhTrR_2ym5Y9kmaeo"}
                alt="profile"
                className="w-11 h-11 rounded-full border border-border object-cover shrink-0"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <h4 className="text-base font-bold text-foreground truncate leading-none">{user?.name || 'Alex Rivera'}</h4>
                <div className="flex items-center gap-2">
                  <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary whitespace-nowrap">
                    {user?.department || t('settings.free_version')}
                  </span>
                  <button
                    onClick={() => { onUpgradeClick?.(); onClose(); }}
                    className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold tracking-wide uppercase">{t('settings.upgrade', 'UPGRADE')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Nav List */}
            <div className="space-y-0.5">
              {/* Language Item with CSS Hover Submenu */}
              <div className="relative group/lang">
                <button className="w-full flex items-center justify-between px-2 py-3 text-foreground/80 dark:text-foreground/90 hover:bg-muted rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('settings.language')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* CSS Submenu - Pure CSS Hover */}
                <div className="absolute left-[calc(100%+8px)] top-0 invisible group-hover/lang:visible opacity-0 group-hover/lang:opacity-100 transition-all duration-200 z-[70]">
                  <div className="w-[200px] p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] rounded-[20px] border border-border bg-card">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          i18n.changeLanguage(lang.code);
                          try {
                            api.patch('/api/user/preferences', { language: lang.code }).catch(() => {});
                          } catch (e) {}
                          onClose();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground/80 dark:text-foreground/90">{lang.label}</span>
                        {i18n.language?.startsWith(lang.code) && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => { onNavigateSettings?.(); onClose(); }} className="w-full flex items-center gap-3 px-2 py-3 text-foreground/80 dark:text-foreground/90 hover:bg-muted rounded-xl transition-colors text-left">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t('settings.settings')}</span>
              </button>

              <div className="my-2 border-t border-border/50"></div>

              <button onClick={() => { window.open('https://docs.ocean.com', '_blank'); onClose(); }} className="w-full flex items-center gap-3 px-2 py-3 text-foreground/80 dark:text-foreground/90 hover:bg-muted rounded-xl transition-colors text-left">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t('settings.help')}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>

              <button
                onClick={() => { onLogout?.(); onClose(); }}
                className="w-full flex items-center gap-3 px-2 py-3 text-[#EF4444] hover:text-white hover:bg-[#EF4444] rounded-xl transition-colors text-left group"
              >
                <LogOut className="w-5 h-5 text-[#EF4444] group-hover:text-white" />
                <span className="text-sm font-medium">{t('settings.sign_out')}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
