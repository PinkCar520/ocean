import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({
 testDir:'.',
 testMatch:'primitive-browser.spec.mjs',
 timeout:60_000,
 workers:1,
 retries:0,
 reporter:'list',
 outputDir:process.env.ENGINEERING_BROWSER_OUTPUT||path.join(root,'reports/engineering/browser'),
 use:{viewport:{width:1280,height:800},reducedMotion:'reduce',trace:'retain-on-failure'},
 webServer:[
  {command:'pnpm --filter web exec next dev --webpack --hostname 127.0.0.1 --port 5191',url:'http://127.0.0.1:5191/engineering-ui-fixture',cwd:root,reuseExistingServer:false,timeout:180_000},
  {command:'pnpm --filter ocean-desktop exec vite --config engineering-ui-vite.config.mts',url:'http://127.0.0.1:5192/engineering-ui-fixture/',cwd:root,reuseExistingServer:false,timeout:120_000}
 ]
});
