const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/components/chat/ChatInput.tsx');
let code = fs.readFileSync(p, 'utf8');

// Remove handleMentionSelect and removeMention
code = code.replace(/const handleMentionSelect = [\s\S]*?const removeMention = [\s\S]*?\n  };\n/g, '');

// Remove handleSlashSelect
code = code.replace(/const handleSlashSelect = [\s\S]*?\n  };\n/g, '');

// Remove ghostRef, useLayoutEffect for ghostRef, useLayoutEffect for syncScroll, useLayoutEffect for auto-resizes, React.useEffect for localInput sync, handlePaste, filteredMentions, filteredSlash, renderHighlightedInput
const startIdx = code.indexOf('const ghostRef = React.useRef');
const endIdx = code.indexOf('return (', startIdx);
if (startIdx !== -1 && endIdx !== -1) {
   code = code.substring(0, startIdx) + code.substring(endIdx);
}

// Remove old <AnimatePresence> for menus
const menuStart = code.indexOf('<AnimatePresence>');
const menuEnd = code.indexOf('</AnimatePresence>', menuStart) + 18;
// Just make sure it's the right one
if (code.substring(menuStart, menuEnd).includes('mentionMenuOpen')) {
   code = code.substring(0, menuStart) + code.substring(menuEnd);
}

// Replace the old activeMentions mapping inside attachments AnimatePresence
code = code.replace(/\{activeMentions\.map\(\(mention\).*?\}\)/gs, '');
code = code.replace(/activeMentions\.length > 0 \|\| /g, '');
code = code.replace(/\|\| activeMentions\.length > 0/g, '');

// Replace old contentEditable
const editStart = code.indexOf('<div className="flex-1 min-w-0 relative">');
const editEnd = code.indexOf('</div>', code.indexOf('</AnimatePresence>', editStart)) + 6;
if (editStart !== -1 && editEnd !== -1) {
   code = code.substring(0, editStart) + 
   '<div className="flex-1 min-w-0 relative overflow-hidden">\n' +
   '  <EditorContent editor={editor} />\n' +
   '</div>\n' + 
   code.substring(editEnd);
}

fs.writeFileSync(p, code);
