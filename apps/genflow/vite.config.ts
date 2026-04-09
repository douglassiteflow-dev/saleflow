import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

// Absolute path helper — entries and outDirs must NOT be relative to Vite's
// root (which is set to the ui/ subdirectory below). Otherwise vite-plugin-electron
// would look for electron/main.ts inside ui/.
const r = (rel: string) => path.resolve(__dirname, rel)

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: r('electron/main.ts'),
        vite: {
          build: {
            outDir: r('dist-electron'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: r('electron/preload.ts'),
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: r('dist-electron'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: r('electron/server-worker.ts'),
        vite: {
          build: {
            outDir: r('dist-electron'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  root: r('ui'),
  build: {
    outDir: r('dist'),
    emptyOutDir: true,
  },
})
