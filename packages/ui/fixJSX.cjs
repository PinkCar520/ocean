const fs = require('fs');
const p = 'packages/ui/src/components/chat/ChatInput.tsx';
let code = fs.readFileSync(p, 'utf8');

// 1. Remove handlers
let h_start = code.indexOf('  const handleMentionSelect =');
let h_end = code.indexOf('  return (');
if(h_start !== -1 && h_end !== -1) {
   code = code.substring(0, h_start) + code.substring(h_end);
}

// 2. Fix JSX AnimatePresence Menus
// First AnimatePresence contains mentionMenuOpen
let m_start = code.indexOf('{mentionMenuOpen && (');
if(m_start !== -1) {
   let p_start = code.lastIndexOf('<AnimatePresence>', m_start);
   let p_end = code.indexOf('</AnimatePresence>', m_start) + 18;
   code = code.substring(0, p_start) + code.substring(p_end);
}

// Second AnimatePresence contains slashMenuOpen
let s_start = code.indexOf('{slashMenuOpen && (');
if(s_start !== -1) {
   let p_start = code.lastIndexOf('<AnimatePresence>', s_start);
   let p_end = code.indexOf('</AnimatePresence>', s_start) + 18;
   code = code.substring(0, p_start) + code.substring(p_end);
}

// 3. Fix attachment mentions mapping
let active_start = code.indexOf('{activeMentions.map((mention) => {');
if(active_start !== -1) {
   let file_start = code.indexOf('{/* File attachments */}', active_start);
   code = code.substring(0, active_start) + code.substring(file_start);
}

// Fix attachments logic condition
code = code.replace(/attachments\.length > 0 \|\| activeMentions\.length > 0/g, 'attachments.length > 0');

// 4. Replace contentEditable with EditorContent
let ce_start = code.indexOf('<div className="flex-1 min-w-0 relative">');
if(ce_start !== -1) {
   // The end of content editable is right before <div className="flex items-center justify-between px-2 sm:px-4 pb-2 h-[52px]">
   // Let's find the bottom toolbar
   let tb_start = code.indexOf('<div className="flex items-center justify-between px-2 sm:px-4 pb-2 h-[52px]">');
   if (tb_start !== -1) {
       // We need to keep the closing div of the parent block?
       // Let's just find the exact closing div
       let close_div = code.lastIndexOf('</div>', tb_start);
       
       let new_block = `            <div className="flex-1 min-w-0 relative overflow-hidden">
              <EditorContent editor={editor} />
            </div>
          </div>
`;
       code = code.substring(0, ce_start) + new_block + code.substring(tb_start);
   }
}

fs.writeFileSync(p, code);
