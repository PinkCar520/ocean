import React from 'react';
import { 
  Plus, 
  MessageSquare,
  FolderOpen,
  GitMerge,
  BookOpen,
  TerminalSquare,
  User,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface SidebarProps {
  activeMainTab: string;
  onMainTabChange: (id: string) => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

export function Sidebar({ 
  activeMainTab, 
  onMainTabChange, 
  onOpenSettings, 
  onNewChat
}: SidebarProps) {
  const { t } = useTranslation();

  const navItems = [
    { id: 'library', icon: FolderOpen, label: 'Library' },
    { id: 'workflows', icon: GitMerge, label: 'Workflows' },
    { id: 'knowledge', icon: BookOpen, label: 'Knowledge' },
    { id: 'console', icon: TerminalSquare, label: 'Console' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#f6f3f2] flex flex-col shrink-0 z-50">
      
      {/* 1. Logo Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#EC5B14] p-1.5 rounded-lg shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-[#1C1B1B] text-xl leading-none">uClaw</span>
            <span className="text-[9px] font-bold text-[#716B67] uppercase tracking-widest mt-0.5">Enterprise AI</span>
          </div>
        </div>
      </div>

      {/* 2. Main CTAs */}
      <div className="px-5 space-y-3 mt-4">
        <button 
          className="w-full h-11 flex items-center justify-center gap-2 btn-kinetic rounded-[8px] font-semibold text-sm"
          onClick={() => { /* Placeholder for New Analysis */ }}
        >
          <Plus className="w-4 h-4" />
          <span>New Analysis</span>
        </button>
        
        <button 
          onClick={onNewChat}
          className="w-full h-11 flex items-center justify-start gap-3 bg-white px-4 rounded-[8px] border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all"
        >
          <div className="bg-[#EC5B14]/10 p-1 rounded-md">
            <Plus className="w-4 h-4 text-[#EC5B14]" />
          </div>
          <span className="text-[#EC5B14] font-semibold text-sm">New Chat</span>
        </button>
      </div>

      {/* 3. Navigation Links */}
      <nav className="flex-1 px-3 mt-8 space-y-1">
        {navItems.map((item) => {
          const isActive = activeMainTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onMainTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] font-medium text-sm transition-all focus:outline-none",
                isActive 
                  ? "bg-white shadow-sm text-[#1C1B1B]" 
                  : "text-[#716B67] hover:bg-[#1C1B1B]/5 hover:text-[#1C1B1B]"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* 4. Bottom Profile & Support */}
      <div className="p-4 space-y-1 mb-4">
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[#716B67] hover:bg-[#1C1B1B]/5 hover:text-[#1C1B1B] transition-all"
        >
          <User className="w-4 h-4" />
          <span className="font-medium text-sm">Profile</span>
        </button>
        <button 
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[#716B67] hover:bg-[#1C1B1B]/5 hover:text-[#1C1B1B] transition-all"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="font-medium text-sm">Support</span>
        </button>
      </div>

    </aside>
  );
}
