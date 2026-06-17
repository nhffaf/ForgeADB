import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer (React) build config.
// `base: './'` makes the built asset paths relative so Electron can load them
// from the local filesystem via file:// in production.
export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
