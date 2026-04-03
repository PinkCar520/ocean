import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Activity, 
  Cpu, 
  Database,
  Search,
  Settings,
  HelpCircle,
  Bug,
  PlusCircle,
  History
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

interface CommandMenuProps {
  onSelectTab: (id: string) => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

export function CommandMenu({ onSelectTab, onOpenSettings, onNewChat }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      {/* 触发按钮 */}
      <button 
        onClick={() => setOpen(true)}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg hover:border-blue-200 transition-all w-48 text-left"
      >
        <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" />
        <span className="text-xs text-slate-400 group-hover:text-slate-600 truncate flex-1">
          {t('common.search_placeholder')}
        </span>
        <kbd className="hidden sm:inline-flex h-4 select-none items-center gap-1 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 opacity-100">
          <span className="text-[8px]">⌘</span>K
        </kbd>
      </button>

      {/* 命令菜单浮层 */}
      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen} 
        label="Global Command Menu"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm"
      >
        <div className="w-full max-w-[640px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="flex items-center border-b border-slate-100 px-4">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <Command.Input 
              autoFocus
              placeholder={t('chat.placeholder')} 
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 px-3 font-medium"
            />
          </div>
          
          <Command.List className="max-h-[400px] overflow-y-auto p-2 scrollbar-none">
            <Command.Empty className="py-12 text-center">
              <div className="flex flex-col items-center gap-3">
                <Search className="w-8 h-8 text-slate-200" />
                <p className="text-sm text-slate-500 font-medium">没有找到相关指令...</p>
              </div>
            </Command.Empty>
            
            <Command.Group heading={t('sidebar.workspace_context')} className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Item icon={PlusCircle} onSelect={() => runCommand(onNewChat)} color="text-blue-600 bg-blue-50">
                {t('chat.new_chat')}
              </Item>
              <Item icon={LayoutDashboard} onSelect={() => runCommand(() => onSelectTab('dashboard'))}>
                {t('nav.dashboard')}
              </Item>
              <Item icon={MessageSquare} onSelect={() => runCommand(() => onSelectTab('chat'))}>
                {t('nav.chat')}
              </Item>
              <Item icon={Cpu} onSelect={() => runCommand(() => onSelectTab('skill_library'))}>
                {t('nav.skill_library')}
              </Item>
              <Item icon={Database} onSelect={() => runCommand(() => onSelectTab('database'))}>
                {t('nav.database')}
              </Item>
            </Command.Group>

            <Command.Separator className="h-px bg-slate-100 my-2" />

            <Command.Group heading={t('sidebar.recent_activity')} className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Item icon={History} onSelect={() => runCommand(() => onSelectTab('chat'))}>
                {t('sidebar.recent_activity')}
              </Item>
            </Command.Group>

            <Command.Separator className="h-px bg-slate-100 my-2" />

            <Command.Group heading={t('nav.settings')} className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Item icon={Settings} onSelect={() => runCommand(onOpenSettings)}>
                {t('nav.settings')}
              </Item>
              <Item icon={HelpCircle}>
                使用帮助 (FAQ)
              </Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↑↓</kbd> 导航
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↵</kbd> 选择
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px]">ESC</kbd> 关闭
            </div>
          </div>
        </div>
      </Command.Dialog>
    </>
  );
}

function Item({ children, icon: Icon, onSelect, color }: { children: React.ReactNode, icon: any, onSelect?: () => void, color?: string }) {
  return (
    <Command.Item 
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-semibold text-slate-600 aria-selected:bg-blue-50 aria-selected:text-blue-700 transition-all duration-200"
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
        color || "bg-slate-100 text-slate-500 aria-selected:bg-white"
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="flex-1">{children}</span>
    </Command.Item>
  );
}
