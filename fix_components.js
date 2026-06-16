const fs = require('fs');

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  for (const [key, value] of Object.entries(replacements)) {
    if (content.includes(key)) {
      content = content.split(key).join(value);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

// 1. ActiveContext.tsx
replaceInFile('packages/ui/src/components/chat/ActiveContext.tsx', {
  'bg-[#FDFCFB]': 'bg-card',
  'border-[#F1EEEB]': 'border-border',
  'bg-blue-50': 'bg-blue-500/10',
  'bg-emerald-50': 'bg-emerald-500/10',
  'bg-purple-50': 'bg-purple-500/10',
  'bg-orange-50': 'bg-orange-500/10',
  'bg-sky-50': 'bg-sky-500/10',
  'bg-slate-50': 'bg-slate-500/10',
  'text-blue-600': 'text-blue-600 dark:text-blue-400',
  'text-emerald-600': 'text-emerald-600 dark:text-emerald-400',
  'text-purple-600': 'text-purple-600 dark:text-purple-400',
  'text-orange-600': 'text-orange-600 dark:text-orange-400',
  'text-sky-600': 'text-sky-600 dark:text-sky-400',
  'text-slate-600': 'text-slate-600 dark:text-slate-400',
  'bg-card border border-border text-[11px] font-bold text-foreground': 'bg-muted/40 border border-border/60 text-[11px] font-bold text-foreground hover:bg-muted'
});

// 2. EmptyState.tsx
replaceInFile('packages/ui/src/components/chat/EmptyState.tsx', {
  'bg-card border border-border/60': 'bg-muted/40 border border-border/60'
});

// 3. IntegrationsPanel.tsx
replaceInFile('packages/ui/src/components/chat/IntegrationsPanel.tsx', {
  "mcp.id === 'gitlab' ? 'bg-foreground'": "mcp.id === 'gitlab' ? 'bg-[#1C1B1B] text-white dark:bg-white dark:text-[#1C1B1B]'",
  "bg-card/70": "bg-muted/30"
});

