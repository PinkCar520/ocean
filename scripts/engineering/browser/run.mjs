import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const webRoute=path.join(root,'apps/web/src/app/engineering-ui-fixture');
const desktopDir=path.join(root,'apps/desktop/src/renderer/engineering-ui-fixture');
const viteConfig=path.join(root,'apps/desktop/engineering-ui-vite.config.mts');
const fixture=path.join(root,'packages/ui/tests/browser/PrimitiveFixture.tsx');
const targets=[webRoute,desktopDir,viteConfig];
const importPath=(from,to)=>path.relative(from,to).split(path.sep).join('/').replace(/^(?!\.)/,'./');
if(targets.some(p=>existsSync(p)))throw Error('Refusing to overwrite an existing browser fixture');
const created=[];
try {
 mkdirSync(webRoute);created.push(webRoute);
 writeFileSync(path.join(webRoute,'page.tsx'),"export { default } from '"+importPath(webRoute,fixture).replace(/\.tsx$/,'')+"'\n");
 mkdirSync(desktopDir);created.push(desktopDir);
 writeFileSync(path.join(desktopDir,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
 writeFileSync(path.join(desktopDir,'main.tsx'),"import * as React from 'react'\nimport {createRoot} from 'react-dom/client'\nimport '../src/index.css'\nimport Fixture from '"+importPath(desktopDir,fixture).replace(/\.tsx$/,'')+"'\ncreateRoot(document.getElementById('root')!).render(<Fixture />)\n");
 // Reuse the renderer's actual CSS and its Vite plugin/alias configuration.
 writeFileSync(viteConfig,`import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {resolve} from 'node:path'
export default defineConfig({
 root:resolve('src/renderer'),
 plugins:[react(),tailwindcss()],
 resolve:{alias:{'@renderer':resolve('src/renderer/src'),'@ocean/ui':resolve('../../packages/ui/src')}},
 server:{host:'127.0.0.1',port:5192,strictPort:true}
})\n`,{flag:'wx'});created.push(viteConfig);
 const pnpm=process.platform==='win32'?'pnpm.cmd':'pnpm';
 const result=spawnSync(pnpm,['exec','playwright','test','--config','scripts/engineering/browser/playwright.config.mjs'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
} finally {
 for(const target of created.reverse())rmSync(target,{recursive:true,force:true});
}
