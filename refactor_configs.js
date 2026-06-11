const fs = require('fs');
const path = require('path');

// 1. Refactor apps/ocean-desktop/electron.vite.config.ts
const desktopConfigPath = path.join(__dirname, 'apps/ocean-desktop/electron.vite.config.ts');
let desktopConfig = fs.readFileSync(desktopConfigPath, 'utf8');

// Inject loadEnv import if not exists
if (!desktopConfig.includes('import { loadEnv }')) {
  desktopConfig = desktopConfig.replace(
    "import { defineConfig } from 'electron-vite'",
    "import { defineConfig } from 'electron-vite'\nimport { loadEnv } from 'vite'"
  );
}

// Wrap defineConfig
desktopConfig = desktopConfig.replace(
  'export default defineConfig({',
  `export default defineConfig(({ mode }) => {
  // Load env from workspace root
  const env = loadEnv(mode, resolve('../../'), '')
  const proxyTarget = env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {`
);

// Replace targets
desktopConfig = desktopConfig.replace(/'http:\/\/43\.139\.108\.187:8081'/g, 'proxyTarget');

// Close the function
desktopConfig = desktopConfig.replace(/}\)$/, '  }\n})');

fs.writeFileSync(desktopConfigPath, desktopConfig, 'utf8');
console.log('Updated electron.vite.config.ts');

// 2. Refactor apps/web/vite.config.ts
const webConfigPath = path.join(__dirname, 'apps/web/vite.config.ts');
let webConfig = fs.readFileSync(webConfigPath, 'utf8');

if (!webConfig.includes('import { loadEnv }')) {
  webConfig = webConfig.replace(
    "import { defineConfig } from 'vite'",
    "import { defineConfig, loadEnv } from 'vite'"
  );
}

// Wrap defineConfig
webConfig = webConfig.replace(
  'export default defineConfig({',
  `export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve('../../'), '')
  const proxyTarget = env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {`
);

webConfig = webConfig.replace(/'http:\/\/127\.0\.0\.1:3000'/g, 'proxyTarget');

// Close the function
webConfig = webConfig.replace(/}\)$/, '  }\n})');

fs.writeFileSync(webConfigPath, webConfig, 'utf8');
console.log('Updated vite.config.ts');

// 3. Refactor apps/ocean-desktop/src/renderer/index.html CSP
const indexHtmlPath = path.join(__dirname, 'apps/ocean-desktop/src/renderer/index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Generalize connect-src
indexHtml = indexHtml.replace(
  /connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\* http:\/\/43\.139\.108\.187:\*;/g,
  "connect-src 'self' http://localhost:* http://127.0.0.1:* http://43.139.108.187:* https://*;"
);
// Actually it's better to just allow any connect in dev, or strictly just replace the hardcoded IP with a wildcard or remove the IP specifically if not needed.
// Wait, for desktop electron, connect-src should allow external APIs easily. 
// Let's replace the whole CSP string to be more flexible.
indexHtml = indexHtml.replace(
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]+"\s*\/>/g,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' \'unsafe-inline\' data:; img-src \'self\' data: https:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' data: https://fonts.gstatic.com; connect-src \'self\' http://localhost:* http://127.0.0.1:* https://* http://*;" />'
);

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('Updated index.html CSP');

