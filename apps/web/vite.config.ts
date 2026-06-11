import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve('../../'), '')
  const proxyTarget = env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@ocean/ui': path.resolve(__dirname, '../../packages/ui/src')
    }
  },
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        timeout: 60000, // 增加到 60s
        proxyTimeout: 60000,
        // 增加一些稳定性配置，防止某些环境下的重试行为
        xfwd: true,
      },
      '/public': {
        target: proxyTarget,
        changeOrigin: true,
      }
    }
  }
  }
})
