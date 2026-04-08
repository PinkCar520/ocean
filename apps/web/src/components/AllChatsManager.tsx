import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, MessageSquare, Calendar, Trash2, X, CheckSquare, Square, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  timestamp: number;
  favorited?: boolean;
}

interface AllChatsManagerProps {
  conversations: Conversation[];
  onLoadConversation: (id: string) => void;
  onDeleteConversations: (ids: string[]) => void;
}

export function AllChatsManager({
  conversations,
  onLoadConversation,
  onDeleteConversations,
}: AllChatsManagerProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const lowerQ = searchQuery.toLowerCase();
    return conversations.filter(c => c.title.toLowerCase().includes(lowerQ));
  }, [conversations, searchQuery]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredChats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredChats.map(c => c.id)));
    }
  };

  const handleDeleteConfirm = () => {
    onDeleteConversations(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsConfirmOpen(false);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    if (Date.now() - timestamp < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
  };

  return (
    <div className="flex-1 flex flex-col items-center bg-[#f6f3f2] overflow-y-auto px-4 sm:px-8 pt-12 pb-24 relative">
      <div className="w-full max-w-5xl">
        <h1 className="text-3xl font-display font-bold text-[#1C1B1B] leading-tight">
          {t('all_chats.title', '历史对话管理')}
        </h1>
        <p className="mt-2 text-[15px] text-[#716B67] max-w-2xl">
          {t('all_chats.subtitle', '管理并且清理您所有的历史探索、代码生成与分析会话。')}
        </p>

        {/* Search & Actions Bar */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="relative w-full sm:max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#716B67]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('all_chats.search_placeholder', '搜索会话标题...')}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E8E4E2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20 transition-all text-[#1C1B1B]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-[#716B67] hover:text-[#1C1B1B]" />
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
             <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 border border-[#E8E4E2] bg-white rounded-lg text-sm font-medium text-[#716B67] hover:bg-[#eeece9] transition-colors"
                disabled={filteredChats.length === 0}
              >
                {selectedIds.size > 0 && selectedIds.size === filteredChats.length ? (
                  <CheckSquare className="w-4 h-4 text-[#EC5B14]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selectedIds.size > 0 && selectedIds.size === filteredChats.length 
                  ? t('all_chats.deselect_all', '取消全选') 
                  : t('all_chats.select_all', '全选')}
              </button>

              {selectedIds.size > 0 && (
                <>
                  <span className="text-[#1C1B1B] text-sm font-medium ml-1">
                    {selectedIds.size} {t('all_chats.selected_label', '条已选中')}
                  </span>
                  
                  <button
                    onClick={() => setIsConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-sm font-bold hover:bg-[#EF4444]/20 transition-all ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('common.delete')}
                  </button>

                  <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#716B67] hover:bg-[#E8E4E2]/50 transition-colors"
                  >
                    {t('all_chats.cancel', '取消')}
                  </button>
                </>
              )}
          </div>
        </div>

        {/* List Body */}
        <div className="mt-4 bg-white border border-[#E8E4E2] rounded-2xl overflow-hidden">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#716B67]">
              <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>{t('all_chats.no_results', '暂未找到包含该关键词的对话')}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8E4E2]/50">
              {filteredChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => onLoadConversation(chat.id)}
                  className="flex items-center group cursor-pointer hover:bg-[#F6F3F2]/50 transition-colors"
                >
                  <div 
                    className="p-4 pr-2 cursor-pointer"
                    onClick={(e) => handleToggleSelect(chat.id, e)}
                  >
                    {selectedIds.has(chat.id) ? (
                      <CheckSquare className="w-5 h-5 text-[#EC5B14]" />
                    ) : (
                      <Square className="w-5 h-5 text-[#C4C0BE] group-hover:text-[#716B67] transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 py-4 px-2 min-w-0">
                    <h3 className="text-[15px] font-semibold text-[#1C1B1B] truncate pr-4">
                      {chat.title}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-xs text-[#716B67]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(chat.timestamp)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {chat.messages.length} {t('all_chats.table.messages', '消息数')}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-5 h-5 text-[#C4C0BE]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog for deletion confirmation */}

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-[460px] sm:rounded-[16px] gap-0 p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#1C1B1B]">{t('all_chats.confirm_delete_title', '确认清除历史记录')}</DialogTitle>
            <DialogDescription className="pt-3 text-base text-[#716B67] leading-relaxed">
              {t('all_chats.confirm_delete_desc', { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-10 flex sm:justify-end gap-3">
            <button
              onClick={() => setIsConfirmOpen(false)}
              className="px-8 py-2.5 rounded-[12px] border border-[#E8E4E2] text-sm font-bold text-[#716B67] hover:bg-[#F1EFEB] transition-colors min-w-[100px]"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-8 py-2.5 rounded-[12px] bg-[#EF4444] text-sm font-bold text-white hover:bg-[#D93636] transition-all shadow-[0_4px_12px_rgba(239,68,68,0.05)] min-w-[100px]"
            >
              {t('common.delete')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
