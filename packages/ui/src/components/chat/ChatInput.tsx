import React, { useState, useLayoutEffect } from 'react';
import {
  Plus, FileText, X as CloseIcon,
  ChevronDown, Paperclip, ArrowUp, Square, Globe, Database, Check, Sparkles, Terminal, Cpu, FolderPlus, Wand2, Plug, BookOpen, Wrench, Briefcase, Archive, Settings2, Bug, Puzzle, Mic, AudioLines
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { beautifyModelName } from '../../lib/chat-utils';
import { useProjects } from '../../lib/useProjects';
import { useInstalledSkills } from '../../lib/useInstalledSkills';
import { ProjectCreateModal } from '../ProjectCreateModal';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { globalToast } from '../GlobalToast';
import { api } from '../../lib/api-client';
import { useVoiceInput } from '../../lib/useVoiceInput';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { getMentionSuggestion } from './extensions/mentionSuggestion';
import { getSlashSuggestion } from './extensions/slashSuggestion';
import { SlashCommand } from './extensions/SlashCommandExtension';
import { GhostTextExtension } from './extensions/GhostTextExtension';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '../ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '../ui/tooltip';

interface ChatInputProps {
  localInput: string;
  setLocalInput: (val: string) => void;
  selectedSkill?: { name: string; provider: string; desc?: string; icon?: any } | null;
  setSelectedSkill?: (skill: { name: string; provider: string; desc?: string; icon?: any } | null) => void;
  attachments: any[];
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: (val: boolean) => void;
  isSearchMode: boolean;
  setIsSearchMode: (val: boolean) => void;
  isKnowledgeMode: boolean;
  setIsKnowledgeMode: (val: boolean) => void;
  onFormSubmit: (e?: any) => void;
  handleStop: () => void;
  isLoading: boolean;
  models: any[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  t: any;
  lastUserMessage?: string;
  setPreviewAttachment?: (attachment: any) => void;
  ghostText?: string;
  setGhostText?: (text: string) => void;
  isPredicting?: boolean;
  isEmpty?: boolean;
  onMainTabChange?: (id: string) => void;
}

const ICON_MAP: Record<string, any> = {
  'Globe': Globe,
  'Sparkles': Sparkles,
  'Database': Database,
  'Cpu': FileText,
  'Zap': Sparkles,
  'Cloud': Sparkles
};

export const ChatInput = React.memo(({
  localInput,
  setLocalInput,
  selectedSkill,
  setSelectedSkill,
  attachments,
  addFiles,
  removeFile,
  isModelDropdownOpen,
  setIsModelDropdownOpen,
  isSearchMode,
  setIsSearchMode,
  isKnowledgeMode,
  setIsKnowledgeMode,
  onFormSubmit,
  handleStop,
  isLoading,
  models,
  selectedModelId,
  setSelectedModelId,
  textAreaRef,
  t,
  lastUserMessage,
  setPreviewAttachment,
  ghostText = '',
  setGhostText = () => { },
  isPredicting = false,
  isEmpty = false,
  onMainTabChange,
}: ChatInputProps) => {
  const activeModel = models.find(m => m.id === selectedModelId) || models[0] || { name: 'Loading...', icon: 'Globe', color: 'text-slate-400' };
  const activeDisplayName = beautifyModelName(activeModel.name);
  const ActiveIcon = ICON_MAP[activeModel.icon] || Globe;

  const [isFocused, setIsFocused] = useState(false);
  const [isProjectCreateModalOpen, setIsProjectCreateModalOpen] = useState(false);

  const preRecordTextRef = React.useRef(localInput);

  const { isRecording, isSupported, audioVolumes, toggle, stop } = useVoiceInput({
    onResult: (text, isFinal) => {
      const prefix = preRecordTextRef.current ? preRecordTextRef.current + ' ' : '';
      setLocalInput(prefix + text);
      if (isFinal) {
        preRecordTextRef.current = prefix + text;
      }
    }
  });

  const handleVoiceToggle = () => {
    if (!isRecording) {
      preRecordTextRef.current = localInput;
    }
    toggle();
  };

  const { projects, fetchProjects } = useProjects();
  const { installedSkills } = useInstalledSkills();
  const { activeProject, setActiveProjectId } = useWorkspace();

  const MENTION_OPTIONS = [
    { id: 'search', label: 'Web Search', icon: Globe, desc: 'Search the live web', type: 'search' },
    { id: 'lexis', label: 'LexisNexis', icon: Database, desc: 'Case law & statutes', type: 'knowledge' },
    { id: 'internal', label: 'Internal Docs', icon: FileText, desc: 'Workspace files', type: 'knowledge' },
  ];

  const SLASH_OPTIONS = React.useMemo(() => {
    const baseOptions = [
      { id: 'clear', label: '/clear', desc: 'Clear conversation context', action: 'clear', icon: CloseIcon, type: 'system' },
      { id: 'prompt', label: '/prompt', desc: 'Insert prompt template', action: 'prompt', icon: FileText, type: 'system' },
    ];
    const skillOptions = installedSkills.map(skill => ({
      id: skill.id,
      label: `/${skill.name}`,
      desc: skill.description || `Execute ${skill.name} skill`,
      action: 'tool',
      icon: Wrench,
      type: 'skill'
    }));
    return [...baseOptions, ...skillOptions];
  }, [installedSkills]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: () => {
          if (ghostText) return '';
          return isEmpty 
            ? t('chat.placeholder_new', 'Ask Ocean to perform a task...') 
            : t('chat.placeholder_reply', 'Write a message...');
        }
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: getMentionSuggestion((query) => {
          return MENTION_OPTIONS.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
        }),
      }),
      SlashCommand.configure({
        suggestion: getSlashSuggestion((query) => {
          return SLASH_OPTIONS.filter(o => o.label.toLowerCase().includes('/' + query.toLowerCase()) || o.label.toLowerCase().includes(query.toLowerCase()));
        }, (props, ed, range) => {
          ed.chain().focus().deleteRange(range).run();
          const item = props;
          if (item) {
            const skillName = item.action === 'tool' ? item.label.replace('/', '') : item.action;
            if (setSelectedSkill) setSelectedSkill({ name: skillName, provider: 'ocean', desc: item.desc, icon: item.icon });
          }
        }),
      }),
      GhostTextExtension.configure({
        text: ghostText,
      }),
    ],
    content: localInput,
    onUpdate: ({ editor }) => {
      setLocalInput(editor.getText());
      
      let hasSearch = false;
      let hasKnowledge = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'mention') {
          if (node.attrs.id === 'search') hasSearch = true;
          if (node.attrs.id === 'lexis' || node.attrs.id === 'internal') hasKnowledge = true;
        }
      });
      setIsSearchMode(hasSearch);
      setIsKnowledgeMode(hasKnowledge);
      
      if (editor.isEmpty && selectedSkill) {
         // Intentionally left empty to prevent auto-clearing skill when backspacing content
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Clear ghost text if the user moves the cursor away from the end
      if (ghostText && setGhostText) {
        const isAtEnd = editor.state.selection.to >= editor.state.doc.content.size - 2;
        if (!isAtEnd) {
          setGhostText('');
        }
      }
    },
    autofocus: 'end',
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    editorProps: {
      attributes: {
        class: "w-full text-[15px] text-foreground outline-none min-h-[22px] max-h-[300px] overflow-y-auto leading-relaxed font-sans cursor-text whitespace-pre-wrap break-words border-none focus:outline-none focus:ring-0",
      },
      handleKeyDown: (view, event) => {
        if (document.querySelector('.tippy-box')) {
           // Allow tippy events to process
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (setGhostText) setGhostText('');
          onFormSubmit();
          return true;
        }
        
        if (event.key === 'Tab' && ghostText) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(ghostText, view.state.selection.to));
          if (setGhostText) setGhostText('');
          return true;
        }
        if (event.key === 'Backspace' && view.state.doc.textContent === '' && selectedSkill) {
          event.preventDefault();
          if (setSelectedSkill) setSelectedSkill(null);
          return true;
        }
        if (event.key === 'ArrowUp' && view.state.doc.textContent.trim() === '' && lastUserMessage) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(lastUserMessage));
          return true;
        }
        return false;
      }
    }
  }, [isEmpty, t, ghostText, selectedSkill, lastUserMessage, installedSkills]);

  React.useEffect(() => {
    if (editor && localInput === '' && !editor.isDestroyed && editor.getText() !== '') {
       editor.commands.clearContent();
    }
  }, [localInput, editor]);

  React.useEffect(() => {
    if (editor && !editor.isDestroyed && editor.extensionManager && ghostText !== undefined) {
      const ext = editor.extensionManager.extensions.find((e: any) => e.name === 'ghostText');
      if (ext) {
        ext.options.text = ghostText;
        editor.view.dispatch(editor.state.tr);
      }
    }
  }, [ghostText, editor]);



  return (
    <div className={cn(
      "px-4 md:px-8 z-10 w-full font-sans transition-all duration-500",
      isEmpty ? "pb-4 mt-4" : "pt-2 pb-4 md:pb-8 bg-gradient-to-t from-[#FCF9F8] via-[#FCF9F8] to-transparent mt-auto"
    )}>
      <div className="max-w-[800px] mx-auto relative">
        

        <div className={cn(
          "bg-card/70 backdrop-blur-md rounded-2xl p-2 flex flex-col shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] ring-1 transition-all duration-300",
          isFocused ? "ring-primary/30 shadow-[0_0_15px_rgba(236,91,20,0.15)]" : "ring-[#1C1B1B]/5"
        )}>
          <AnimatePresence>
            {(attachments.length > 0) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-2 px-4 pt-3 pb-1"
              >
                {/* Mention chips with hover X */}
                {/* File attachments */}
                {attachments.map((file) => (
                  <div key={file.id} className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl border group relative transition-all",
                    file.isUploading ? "bg-card/50 border-border/40" : "bg-muted border-border/60 hover:border-primary/30 cursor-pointer hover:bg-card"
                  )}
                    onClick={() => {
                      if (!file.isUploading && file.url && setPreviewAttachment) {
                        setPreviewAttachment({ name: file.name, contentType: file.contentType, url: file.url });
                      }
                    }}>
                    {file.isUploading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-border border-t-[#EC5B14] animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 text-primary" />
                    )}
                    <span className={cn(
                      "text-[12px] font-bold max-w-[160px] truncate",
                      file.isUploading ? "text-muted-foreground animate-pulse" : "text-foreground"
                    )}>{file.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.id);
                        if (setPreviewAttachment) {
                          setPreviewAttachment((prev: any) => prev?.name === file.name ? null : prev);
                        }
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-border text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-1"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className={cn(
            "relative flex items-baseline w-full px-4",
            attachments.length > 0 ? "pt-1 pb-3" : "py-3"
          )}>
            {selectedSkill && (
              
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="inline-flex items-center px-2 py-[3px] rounded-md bg-[#2b7fff]/10 text-[#2b7fff] font-mono text-[13px] font-medium select-none outline-none mr-2 group shrink-0"
                    >
                      /{selectedSkill.name}
                      <button
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedSkill?.(null); }}
                        className="w-4 h-4 ml-0.5 -mr-1 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-[#2b7fff]/20 transition-all cursor-pointer"
                      >
                        <CloseIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  {selectedSkill.desc && (
                    <TooltipContent
                      sideOffset={8}
                      side="top"
                      className="bg-card text-foreground border border-border rounded-xl px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.1)] max-w-[280px] z-50 cursor-pointer hover:bg-muted transition-colors pointer-events-auto"
                      onClick={() => {
                        if (selectedSkill.provider === 'ocean' && !['clear', 'prompt'].includes(selectedSkill.name)) {
                          localStorage.setItem('ocean_active_skill_name', selectedSkill.name);
                          onMainTabChange?.('skill_studio');
                        }
                      }}
                    >
                      <div className="font-bold mb-1.5 flex items-center gap-2">
                        {selectedSkill.icon ? (
                          <selectedSkill.icon className="w-3.5 h-3.5 text-[#2b7fff]" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-[#2b7fff]" />
                        )}
                        /{selectedSkill.name}
                      </div>
                      <div className="text-[12px] text-muted-foreground leading-relaxed font-normal">{selectedSkill.desc}</div>
                    </TooltipContent>
                  )}
                </Tooltip>
              
            )}

                        <div className="flex-1 min-w-0 relative overflow-hidden">
              <EditorContent editor={editor} />
            </div>
          </div>
<div className="flex items-center justify-between px-2 sm:px-4 pb-2 h-[52px]">
            {isRecording ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center w-full justify-between"
              >
                <div className="flex-1 flex items-center justify-center gap-1 opacity-70">
                  {audioVolumes.map((vol, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: Math.max(4, (vol / 255) * 24) }}
                      transition={{ duration: 0.1, ease: "linear" }}
                      className="w-1 bg-primary rounded-full"
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <button
                    onClick={() => {
                      stop();
                      setLocalInput(preRecordTextRef.current);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
                    title="取消"
                  >
                    <CloseIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      stop();
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    title="完成"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
            <div className="flex items-center gap-0.5 sm:gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-muted-foreground bg-transparent hover:bg-muted hover:text-foreground transition-all shrink-0">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-56 border-border shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-card/95 mb-2">
                  <DropdownMenuItem onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e: any) => {
                      if (e.target.files) addFiles(Array.from(e.target.files as FileList));
                    };
                    input.click();
                  }} className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5">
                    <div className="flex items-center gap-3">
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[13px] font-medium text-foreground">Add files or photos</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5 data-[state=open]:bg-muted">
                      <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-medium text-foreground flex-1">Add to project</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent sideOffset={8} className="w-56 border-border shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-card/95">
                        {projects.map(project => (
                          <DropdownMenuItem
                            key={project.id}
                            onClick={() => {
                              setActiveProjectId(project.id);
                              globalToast(`Chat moved to ${project.name}`);
                            }}
                            className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-muted"
                          >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                              <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                                <Briefcase className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-[13px] font-bold text-foreground truncate">{project.name}</span>
                                <span className="text-[10px] text-muted-foreground/80 truncate">Local Project</span>
                              </div>
                            </div>
                            {activeProject?.id === project.id && (
                              <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </DropdownMenuItem>
                        ))}
                        {projects.length > 0 && <DropdownMenuSeparator className="bg-border/50 my-1" />}
                        <DropdownMenuItem onClick={() => setIsProjectCreateModalOpen(true)} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted">
                          <Plus className="w-4 h-4 text-muted-foreground" />
                          <span className="text-[13px] font-medium text-foreground">Start a new project</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator className="bg-border/50 my-1" />

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5 data-[state=open]:bg-muted">
                      <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-medium text-foreground flex-1">Skills</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent sideOffset={8} className="w-60 border-border shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-xl p-1.5 backdrop-blur-xl bg-card/95">
                        {installedSkills.map(skill => (
                          <DropdownMenuItem
                            key={skill.id}
                            onClick={() => setSelectedSkill?.({ name: skill.name, provider: 'ocean', desc: skill.description, icon: Wrench })}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5"
                          >
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-[13px] font-medium text-foreground truncate">{skill.name}</span>
                          </DropdownMenuItem>
                        ))}
                        {installedSkills.length > 0 && <DropdownMenuSeparator className="bg-border/50 my-1" />}
                        <DropdownMenuItem onClick={() => onMainTabChange?.('library')} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5">
                          <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-[13px] font-medium text-foreground">Manage skills</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onMainTabChange?.('library')} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted">
                          <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-[13px] font-medium text-foreground">Add skill</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem disabled className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-not-allowed opacity-40 mb-0.5">
                    <Puzzle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">Add plugins...</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-border/50 my-1" />

                  <DropdownMenuItem onClick={() => setIsSearchMode(!isSearchMode)} className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-muted mb-0.5">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[13px] font-medium text-foreground">Web search</span>
                    </div>
                    {isSearchMode && <Check className="w-4 h-4 text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AnimatePresence>
                {activeProject && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, width: 0 }}
                    animate={{ opacity: 1, scale: 1, width: 'auto' }}
                    exit={{ opacity: 0, scale: 0.9, width: 0 }}
                    className="flex items-center ml-1"
                  >
                    <div className="relative group flex items-center">
                      <button
                        onClick={() => onMainTabChange?.('projects')}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent bg-primary/5 hover:bg-primary/10 transition-colors whitespace-nowrap"
                      >
                        <Briefcase className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold text-primary truncate max-w-[120px]">
                          {activeProject.name}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveProjectId(null);
                        }}
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:scale-110 active:scale-95 z-10"
                        title="取消关联项目"
                      >
                        <CloseIcon className="w-2 h-2 stroke-[3]" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <DropdownMenu open={isModelDropdownOpen} onOpenChange={setIsModelDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg text-muted-foreground hover:bg-muted transition-all border border-transparent hover:border-border/40 shrink-0">
                    <ActiveIcon className={cn("w-4 h-4 shrink-0", activeModel.color)} />
                    <span className="text-[10px] sm:text-[11px] font-bold tracking-tight max-w-[60px] sm:max-w-none truncate">{activeDisplayName}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", isModelDropdownOpen ? "rotate-180" : "")} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 border-border shadow-[0_10px_30px_rgba(0,0,0,0.1)] rounded-2xl p-1.5 backdrop-blur-xl bg-card/90">
                  <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t('chat.available_models')}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/40" />
                  <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                    {models.map((m) => {
                      const displayName = beautifyModelName(m.name);
                      const ModelIcon = ICON_MAP[m.icon] || Globe;
                      return (
                        <DropdownMenuItem key={m.id} onClick={() => setSelectedModelId(m.id)} className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all mb-0.5 hover:bg-muted">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex items-center justify-center w-8 h-8", m.color)}>
                              <ModelIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[14px] font-bold text-foreground">{displayName}</span>
                              <span className="text-[11px] text-muted-foreground font-medium">{m.provider}</span>
                            </div>
                          </div>
                          {selectedModelId === m.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />

              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.onchange = (e: any) => {
                    if (e.target.files) addFiles(Array.from(e.target.files as FileList));
                  };
                  input.click();
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all shrink-0"
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => setIsSearchMode(!isSearchMode)}
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all transform active:scale-95 shrink-0",
                  isSearchMode
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:bg-muted hover:text-primary"
                )}
              >
                <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => setIsKnowledgeMode(!isKnowledgeMode)}
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all transform active:scale-95 shrink-0",
                  isKnowledgeMode
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:bg-muted hover:text-primary"
                )}
              >
                <Database className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>


            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={() => {
                  if (!isSupported) {
                    alert('您的浏览器不支持原生的语音识别 API，请使用 Chrome 或 Edge 浏览器体验语音听写功能。');
                    return;
                  }
                  handleVoiceToggle();
                }}
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 relative text-muted-foreground hover:bg-muted hover:text-foreground",
                  !isSupported && "opacity-50 cursor-not-allowed"
                )}
                title={!isSupported ? "浏览器不支持语音输入" : "语音听写"}
              >
                <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {(!localInput.trim() && attachments.length === 0 && !isLoading) ? (
                <button
                  onClick={() => alert("实时语音对话功能即将上线，敬请期待！")}
                  className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 relative text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="开启实时语音对话"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key="voice-chat"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <AudioLines className="w-4 h-4 sm:w-5 sm:h-5" />
                    </motion.div>
                  </AnimatePresence>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isLoading) {
                      handleStop();
                    } else {
                      if (setGhostText) setGhostText('');
                      onFormSubmit();
                    }
                  }}
                  className={cn(
                    "w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                    isLoading
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-[#cc4900] hover:bg-[#a33800] text-white shadow-sm"
                  )}
                >
                <AnimatePresence mode="wait" initial={false}>
                  {isLoading ? (
                    <motion.div
                      key="stop"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="send"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            )}
            </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ProjectCreateModal
        isOpen={isProjectCreateModalOpen}
        onClose={() => setIsProjectCreateModalOpen(false)}
        onCreated={async (name: string) => {
          setIsProjectCreateModalOpen(false);
          await fetchProjects();

          // Try to automatically find and select the new project by name
          // We need a short delay since fetchProjects might be async
          setTimeout(async () => {
            try {
              const res = await api.get<any>('/api/knowledge-projects');
              const newProj = res.data?.find((p: any) => p.name === name);
              if (newProj) {
                setActiveProjectId(newProj.id);
                globalToast(`Chat moved to ${newProj.name}`);
              }
            } catch (e) {
              // Ignore error on fallback
            }
          }, 500);

          onMainTabChange?.('projects');
        }}
      />
    </div>
  );
});
