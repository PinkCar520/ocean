import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, CornerDownLeft, FolderRoot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: any[];
  projects?: any[];
  onSelectChat: (id: string) => void;
  onSelectProject?: (id: string) => void;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  conversations,
  projects = [],
  onSelectChat,
  onSelectProject
}: GlobalSearchModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter and Combine Results
  const filtered = React.useMemo(() => {
    const lowerQ = query.toLowerCase().trim();
    
    const filteredProjects = projects
      .filter(p => !lowerQ || p.name.toLowerCase().includes(lowerQ))
      .map(p => ({ ...p, type: 'project' as const }));

    const filteredChats = conversations
      .filter(c => !lowerQ || c.title.toLowerCase().includes(lowerQ))
      .map(c => ({ ...c, type: 'chat' as const }));

    // Limit and Combine: Projects first, then Chats
    return [
      ...filteredProjects.slice(0, 5),
      ...filteredChats.slice(0, 10)
    ];
  }, [conversations, projects, query]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item.type === 'project') {
          onSelectProject?.(item.id);
        } else {
          onSelectChat(item.id);
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onSelectChat, onSelectProject, onClose]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogTitle className="sr-only">Command Center</DialogTitle>

      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-[640px] p-0 overflow-hidden bg-card/95 backdrop-blur-xl border-border shadow-2xl rounded-[12px] top-[15%] translate-y-0 [&>button]:hidden"
      >
        <div className="flex flex-col h-full max-h-[80vh]">
          {/* Search Input Area */}
          <div className="flex items-center px-6 py-5 border-b border-border/50 gap-4">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search_modal.placeholder', '搜索项目、任务或对话...')}
              className="flex-1 bg-transparent border-none outline-none text-[16px] font-medium text-foreground placeholder:text-muted-foreground/80 placeholder:font-normal"
            />
            <div className="hidden sm:flex px-2 py-1 rounded-md text-[11px] font-bold text-muted-foreground/80 bg-muted">
              ESC
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground/80 text-[15px]">
                没有找到相关内容
              </div>
            ) : (
              <div className="flex flex-col space-y-1">
                {filtered.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  const isProject = item.type === 'project';
                  
                  // Show Header
                  const showHeader = index === 0 || (item.type !== filtered[index - 1].type);
                  
                  return (
                    <React.Fragment key={`${item.type}-${item.id}`}>
                      {showHeader && (
                        <div className="px-4 py-3 text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase mt-2 mb-1">
                          {isProject ? '企业工作空间 (Projects)' : '历史会话 (Chats)'}
                        </div>
                      )}
                      <div
                        onClick={() => {
                          if (isProject) onSelectProject?.(item.id);
                          else onSelectChat(item.id);
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex items-center justify-between px-4 py-3 rounded-[8px] cursor-pointer transition-colors ${
                          isSelected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {isProject ? (
                            <FolderRoot className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground/80'}`} />
                          ) : (
                            <MessageSquare className={`w-4 h-4 shrink-0 ${isSelected ? 'text-foreground' : 'text-muted-foreground/80'}`} />
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className={`text-[14px] truncate ${isSelected ? 'text-foreground font-bold' : 'text-muted-foreground font-semibold'}`}>
                              {isProject ? item.name : item.title}
                            </span>
                            {isProject && (
                              <span className="text-[10px] text-muted-foreground/80 font-medium uppercase tracking-tighter">
                                {item.category} • 激活此空间开始编排
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">
                              {isProject ? '立即激活' : '查看对话'}
                            </span>
                            <CornerDownLeft className="w-3.5 h-3.5 text-primary" />
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-border/50 bg-muted/30 flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground/80">
              使用 ↑↓ 导航, Enter 选择, Esc 关闭
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
