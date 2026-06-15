import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';
import { Plus, Save, Trash2, Cpu, Play, ArrowLeft, Wrench, MoreVertical, MessageSquare, HelpCircle, Edit2, Download, UploadCloud, RefreshCw, Info, Search, Pin, Terminal, History, Copy, ChevronDown, X } from 'lucide-react';
import CodeEditor from '@uiw/react-textarea-code-editor';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { SkillSandbox } from './SkillSandbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

export function SkillManager({ token, onMainTabChange }: { token?: string | null, onMainTabChange?: (tab: string) => void }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<any[]>([]);
  const [activeSkill, setActiveSkill] = useState<any | null>(null);
  const [originalSkill, setOriginalSkill] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFormEditable, setIsFormEditable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<any | null>(null);
  const [skillHistory, setSkillHistory] = useState<any[]>([]);

  const hasUnsavedChanges = isFormEditable && JSON.stringify(activeSkill) !== JSON.stringify(originalSkill);

  useEffect(() => {
    if (activeSkill?.id) {
      const history = JSON.parse(localStorage.getItem(`ocean_skill_history_${activeSkill.id}`) || '[]');
      setSkillHistory(history);
    } else {
      setSkillHistory([]);
    }
  }, [activeSkill?.id]);

  useEffect(() => {
    fetchSkills();
    const savedPins = localStorage.getItem('ocean_pinned_skills');
    if (savedPins) {
      try {
        setPinnedSkillIds(JSON.parse(savedPins));
      } catch (e) {}
    }
  }, []);

  const fetchSkills = async () => {
    try {
      const res = await api.get<any>('/api/skills');
      if (res.data) {
        setSkills(res.data);

        // Auto-select skill if specified in localStorage (e.g., from ChatInput click)
        const targetName = localStorage.getItem('ocean_active_skill_name');
        if (targetName) {
          const target = res.data.find((s: any) => s.name === targetName);
          if (target) {
            setActiveSkill(target);
            setOriginalSkill(target);
            setIsEditing(true);
            setIsFormEditable(false);
          }
          localStorage.removeItem('ocean_active_skill_name');
        }
      }
    } catch (err) {
      console.error('Failed to fetch skills', err);
    }
  };

  const handleCreate = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation('create');
      return;
    }
    const newSkill = {
      name: 'New Skill',
      description: '',
      triggerKws: [],
      content: '# Context\n\nYou are an expert in...',
      scope: 'team',
    };
    setActiveSkill(newSkill);
    setOriginalSkill(newSkill);
    setIsEditing(true);
    setIsFormEditable(true);
  };

  const handleDiscardAndNavigate = () => {
    if (pendingNavigation === 'create') {
      const newSkill = {
        name: 'New Skill',
        description: '',
        triggerKws: [],
        content: '# Context\n\nYou are an expert in...',
        scope: 'team',
      };
      setActiveSkill(newSkill);
      setOriginalSkill(newSkill);
      setIsEditing(true);
      setIsFormEditable(true);
    } else if (pendingNavigation === 'library') {
      onMainTabChange?.('library');
    } else if (pendingNavigation) {
      setActiveSkill(pendingNavigation);
      setOriginalSkill(pendingNavigation);
      setIsEditing(true);
      setIsFormEditable(false);
    }
    setPendingNavigation(null);
  };

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedSkillIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      localStorage.setItem('ocean_pinned_skills', JSON.stringify(next));
      return next;
    });
  };

  const handleExport = () => {
    if (!activeSkill) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeSkill, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${activeSkill.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const restoreVersion = (version: any) => {
    setActiveSkill({ ...activeSkill, content: version.content, name: version.name });
    setIsEditing(true);
    setIsFormEditable(true);
  };

  const handleSave = async () => {
    if (!activeSkill) return;
    try {
      if (activeSkill.id) {
        // Update
        await api.put(`/api/skills/${activeSkill.id}`, activeSkill);
      } else {
        // Create
        const res = await api.post('/api/skills', activeSkill);
        setActiveSkill(res.data);
      }
      await fetchSkills();
      
      const skillId = activeSkill.id || (await api.get('/api/skills')).data.find((s: any) => s.name === activeSkill.name)?.id;

      if (skillId) {
        const history = JSON.parse(localStorage.getItem(`ocean_skill_history_${skillId}`) || '[]');
        history.unshift({
          timestamp: new Date().toISOString(),
          name: activeSkill.name,
          content: activeSkill.content,
        });
        const limitedHistory = history.slice(0, 10);
        localStorage.setItem(`ocean_skill_history_${skillId}`, JSON.stringify(limitedHistory));
        setSkillHistory(limitedHistory);
      }

      setOriginalSkill(activeSkill);
      setIsFormEditable(false);
    } catch (err) {
      console.error('Failed to save skill', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;
    try {
      await api.delete(`/api/skills/${id}`);
      if (activeSkill?.id === id) {
        setActiveSkill(null);
        setIsEditing(false);
      }
      await fetchSkills();
    } catch (err) {
      console.error('Failed to delete skill', err);
    }
  };

  const filteredSkills = skills.filter(s => {
    const term = searchQuery.toLowerCase();
    if (!term) return true;
    return s.name.toLowerCase().includes(term) ||
           (s.description && s.description.toLowerCase().includes(term)) ||
           (s.trigger_keywords && s.trigger_keywords.some((k: string) => k.toLowerCase().includes(term)));
  });

  const pinnedSkills = filteredSkills.filter(s => pinnedSkillIds.includes(s.id));
  const unpinnedSkills = filteredSkills.filter(s => !pinnedSkillIds.includes(s.id));

  const renderSkillItem = (s: any, isPinned: boolean) => (
    <div
      key={s.id}
      onClick={() => {
        if (hasUnsavedChanges) {
          if (activeSkill?.id !== s.id) {
            setPendingNavigation(s);
          }
        } else {
          setActiveSkill(s);
          setOriginalSkill(s);
          setIsEditing(true);
          setIsFormEditable(false);
        }
      }}
      className={cn(
        "p-2 rounded-lg cursor-pointer text-sm font-medium transition-colors group flex items-center justify-between mb-0.5",
        activeSkill?.id === s.id ? "bg-[#EC5B14]/10 text-[#EC5B14]" : "text-[#716B67] hover:bg-[#1C1B1B]/5 hover:text-[#1C1B1B]"
      )}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <Terminal className="w-3.5 h-3.5 shrink-0 opacity-50" />
        <span className="truncate">{s.name}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={(e) => togglePin(e, s.id)}
          className={cn(
            "p-1 rounded hover:bg-black/5 transition-opacity",
            isPinned ? "opacity-100 text-[#EC5B14]" : "opacity-0 group-hover:opacity-100 text-[#A8A4A1] hover:text-[#1C1B1B]"
          )}
          title={isPinned ? "Unpin" : "Pin to top"}
        >
          <Pin className={cn("w-3.5 h-3.5", isPinned && "fill-current")} />
        </button>
        {/* Status dot */}
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" title="Active"></div>
      </div>
    </div>
  );

  return (
    <div className="flex w-full h-full bg-[#F6F3F2] font-sans">
      {/* Left Sidebar: List of Skills */}
      <div className="w-64 border-r border-[#E8E4E2] bg-transparent flex flex-col shrink-0">
        <div className="px-4 py-0 border-b border-[#E8E4E2] flex items-center justify-between shrink-0 h-[60px]">
          <h2 className="font-sans text-[14px] font-bold text-[#1C1B1B] flex items-center gap-1">
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  setPendingNavigation('library');
                } else {
                  onMainTabChange?.('library');
                }
              }}
              className="relative z-[9999] p-1 -ml-1 mr-1 hover:bg-[#F6F3F2] rounded text-[#A8A4A1] hover:text-[#1C1B1B] transition-colors flex items-center justify-center group"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              title="Return to Skill Library"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            Skill Studio
          </h2>
          <button 
            onClick={handleCreate}
            className="relative z-[9999] p-1 hover:bg-[#1C1B1B]/5 rounded text-[#716B67] hover:text-[#1C1B1B] transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="Create New Skill"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-2 border-b border-[#E8E4E2]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#A8A4A1] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#1C1B1B]/5 rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-[#1C1B1B] placeholder:text-[#A8A4A1] focus:outline-none focus:ring-1 focus:ring-[#EC5B14]/30"
            />
          </div>
          <div className="text-[11px] font-medium text-[#A8A4A1] mt-2 px-1">
            {filteredSkills.length} {filteredSkills.length === 1 ? 'Skill' : 'Skills'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {pinnedSkills.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[11px] font-bold text-[#A8A4A1] uppercase tracking-wider">Pinned</div>
              {pinnedSkills.map(s => renderSkillItem(s, true))}
            </div>
          )}
          {unpinnedSkills.length > 0 && (
            <div>
              {pinnedSkills.length > 0 && <div className="px-2 py-1 text-[11px] font-bold text-[#A8A4A1] uppercase tracking-wider mt-2">All Skills</div>}
              {unpinnedSkills.map(s => renderSkillItem(s, false))}
            </div>
          )}
          {filteredSkills.length === 0 && (
            <div className="px-2 py-4 text-center text-[13px] text-[#A8A4A1]">
              No skills found.
            </div>
          )}
        </div>
      </div>

      {/* Main Area: Editor + Sandbox */}
      <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
        {isEditing && activeSkill ? (
          <>
            {/* Editor */}
            <div className="flex-1 flex flex-col border-r border-[#E8E4E2] bg-[#fcf9f8]">
              {/* Header */}
              <div className="px-6 py-0 border-b border-[#E8E4E2] flex items-center justify-between shrink-0 h-[60px]">
                <h3 className="font-sans text-[14px] font-bold text-[#1C1B1B]">Edit Skill</h3>
                <div 
                  className="flex items-center gap-2 relative z-[9999] titlebar-no-drag"
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                >
                  {isFormEditable && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setActiveSkill(originalSkill);
                          setIsFormEditable(false);
                        }}
                        title="Cancel Editing"
                        className="p-1.5 rounded-lg hover:bg-[#1C1B1B]/5 text-[#716B67] hover:text-[#1C1B1B] transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleSave}
                        title="Save Changes"
                        className="p-1.5 rounded-lg hover:bg-[#EC5B14]/10 text-[#EC5B14] transition-colors"
                      >
                        <Save className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg hover:bg-[#1C1B1B]/5 text-[#716B67] hover:text-[#1C1B1B] transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8} className="w-56 border-[#E8E4E2] shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-white/95 z-[10000]">
                      <DropdownMenuItem 
                        onClick={() => setIsFormEditable(true)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] focus:bg-[#F6F3F2] mb-0.5"
                      >
                        <Edit2 className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleExport}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] focus:bg-[#F6F3F2] mb-0.5"
                      >
                        <Download className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Export</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          if (activeSkill) {
                            localStorage.setItem('ocean_try_skill_name', activeSkill.name);
                            window.location.hash = '#/';
                            onMainTabChange?.('chat');
                          }
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] focus:bg-[#F6F3F2] mb-0.5"
                      >
                        <MessageSquare className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Try in chat</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#E8E4E2]/50 my-1" />
                      <DropdownMenuItem 
                        onClick={() => handleDelete(activeSkill.id)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#EF4444] focus:bg-[#EF4444] hover:text-white focus:text-white mb-0.5 group"
                      >
                        <Trash2 className="w-4 h-4 text-[#EF4444] group-hover:text-white group-focus:text-white shrink-0 transition-colors" />
                        <span className="text-[13px] font-medium text-[#EF4444] flex-1 group-hover:text-white group-focus:text-white transition-colors">Uninstall</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {/* Meta info section */}
                <div className="pb-4 border-b border-[#E8E4E2]/50 space-y-4">
                  <div className="flex items-start gap-10">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[13px] text-[#A8A4A1] whitespace-nowrap">Added by</span>
                      <span className="text-[14px] font-medium text-[#1C1B1B] truncate">{activeSkill.author || 'You'}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[13px] text-[#A8A4A1] whitespace-nowrap">Last updated</span>
                      <span className="text-[14px] font-medium text-[#1C1B1B] whitespace-nowrap">
                        {activeSkill.updatedAt ? new Date(activeSkill.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[13px] text-[#A8A4A1] whitespace-nowrap">Trigger</span>
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <span className="text-[14px] font-medium text-[#1C1B1B] border-b border-dashed border-[#A8A4A1] self-start cursor-help pb-0.5 whitespace-nowrap">
                              Slash command + auto
                            </span>
                          </TooltipTrigger>
                          <TooltipContent 
                            className="z-[10000] bg-[#1C1B1B] text-white p-3 rounded-lg text-[13px] max-w-[250px] leading-relaxed shadow-[0_10px_30px_rgba(0,0,0,0.1)] border-none"
                            sideOffset={6}
                          >
                            Appears in the / menu. Ocean can also run it automatically when relevant.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[13px] text-[#A8A4A1] whitespace-nowrap">History</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center gap-1.5 text-[14px] font-medium text-[#1C1B1B] hover:text-[#EC5B14] transition-colors self-start cursor-pointer border-b border-dashed border-[#A8A4A1] pb-0.5 whitespace-nowrap"
                            title="Select Version"
                          >
                            <History className="w-3.5 h-3.5 opacity-50" />
                            Current
                            <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[200px] border-[#E8E4E2] shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-white/95 z-[10000]">
                          <div className="px-2 py-1.5 text-[11px] font-bold text-[#A8A4A1] uppercase tracking-wider">Restore Version</div>
                          {skillHistory.length === 0 && (
                            <div className="px-2 py-2 text-[12px] text-[#A8A4A1]">No history available</div>
                          )}
                          {skillHistory.map((version, index) => (
                            <DropdownMenuItem 
                              key={index} 
                              onClick={() => restoreVersion(version)}
                              className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] focus:bg-[#F6F3F2] text-[12px]"
                            >
                              <History className="w-3.5 h-3.5 text-[#A8A4A1] shrink-0" />
                              <span className="truncate">{new Date(version.timestamp).toLocaleString()}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-[13px] text-[#A8A4A1] mb-1.5">
                      Description <Info className="w-3.5 h-3.5 text-[#A8A4A1]" />
                    </label>
                    {isFormEditable ? (
                      <textarea
                        value={activeSkill.description}
                        onChange={e => setActiveSkill({ ...activeSkill, description: e.target.value })}
                        className="w-full border border-[#E8E4E2] rounded-lg p-2 text-sm h-20 focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/30"
                      />
                    ) : (
                      <div className="text-[14px] leading-relaxed text-[#1C1B1B]">
                        {activeSkill.description || 'No description provided.'}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#716B67] mb-1">Name</label>
                  <input
                    type="text"
                    value={activeSkill.name}
                    readOnly={!isFormEditable}
                    onChange={e => setActiveSkill({ ...activeSkill, name: e.target.value })}
                    className={cn(
                      "w-full border border-[#E8E4E2] rounded-lg p-2 text-sm focus:outline-none",
                      isFormEditable ? "focus:ring-2 focus:ring-[#EC5B14]/30" : "bg-[#F6F3F2]/50 text-[#716B67]"
                    )}
                  />
                </div>
                <div>
                  <label className="block text-[13px] text-[#A8A4A1] mb-1.5">Trigger Keywords (comma separated)</label>
                  <input
                    type="text"
                    value={(activeSkill.triggerKws || []).join(', ')}
                    readOnly={!isFormEditable}
                    onChange={e => setActiveSkill({ ...activeSkill, triggerKws: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    className={cn(
                      "w-full border border-[#E8E4E2] rounded-lg p-2 text-sm focus:outline-none",
                      isFormEditable ? "focus:ring-2 focus:ring-[#EC5B14]/30 bg-white" : "bg-transparent text-[#1C1B1B] font-mono opacity-80"
                    )}
                  />
                </div>
                <div className="flex-1 flex flex-col min-h-[300px]">
                  <label className="block text-xs font-bold text-[#716B67] mb-1">Body (Markdown Prompt)</label>
                  <div className={cn(
                    "flex-1 w-full border border-[#E8E4E2] rounded-lg overflow-hidden flex flex-col",
                    isFormEditable ? "focus-within:ring-2 focus-within:ring-[#EC5B14]/30 bg-white" : "border-transparent bg-transparent"
                  )}>
                    <CodeEditor
                      value={activeSkill.content}
                      language="markdown"
                      placeholder="Please enter markdown code."
                      onChange={(e) => setActiveSkill({ ...activeSkill, content: e.target.value })}
                      disabled={!isFormEditable}
                      padding={16}
                      style={{
                        fontSize: 13,
                        backgroundColor: 'transparent',
                        fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                        flex: 1,
                        height: '100%',
                        minHeight: 300,
                      }}
                      className={cn(
                        "text-[#1C1B1B] flex-1 overflow-y-auto",
                        !isFormEditable && "opacity-80"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sandbox Panel */}
            <div className="w-[400px] shrink-0 bg-[#F6F3F2] flex flex-col">
              <SkillSandbox activeSkill={activeSkill} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-4 bg-[#fcf9f8]">
            <Wrench className="w-12 h-12 opacity-20" />
            <p>Select a skill or create a new one to start editing.</p>
          </div>
        )}
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={pendingNavigation !== null} onOpenChange={(open) => !open && setPendingNavigation(null)}>
        <DialogContent className="sm:max-w-[425px] bg-white rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#1C1B1B]">Unsaved Changes</DialogTitle>
            <DialogDescription className="text-sm text-[#716B67]">
              You have unsaved changes in the current skill. If you leave now, these changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <button
              onClick={() => setPendingNavigation(null)}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-[#F6F3F2] text-[#716B67] hover:bg-[#E8E4E2] transition-colors"
            >
              Continue Editing
            </button>
            <button
              onClick={handleDiscardAndNavigate}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors shadow-sm"
            >
              Discard Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
