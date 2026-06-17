const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/components/chat/ChatInput.tsx');
let code = fs.readFileSync(p, 'utf8');

// 1. Add imports
const newImports = `
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { getMentionSuggestion } from './extensions/mentionSuggestion';
import { getSlashSuggestion } from './extensions/slashSuggestion';
import { SlashCommand } from './extensions/SlashCommandExtension';
import { GhostTextExtension } from './extensions/GhostTextExtension';
`;
code = code.replace("import { useVoiceInput } from '../../lib/useVoiceInput';", "import { useVoiceInput } from '../../lib/useVoiceInput';\n" + newImports);

// 2. Replace hooks block
const startHooks = code.indexOf('  const [isFocused, setIsFocused] = useState(false);');
const endHooks = code.indexOf('  const handleMentionSelect =');

const hooksReplacement = `
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
            setSelectedSkill?.({ name: skillName, provider: 'ocean', desc: item.desc, icon: item.icon });
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
         setSelectedSkill(null);
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

`;

code = code.substring(0, startHooks) + hooksReplacement + code.substring(endHooks);

// 3. Remove from handleMentionSelect to renderHighlightedInput
const startHandlers = code.indexOf('  const handleMentionSelect =');
const endHandlers = code.indexOf('  return (');
code = code.substring(0, startHandlers) + code.substring(endHandlers);

// 4. Clean up the JSX.
// A. Remove AnimatePresence for the menus.
// It starts right after `<div className="max-w-[800px] mx-auto relative">`
const startMenuPresence = code.indexOf('<AnimatePresence>', code.indexOf('max-w-[800px]'));
const endMenuPresence = code.indexOf('</AnimatePresence>', startMenuPresence) + 18;
code = code.substring(0, startMenuPresence) + code.substring(endMenuPresence);

// B. Remove activeMentions from attachments rendering
const mentionMapStart = code.indexOf('{activeMentions.map((mention)');
const mentionMapEnd = code.indexOf('{/* File attachments */}');
code = code.substring(0, mentionMapStart) + code.substring(mentionMapEnd);

// C. Fix the condition `(attachments.length > 0 || activeMentions.length > 0)`
code = code.replace(/\(attachments\.length > 0 \|\| activeMentions\.length > 0\)/g, '(attachments.length > 0)');
code = code.replace(/attachments\.length > 0 \|\| activeMentions\.length > 0/g, 'attachments.length > 0');

// D. Replace the entire content editable block with EditorContent
const editorBlockStart = code.indexOf('<div className="flex-1 min-w-0 relative">');
const editorBlockEnd = code.indexOf('</div>', code.indexOf('</AnimatePresence>', editorBlockStart)) + 6;

const newEditorBlock = `
            <div className="flex-1 min-w-0 relative overflow-hidden">
              <EditorContent editor={editor} />
            </div>
`;
code = code.substring(0, editorBlockStart) + newEditorBlock + code.substring(editorBlockEnd);

fs.writeFileSync(p, code);
