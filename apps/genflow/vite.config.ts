import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
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
    tailwindcss(),
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
      // NOTE: preload.ts is built separately by `npm run build:preload`
      // (esbuild → CommonJS .cjs) because Electron's preload loader uses
      // require() and the package has type:module which makes .js files ESM.
      // vite-plugin-electron ignores rollupOptions.output.format so we
      // build preload outside vite-plugin-electron entirely.
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
