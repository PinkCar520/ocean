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
