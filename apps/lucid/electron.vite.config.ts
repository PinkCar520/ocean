import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
        '@uclaw/ui': resolve('../../packages/ui/src')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false
        },
        '/public': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        }
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
