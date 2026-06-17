import os

fpath = os.path.join("packages", "ui", "src", "components", "chat", "ChatInput.tsx")
with open(fpath, "r") as f:
    code = f.read()

import re

# 1. Imports
imports = """import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { getMentionSuggestion } from './extensions/mentionSuggestion';
import { getSlashSuggestion } from './extensions/slashSuggestion';
import { SlashCommand } from './extensions/SlashCommandExtension';
import { GhostTextExtension } from './extensions/GhostTextExtension';
import {"""
code = code.replace("import {", imports, 1)

# 2. Hooks and setup
start_str = "  const [isFocused, setIsFocused] = useState(false);"
end_str = "  const handleMentionSelect ="
idx_start = code.find(start_str)
idx_end = code.find(end_str)

hooks = """  const [isFocused, setIsFocused] = useState(false);
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
      label: "/" + skill.name,
      desc: skill.description || "Execute " + skill.name + " skill",
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
        placeholder: isEmpty 
          ? t('chat.placeholder_new', 'Ask Ocean to perform a task...') 
          : t('chat.placeholder_reply', 'Write a message...'),
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
          return SLASH_OPTIONS.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
        }, (props, ed, range) => {
          ed.chain().focus().deleteRange(range).run();
          const item = props;
          if (item) {
            const skillName = item.action === 'tool' ? item.label.replace(/^\\//, '') : item.action;
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
         if (setSelectedSkill) setSelectedSkill(null);
      }
    },
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
          onFormSubmit();
          return true;
        }
        
        if (event.key === 'Tab' && ghostText) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(ghostText, view.state.selection.to));
          setGhostText('');
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
    if (editor && ghostText !== undefined) {
      const ext = editor.extensionManager.extensions.find(e => e.name === 'ghostText');
      if (ext) {
        ext.options.text = ghostText;
        editor.view.dispatch(editor.state.tr);
      }
    }
  }, [ghostText, editor]);

"""
code = code[:idx_start] + hooks + code[idx_end:]


# 3. Remove legacy handlers
start_str = "  const handleMentionSelect ="
end_str = "  return ("
idx_start = code.find(start_str)
idx_end = code.find(end_str)
code = code[:idx_start] + code[idx_end:]

# 4. Remove AnimatePresence menus
start_str = "<AnimatePresence>"
end_str = "</AnimatePresence>"
# there are multiple AnimatePresence. We want the ones that contain mentionMenuOpen
idx = code.find("mentionMenuOpen")
if idx != -1:
    idx_start = code.rfind(start_str, 0, idx)
    idx_end = code.find(end_str, idx) + len(end_str)
    code = code[:idx_start] + code[idx_end:]
    
idx2 = code.find("slashMenuOpen")
if idx2 != -1:
    idx_start = code.rfind(start_str, 0, idx2)
    idx_end = code.find(end_str, idx2) + len(end_str)
    code = code[:idx_start] + code[idx_end:]


# 5. Fix mentions active in attachments
replace_1 = "{(attachments.length > 0 || activeMentions.length > 0) && ("
with_1 = "{(attachments.length > 0) && ("
code = code.replace(replace_1, with_1)

replace_2 = 'attachments.length > 0 || activeMentions.length > 0 ? "pt-1 pb-3" : "py-3"'
with_2 = 'attachments.length > 0 ? "pt-1 pb-3" : "py-3"'
code = code.replace(replace_2, with_2)

# Remove the mentions chips mapping loop
start_str = "{/* Mention chips with hover X */}"
end_str = "{/* File attachments */}"
idx_start = code.find(start_str)
idx_end = code.find(end_str)
code = code[:idx_start] + "{/* File attachments */}" + code[idx_end + len(end_str):]


# 6. Replace editor block
start_str = '<div className="flex-1 min-w-0 relative">'
end_str = "            <AnimatePresence>"
idx_start = code.find(start_str)
idx_end = code.find(end_str, idx_start)

new_editor_block = """<div className="flex-1 min-w-0 relative">
              <EditorContent editor={editor} />
            </div>

"""
code = code[:idx_start] + new_editor_block + code[idx_end:]


with open(fpath, "w") as f:
    f.write(code)

print("done")
