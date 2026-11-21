import { resolve } from 'path'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import { build } from 'esbuild'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load env from workspace root
  const env = loadEnv(mode, resolve('../../'), '')
  // macOS utility processes require the Electron app bundle's canonical path.
  if (process.platform === 'darwin' && mode === 'development') {
    const require = createRequire(import.meta.url)
    process.env.ELECTRON_EXEC_PATH = realpathSync(process.env.ELECTRON_EXEC_PATH || require('electron'))
  }
  const workspaceHostGateway = env.OCEAN_WORKSPACE_HOST_GATEWAY_URL || 'http://localhost:3000'
  // Desktop development talks to the same Gateway as the Workspace Host.
  const proxyTarget = env.OCEAN_DESKTOP_API_PROXY_URL || workspaceHostGateway

  return {
  main: {
    define: { '__OCEAN_GATEWAY_URL__': JSON.stringify(workspaceHostGateway) },
    plugins: [{
      name: 'ocean-workspace-host',
      async buildStart() {
        const output = await build({
          entryPoints: [resolve('../cli/src/workspace-host.ts')],
          bundle: true,
          platform: 'node',
          target: 'node22',
          format: 'cjs',
          write: false,
          metafile: true
        })
        for (const input of Object.keys(output.metafile.inputs)) this.addWatchFile(resolve(input))
        this.emitFile({ type: 'asset', fileName: 'workspace-host.cjs', source: output.outputFiles[0].contents })
      }
    }]
  },
  preload: {},
  renderer: {
    root: resolve('src/renderer'),
    define: { __OCEAN_WEB_URL__: JSON.stringify(env.VITE_OCEAN_WEB_URL || 'http://localhost:8081') },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@ocean/ui': resolve('../../packages/ui/src')
      }
    },
    server: {
      // 独立端口：避免与 Web 的 next dev (5173) 冲突；浏览器 IPv6 优先曾连到本进程
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/public': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    plugins: [tailwindcss(), react()]
  }
  }
})
