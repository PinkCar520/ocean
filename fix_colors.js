const fs = require('fs');
const path = require('path');

const directoryPaths = ['packages/ui/src/components', 'apps/web/src', 'apps/desktop/src'];

const replacements = {
  'text-[#716B67]': 'text-muted-foreground',
  'text-[#716b67]': 'text-muted-foreground',
  'border-[#E8E4E2]': 'border-border',
  'border-[#e8e4e2]': 'border-border',
  'text-[#1C1B1B]': 'text-foreground',
  'text-[#1c1b1b]': 'text-foreground',
  'bg-[#F6F3F2]': 'bg-muted',
  'bg-[#f6f3f2]': 'bg-muted',
  'text-[#EC5B14]': 'text-primary',
  'text-[#ec5b14]': 'text-primary',
  'bg-[#EC5B14]': 'bg-primary',
  'bg-[#ec5b14]': 'bg-primary',
  'border-[#EC5B14]': 'border-primary',
  'border-[#ec5b14]': 'border-primary',
  'text-[#A8A4A1]': 'text-muted-foreground/80',
  'text-[#a8a4a1]': 'text-muted-foreground/80',
  'bg-[#1C1B1B]': 'bg-foreground',
  'bg-[#1c1b1b]': 'bg-foreground',
  'bg-[#E8E4E2]': 'bg-border',
  'bg-[#e8e4e2]': 'bg-border',
  'bg-[#FCF9F8]': 'bg-background',
  'bg-[#fcf9f8]': 'bg-background',
  'bg-white': 'bg-card',
  'border-[#dddddd]': 'border-border',
  'ring-[#EC5B14]': 'ring-primary',
  'ring-[#ec5b14]': 'ring-primary',
  'fill-[#1C1B1B]': 'fill-foreground',
  'fill-[#716B67]': 'fill-muted-foreground'
};

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      
      for (const [key, value] of Object.entries(replacements)) {
        if (content.includes(key)) {
          content = content.split(key).join(value);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

directoryPaths.forEach(processDir);
