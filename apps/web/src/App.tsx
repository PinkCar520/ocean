import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import {
  ArrowUp, ArrowDown, Sparkles, Terminal, 
  Search, 
  Copy, RotateCcw, Check,
  Plus, FileText, X as CloseIcon, Image as ImageIcon,
  ChevronDown, Cloud, Cpu, Square,
  Bell as BellIcon, Settings, Database, Activity
  } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from './lib/utils';
import { BugCard } from './components/BugCard';
import { Dashboard } from './components/Dashboard';
import { PipelineCard } from './components/PipelineCard';
import { TaskPlan } from './components/TaskPlan';
import { UIGallery } from './components/UIGallery';
import { SkillLibrary } from './components/SkillLibrary';
import { NodeMonitor } from './components/NodeMonitor';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { CommandMenu } from './components/CommandMenu';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  timestamp: number;
}

function AppContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: routeChatId } = useParams();
  const { pathname } = useLocation();

  const { messages, sendMessage, status, reload, setMessages, stop } = useChat() as any;
  const isLoading = status === 'streaming' || status === 'submitting';

  const [localInput, setLocalInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 对话持久化逻辑
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // 1. 初始化加载历史
  useEffect(() => {
    const saved = localStorage.getItem('uclaw_chats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConversations(parsed);

        // 如果当前 URL 有 ID，尝试恢复对话
        const match = pathname.match(/\/chat\/(.+)/);
        const chatIdFromUrl = match ? match[1] : null;
        if (chatIdFromUrl) {
          const chat = parsed.find((c: any) => c.id === chatIdFromUrl);
          if (chat) {
            setMessages(chat.messages);
            setCurrentChatId(chat.id);
          }
        }
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
  }, []);

  // 2. 监听 URL 变化，同步消息列表 (处理点击侧边栏或浏览器后退)
  useEffect(() => {
    const match = pathname.match(/\/chat\/(.+)/);
    const chatIdFromUrl = match ? match[1] : null;

    if (chatIdFromUrl && chatIdFromUrl !== currentChatId) {
      const chat = conversations.find(c => c.id === chatIdFromUrl);
      if (chat) {
        setMessages(chat.messages);
        setCurrentChatId(chat.id);
      }
    } else if (!chatIdFromUrl && pathname === '/' && currentChatId !== null) {
      // 回到首页，清空当前对话
      setMessages([]);
      setCurrentChatId(null);
    }
  }, [pathname, conversations]);

  // 3. 消息更新时同步到 LocalStorage 并更新 URL
  useEffect(() => {
    if (messages.length === 0) return;
    const id = currentChatId || `chat_${Date.now()}`;

    // 如果是新对话产生的第一个 ID，更新 URL
    if (!currentChatId) {
      setCurrentChatId(id);
      navigate(`/chat/${id}`, { replace: true });
    }

    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === id);
      const existing = prev[idx];

      const firstMsg = messages.find((m: any) => m.role === 'user')?.content || 'New Conversation';
      const defaultTitle = firstMsg.slice(0, 25) + (firstMsg.length > 25 ? '...' : '');
      const title = existing ? existing.title : defaultTitle;

      const updated = { id, title, messages, timestamp: Date.now() };
      let newList;
      if (idx > -1) {
        newList = [...prev];
        newList[idx] = updated;
      } else {
        newList = [updated, ...prev];
      }
      localStorage.setItem('uclaw_chats', JSON.stringify(newList));
      return newList;
    });
  }, [messages]);

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setActiveTab('chat');
    navigate('/');
  };

  const handleRenameChat = (id: string, newTitle: string) => {
    setConversations(prev => {
      const newList = prev.map(c => c.id === id ? { ...c, title: newTitle } : c);
      localStorage.setItem('uclaw_chats', JSON.stringify(newList));
      return newList;
    });
  };

  const handleDeleteChat = (id: string) => {
    setConversations(prev => {
      const newList = prev.filter(c => c.id !== id);
      localStorage.setItem('uclaw_chats', JSON.stringify(newList));
      return newList;
    });
    if (currentChatId === id) {
      handleNewChat();
    }
  };

  const loadConversation = (id: string) => {
    navigate(`/chat/${id}`);
  };

const [models, setModels] = useState<any[]>([]);
const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('uclaw_selected_model') || '');

// 每次模型选择变化时保存到 localStorage
useEffect(() => {
  if (selectedModelId) {
    localStorage.setItem('uclaw_selected_model', selectedModelId);
  }
}, [selectedModelId]);

// 动态获取可用模型
useEffect(() => {
  const fetchModels = async () => {
    try {
      const res = await fetch('/api/chat/models', {
        headers: {
          'Authorization': localStorage.getItem('uclaw_sso_token') || '',
          'X-User-Id': localStorage.getItem('uclaw_user_id') || ''
        }
      });
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.models || []);
        
        const iconMap: Record<string, any> = { 
          'Sparkles': Sparkles,
          'Cloud': Cloud,
          'Cpu': Cpu
        };
        const formattedModels = data.map((m: any) => ({
          ...m,
          icon: iconMap[m.icon] || Sparkles
        }));
        
        setModels(formattedModels);
        
        // 如果 localStorage 中没存，或者存的 ID 在列表中不存在，则使用第一个作为默认
        if (formattedModels.length > 0) {
          const exists = formattedModels.some((m: any) => m.id === selectedModelId);
          if (!selectedModelId || !exists) {
            setSelectedModelId(formattedModels[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };
  fetchModels();
}, []);

const activeModel = models.find(m => m.id === selectedModelId) || models[0] || { name: 'Loading...', icon: Sparkles, color: 'text-slate-400' };

const scrollRef = useRef<HTMLDivElement>(null);
const textAreaRef = useRef<HTMLTextAreaElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
const [showScrollButton, setShowScrollButton] = useState(false);

const handleScroll = () => {
  if (scrollRef.current) {
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 300);
  }
};

const scrollToBottom = () => {
  if (scrollRef.current) {
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }
};

useEffect(() => {
  if (activeTab === 'chat' && textAreaRef.current) {
    textAreaRef.current.focus();
  }
}, [currentChatId, activeTab]);

const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  }
};

const removeFile = (index: number) => {
  setSelectedFiles(prev => prev.filter((_, i) => i !== index));
};

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = () => {
  setIsDragging(false);
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  if (e.dataTransfer.files) {
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(prev => [...prev, ...files]);
  }
};

// TextArea 自动增高逻辑
useEffect(() => {
  if (textAreaRef.current) {
    textAreaRef.current.style.height = 'auto';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 200)}px`;
  }
}, [localInput]);

useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }
}, [messages]);

const copyToClipboard = (m: any) => {
  const text = Array.isArray(m.parts)
    ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
    : m.content || '';
  navigator.clipboard.writeText(text);
  setCopiedId(m.id);
  setTimeout(() => setCopiedId(null), 2000);
};

const onFormSubmit = async (e?: any) => {
  if (e) e.preventDefault();
  if ((!localInput.trim() && selectedFiles.length === 0) || isLoading) return;
  const val = localInput;
  setLocalInput('');
  const filesToUpload = [...selectedFiles];
  setSelectedFiles([]);
  try {
    await sendMessage({ text: val }, { body: { modelId: selectedModelId } });
  } catch (err) {
    console.error(err);
    setLocalInput(val);
    setSelectedFiles(filesToUpload);
  }
};

const renderToolResult = (part: any) => {
  if (part.type === 'tool-getBugInfo' || part.toolName === 'getBugInfo') {
    const bug = part.output || part.result;
    if (bug) return <BugCard key={part.toolCallId} {...bug} />;
  }
  if (part.type === 'tool-searchBugs' || part.toolName === 'searchBugs') {
    const bugs = part.output || part.result || [];
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 mt-2">
        {bugs.map((b: any) => <BugCard key={b.id} {...b} />)}
      </div>
    );
  }
  if (part.type === 'tool-getPipelineStatus' || part.toolName === 'getPipelineStatus') {
    const pipeline = part.output || part.result;
    if (pipeline) return <PipelineCard key={part.toolCallId} {...pipeline} />;
  }
  if (part.type === 'tool-proposePlan' || part.toolName === 'proposePlan') {
    const plan = part.output || part.result;
    if (plan) return (
      <TaskPlan
        key={part.toolCallId}
        {...plan}
        onConfirm={() => sendMessage({ text: 'Y' })}
        onCancel={() => sendMessage({ text: 'N' })}
      />
    );
  }
  if (part.type === 'tool-runLocalCommand' || part.toolName === 'runLocalCommand') {
    const res = part.output || part.result;
    if (res?.status === 'Success') {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs mt-2 overflow-hidden">
          <div className="flex items-center gap-2 mb-2 text-blue-600 font-semibold">
            <Terminal className="w-3 h-3" />
            <span>Local Node Execute: {res.command}</span>
          </div>
          <pre className="text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {JSON.stringify(res.result, null, 2)}
          </pre>
        </div>
      );
    }
  }
  return null;
};

return (
  <div className="min-h-screen bg-[#FCF9F8] text-[#1C1B1B] font-sans selection:bg-[#EC5B14]/20" onDragOver={handleDragOver}>

    {/* 1. 侧边栏 (Fixed App Shell) */}
    <Sidebar 
      activeMainTab={activeTab} 
      onMainTabChange={setActiveTab} 
      onOpenSettings={() => setIsSettingsOpen(true)}
      onNewChat={handleNewChat}
    />

    {/* 2. 主区域 (Fluid Workspace) */}
    <main className="ml-64 flex-1 flex flex-col relative min-h-screen">

      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onDragLeave={handleDragLeave} onDrop={handleDrop}
            className="absolute inset-0 z-50 bg-[#EC5B14]/5 backdrop-blur-[2px] border-4 border-dashed border-[#EC5B14]/20 m-4 rounded-[40px] flex flex-col items-center justify-center text-[#EC5B14]"
          >
            <Plus className="w-12 h-12 mb-4" />
            <p className="text-xl font-bold font-display">{t('common.drag_drop')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header: Search, Nav Tabs, Icons */}
      <header className="h-[88px] flex items-center justify-between px-8 bg-[#FCF9F8]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex-1 max-w-2xl">
          <div className="relative flex items-center w-full bg-white rounded-full px-4 py-2 border border-[#E8E4E2]/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <Search className="w-4 h-4 text-[#716B67] mr-3" />
            <input 
              type="text" 
              placeholder="Search insights, pipelines or docs..."
              className="flex-1 bg-transparent border-none text-[#1C1B1B] text-sm focus:outline-none placeholder:text-[#716B67]/70"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-10 ml-8">
          <nav className="flex items-center gap-6 font-semibold text-sm">
            <button className="text-[#EC5B14] border-b-2 border-[#EC5B14] pb-1 cursor-default">Dashboard</button>
            <button className="text-[#716B67] hover:text-[#1C1B1B] transition-colors pb-1">Analytics</button>
          </nav>
          
          <div className="flex items-center gap-4 text-[#716B67]">
            <button className="hover:text-[#1C1B1B] transition-colors"><BellIcon className="w-5 h-5" /></button>
            <button className="hover:text-[#1C1B1B] transition-colors" onClick={() => setIsSettingsOpen(true)}><Settings className="w-5 h-5" /></button>
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden ml-2 cursor-pointer border border-[#E8E4E2]">
               <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=WangEr" alt="profile" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Chat / Left Panel */}
        {activeTab === 'chat' || !activeTab ? (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div 
              ref={scrollRef} 
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-8 py-4 scroll-smooth"
            >
              <div className="max-w-[800px] mx-auto space-y-8">
                <AnimatePresence mode="popLayout" initial={false}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col mt-10">
                      <div className="flex items-start gap-6 bg-[#f6f3f2] p-8 rounded-[24px] mb-8 border border-transparent">
                        <div className="w-12 h-12 rounded-[12px] bg-white flex items-center justify-center shrink-0 shadow-sm text-[#EC5B14]">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold font-display text-[#1C1B1B] mb-2 cursor-default">Deployment Efficiency Optimized</h3>
                          <p className="text-[#716B67] text-sm leading-relaxed max-w-xl">
                            Based on current GitLab PR patterns and Jenkins pipeline history, I've identified a bottleneck in the staging environment.
                          </p>
                          <div className="flex gap-4 mt-6">
                            <div className="bg-white px-5 py-4 rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-w-[140px]">
                              <p className="text-[11px] text-[#716B67] font-semibold mb-1">Projected Improvement</p>
                              <p className="text-2xl font-bold font-display text-[#EC5B14]">15% Faster Cycle</p>
                            </div>
                            <div className="bg-white px-5 py-4 rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-w-[140px]">
                              <p className="text-[11px] text-[#716B67] font-semibold mb-1">Success Probability</p>
                              <p className="text-2xl font-bold font-display text-[#0066CC]">94%</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    messages.map((m: any) => (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={m.id} className={cn("flex flex-col group", m.role === 'user' ? "items-end" : "items-start w-full")}>
                        <div className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse max-w-[85%]" : "w-full")}>
                          
                          {/* Avatar */}
                          <div className="shrink-0 pt-1">
                            {m.role === 'user' ? (
                               <div className="w-8 h-8 rounded-full border border-[#E8E4E2] overflow-hidden"><img src="https://api.dicebear.com/7.x/avataaars/svg?seed=WangEr" alt="U" /></div>
                            ) : (
                               <div className="w-8 h-8 rounded-[8px] bg-[#EC5B14] flex items-center justify-center text-white shadow-sm"><Sparkles className="w-4 h-4" /></div>
                            )}
                          </div>

                          <div className={cn(
                            "py-3 px-5 rounded-[16px] text-[14px]",
                            m.role === 'user' 
                              ? "bg-white border border-[#E8E4E2]/60 text-[#1C1B1B] shadow-[0_4px_20px_rgba(0,0,0,0.02)]" 
                              : "bg-transparent text-[#1C1B1B]"
                          )}>                          
                            {Array.isArray(m.parts) ? (
                              m.parts.map((part: any, i: number) => (
                                <div key={i} className="prose prose-slate prose-sm max-w-none">
                                  {part.type === 'text' && <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>}
                                  {renderToolResult(part)}
                                </div>
                              ))
                            ) : (
                              <div className="prose prose-slate prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {m.content}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={cn("flex items-center gap-3 px-12 mt-2", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => copyToClipboard(m)} className="p-1 hover:bg-[#F6F3F2] rounded-md text-[#716B67]">{copiedId === m.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</button>
                            {m.role === 'assistant' && <button onClick={() => reload?.()} className="p-1 hover:bg-[#F6F3F2] rounded-md text-[#716B67]"><RotateCcw className="w-3 h-3" /></button>}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Input Area */}
            <div className="pt-2 pb-8 px-8 bg-gradient-to-t from-[#FCF9F8] via-[#FCF9F8] to-transparent z-10 w-full mt-auto">
              <div className="max-w-[800px] mx-auto">
                <div className="relative flex flex-col bg-white border border-[#E8E4E2]/50 shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[24px] p-2 transition-all group focus-within:ring-2 focus-within:ring-[#EC5B14]/20 focus-within:border-[#EC5B14]/40">
                  <div className="flex items-end">
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 text-[#716B67] hover:text-[#EC5B14] transition-colors"><ImageIcon className="w-5 h-5 flex-shrink-0" /></button>
                    <textarea
                      ref={textAreaRef}
                      rows={1}
                      value={localInput}
                      onChange={(e) => setLocalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!isLoading) onFormSubmit();
                        }
                      }}
                      placeholder="Type a message or command..."
                      className="flex-1 bg-transparent border-none text-[#1C1B1B] text-[15px] focus:ring-0 focus:outline-none p-3 resize-none min-h-[48px] max-h-[200px]"
                    />
                    <button 
                      onClick={() => isLoading ? stop() : onFormSubmit()} 
                      disabled={!isLoading && !localInput.trim()} 
                      className={cn(
                        "m-2 p-2.5 rounded-[12px] transition-all flex-shrink-0",
                        isLoading 
                          ? "bg-[#1C1B1B] text-white" 
                          : "btn-kinetic disabled:opacity-30 disabled:shadow-none hover:shadow-lg focus:outline-none"
                      )}
                    >
                      {isLoading ? <Square className="w-5 h-5 fill-current" /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 translate-x-0.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-[10px] font-bold text-[#716B67] uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> All systems operational</div>
                  <div className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> AI powered by uClaw Core v3</div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'library' ? (<SkillLibrary />) : activeTab === 'console' ? (<Dashboard />) : (<UIGallery />)}
        
        {/* Sidebar right Integrations Panel (only in Chat view) */}
        {(activeTab === 'chat' || !activeTab) && (
          <aside className="w-[320px] bg-[#FCF9F8] border-l border-[#E8E4E2]/50 p-6 flex flex-col gap-8 overflow-y-auto hidden lg:flex">
            
            {/* Active Integrations */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-[#1C1B1B]">Active Integrations</h4>
                <button className="text-[11px] font-bold text-[#EC5B14] hover:underline">Manage</button>
              </div>
              <div className="space-y-3">
                <div className="card-floating p-4 flex items-center justify-between group cursor-pointer hover:ring-2 hover:ring-[#EC5B14]/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] bg-[#1C1B1B] flex items-center justify-center text-white font-bold text-xs">GL</div>
                    <div>
                      <p className="text-sm font-bold text-[#1C1B1B]">GitLab</p>
                      <p className="text-[11px] text-[#716B67]">2 Pending MRs</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                </div>
                <div className="card-floating p-4 flex items-center justify-between group cursor-pointer hover:ring-2 hover:ring-[#EC5B14]/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] bg-[#0E1529] flex items-center justify-center text-red-500 font-bold text-xs"><Cpu className="w-4 h-4"/></div>
                    <div>
                      <p className="text-sm font-bold text-[#1C1B1B]">Jenkins</p>
                      <p className="text-[11px] text-[#716B67]">1 Pipeline Running</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[#EC5B14]"></div>
                </div>
                <div className="card-floating p-4 flex items-center justify-between group flex-col items-start gap-2">
                   <div className="w-full flex justify-between items-center">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-blue-100 flex items-center justify-center text-blue-600"><Database className="w-4 h-4"/></div>
                        <div>
                          <p className="text-sm font-bold text-[#1C1B1B]">ZenTao</p>
                          <p className="text-[11px] text-[#716B67]">4 Active Tasks</p>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                   </div>
                </div>
              </div>
            </div>

            {/* Contextual Actions */}
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#716B67] mb-3">Contextual Actions</h4>
              <div className="flex flex-wrap gap-2">
                <button className="px-3 py-1.5 rounded-full bg-[#EC5B14]/10 text-[#EC5B14] hover:bg-[#EC5B14]/20 text-xs font-semibold transition-colors">Summarize MR #842</button>
                <button className="px-3 py-1.5 rounded-full bg-[#EC5B14]/10 text-[#EC5B14] hover:bg-[#EC5B14]/20 text-xs font-semibold transition-colors">Fix Jenkins config</button>
                <button className="px-3 py-1.5 rounded-full bg-[#EC5B14]/10 text-[#EC5B14] hover:bg-[#EC5B14]/20 text-xs font-semibold transition-colors">Export Analysis PDF</button>
                <button className="px-3 py-1.5 rounded-full bg-[#EC5B14]/10 text-[#EC5B14] hover:bg-[#EC5B14]/20 text-xs font-semibold transition-colors">Sync ZenTao tasks</button>
              </div>
            </div>

            {/* Real-time Performance */}
            <div className="card-floating p-5 mt-auto">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-[#EC5B14]" />
                <h4 className="font-bold text-sm text-[#1C1B1B]">Real-time Performance</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#716B67] mb-1.5">
                    <span>Pipeline Velocity</span>
                    <span className="text-[#1C1B1B]">12.4m avg</span>
                  </div>
                  <div className="w-full bg-[#F6F3F2] h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#EC5B14] h-full" style={{ width: '82%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#716B67] mb-1.5">
                    <span>Merge Conflict Rate</span>
                    <span className="text-[#1C1B1B]">4.2%</span>
                  </div>
                  <div className="w-full bg-[#F6F3F2] h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#0066CC] h-full" style={{ width: '15%' }}></div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#716B67] mt-4">uClaw is monitoring <strong className="text-[#EC5B14]">8 repositories</strong> across your stack.</p>
            </div>

          </aside>
        )}
      </div>

    </main>
    <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(true)} />
  </div>
);
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppContent />} />
      <Route path="/chat/:id" element={<AppContent />} />
    </Routes>
  );
}

export default App;
