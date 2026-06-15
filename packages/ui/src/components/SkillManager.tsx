import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';
import { Plus, Save, Trash2, Cpu, Play, ArrowLeft, Wrench, MoreVertical, MessageSquare, HelpCircle, Edit2, Download, UploadCloud, RefreshCw, Info } from 'lucide-react';
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

export function SkillManager({ token, onMainTabChange }: { token?: string | null, onMainTabChange?: (tab: string) => void }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<any[]>([]);
  const [activeSkill, setActiveSkill] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFormEditable, setIsFormEditable] = useState(false);

  useEffect(() => {
    fetchSkills();
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
    setActiveSkill({
      name: 'New Skill',
      description: '',
      trigger_keywords: [],
      body: '# Context\n\nYou are an expert in...',
      scope: 'team',
    });
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
        await api.post('/api/skills', activeSkill);
      }
      await fetchSkills();
      setIsEditing(false);
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

  return (
    <div className="flex w-full h-full bg-[#F6F3F2] font-sans">
      {/* Left Sidebar: List of Skills */}
      <div className="w-64 border-r border-[#E8E4E2] bg-transparent flex flex-col shrink-0">
        <div className="px-4 py-0 border-b border-[#E8E4E2] flex items-center justify-between shrink-0 h-[60px]">
          <h2 className="font-sans text-[14px] font-bold text-[#1C1B1B] flex items-center gap-1">
            <button
              onClick={() => onMainTabChange?.('library')}
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
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {skills.map(s => (
            <div
              key={s.id}
              onClick={() => { setActiveSkill(s); setIsEditing(true); setIsFormEditable(false); }}
              className={cn(
                "p-2 rounded-lg cursor-pointer text-sm font-medium transition-colors group flex items-center justify-between",
                activeSkill?.id === s.id ? "bg-[#EC5B14]/10 text-[#EC5B14]" : "text-[#716B67] hover:bg-[#1C1B1B]/5 hover:text-[#1C1B1B]"
              )}
            >
              <span className="truncate">{s.name}</span>
            </div>
          ))}
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
                    <button
                      onClick={handleSave}
                      title="Save"
                      className="flex items-center justify-center bg-[#EC5B14] text-white w-8 h-8 rounded-lg hover:bg-[#d04a0d] transition-colors shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg hover:bg-[#1C1B1B]/5 text-[#716B67] hover:text-[#1C1B1B] transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8} className="w-56 border-[#E8E4E2] shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-white/95">
                      <DropdownMenuItem 
                        onClick={() => {
                          if (activeSkill) {
                            localStorage.setItem('ocean_try_skill_name', activeSkill.name);
                            window.location.hash = '#/';
                            onMainTabChange?.('chat');
                          }
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] mb-0.5"
                      >
                        <MessageSquare className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Try in chat</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] mb-0.5">
                        <HelpCircle className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Help</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#E8E4E2]/50 my-1" />
                      <DropdownMenuItem 
                        onClick={() => setIsFormEditable(true)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] mb-0.5"
                      >
                        <Edit2 className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F6F3F2] mb-0.5">
                        <Download className="w-4 h-4 text-[#1C1B1B] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1C1B1B] flex-1">Download</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#E8E4E2]/50 my-1" />
                      <DropdownMenuItem className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#FEF2F2] mb-0.5 group">
                        <Trash2 className="w-4 h-4 text-[#EF4444] shrink-0" />
                        <span className="text-[13px] font-medium text-[#EF4444] flex-1 group-focus:text-[#EF4444]">Uninstall</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {/* Meta info section */}
                <div className="pb-4 border-b border-[#E8E4E2]/50 space-y-4">
                  <div className="flex items-start gap-16">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] text-[#A8A4A1]">Added by</span>
                      <span className="text-[14px] font-medium text-[#1C1B1B]">{activeSkill.author || 'You'}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] text-[#A8A4A1]">Last updated</span>
                      <span className="text-[14px] font-medium text-[#1C1B1B]">
                        {activeSkill.updatedAt ? new Date(activeSkill.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] text-[#A8A4A1]">Trigger</span>
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
                  <label className="block text-xs font-bold text-[#716B67] mb-1">Trigger Keywords (comma separated)</label>
                  <input
                    type="text"
                    value={(activeSkill.trigger_keywords || []).join(', ')}
                    readOnly={!isFormEditable}
                    onChange={e => setActiveSkill({ ...activeSkill, trigger_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    className={cn(
                      "w-full border border-[#E8E4E2] rounded-lg p-2 text-sm focus:outline-none",
                      isFormEditable ? "focus:ring-2 focus:ring-[#EC5B14]/30" : "bg-[#F6F3F2]/50 text-[#716B67]"
                    )}
                  />
                </div>
                <div className="flex-1 flex flex-col min-h-[300px]">
                  <label className="block text-xs font-bold text-[#716B67] mb-1">Body (Markdown Prompt)</label>
                  <textarea
                    value={activeSkill.body}
                    readOnly={!isFormEditable}
                    onChange={e => setActiveSkill({ ...activeSkill, body: e.target.value })}
                    className={cn(
                      "flex-1 w-full border border-[#E8E4E2] rounded-lg p-4 text-sm font-mono focus:outline-none bg-white",
                      isFormEditable ? "focus:ring-2 focus:ring-[#EC5B14]/30" : "bg-transparent text-[#716B67] border-transparent p-0"
                    )}
                  />
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
    </div>
  );
}
