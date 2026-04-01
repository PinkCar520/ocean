import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { 
  ArrowUp, Sparkles, Terminal, 
  Settings, 
  LayoutDashboard, Database, AlertCircle, Search, Menu, MessageSquare,
  Copy, RotateCcw, Edit2, Check,
  PanelRightClose, PanelRightOpen,
  Store, Cpu, Plus, FileText, X as CloseIcon, Image as ImageIcon,
  ChevronDown, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import { cn } from './lib/utils';
import { BugCard } from './components/BugCard';
import { Dashboard } from './components/Dashboard';
import { PipelineCard } from './components/PipelineCard';
import { TaskPlan } from './components/TaskPlan';
import { UIGallery } from './components/UIGallery';
import { SkillLibrary } from './components/SkillLibrary';
import { NodeMonitor } from './components/NodeMonitor';

function App() {
  const { t, i18n } = useTranslation();
  const { messages, sendMessage, status, reload } = useChat() as any;
  const isLoading = status === 'streaming' || status === 'submitting';
  const isWaiting = status === 'submitting';

  const [localInput, setLocalInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedNodeId, setSelectedNodeId] = useState('pink-car');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const nodes = [
    { id: 'pink-car', name: 'PinkCar', status: 'online', load: '12%' },
    { id: 'blue-dragon', name: 'BlueDragon', status: 'standby', load: '2%' },
    { id: 'red-hawk', name: 'RedHawk', status: 'offline', load: '0%' },
  ];

  const activeNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLang);
  };

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

  const handleEdit = (m: any) => {
    const text = Array.isArray(m.parts) 
      ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
      : m.content || '';
    setLocalInput(text);
    inputRef.current?.focus();
  };

  const onFormSubmit = async (e: any) => {
    e.preventDefault();
    if ((!localInput.trim() && selectedFiles.length === 0) || isLoading) return;
    const val = localInput;
    setLocalInput('');
    const filesToUpload = [...selectedFiles];
    setSelectedFiles([]);
    try {
      await sendMessage({ text: val });
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
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs mt-2 overflow-hidden shadow-inner">
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
    <div className="flex h-screen bg-[#F9FAFB] text-slate-900 font-sans selection:bg-blue-100 overflow-hidden">
      
      {/* 1. 全局导航 (Sidebar) - 现代极简风格 */}
      <aside className="w-16 flex flex-col items-center py-6 border-r border-slate-200 bg-white shrink-0">
        <div className="bg-blue-600 p-2.5 rounded-xl mb-8">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <nav className="flex flex-col gap-8">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
            { id: 'chat', icon: MessageSquare, label: t('nav.chat') },
            { id: 'mcp_market', icon: Store, label: t('nav.mcp_market') },
            { id: 'skill_library', icon: Cpu, label: t('nav.skill_library') },
            { id: 'database', icon: Database, label: t('nav.database') },
            { id: 'settings', icon: Settings, label: t('nav.settings') },
          ].map(({ id, icon: Icon, label }) => (
            <button 
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              className={cn(
                "p-2 rounded-lg transition-all border",
                activeTab === id 
                  ? "text-blue-600 bg-blue-50 border-blue-100" 
                  : "text-slate-400 hover:text-slate-600 border-transparent"
              )}>
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </nav>
      </aside>

      {/* 3. 中间主区域 (Workspace) */}
      <main className="flex-1 flex flex-col relative bg-white overflow-hidden">
        
        {/* 顶部工具栏 */}
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-8 bg-white/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
              <span className="text-xs font-bold font-mono tracking-tight text-slate-400">PROJECT / ALPHA_UC</span>
              <span className="text-slate-200">/</span>
              <span className="text-xs font-bold text-slate-800 uppercase">
                {activeTab === 'chat' ? t('nav.chat') : t(`nav.${activeTab}`)}
              </span>
            </div>

            {/* Node Selector (Replacement for the sidebar) */}
            <button 
              onClick={() => setActiveTab('node_monitor')}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group"
            >
              <div className={cn(
                "w-2 h-2 rounded-full ring-4",
                activeNode.status === 'online' ? "bg-emerald-500 ring-emerald-500/10" : 
                activeNode.status === 'standby' ? "bg-amber-500 ring-amber-500/10" : "bg-slate-300 ring-slate-300/10"
              )} />
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{activeNode.name}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-none">{activeNode.load} Load</span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-6">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input placeholder="Quick search..." className="bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 ring-blue-500/10 w-48" />
             </div>
             
             <button 
                onClick={toggleLanguage}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-tight"
             >
                {i18n.language.startsWith('zh') ? 'EN' : '中文'}
             </button>

             <button 
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                title={rightPanelOpen ? "Close Context Panel" : "Open Context Panel"}
             >
                {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
             </button>
             <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=WangEr`} alt="avatar" />
             </div>
          </div>
        </header>

        {activeTab === 'chat' ? (
          <>
            {/* 协作聊天流 */}
            <div 
              ref={scrollRef} 
              onDragOver={handleDragOver}
              className="flex-1 overflow-y-auto px-6 py-12 scroll-smooth bg-[#F9FAFB]/30 relative"
            >
              {/* Drag Overlay */}
              <AnimatePresence>
                {isDragging && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="absolute inset-0 z-50 bg-blue-600/10 backdrop-blur-[2px] border-4 border-dashed border-blue-500/50 m-4 rounded-[40px] flex flex-col items-center justify-center text-blue-600"
                  >
                    <div className="bg-white p-6 rounded-full shadow-xl shadow-blue-500/20 mb-4">
                      <Plus className="w-10 h-10" />
                    </div>
                    <p className="text-xl font-bold">{t('common.drag_drop')}</p>
                    <p className="text-sm font-medium opacity-70 mt-2">{t('common.file_limit')}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="max-w-4xl mx-auto space-y-10">
                <AnimatePresence mode="popLayout" initial={false}>
                  {messages.length === 0 ? (
                    <motion.div 
                      key="empty-state"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex flex-col items-center justify-center h-[50vh] text-center"
                    >
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 mb-8">
                        <Sparkles className="w-12 h-12 text-blue-600 stroke-[1.2]" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{t('chat.empty_title')}</h3>
                        <p className="text-sm text-slate-400 max-w-sm mt-4 leading-relaxed">
                          <Trans i18nKey="chat.empty_desc">
                            Bridge your <span className="text-slate-900 font-semibold tracking-tight">CLI node</span> with enterprise workflows.
                          </Trans>
                        </p>
                      </div>
                      </motion.div>
                      ) : (
                      messages.map((m: any) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        key={m.id} 
                        className={cn("flex flex-col group", m.role === 'user' ? "items-end" : "items-start w-full")}
                      >
                        <div className={cn("flex flex-col space-y-2", m.role === 'user' ? "max-w-[85%] items-end" : "w-full")}>
                          <div className={cn(
                            "px-7 py-4 rounded-3xl leading-relaxed text-[15px] relative",
                            m.role === 'user' 
                              ? "bg-blue-600 text-white rounded-tr-none" 
                              : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                          )}>
                            {Array.isArray(m.parts) ? (
                              m.parts.map((part: any, i: number) => (
                                <div key={i}>
                                  {part.type === 'text' && <p className="whitespace-pre-wrap">{part.text}</p>}
                                  {renderToolResult(part)}
                                </div>
                              ))
                            ) : (
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            )}
                          </div>

                          {/* 角色标签与功能按钮 */}
                          <div className={cn("flex items-center gap-3 px-2 mt-1", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                              {m.role === 'assistant' ? t('chat.role_assistant') : t('chat.role_user')}
                            </span>

                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => copyToClipboard(m)}
                                className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-600"
                                title={t('common.copy')}
                              >
                                {copiedId === m.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                              </button>

                              {m.role === 'user' && (
                                <button 
                                  onClick={() => handleEdit(m)}
                                  className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-600"
                                  title={t('common.edit')}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}

                              {m.role === 'assistant' && (
                                <button 
                                  onClick={() => reload?.()}
                                  className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-600"
                                  title={t('common.regenerate')}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                      ))
                      )}
                      </AnimatePresence>                {isWaiting && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-5 animate-pulse opacity-50"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="h-10 w-24 bg-slate-100 rounded-2xl" />
                  </motion.div>
                )}
              </div>
            </div>

            {/* 底部输入框 */}
            <div className="p-8 bg-white border-t border-slate-100 z-10">
              {/* File Preview Bar */}
              <AnimatePresence>
                {selectedFiles.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex flex-wrap gap-3 mb-4 max-w-4xl mx-auto"
                  >
                    {selectedFiles.map((file, i) => (
                      <motion.div 
                        layout
                        key={`${file.name}-${i}`}
                        className="group relative flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl"
                      >
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="w-4 h-4 text-blue-500" />
                        ) : (
                          <FileText className="w-4 h-4 text-orange-500" />
                        )}
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 max-w-[120px] truncate">{file.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <button 
                          onClick={() => removeFile(i)}
                          className="p-1 rounded-full bg-slate-200 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                        >
                          <CloseIcon className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={onFormSubmit} className="relative max-w-4xl mx-auto">
                <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl pl-2 pr-2 py-2 transition-all focus-within:ring-4 ring-blue-500/5 focus-within:border-blue-500/50">
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    onChange={onFileChange} 
                    className="hidden" 
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-xl hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                    title={t('common.upload_files')}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <input
                    ref={inputRef}
                    className="flex-1 bg-transparent border-none text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-0 h-10 ml-2"
                    value={localInput}
                    placeholder={t('chat.placeholder')}
                    onChange={(e) => setLocalInput(e.target.value)}
                    disabled={isLoading}
                  />
                  <button 
                    type="submit" 
                    disabled={isLoading || (!localInput.trim() && selectedFiles.length === 0)}
                    className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-20 shrink-0"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </form>
              <div className="flex items-center justify-center gap-4 mt-6">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{t('chat.status_secured')}</span>
                <span className="text-slate-200">•</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{t('chat.status_stable')}</span>
              </div>
            </div>
          </>
        ) : activeTab === 'dashboard' ? (
          <Dashboard />
        ) : activeTab === 'skill_library' ? (
          <SkillLibrary />
        ) : activeTab === 'node_monitor' ? (
          <NodeMonitor />
        ) : activeTab === 'database' ? (
          <UIGallery />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50/50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mx-auto mb-6 shadow-sm">
                {activeTab === 'dashboard' && <LayoutDashboard className="w-8 h-8 text-blue-500" />}
                {activeTab === 'mcp_market' && <Store className="w-8 h-8 text-orange-500" />}
                {activeTab === 'skill_library' && <Cpu className="w-8 h-8 text-emerald-500" />}
                {activeTab === 'node_monitor' && <Activity className="w-8 h-8 text-rose-500" />}
                {activeTab === 'database' && <Database className="w-8 h-8 text-indigo-500" />}
                {activeTab === 'settings' && <Settings className="w-8 h-8 text-slate-500" />}
              </div>
              <h2 className="text-xl font-bold text-slate-800 capitalize">{t('common.dev_view')}</h2>
              <p className="text-slate-400 text-sm mt-2">{t('common.dev_desc')}</p>
            </motion.div>
          </div>
        )}
      </main>

      {/* 4. 右侧辅助面板 (Status/Tasks) */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: rightPanelOpen ? 320 : 0,
          opacity: rightPanelOpen ? 1 : 0,
          borderLeftWidth: rightPanelOpen ? 1 : 0
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="border-slate-200 bg-white hidden xl:flex flex-col shrink-0 overflow-hidden"
      >
        <div className="w-80 p-8 flex flex-col h-full">
           <div className="flex items-center gap-2 mb-8">
              <AlertCircle className="w-4 h-4 text-blue-500" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-800">{t('sidebar.workspace_context')}</h2>
           </div>
           <div className="space-y-8">
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t('sidebar.core_stats')}</div>
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-400 mb-1">{t('common.bugs')}</div>
                      <div className="text-sm font-bold text-slate-800">12</div>
                   </div>
                   <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-400 mb-1">{t('common.commits')}</div>
                      <div className="text-sm font-bold text-slate-800">48</div>
                   </div>
                </div>
              </div>

              
              <div className="space-y-4">
                 <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">{t('sidebar.recent_activity')}</h3>
                 <div className="space-y-5">
                    {[1, 2].map(i => (
                      <div key={i} className="flex gap-4 items-start relative pl-2">
                         <div className="absolute left-0 top-2 w-1 h-1 rounded-full bg-blue-500" />
                         <div className="text-[11px] text-slate-500 leading-relaxed">
                            <span className="text-slate-800 font-semibold">PinkCar</span> {t('sidebar.executed_command')} <code className="bg-slate-100 px-1 rounded text-blue-600">git status</code>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </motion.aside>

    </div>
  );
}

// 简单的 Badge 辅助组件
function Badge({ children, className }: any) {
  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
      className
    )}>
      {children}
    </span>
  );
}

export default App;
