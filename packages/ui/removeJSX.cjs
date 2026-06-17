const fs = require('fs');
const p = 'packages/ui/src/components/chat/ChatInput.tsx';
let code = fs.readFileSync(p, 'utf8');

// We want to remove the old popups.
// The code looks like:
//        <div className={cn("bg-card/70 ...")}>
//          <AnimatePresence>
//            {mentionMenuOpen && ( ... )}
//          </AnimatePresence>
//          <AnimatePresence>
//            {slashMenuOpen && ( ... )}
//          </AnimatePresence>
//          <AnimatePresence>
//            {(attachments.length > 0) && ( ... )}

// Find the first <AnimatePresence> after <div className="max-w-[800px] mx-auto relative">
let start_idx = code.indexOf('<AnimatePresence>', code.indexOf('<div className="max-w-[800px] mx-auto relative">'));
let end_idx = code.indexOf('<AnimatePresence>', start_idx + 10);
// We want to remove everything up to the <AnimatePresence> that contains attachments.length > 0
let correct_start = code.indexOf('{(attachments.length > 0');
if (correct_start !== -1) {
    let parent_animate_presence = code.lastIndexOf('<AnimatePresence>', correct_start);
    if (parent_animate_presence !== -1) {
        code = code.substring(0, start_idx) + code.substring(parent_animate_presence);
    }
}

// Next, change the old contentEditable block
let editor_start = code.indexOf('<div className="flex-1 min-w-0 relative">');
let editor_end = code.indexOf('</div>', code.indexOf('</AnimatePresence>', editor_start)) + 6;

if (editor_start !== -1 && editor_end !== -1) {
    const new_block = `            <div className="flex-1 min-w-0 relative">
              <EditorContent editor={editor} />
            </div>`;
    code = code.substring(0, editor_start) + new_block + code.substring(editor_end);
}

fs.writeFileSync(p, code);
