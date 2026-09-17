import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load env from workspace root
  const env = loadEnv(mode, resolve('../../'), '')
  const proxyTarget = env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {
  main: {},
  preload: {},
  renderer: {
    root: resolve('src/renderer'),
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
