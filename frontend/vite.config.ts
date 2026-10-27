import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The FastAPI backend serves /api. In development Vite proxies to it so the browser
// talks to a single origin, exactly as in production (Docker and Vercel).
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: app deploys do not invalidate the cached libraries.
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|es-toolkit|decimal\.js-light|immer|reselect|@reduxjs|redux|react-redux|use-sync-external-store)[\\/]/,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler|@tanstack)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})
