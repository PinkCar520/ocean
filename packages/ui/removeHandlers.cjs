const fs = require('fs');
const p = 'packages/ui/src/components/chat/ChatInput.tsx';
let code = fs.readFileSync(p, 'utf8');
const start_str = "  const handleMentionSelect =";
const end_str = "  return (";
const idx_start = code.indexOf(start_str);
const idx_end = code.indexOf(end_str);
if(idx_start !== -1 && idx_end !== -1) {
    code = code.substring(0, idx_start) + code.substring(idx_end);
    fs.writeFileSync(p, code);
}
