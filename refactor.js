const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'out', '.pnpm-store'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.md', '.env', '.html', '.css'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        results = results.concat(walk(filePath));
      }
    } else {
      if (EXTENSIONS.includes(path.extname(file)) || path.basename(file) === '.env' || path.basename(file) === 'Dockerfile') {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walk(__dirname);

let updatedFiles = 0;

for (const file of files) {
  // Skip this script itself
  if (file === __filename) continue;

  const originalContent = fs.readFileSync(file, 'utf8');
  let newContent = originalContent;

  // Replacements
  newContent = newContent.replace(/@uclaw/g, '@ocean');
  newContent = newContent.replace(/uclaw-/g, 'ocean-');
  newContent = newContent.replace(/uclaw_/g, 'ocean_');
  newContent = newContent.replace(/"uclaw"/g, '"ocean"');
  newContent = newContent.replace(/'uclaw'/g, "'ocean'");
  newContent = newContent.replace(/\/uclaw/g, '/ocean');
  newContent = newContent.replace(/uclaw\?/g, 'ocean?'); // for DB URL
  newContent = newContent.replace(/uclaw:/g, 'ocean:');
  newContent = newContent.replace(/UClaw/g, 'Ocean');
  newContent = newContent.replace(/UCLAW/g, 'OCEAN');

  // App specific replacements
  newContent = newContent.replace(/apps\/lucid/g, 'apps/ocean-desktop');
  newContent = newContent.replace(/"lucid"/g, '"ocean-desktop"');
  // For Docker image tags like lucid/uclaw-gateway
  newContent = newContent.replace(/lucid\//g, 'ocean/');
  // "name": "lucid" in package.json
  if (file.endsWith('package.json')) {
    newContent = newContent.replace(/"name":\s*"lucid"/g, '"name": "ocean-desktop"');
  }

  if (originalContent !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    updatedFiles++;
    console.log('Updated:', file);
  }
}

console.log(`Refactoring complete. Updated ${updatedFiles} files.`);
