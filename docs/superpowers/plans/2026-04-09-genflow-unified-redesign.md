# Genflow Unified Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg om Genflow till ETT unified Electron-projekt i `saleflow/apps/genflow/` som kombinerar UI, polling mot Saleflow-backend och hela pipelinen (scrape → strategy → layout → parallel sidor → polish → bildverifiering → deploy) i en enda app med utilityProcess-isolering.

**Architecture:** Electron main process äger UI, Tray, login item och spawn:ar en enskild utility process som kör Express + polling-worker + pipeline. Claude CLI-processer körs via `p-limit(3)` med watchdog + hard timeout. Python-scraper bundlas som PyInstaller-sidecar. Alla sidor delar en gemensam `layout.html`-mall via Node-substitution.

**Tech Stack:** Electron 33, React 19, Vite 6, TypeScript, Express 4 (utility process backend), p-limit, Node's `node:child_process` + `node:fetch`, PyInstaller (scraper), electron-builder.

**Spec reference:** `docs/superpowers/specs/2026-04-09-genflow-unified-redesign.md`

**Decisions locked in this plan (öppna frågor i specen):**
- Express (inte Hono) för server-ramverket — bättre dokumenterat, mindre risk. Byt senare om det blir ett problem.
- Egen Tray-implementation (inte `menubar`-paketet) — full kontroll, inga extra dependencies.

**Execution order:** Tasks 1-4 bygger grunden som måste fungera innan resten. Tasks 5-8 bygger bakgrundsservice-mönstret. Tasks 9-14 ger pollning + defensiv Claude-spawning. Tasks 15-21 bygger pipelinen. Tasks 22-24 knyter ihop orkestreringen. Tasks 25-27 är UI. Tasks 28-30 är migration.

**Checkpoint-punkter** (där engineer kan pausa och verifiera):
- Efter Task 4: Electron startar, öppnar ett tomt React-fönster
- Efter Task 8: Tray + login item fungerar, appen kan köras i bakgrunden
- Efter Task 11: Poller pratar med Saleflow-backend (bara status, inga jobb plockas)
- Efter Task 14: Claude CLI kan spawn:as säkert från utility process
- Efter Task 21: Hela pipelinen kan köras manuellt på en känd bokadirekt-URL
- Efter Task 24: End-to-end från UI-trigger till färdig hemsida
- Efter Task 27: Full UI med status, loggar, jobbkö
- Efter Task 30: Migration komplett, gamla kopior raderade, backend använder nya flödet

---

## Fas 1: Foundation (Tasks 1-4)

### Task 1: Monorepo workspace setup

**Files:**
- Create: `pnpm-workspace.yaml` (om inte redan finns)
- Create: `apps/genflow/.gitignore`
- Create: `apps/genflow/README.md`

- [ ] **Step 1: Kontrollera om pnpm-workspace.yaml redan finns**

Run: `ls /Users/douglassiteflow/dev/saleflow/pnpm-workspace.yaml 2>&1`

Om den finns, hoppa till Step 3. Om inte, fortsätt till Step 2.

- [ ] **Step 2: Skapa pnpm-workspace.yaml i saleflow-rooten**

Skapa `/Users/douglassiteflow/dev/saleflow/pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Skapa apps/genflow/.gitignore**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/.gitignore`:

```
# Dependencies
node_modules/

# Build outputs
dist/
dist-electron/
out/
release/

# Job artifacts
output/

# PyInstaller outputs
bin/
build/
*.spec

# Python
__pycache__/
*.pyc
venv/
.venv/

# Logs
*.log

# OS
.DS_Store
Thumbs.db

# Config
.env
.env.local
```

- [ ] **Step 4: Skapa apps/genflow/README.md**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/README.md`:

```markdown
# Genflow

Unified Electron desktop app for generating demo websites on behalf of the Saleflow backend.

## Architecture

Runs on Douglas's Mac. When the app is open, it polls the Saleflow backend every 5 seconds for pending `GenerationJob`s, picks them up, runs the full pipeline locally (scrape → strategy → layout → parallel pages → polish → image verify → Vercel deploy), and posts the result URL back to Saleflow.

## Running in development

\`\`\`
pnpm install
pnpm dev
\`\`\`

## Building for production

\`\`\`
pnpm build
pnpm package
\`\`\`

See `docs/superpowers/specs/2026-04-09-genflow-unified-redesign.md` for the full spec.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add pnpm-workspace.yaml apps/genflow/.gitignore apps/genflow/README.md
git commit -m "chore: scaffold apps/genflow workspace"
```

---

### Task 2: package.json, tsconfig och bygg-config

**Files:**
- Create: `apps/genflow/package.json`
- Create: `apps/genflow/tsconfig.json`
- Create: `apps/genflow/electron-builder.yml`

- [ ] **Step 1: Skapa package.json**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/package.json`:

```json
{
  "name": "@saleflow/genflow",
  "private": true,
  "version": "0.1.0",
  "description": "Unified Electron app for generating demo websites",
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "package": "electron-builder --mac --dir",
    "dist": "electron-builder --mac"
  },
  "dependencies": {
    "express": "^4.21.0",
    "p-limit": "^6.2.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.3.0",
    "electron-builder": "^26.0.12",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vite-plugin-electron": "^0.28.8",
    "vite-plugin-electron-renderer": "^0.14.6"
  }
}
```

- [ ] **Step 2: Skapa tsconfig.json**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["electron/**/*.ts", "server/**/*.ts", "ui/src/**/*.ts", "ui/src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "dist-electron", "output"]
}
```

- [ ] **Step 3: Skapa electron-builder.yml**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron-builder.yml`:

```yaml
appId: se.siteflow.genflow
productName: Genflow
directories:
  output: release
files:
  - dist/**/*
  - dist-electron/**/*
  - package.json
extraResources:
  - from: bin/darwin-arm64/scrape
    to: bin/scrape
  - from: pipeline
    to: pipeline
  - from: skills
    to: skills
  - from: scraper/scrape.py
    to: scraper/scrape.py
mac:
  target:
    - target: dir
      arch: [arm64]
  category: public.app-category.productivity
  icon: resources/app-icon.icns
```

- [ ] **Step 4: Installera dependencies**

```bash
cd /Users/douglassiteflow/dev/saleflow
pnpm install
```

Expected: pnpm skapar `apps/genflow/node_modules/` eller hoistar via workspace.

- [ ] **Step 5: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/package.json apps/genflow/tsconfig.json apps/genflow/electron-builder.yml pnpm-lock.yaml
git commit -m "chore(genflow): add package.json, tsconfig and builder config"
```

---

### Task 3: Vite config och HTML entry

**Files:**
- Create: `apps/genflow/vite.config.ts`
- Create: `apps/genflow/index.html`
- Create: `apps/genflow/ui/src/main.tsx`
- Create: `apps/genflow/ui/src/App.tsx`
- Create: `apps/genflow/ui/src/index.css`

- [ ] **Step 1: Skapa vite.config.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  root: path.join(__dirname, 'ui'),
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
```

- [ ] **Step 2: Skapa ui/index.html**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Genflow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Skapa ui/src/main.tsx**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: Skapa ui/src/App.tsx (minimal stub)**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/App.tsx`:

```tsx
export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Genflow</h1>
      <p>Initialiserar...</p>
    </div>
  )
}
```

- [ ] **Step 5: Skapa ui/src/index.css**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/index.css`:

```css
:root {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  color-scheme: light dark;
}

body {
  margin: 0;
  min-height: 100vh;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/vite.config.ts apps/genflow/ui
git commit -m "feat(genflow): add Vite config and minimal React UI shell"
```

---

### Task 4: Electron main + preload (bare minimum)

**Files:**
- Create: `apps/genflow/electron/main.ts`
- Create: `apps/genflow/electron/preload.ts`

- [ ] **Step 1: Skapa electron/main.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.APP_ROOT = path.join(__dirname, '..')
process.env.VITE_PUBLIC = app.isPackaged
  ? path.join(process.env.APP_ROOT, 'dist')
  : path.join(process.env.APP_ROOT, 'public')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Genflow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
```

- [ ] **Step 2: Skapa electron/preload.ts (minimal)**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('genflow', {
  onEvent: (channel: string, listener: (payload: unknown) => void) => {
    const wrapped = (_: unknown, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  },
  send: (channel: string, payload: unknown) => {
    ipcRenderer.send(channel, payload)
  },
})
```

- [ ] **Step 3: Starta dev-server och verifiera fönstret öppnas**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: Electron-fönstret öppnas, visar "Genflow / Initialiserar..." i UI. DevTools öppnas automatiskt i dev-mode.

Stäng dev-servern med Ctrl+C när verifierat.

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/electron
git commit -m "feat(genflow): add Electron main and preload scripts"
```

**CHECKPOINT 1:** Efter denna task startar Electron-appen och visar en tom React-sida. Verifiera genom att köra `pnpm dev` i `apps/genflow/`.

---

## Fas 2: Bakgrundsservice — utility process, tray, login item (Tasks 5-8)

### Task 5: Utility process stub

**Files:**
- Create: `apps/genflow/server/index.ts`
- Create: `apps/genflow/electron/server-worker.ts`
- Modify: `apps/genflow/electron/main.ts`

- [ ] **Step 1: Skapa server/index.ts (tom stub som bara loggar)**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/index.ts`:

```ts
// Utility process entry point.
// Körs isolerad från main process via Electron's utilityProcess.fork().

console.log('[server] utility process started, pid:', process.pid)

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined
  console.log('[server] message from main:', msg)

  if (msg?.type === 'ping') {
    process.parentPort?.postMessage({ type: 'pong' })
  }

  if (msg?.type === 'shutdown') {
    console.log('[server] shutdown received, exiting')
    process.exit(0)
  }
})

// Heartbeat var 30:e sekund så main kan detektera hängt utility process
setInterval(() => {
  process.parentPort?.postMessage({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

console.log('[server] ready, awaiting jobs')
```

- [ ] **Step 2: Skapa electron/server-worker.ts (TypeScript-wrapper för att peka på server/index)**

Detta är en entry för vite-plugin-electron så att server/index.ts kompileras separat:

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/server-worker.ts`:

```ts
// Denna fil är bara en re-export så att vite-plugin-electron kan kompilera
// server-koden som en fristående utility process bundle.
export * from '../server/index'
```

- [ ] **Step 3: Uppdatera vite.config.ts så server-worker byggs**

Öppna `apps/genflow/vite.config.ts` och lägg till en ny entry i `electron`-array:n (EFTER preload-entryn, före `]`):

```ts
      {
        entry: 'electron/server-worker.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
```

- [ ] **Step 4: Uppdatera electron/main.ts för att spawn:a utility process**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`. Lägg till import för `utilityProcess`:

Ersätt första importraden:
```ts
import { app, BrowserWindow } from 'electron'
```
med:
```ts
import { app, BrowserWindow, utilityProcess, UtilityProcess } from 'electron'
```

Lägg till en ny global variabel efter `let mainWindow: BrowserWindow | null = null`:

```ts
let serverProc: UtilityProcess | null = null

function startServerProcess() {
  const serverPath = path.join(__dirname, 'server-worker.js')
  serverProc = utilityProcess.fork(serverPath, [], {
    stdio: 'pipe',
    serviceName: 'genflow-server',
  })

  serverProc.stdout?.on('data', (chunk: Buffer) => {
    console.log('[server]', chunk.toString().trimEnd())
  })
  serverProc.stderr?.on('data', (chunk: Buffer) => {
    console.error('[server err]', chunk.toString().trimEnd())
  })

  serverProc.on('message', (msg: unknown) => {
    console.log('[main] from server:', msg)
  })

  serverProc.on('exit', (code: number) => {
    console.log('[main] server exited with code', code)
    serverProc = null
  })
}
```

Uppdatera `app.whenReady().then(...)`:

```ts
app.whenReady().then(() => {
  startServerProcess()
  createMainWindow()
})
```

- [ ] **Step 5: Starta dev-server och verifiera att server-worker loggar**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: I Electron-konsolen (Terminal där du startade `pnpm dev`) ska du se:
```
[server] utility process started, pid: XXXX
[server] ready, awaiting jobs
```

Stäng med Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server apps/genflow/electron apps/genflow/vite.config.ts
git commit -m "feat(genflow): spawn utility process for backend logic"
```

---

### Task 6: Tray-ikon med kontextmeny

**Files:**
- Create: `apps/genflow/resources/tray-icon.png` (16x16 template-ikon i svart)
- Create: `apps/genflow/electron/tray.ts`
- Modify: `apps/genflow/electron/main.ts`

- [ ] **Step 1: Skapa resources/tray-icon.png**

Detta måste vara en 16x16 PNG (helst med @2x 32x32-variant för Retina). Eftersom vi inte har bildassets nu, skapa en temporär placeholder:

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
mkdir -p resources
# Skapa en tom 16x16 PNG med ImageMagick om tillgängligt, annars manuellt:
# Eller använd Node/sharp, eller ladda ner en placeholder från project-icons.
# För nu: kopiera en ikon från genflow-local-server om den finns:
if [ -f ../genflow-local-server/resources/tray-icon.png ]; then
  cp ../genflow-local-server/resources/tray-icon.png resources/tray-icon.png
fi
```

Om ingen ikon finns — skapa en tom placeholder med Node:

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
node -e "
const fs = require('fs');
// Minimal 16x16 transparent PNG
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x10,0x08,0x06,0x00,0x00,0x00,0x1f,0xf3,0xff,0x61,0x00,0x00,0x00,0x15,0x49,0x44,0x41,0x54,0x28,0x53,0x63,0xfc,0xff,0xff,0x3f,0x03,0x16,0x00,0x00,0xff,0xff,0x03,0x00,0x00,0x08,0x00,0x01,0x1a,0xe4,0x3f,0x9f,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
fs.writeFileSync('resources/tray-icon.png', png);
console.log('Placeholder tray icon created');
"
```

Notering: Byt ut mot en riktig ikon senare. För menubar är template-ikoner (svartvita med transparens) bäst.

- [ ] **Step 2: Skapa electron/tray.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/tray.ts`:

```ts
import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import path from 'node:path'

export type TrayStatus = 'connected' | 'disconnected' | 'paused' | 'working'

interface TrayContext {
  getMainWindow: () => BrowserWindow | null
  createMainWindow: () => void
  onTogglePolling: () => void
  getStatus: () => TrayStatus
  getRecentJobs: () => { slug: string; status: 'ok' | 'failed' | 'running' }[]
}

let tray: Tray | null = null

export function createTray(ctx: TrayContext, appRoot: string) {
  const iconPath = path.join(appRoot, 'resources', 'tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  updateTray(ctx)

  tray.on('click', () => {
    const win = ctx.getMainWindow()
    if (win) {
      win.isVisible() ? win.hide() : win.show()
    } else {
      ctx.createMainWindow()
    }
  })
}

export function updateTray(ctx: TrayContext) {
  if (!tray) return

  const status = ctx.getStatus()
  const statusDot =
    status === 'connected' ? '● Ansluten' :
    status === 'working' ? '● Arbetar' :
    status === 'paused' ? '● Pausad' :
    '● Frånkopplad'

  const recentJobs = ctx.getRecentJobs()
  const jobItems: Electron.MenuItemConstructorOptions[] = recentJobs.length === 0
    ? [{ label: 'Inga jobb än', enabled: false }]
    : recentJobs.map(j => ({
        label: `${j.status === 'ok' ? '✓' : j.status === 'failed' ? '✗' : '⏳'} ${j.slug}`,
        enabled: false,
      }))

  const menu = Menu.buildFromTemplate([
    { label: `Genflow (${statusDot})`, enabled: false },
    { type: 'separator' },
    {
      label: 'Visa fönster',
      click: () => {
        const win = ctx.getMainWindow()
        if (win) win.show()
        else ctx.createMainWindow()
      },
    },
    {
      label: status === 'paused' ? 'Starta polling' : 'Pausa polling',
      click: () => ctx.onTogglePolling(),
    },
    { type: 'separator' },
    { label: 'Senaste jobb:', enabled: false },
    ...jobItems,
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ])

  tray.setToolTip(`Genflow — ${statusDot.replace('● ', '')}`)
  tray.setContextMenu(menu)
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
```

- [ ] **Step 3: Uppdatera electron/main.ts för att skapa tray**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`. Lägg till import:

```ts
import { createTray, updateTray, destroyTray, TrayStatus } from './tray'
```

Lägg till globala state-variabler efter `let serverProc: UtilityProcess | null = null`:

```ts
let currentStatus: TrayStatus = 'disconnected'
let recentJobs: { slug: string; status: 'ok' | 'failed' | 'running' }[] = []
```

Uppdatera `app.whenReady().then(...)`:

```ts
app.whenReady().then(() => {
  startServerProcess()
  createMainWindow()

  createTray(
    {
      getMainWindow: () => mainWindow,
      createMainWindow,
      onTogglePolling: () => {
        serverProc?.postMessage({ type: 'toggle-polling' })
      },
      getStatus: () => currentStatus,
      getRecentJobs: () => recentJobs,
    },
    process.env.APP_ROOT!,
  )
})
```

Lägg till `before-quit`-handler innan den sista `app.on('activate', ...)`:

```ts
app.on('before-quit', () => {
  destroyTray()
})
```

Ta bort `window-all-closed`-handlern som quit:ar appen — vi vill INTE quit:a på Mac när fönster stängs:

Byt ut:
```ts
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

mot:
```ts
app.on('window-all-closed', (event: Event) => {
  // Förhindra att appen stängs när alla fönster är stängda
  // Tray-ikonen håller appen igång
  event.preventDefault()
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
})
```

- [ ] **Step 4: Starta dev-server och verifiera tray dyker upp**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: En ikon dyker upp i menubar (kan vara liten/osynlig om placeholder är tom — kolla med muspekaren över menubarens högra del). Klicka på ikonen för att se menyn.

Stäng fönstret med röd knapp — fönstret försvinner men appen fortsätter köra (tray-ikonen kvar). Quit från tray-menyn stänger helt.

Stäng dev-servern med Ctrl+C i terminalen.

- [ ] **Step 5: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/resources apps/genflow/electron
git commit -m "feat(genflow): add tray icon with context menu and quit handler"
```

---

### Task 7: Login item (auto-start) + --hidden-flagga

**Files:**
- Modify: `apps/genflow/electron/main.ts`

- [ ] **Step 1: Uppdatera main.ts för att registrera login item och hantera --hidden**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`.

Lägg till en konstant för om appen startats i hidden-mode, överst efter imports:

```ts
const startedHidden = process.argv.includes('--hidden')
```

Uppdatera `createMainWindow()` för att starta dolt om `startedHidden`:

```ts
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Genflow',
    show: !startedHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    if (!startedHidden) mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // När window stängs, hide istället för destroy
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      if (process.platform === 'darwin') {
        app.dock?.hide()
      }
    }
  })
}
```

Lägg till `isQuitting`-flagga genom att utöka Electron's App-interface:

```ts
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}
```

Sätt flaggan i `before-quit`:

```ts
app.on('before-quit', () => {
  app.isQuitting = true
  destroyTray()
})
```

Uppdatera `whenReady` för att registrera login item och gömma dock om startedHidden:

```ts
app.whenReady().then(() => {
  // Register as login item so the app starts automatically at Mac login
  if (!app.isPackaged) {
    // Skip i dev-mode — SMAppService funkar inte pålitligt utan signering
    console.log('[main] dev mode: skipping login item registration')
  } else {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    })
  }

  startServerProcess()

  if (!startedHidden) {
    createMainWindow()
  } else {
    // Startade med --hidden (från login item): göm dock direkt
    app.dock?.hide()
  }

  createTray(
    {
      getMainWindow: () => mainWindow,
      createMainWindow: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createMainWindow()
          mainWindow?.show()
          if (process.platform === 'darwin') app.dock?.show()
        } else {
          mainWindow.show()
          if (process.platform === 'darwin') app.dock?.show()
        }
      },
      onTogglePolling: () => {
        serverProc?.postMessage({ type: 'toggle-polling' })
      },
      getStatus: () => currentStatus,
      getRecentJobs: () => recentJobs,
    },
    process.env.APP_ROOT!,
  )
})
```

- [ ] **Step 2: Testa i dev-mode att --hidden-flaggan fungerar**

Run:
```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
pnpm build
# Starta Electron manuellt med --hidden:
./node_modules/.bin/electron dist-electron/main.js --hidden
```

Expected: Ingen fönster öppnas, bara tray-ikonen. Klicka tray → "Visa fönster" för att öppna UI:t.

Stäng via tray → "Quit".

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/electron/main.ts
git commit -m "feat(genflow): add login item registration and --hidden flag"
```

---

### Task 8: Graceful shutdown + heartbeat övervakning

**Files:**
- Modify: `apps/genflow/electron/main.ts`

- [ ] **Step 1: Implementera graceful shutdown av utility process**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`.

Uppdatera `before-quit`-handlern till att skicka shutdown-meddelande och vänta:

```ts
app.on('before-quit', async (event) => {
  if (app.isQuitting) return  // redan i shutdown
  app.isQuitting = true
  destroyTray()

  if (serverProc) {
    event.preventDefault()
    console.log('[main] sending shutdown to server process')
    serverProc.postMessage({ type: 'shutdown' })

    // Vänta max 5 sek på clean exit
    const killTimer = setTimeout(() => {
      console.warn('[main] server did not exit in 5s, killing')
      serverProc?.kill()
      serverProc = null
      app.quit()
    }, 5000)

    serverProc.once('exit', () => {
      clearTimeout(killTimer)
      serverProc = null
      app.quit()
    })
  }
})
```

- [ ] **Step 2: Implementera heartbeat-övervakning av utility process**

Lägg till heartbeat-tracking efter `let currentStatus: TrayStatus = 'disconnected'`:

```ts
let lastHeartbeat = Date.now()
const HEARTBEAT_TIMEOUT_MS = 90_000  // 3 heartbeats (30s vardera) måste missas
```

Uppdatera `startServerProcess()` så att heartbeat-messages uppdaterar `lastHeartbeat`:

Ersätt:
```ts
  serverProc.on('message', (msg: unknown) => {
    console.log('[main] from server:', msg)
  })
```

med:
```ts
  serverProc.on('message', (msg: unknown) => {
    const typedMsg = msg as { type?: string; timestamp?: number }
    if (typedMsg.type === 'heartbeat') {
      lastHeartbeat = typedMsg.timestamp ?? Date.now()
      return
    }
    console.log('[main] from server:', msg)
  })
```

Lägg till en watchdog som restartar utility process om heartbeat tystnar, direkt efter `startServerProcess()`-funktionen:

```ts
function startHeartbeatWatchdog() {
  setInterval(() => {
    if (!serverProc) return
    const since = Date.now() - lastHeartbeat
    if (since > HEARTBEAT_TIMEOUT_MS) {
      console.warn(`[main] server heartbeat missing for ${since}ms — restarting`)
      serverProc.kill()
      serverProc = null
      lastHeartbeat = Date.now()
      startServerProcess()
    }
  }, 10_000)
}
```

Anropa `startHeartbeatWatchdog()` i `whenReady`-blocket efter `startServerProcess()`:

```ts
  startServerProcess()
  startHeartbeatWatchdog()
```

- [ ] **Step 3: Testa att shutdown fungerar**

Run:
```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
pnpm dev
```

Öppna ett nytt terminalfönster och kör:
```bash
pkill -INT electron
```

Expected: Du ser i första terminalen `[main] sending shutdown to server process` följt av `[server] shutdown received, exiting`. Appen stänger rent.

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/electron/main.ts
git commit -m "feat(genflow): add graceful shutdown and heartbeat watchdog"
```

**CHECKPOINT 2:** Efter denna task fungerar appen som en bakgrundsservice. Den startar, visar tray-ikon, kan dölja fönster, startar om utility process vid hang, stänger rent vid quit.

---

## Fas 3: Config + Saleflow polling (Tasks 9-11)

### Task 9: Config loading och saleflow HTTP client

**Files:**
- Create: `apps/genflow/server/lib/config.ts`
- Create: `apps/genflow/server/lib/saleflow-client.ts`
- Create: `apps/genflow/server/lib/types.ts`

- [ ] **Step 1: Skapa server/lib/types.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/types.ts`:

```ts
export interface GenflowConfig {
  backendUrl: string
  apiKey: string
  pollInterval: number
}

export interface GenJob {
  id: string
  source_url: string
  slug: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  deal_id: string | null
  demo_config_id: string | null
}

export interface JobResult {
  slug: string
  ok: boolean
  error?: string
}

export interface PageSpec {
  slug: string
  filename: string
  sections: string[]
  categoryOrder?: string[]
  reason: string
}

export interface Strategy {
  reasoning: string
  businessType: 'frisör' | 'spa' | 'nagel' | 'massage' | 'skönhet' | 'klinik' | 'annat'
  pages: PageSpec[]
  services: {
    total: number
    featuredForIndex: Array<{ namn: string; kategori: string; reason: string }>
    categoryOrder: string[]
  }
  reviews: {
    total: number
    displayMode: 'statiska-kort' | 'infinity-scroll' | 'skippa'
    placement: string
  }
  gallery: {
    needed: boolean
    layout: 'bento'
    placement?: string
    themes: string[]
  }
}

export type LogFn = (message: string) => void
```

- [ ] **Step 2: Skapa server/lib/config.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/config.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { GenflowConfig } from './types'

const CONFIG_DIR = join(homedir(), '.genflow')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: GenflowConfig = {
  backendUrl: 'https://api.siteflow.se',
  apiKey: '',
  pollInterval: 5000,
}

export function loadConfig(): GenflowConfig {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      backendUrl: parsed.backendUrl ?? DEFAULT_CONFIG.backendUrl,
      apiKey: parsed.apiKey ?? DEFAULT_CONFIG.apiKey,
      pollInterval: parsed.pollInterval ?? DEFAULT_CONFIG.pollInterval,
    }
  } catch (err) {
    console.error('[config] failed to parse, using defaults:', err)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: GenflowConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
```

- [ ] **Step 3: Skapa server/lib/saleflow-client.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/saleflow-client.ts`:

```ts
import type { GenflowConfig, GenJob } from './types'

export async function fetchPendingJob(config: GenflowConfig): Promise<GenJob | null> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/pending`, {
    headers: { 'X-GenFlow-Key': config.apiKey },
  })
  if (!res.ok) {
    throw new Error(`fetchPendingJob: HTTP ${res.status}`)
  }
  const data = (await res.json()) as { job: GenJob | null }
  return data.job ?? null
}

export async function pickJob(jobId: string, config: GenflowConfig): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/pick`, {
    method: 'POST',
    headers: { 'X-GenFlow-Key': config.apiKey },
  })
  if (!res.ok) {
    throw new Error(`pickJob: HTTP ${res.status}`)
  }
}

export async function completeJob(
  jobId: string,
  resultUrl: string,
  config: GenflowConfig,
): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/complete`, {
    method: 'POST',
    headers: {
      'X-GenFlow-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ result_url: resultUrl }),
  })
  if (!res.ok) {
    throw new Error(`completeJob: HTTP ${res.status}`)
  }
}

export async function failJob(
  jobId: string,
  error: string,
  config: GenflowConfig,
): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/fail`, {
    method: 'POST',
    headers: {
      'X-GenFlow-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ error }),
  })
  if (!res.ok) {
    throw new Error(`failJob: HTTP ${res.status}`)
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/lib
git commit -m "feat(genflow): add config loading and saleflow HTTP client"
```

---

### Task 10: Polling loop (utan jobbhantering ännu)

**Files:**
- Create: `apps/genflow/server/poller.ts`
- Modify: `apps/genflow/server/index.ts`

- [ ] **Step 1: Skapa server/poller.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/poller.ts`:

```ts
import { setTimeout as sleep } from 'node:timers/promises'
import type { GenflowConfig, GenJob, LogFn } from './lib/types'
import { fetchPendingJob } from './lib/saleflow-client'

type BroadcastFn = (event: { type: string; payload?: unknown }) => void

let running = false
let paused = false
let processing = false

export async function startPolling(
  config: GenflowConfig,
  log: LogFn,
  broadcast: BroadcastFn,
  handleJob: (job: GenJob) => Promise<void>,
) {
  if (running) return
  running = true
  paused = false
  log('Polling startat')
  broadcast({ type: 'polling-status', payload: { running: true, paused: false } })

  while (running) {
    if (!paused && !processing) {
      try {
        const job = await fetchPendingJob(config)
        if (job) {
          processing = true
          try {
            await handleJob(job)
          } finally {
            processing = false
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Nätverksfel är tysta — vi loggar bara debug
        if (!msg.includes('fetch failed') && !msg.includes('ECONNREFUSED')) {
          log(`Pollingfel: ${msg}`)
        }
      }
    }
    await sleep(config.pollInterval)
  }

  log('Polling stoppat')
  broadcast({ type: 'polling-status', payload: { running: false, paused: false } })
}

export function stopPolling() {
  running = false
}

export function togglePause() {
  paused = !paused
}

export function isPaused(): boolean {
  return paused
}

export function isRunning(): boolean {
  return running
}
```

- [ ] **Step 2: Uppdatera server/index.ts för att använda pollern**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/index.ts` och ersätt HELA innehållet med:

```ts
// Utility process entry point.
import { loadConfig } from './lib/config'
import { startPolling, stopPolling, togglePause } from './poller'
import type { GenJob, LogFn } from './lib/types'

console.log('[server] utility process started, pid:', process.pid)

type ServerToMainMessage =
  | { type: 'log'; payload: { message: string } }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'pong' }
  | { type: 'polling-status'; payload: { running: boolean; paused: boolean } }
  | { type: 'job-start'; payload: { job: GenJob } }
  | { type: 'job-complete'; payload: { job: GenJob; resultUrl: string } }
  | { type: 'job-failed'; payload: { job: GenJob; error: string } }

function send(msg: ServerToMainMessage) {
  process.parentPort?.postMessage(msg)
}

const log: LogFn = (message) => {
  console.log('[server]', message)
  send({ type: 'log', payload: { message } })
}

function broadcast(event: { type: string; payload?: unknown }) {
  send(event as ServerToMainMessage)
}

async function handleJob(job: GenJob): Promise<void> {
  log(`Nytt jobb plockat: ${job.slug} (${job.source_url})`)
  broadcast({ type: 'job-start', payload: { job } })

  // Jobbhantering implementeras i Task 22 (orchestrator)
  log(`Jobb ${job.slug}: pipeline inte implementerad än — skippas`)
  broadcast({ type: 'job-failed', payload: { job, error: 'Pipeline inte implementerad ännu' } })
}

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined

  if (msg?.type === 'ping') {
    send({ type: 'pong' })
  }

  if (msg?.type === 'toggle-polling') {
    togglePause()
    log('Polling-toggle mottaget')
  }

  if (msg?.type === 'shutdown') {
    log('Shutdown mottaget, avslutar')
    stopPolling()
    setTimeout(() => process.exit(0), 500)
  }
})

// Heartbeat var 30:e sekund
setInterval(() => {
  send({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

// Starta polling
const config = loadConfig()
if (!config.apiKey) {
  log('Ingen API-nyckel i ~/.genflow/config.json — polling pausad')
  log('Lägg till apiKey i config och restarta appen')
} else {
  log(`Startar polling mot ${config.backendUrl}`)
  startPolling(config, log, broadcast, handleJob).catch((err) => {
    log(`Polling-loop krasch: ${err.message}`)
    process.exit(1)
  })
}
```

- [ ] **Step 3: Testa i dev-mode**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: I terminalen ser du:
```
[server] utility process started, pid: XXXX
[server] Ingen API-nyckel i ~/.genflow/config.json — polling pausad
```

Om det är första gången appen körs skapas `~/.genflow/config.json` automatiskt med tomma values.

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server
git commit -m "feat(genflow): add polling loop with saleflow integration"
```

---

### Task 11: IPC-bridge mellan utility → main → renderer

**Files:**
- Modify: `apps/genflow/electron/main.ts`
- Modify: `apps/genflow/ui/src/App.tsx`

- [ ] **Step 1: Lägg till IPC-forwarding från utility till renderer i main.ts**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/electron/main.ts`.

Uppdatera `serverProc.on('message', ...)`-handlern så att loggar och status forwardas till renderer:

```ts
  serverProc.on('message', (msg: unknown) => {
    const typedMsg = msg as { type?: string; timestamp?: number; payload?: unknown }

    if (typedMsg.type === 'heartbeat') {
      lastHeartbeat = typedMsg.timestamp ?? Date.now()
      return
    }

    // Spåra status
    if (typedMsg.type === 'polling-status') {
      const p = typedMsg.payload as { running: boolean; paused: boolean }
      currentStatus = p.paused ? 'paused' : p.running ? 'connected' : 'disconnected'
      updateTray({
        getMainWindow: () => mainWindow,
        createMainWindow,
        onTogglePolling: () => serverProc?.postMessage({ type: 'toggle-polling' }),
        getStatus: () => currentStatus,
        getRecentJobs: () => recentJobs,
      })
    }

    if (typedMsg.type === 'job-start') {
      currentStatus = 'working'
      const job = (typedMsg.payload as { job: { slug: string } }).job
      recentJobs = [{ slug: job.slug, status: 'running' }, ...recentJobs].slice(0, 5)
    }

    if (typedMsg.type === 'job-complete') {
      currentStatus = 'connected'
      const job = (typedMsg.payload as { job: { slug: string } }).job
      recentJobs = recentJobs.map((j) =>
        j.slug === job.slug ? { ...j, status: 'ok' } : j,
      )
    }

    if (typedMsg.type === 'job-failed') {
      currentStatus = 'connected'
      const job = (typedMsg.payload as { job: { slug: string } }).job
      recentJobs = recentJobs.map((j) =>
        j.slug === job.slug ? { ...j, status: 'failed' } : j,
      )
    }

    // Forward till renderer
    mainWindow?.webContents.send('server-event', typedMsg)
  })
```

- [ ] **Step 2: Uppdatera UI/src/App.tsx för att lyssna på server-events**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/App.tsx` och ersätt innehållet:

```tsx
import { useEffect, useState } from 'react'

interface ServerEvent {
  type: string
  payload?: unknown
  timestamp?: number
}

interface LogEntry {
  timestamp: string
  message: string
}

declare global {
  interface Window {
    genflow?: {
      onEvent: (channel: string, listener: (payload: unknown) => void) => () => void
      send: (channel: string, payload: unknown) => void
    }
  }
}

export default function App() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'paused' | 'working'>(
    'disconnected',
  )
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    if (!window.genflow) return

    const unsub = window.genflow.onEvent('server-event', (payload) => {
      const event = payload as ServerEvent

      if (event.type === 'log') {
        const p = event.payload as { message: string }
        setLogs((prev) => [
          ...prev.slice(-199),
          { timestamp: new Date().toLocaleTimeString('sv-SE'), message: p.message },
        ])
      }

      if (event.type === 'polling-status') {
        const p = event.payload as { running: boolean; paused: boolean }
        setStatus(p.paused ? 'paused' : p.running ? 'connected' : 'disconnected')
      }

      if (event.type === 'job-start') {
        setStatus('working')
      }

      if (event.type === 'job-complete' || event.type === 'job-failed') {
        setStatus('connected')
      }
    })

    return () => unsub()
  }, [])

  const statusColor =
    status === 'connected' ? '#22c55e' :
    status === 'working' ? '#3b82f6' :
    status === 'paused' ? '#eab308' :
    '#ef4444'

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Genflow</h1>
        <span style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: statusColor,
        }} />
        <span style={{ color: '#666', fontSize: 14 }}>
          {status === 'connected' ? 'Ansluten' :
           status === 'working' ? 'Arbetar' :
           status === 'paused' ? 'Pausad' :
           'Frånkopplad'}
        </span>
      </header>

      <section>
        <h2 style={{ fontSize: 16, color: '#666' }}>Loggar</h2>
        <div style={{
          background: '#111',
          color: '#ddd',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          padding: 12,
          borderRadius: 6,
          height: 400,
          overflow: 'auto',
        }}>
          {logs.length === 0 && <div style={{ opacity: 0.5 }}>Inga loggar ännu</div>}
          {logs.map((log, i) => (
            <div key={i}>
              <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span> {log.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Testa i dev-mode att loggar flödar till UI**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: Fönstret öppnas med "Genflow — Frånkopplad" (eller "Ansluten" om apiKey finns i config). Loggar från server visas i den svarta logg-rutan.

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/electron/main.ts apps/genflow/ui/src/App.tsx
git commit -m "feat(genflow): wire up IPC bridge from utility to renderer"
```

**CHECKPOINT 3:** Efter denna task pollar utility process saleflow backend, loggar flödar till UI, tray-status uppdateras. Inga jobb plockas än (handleJob är stub). Om du har en giltig apiKey i `~/.genflow/config.json` kan du verifiera att det finns HTTP-trafik mot backend i network panel.

---

## Fas 4: Defensiv Claude-spawning (Tasks 12-14)

### Task 12: Platform utilities

**Files:**
- Create: `apps/genflow/server/lib/platform.ts`

- [ ] **Step 1: Skapa server/lib/platform.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/platform.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

// Roten för genflow-appen — en nivå över dist-electron/ eller server/
export const APP_ROOT = process.env.APP_ROOT ?? join(__dirname, '..', '..')

// Claude CLI binary path
export function resolveClaudeBin(): string {
  // Försök i PATH först
  const envPath = process.env.PATH ?? ''
  for (const dir of envPath.split(':')) {
    const candidate = join(dir, 'claude')
    if (existsSync(candidate)) return candidate
  }
  // Fallback till /usr/local/bin (standard för Homebrew + manuell install)
  const fallback = '/usr/local/bin/claude'
  if (existsSync(fallback)) return fallback
  // Sista fallback
  return 'claude'
}

export const CLAUDE_BIN = resolveClaudeBin()

// Python binary path
export function resolvePythonBin(): string {
  const envPath = process.env.PATH ?? ''
  for (const name of ['python3', 'python']) {
    for (const dir of envPath.split(':')) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return 'python3'
}

export const PYTHON_BIN = resolvePythonBin()

// Scraper path — i dev är det scraper/scrape.py, i packaged app är det bin/scrape (PyInstaller binär)
export function resolveScraperCommand(): { cmd: string; args: (url: string) => string[] } {
  // I packaged app: bin/scrape
  const packagedScraper = join(process.resourcesPath ?? '', 'bin', 'scrape')
  if (existsSync(packagedScraper)) {
    return {
      cmd: packagedScraper,
      args: (url: string) => [url, '--no-images'],
    }
  }
  // I dev: python3 scraper/scrape.py
  const devScraper = join(APP_ROOT, 'scraper', 'scrape.py')
  return {
    cmd: PYTHON_BIN,
    args: (url: string) => [devScraper, url, '--no-images'],
  }
}

// Skills-katalogen
export const SKILLS_DIR = join(APP_ROOT, 'skills')

// Pipeline-katalogen (prompt templates)
export const PIPELINE_DIR = join(APP_ROOT, 'pipeline')

// Output-katalogen (per-jobb artefakter)
export const OUTPUT_DIR = join(APP_ROOT, 'output')
```

- [ ] **Step 2: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/lib/platform.ts
git commit -m "feat(genflow): add platform utilities for claude/python/scraper paths"
```

---

### Task 13: Claude runner — defensivt med p-limit + watchdog

**Files:**
- Create: `apps/genflow/server/claude-runner.ts`

- [ ] **Step 1: Skapa server/claude-runner.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/claude-runner.ts`:

```ts
import { spawn, ChildProcess } from 'node:child_process'
import pLimit from 'p-limit'
import { CLAUDE_BIN } from './lib/platform'
import type { LogFn } from './lib/types'

const CLAUDE_CONCURRENCY = 3
const CLAUDE_MAX_RUNTIME_MS = 45 * 60 * 1000  // 45 min hard timeout
const STDOUT_IDLE_MS = 120 * 1000              // 2 min utan stdout = hang

const limit = pLimit(CLAUDE_CONCURRENCY)
const activeProcesses = new Set<ChildProcess>()

export interface RunClaudeOptions {
  args: string[]
  cwd: string
  log: LogFn
  onLine?: (line: string) => void
}

export function runClaude(opts: RunClaudeOptions): Promise<string> {
  return limit(() => new Promise<string>((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, opts.args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    activeProcesses.add(proc)

    let stdout = ''
    let lastActivity = Date.now()
    let finalized = false

    const finalize = (resolveVal: string | null, rejectVal: Error | null) => {
      if (finalized) return
      finalized = true
      clearInterval(watchdog)
      clearTimeout(hardTimer)
      activeProcesses.delete(proc)
      if (rejectVal) reject(rejectVal)
      else resolve(resolveVal ?? '')
    }

    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STDOUT_IDLE_MS) {
        opts.log(`Claude tyst i ${STDOUT_IDLE_MS / 1000}s — skickar SIGTERM`)
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL')
        }, 3000)
      }
    }, 10_000)

    const hardTimer = setTimeout(() => {
      opts.log(`Claude max runtime (${CLAUDE_MAX_RUNTIME_MS / 1000}s) — dödar`)
      proc.kill('SIGKILL')
      finalize(null, new Error('claude max runtime exceeded'))
    }, CLAUDE_MAX_RUNTIME_MS)

    proc.stdout?.on('data', (chunk: Buffer) => {
      lastActivity = Date.now()
      const text = chunk.toString()
      stdout += text
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && opts.onLine) {
          opts.onLine(trimmed)
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      lastActivity = Date.now()  // stderr räknas som aktivitet
      const text = chunk.toString().trim()
      if (text) opts.log(`[stderr] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => {
      opts.log(`Claude spawn error: ${err.message}`)
      finalize(null, err)
    })

    proc.on('exit', (code) => {
      if (code === 0) {
        finalize(stdout, null)
      } else {
        finalize(null, new Error(`claude exit code ${code}`))
      }
    })
  }))
}

export function killAllActive(): void {
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  activeProcesses.clear()
}

export function getActiveCount(): number {
  return activeProcesses.size
}
```

- [ ] **Step 2: Uppdatera server/index.ts shutdown-hook att döda alla claude-processer**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/index.ts`.

Lägg till import överst:
```ts
import { killAllActive } from './claude-runner'
```

Uppdatera shutdown-handler:
```ts
  if (msg?.type === 'shutdown') {
    log('Shutdown mottaget, avslutar')
    killAllActive()
    stopPolling()
    setTimeout(() => process.exit(0), 500)
  }
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/claude-runner.ts apps/genflow/server/index.ts
git commit -m "feat(genflow): add defensive Claude CLI runner with p-limit and watchdog"
```

---

### Task 14: Logger med strukturerade events

**Files:**
- Create: `apps/genflow/server/lib/logger.ts`

- [ ] **Step 1: Skapa server/lib/logger.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/logger.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogFn } from './types'

export interface JobLogger {
  log: LogFn
  logPath: string
}

type BroadcastFn = (event: { type: string; payload?: unknown }) => void

export function createJobLogger(
  jobSlug: string,
  logPath: string,
  broadcast: BroadcastFn,
): JobLogger {
  // Se till att katalogen finns
  mkdirSync(dirname(logPath), { recursive: true })
  // Nollställ logfilen vid start
  writeFileSync(logPath, '')

  const log: LogFn = (message) => {
    const timestamp = new Date().toLocaleTimeString('sv-SE')
    const line = `[${timestamp}] ${message}\n`
    try {
      appendFileSync(logPath, line)
    } catch (err) {
      console.error('[logger] failed to append:', err)
    }
    broadcast({
      type: 'log',
      payload: { message, jobSlug, timestamp },
    })
  }

  return { log, logPath }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/lib/logger.ts
git commit -m "feat(genflow): add per-job logger with broadcast"
```

**CHECKPOINT 4:** Efter denna task kan vi säkert spawn:a Claude-processer (upp till 3 parallellt) med watchdog + hard timeout, och per-jobb loggar streamas till UI.

---

## Fas 5: Pipeline — scraper + prompts (Tasks 15-21)

### Task 15: Scraper — cherry-pick och strippa bildnedladdning

**Files:**
- Create: `apps/genflow/scraper/scrape.py`
- Create: `apps/genflow/scraper/requirements.txt`

- [ ] **Step 1: Kopiera scrape.py från ~/dev/flowing-ai/**

```bash
cp /Users/douglassiteflow/dev/flowing-ai/scraper/scrape.py /Users/douglassiteflow/dev/saleflow/apps/genflow/scraper/scrape.py
```

- [ ] **Step 2: Öppna scrape.py och ta bort bildnedladdning**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/scraper/scrape.py`.

Leta efter funktionen `download_images` och ta bort den helt.

Leta efter anropet till `download_images` i main-block (runt rad 595). Ersätt det blocket:

```python
    # Ladda ner bilder
    if image_urls:
        print(f"\nLaddar ner {len(image_urls)} bilder...")
        downloaded = download_images(image_urls, images_dir)
        print(f"\n{downloaded} av {len(image_urls)} bilder nedladdade till: {images_dir}")
    else:
        print("\nInga bilder hittades.")
```

med:

```python
    # Bilder laddas INTE ner — vi använder Unsplash stock i stället
    if "--no-images" not in sys.argv:
        print(f"\n{len(image_urls)} bilder hittades (laddas inte ner)")
```

Ta också bort `images_dir`-variabeldefinitionen om den finns (runt rad 557).

- [ ] **Step 3: Skapa requirements.txt**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/scraper/requirements.txt`:

```
requests>=2.31.0
beautifulsoup4>=4.12.0
```

- [ ] **Step 4: Testa scrapern manuellt**

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
python3 scraper/scrape.py https://bokadirekt.se/places/darkbright-haircouture-47649 --no-images
```

Expected: Hämtar företagsdata, skapar `output/darkbright-haircouture-47649/företagsdata.json`, skapar INTE `bilder/`-katalog.

- [ ] **Step 5: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/scraper
git commit -m "feat(genflow): add scrape.py without image downloading"
```

---

### Task 16: Skills cherry-pick

**Files:**
- Create: `apps/genflow/skills/frontend-design/`
- Create: `apps/genflow/skills/theme-factory/`
- Create: `apps/genflow/skills/prompt-generator/`
- Create: `apps/genflow/skills/web-artifacts-builder/`

- [ ] **Step 1: Kopiera skills från ~/dev/flowing-ai/**

```bash
cp -R /Users/douglassiteflow/dev/flowing-ai/skills/frontend-design /Users/douglassiteflow/dev/saleflow/apps/genflow/skills/frontend-design
cp -R /Users/douglassiteflow/dev/flowing-ai/skills/theme-factory /Users/douglassiteflow/dev/saleflow/apps/genflow/skills/theme-factory
cp -R /Users/douglassiteflow/dev/flowing-ai/skills/prompt-generator /Users/douglassiteflow/dev/saleflow/apps/genflow/skills/prompt-generator
cp -R /Users/douglassiteflow/dev/flowing-ai/skills/web-artifacts-builder /Users/douglassiteflow/dev/saleflow/apps/genflow/skills/web-artifacts-builder
```

- [ ] **Step 2: Verifiera att alla 4 katalogerna finns**

```bash
ls /Users/douglassiteflow/dev/saleflow/apps/genflow/skills/
```

Expected: `frontend-design  prompt-generator  theme-factory  web-artifacts-builder`

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/skills
git commit -m "feat(genflow): cherry-pick claude code skills from flowing-ai"
```

---

### Task 17: Strategy-prompt + runStrategy

**Files:**
- Create: `apps/genflow/pipeline/strategy-prompt.md`
- Create: `apps/genflow/server/pipeline/strategy.ts`

- [ ] **Step 1: Skapa pipeline/strategy-prompt.md**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/pipeline/strategy-prompt.md`:

```markdown
# Innehållsstrategi för flersidig webbplats

Du är innehållsstrategist för en webbyrå. Analysera företagsdatan nedan och bestäm:
1. Vilka sidor som behövs (från en fast kandidatlista)
2. Vilka tjänster som ska vara featured på index
3. Hur recensioner ska visas
4. Om galleri behövs och vilka Unsplash-teman som passar

## Företagsdata

$BUSINESS_DATA

## Tillgängliga sidtyper (fast lista)

- `index` — alltid obligatorisk
- `tjanster` — lämplig när >15 tjänster eller >4 kategorier
- `om-oss` — lämplig när om_oss-text >200 tecken eller ≥3 personal finns
- `galleri` — lämplig när affärstypen gynnas av visuellt innehåll (salong, spa, nagel, massage, skönhet, klinik)
- `kontakt` — lämplig när minst 2 av följande finns: adress, telefon, öppettider, karta

## Minimum-regel

Om INGA kandidater triggas — skippa alla undersidor. Allt packas in på `index.html` (tjänster som "visa fler"-toggle, om-oss som sektion, kontakt i footer).

## Recensions-regler

- ≤3 recensioner → statiska kort på index
- >3 recensioner → horisontell infinity-scroll på index (ALDRIG på en separat recensioner-sida)

## Galleri-regler

- Galleri visas ALLTID som bento-grid (varierade cell-storlekar) — ALDRIG infinity-scroll eller carousel
- När du väljer galleri: ge 3-5 konkreta Unsplash-söktermar baserat på affärstypen

## Ingen team-sida

Personal nämns som text i `om-oss` eller i footern — ingen dedikerad team-sektion med porträtt.

## Output

Respondera med ENDAST valid JSON, inget annat:

```json
{
  "reasoning": "2-4 meningar motivering",
  "businessType": "frisör | spa | nagel | massage | skönhet | klinik | annat",
  "pages": [
    {
      "slug": "index",
      "filename": "index.html",
      "sections": ["hero", "intro", "featured-tjanster", "recensioner", "kontakt-cta"],
      "reason": "Huvudsida"
    }
  ],
  "services": {
    "total": 0,
    "featuredForIndex": [{"namn": "...", "kategori": "...", "reason": "..."}],
    "categoryOrder": ["..."]
  },
  "reviews": {
    "total": 0,
    "displayMode": "statiska-kort",
    "placement": "index"
  },
  "gallery": {
    "needed": true,
    "layout": "bento",
    "placement": "galleri",
    "themes": ["modern salong interiör", "hår styling närbild"]
  }
}
```
```

- [ ] **Step 2: Skapa server/pipeline/strategy.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/strategy.ts`:

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR } from '../lib/platform'
import type { Strategy, LogFn } from '../lib/types'

export async function runStrategy(outputDir: string, log: LogFn): Promise<Strategy> {
  log('Strategisk analys startad...')

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Företagsdata saknas: ${dataPath}`)
  }
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 3000)

  const templatePath = join(PIPELINE_DIR, 'strategy-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = template.replace('$BUSINESS_DATA', businessData)

  const stdout = await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--bare',
      '-p', prompt,
      '--output-format', 'json',
      '--max-turns', '5',
    ],
    cwd: outputDir,
    log,
  })

  const strategy = parseStrategyResult(stdout)
  const strategyPath = join(outputDir, 'strategy.json')
  writeFileSync(strategyPath, JSON.stringify(strategy, null, 2))

  log(`Strategi klar — ${strategy.pages.length} sidor, ${strategy.services.total} tjänster`)
  return strategy
}

function parseStrategyResult(stdout: string): Strategy {
  // Claude --output-format json returnerar en JSON-array av messages.
  // Det sista meddelandet har type="result" med ett "result"-fält.
  try {
    const messages = JSON.parse(stdout)
    if (Array.isArray(messages)) {
      const resultMsg = messages.find((m) => m.type === 'result' && m.result)
      if (resultMsg) {
        let text: string = resultMsg.result
        // Strippa eventuella markdown code-blocks
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const match = text.match(/\{[\s\S]*"reasoning"[\s\S]*\}/)
        if (match) {
          return JSON.parse(match[0]) as Strategy
        }
      }
    }
  } catch {
    // fall through
  }

  // Fallback: försök extrahera från rå stdout
  const cleaned = stdout.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const match = cleaned.match(/\{"reasoning"[\s\S]*?"categoryOrder"\s*:\s*\[[^\]]*\]\s*\}\s*\}/)
  if (match) {
    return JSON.parse(match[0]) as Strategy
  }

  throw new Error('Kunde inte parsa strategi-JSON från Claude output')
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/pipeline/strategy-prompt.md apps/genflow/server/pipeline/strategy.ts
git commit -m "feat(genflow): add strategy prompt and runStrategy"
```

---

### Task 18: Layout-prompt + runLayout + verifyLayout

**Files:**
- Create: `apps/genflow/pipeline/layout-prompt.md`
- Create: `apps/genflow/server/pipeline/layout.ts`

- [ ] **Step 1: Skapa pipeline/layout-prompt.md**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/pipeline/layout-prompt.md`:

```markdown
# Layout-mall för flersidig webbplats

Du är webbdesigner. Producera EN enda fil — `layout.html` — som fungerar som delad mall för alla sidor.

## Företagsdata

$BUSINESS_DATA

## Affärstyp

$BUSINESS_TYPE

## Sidor som kommer skapas

$PAGES_LIST

Navbaren MÅSTE innehålla länkar till exakt dessa sidor.

## Krav på layout.html

1. Komplett `<!DOCTYPE html>` (lang="sv")
2. `<head>` med:
   - `<title>{{PAGE_TITLE}}</title>` (platshållare — oförändrad)
   - `<meta name="description" content="{{PAGE_DESCRIPTION}}">` (platshållare — oförändrad)
   - Google Fonts `<link>` (välj 1-2 fonter baserat på affärstypen)
   - En enda `<style>`-block med ALL CSS för webbplatsen:
     * CSS custom properties (`--primary`, `--secondary`, `--accent`, `--text`, `--bg`, `--surface`)
     * Reset, base, typografi
     * Komponenter: header, nav, footer, knappar, kort, hero, bento-grid, recensions-scroll, kontaktformulär
     * Responsiv navbar med hamburger på mobil
3. `<header>` med logo + `<nav>` där varje `<a>` har `data-page="<slug>"`-attribut
4. `<main><!-- CONTENT --></main>` — EXAKT denna kommentar
5. `<footer>` med kontaktinfo, öppettider, länkar till alla sidor

## Färgpalett per affärstyp

- frisör/skönhet: varma pasteller, koppar, champagne
- spa: lugna jordnära toner, sage, terracotta
- nagel: mjukt rosa, nude, accentfärg
- massage: neutrala jordnära, mörkt trä
- klinik: rent vitt, ljusblått, mint
- annat: välj baserat på företagsnamn och beskrivning

## Typografi

Två Google Fonts: en för rubriker, en för brödtext.

## FÖRBJUDET

- `<main>` får INTE innehålla något annat än `<!-- CONTENT -->`
- Inga placeholder-texter som "Lorem ipsum"
- Inga externa CSS-filer utöver Google Fonts

## Leverans

Spara till `$OUTPUT_DIR/layout.html`. Inga andra filer.
```

- [ ] **Step 2: Skapa server/pipeline/layout.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/layout.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR, SKILLS_DIR } from '../lib/platform'
import type { Strategy, LogFn } from '../lib/types'

export async function runLayout(strategy: Strategy, outputDir: string, log: LogFn): Promise<void> {
  log('Layout-pass startat...')

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Företagsdata saknas: ${dataPath}`)
  }
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 2000)

  const pagesList = strategy.pages
    .map((p) => `- ${p.slug} (${p.filename})`)
    .join('\n')

  const templatePath = join(PIPELINE_DIR, 'layout-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = template
    .replace('$BUSINESS_DATA', businessData)
    .replace('$BUSINESS_TYPE', strategy.businessType)
    .replace('$PAGES_LIST', pagesList)
    .replaceAll('$OUTPUT_DIR', outputDir)

  let attempt = 0
  const maxAttempts = 2

  while (attempt < maxAttempts) {
    attempt++
    log(`Layout försök ${attempt}/${maxAttempts}`)

    await runClaude({
      args: [
        '--dangerously-skip-permissions',
        '--bare',
        '--add-dir', SKILLS_DIR,
        '-p', prompt,
        '--output-format', 'stream-json',
      ],
      cwd: outputDir,
      log,
      onLine: (line) => {
        try {
          const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string; text?: string }> } }
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use' && block.name) {
                log(`Använder ${block.name}...`)
              } else if (block.type === 'text' && block.text && block.text.length > 10) {
                log(block.text.slice(0, 150))
              }
            }
          }
        } catch {
          // Icke-JSON, ignorera
        }
      },
    })

    try {
      verifyLayout(join(outputDir, 'layout.html'), strategy)
      log('Layout verifierad')
      return
    } catch (err) {
      log(`Layout-verifiering misslyckades: ${(err as Error).message}`)
      if (attempt >= maxAttempts) {
        throw new Error(`Layout-passet kunde inte producera giltig layout.html efter ${maxAttempts} försök`)
      }
    }
  }
}

export function verifyLayout(layoutPath: string, strategy: Strategy): void {
  if (!existsSync(layoutPath)) {
    throw new Error('layout.html saknas')
  }
  const html = readFileSync(layoutPath, 'utf-8')

  const contentMatches = html.match(/<!-- CONTENT -->/g) ?? []
  if (contentMatches.length !== 1) {
    throw new Error(`Förväntade exakt en <!-- CONTENT -->, hittade ${contentMatches.length}`)
  }

  if (!html.includes('{{PAGE_TITLE}}')) {
    throw new Error('Saknar {{PAGE_TITLE}}')
  }
  if (!html.includes('{{PAGE_DESCRIPTION}}')) {
    throw new Error('Saknar {{PAGE_DESCRIPTION}}')
  }
  if (!/<style[^>]*>[\s\S]*?<\/style>/.test(html)) {
    throw new Error('Saknar <style>-block')
  }

  for (const page of strategy.pages) {
    const re = new RegExp(`data-page=["']${page.slug}["']`)
    if (!re.test(html)) {
      throw new Error(`Saknar nav-länk för "${page.slug}"`)
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/pipeline/layout-prompt.md apps/genflow/server/pipeline/layout.ts
git commit -m "feat(genflow): add layout prompt and runLayout with verification"
```

---

### Task 19: Page prompt + runPagePipeline + layout-substitution

**Files:**
- Create: `apps/genflow/pipeline/page-prompt.md`
- Create: `apps/genflow/server/pipeline/page.ts`
- Create: `apps/genflow/server/lib/layout-substitution.ts`

- [ ] **Step 1: Skapa pipeline/page-prompt.md**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/pipeline/page-prompt.md`:

```markdown
# Sid-innehåll: $PAGE_SLUG

Du bygger INNEHÅLLET för sidan `$PAGE_FILENAME`. Den delade mallen finns i `$LAYOUT_PATH`. Din uppgift är BARA att producera content-fragmentet som ska sättas in i `<main>`. Du får INTE redigera layout-filen och INTE skriva den slutliga sidfilen — Node sköter substitutionen.

## Företagsdata

$BUSINESS_DATA

## Strategi

$STRATEGY

## Sidspecifika data

$PAGE_CONTEXT

## Process

1. Läs `$LAYOUT_PATH` (Read med limit 1000) för att förstå CSS-klasser, tema, komponenter
2. Generera HTML för sektionerna: $PAGE_SECTIONS
3. Skriv ENDAST content-fragmentet till: `$CONTENT_PATH`
   - Bara sektioner som ska visas inuti `<main>`
   - Inget `<html>`, `<head>`, `<body>`, `<header>`, `<footer>`, `<main>`-omslag

## Regler

- Bilder är Unsplash-URL:er: `https://images.unsplash.com/photo-XXXX?w=1200&q=80`
- Ingen `<style>`-tagg normalt — CSS finns i layouten. Sidspecifik CSS får finnas som litet `<style>`-block överst i fragmentet.
- Inget `<script>`
- CSS-klasser ska matcha layoutens `<style>`
- Svenska text genomgående
- Aldrig skriva till `site/`
- Aldrig läsa/ändra andra filer än `$LAYOUT_PATH` (read) och `$CONTENT_PATH` (write)

## Sidtyp-specifika regler

$PAGE_TYPE_RULES
```

- [ ] **Step 2: Skapa server/lib/layout-substitution.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/lib/layout-substitution.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { PageSpec, Strategy } from './types'

export function renderPageFromLayout(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string,
): void {
  const contentPath = join(outputDir, 'pages', `${pageSpec.slug}.content.html`)
  const layoutPath = join(outputDir, 'layout.html')
  const sitePath = join(outputDir, 'site', pageSpec.filename)

  if (!existsSync(contentPath)) {
    throw new Error(`Content-fragment saknas: ${contentPath}`)
  }
  if (!existsSync(layoutPath)) {
    throw new Error(`Layout saknas: ${layoutPath}`)
  }

  const content = readFileSync(contentPath, 'utf-8')
  const layout = readFileSync(layoutPath, 'utf-8')
  const businessName = readBusinessName(outputDir)
  const pageTitle = buildPageTitle(pageSpec.slug, businessName)
  const pageDescription = buildPageDescription(pageSpec.slug, businessName)

  let html = layout
    .replace('{{PAGE_TITLE}}', escapeHtml(pageTitle))
    .replace('{{PAGE_DESCRIPTION}}', escapeHtml(pageDescription))
    .replace('<!-- CONTENT -->', content)

  // Sätt active-klass på nav-länk för denna sida
  html = setActiveNav(html, pageSpec.slug)

  mkdirSync(dirname(sitePath), { recursive: true })
  writeFileSync(sitePath, html)
}

function readBusinessName(outputDir: string): string {
  try {
    const dataPath = join(outputDir, 'företagsdata.json')
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return data.namn ?? data.name ?? 'Företag'
  } catch {
    return 'Företag'
  }
}

function buildPageTitle(slug: string, businessName: string): string {
  const titles: Record<string, string> = {
    index: businessName,
    tjanster: `Tjänster — ${businessName}`,
    'om-oss': `Om oss — ${businessName}`,
    galleri: `Galleri — ${businessName}`,
    kontakt: `Kontakt — ${businessName}`,
  }
  return titles[slug] ?? businessName
}

function buildPageDescription(slug: string, businessName: string): string {
  const descriptions: Record<string, string> = {
    index: `Välkommen till ${businessName}. Boka tid online.`,
    tjanster: `Alla tjänster och priser hos ${businessName}.`,
    'om-oss': `Läs mer om ${businessName} — vår historia och värderingar.`,
    galleri: `Bildgalleri från ${businessName}.`,
    kontakt: `Kontakta ${businessName} — adress, telefon och öppettider.`,
  }
  return descriptions[slug] ?? businessName
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function setActiveNav(html: string, slug: string): string {
  const activeRe = new RegExp(
    `(<a[^>]*data-page=["']${slug}["'][^>]*?)(class=["']([^"']*)["'])?`,
  )
  return html.replace(activeRe, (_match, prefix: string, classAttr: string | undefined, classes: string | undefined) => {
    if (classAttr) {
      return `${prefix}class="${classes} active"`
    }
    return `${prefix} class="active"`
  })
}
```

- [ ] **Step 3: Skapa server/pipeline/page.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/page.ts`:

```ts
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR, SKILLS_DIR } from '../lib/platform'
import type { PageSpec, Strategy, LogFn } from '../lib/types'

export async function runPagePipeline(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string,
  log: LogFn,
): Promise<void> {
  log(`Sid-pipeline startad: ${pageSpec.slug}`)

  // Se till att pages/ finns
  mkdirSync(join(outputDir, 'pages'), { recursive: true })

  const dataPath = join(outputDir, 'företagsdata.json')
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 2000)

  const layoutPath = join(outputDir, 'layout.html')
  const contentPath = join(outputDir, 'pages', `${pageSpec.slug}.content.html`)

  const templatePath = join(PIPELINE_DIR, 'page-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')

  const pageContext = buildPageContext(pageSpec, strategy, outputDir)
  const pageTypeRules = getPageTypeRules(pageSpec.slug)

  const prompt = template
    .replaceAll('$PAGE_SLUG', pageSpec.slug)
    .replace('$PAGE_FILENAME', pageSpec.filename)
    .replace('$BUSINESS_DATA', businessData)
    .replace('$STRATEGY', JSON.stringify(strategy, null, 2))
    .replace('$PAGE_CONTEXT', pageContext)
    .replace('$PAGE_SECTIONS', JSON.stringify(pageSpec.sections))
    .replace('$LAYOUT_PATH', layoutPath)
    .replace('$CONTENT_PATH', contentPath)
    .replace('$PAGE_TYPE_RULES', pageTypeRules)

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--bare',
      '--add-dir', SKILLS_DIR,
      '-p', prompt,
      '--output-format', 'stream-json',
    ],
    cwd: outputDir,
    log,
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string; text?: string }> } }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              log(`[${pageSpec.slug}] ${block.name}...`)
            }
          }
        }
      } catch {
        // ignore
      }
    },
  })

  if (!existsSync(contentPath)) {
    throw new Error(`Sidan ${pageSpec.slug} producerade inget content-fragment`)
  }

  log(`Sid-pipeline klar: ${pageSpec.slug}`)
}

function buildPageContext(pageSpec: PageSpec, strategy: Strategy, outputDir: string): string {
  const dataPath = join(outputDir, 'företagsdata.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'))

  switch (pageSpec.slug) {
    case 'index':
      return [
        `Featured tjänster: ${JSON.stringify(strategy.services.featuredForIndex)}`,
        `Recensions-mode: ${strategy.reviews.displayMode}`,
        `Antal recensioner: ${strategy.reviews.total}`,
        `Exempel-recensioner: ${JSON.stringify((data.recensioner ?? []).slice(0, 8))}`,
      ].join('\n')
    case 'tjanster':
      return [
        `Alla tjänster: ${JSON.stringify(data.tjänster ?? [])}`,
        `Kategoriordning: ${JSON.stringify(strategy.services.categoryOrder)}`,
      ].join('\n')
    case 'om-oss':
      return [
        `Om oss-text: ${data.om_oss ?? data.beskrivning ?? ''}`,
        `Personal (nämns som text): ${JSON.stringify(data.personal ?? [])}`,
      ].join('\n')
    case 'galleri':
      return `Unsplash-teman: ${JSON.stringify(strategy.gallery.themes)}`
    case 'kontakt':
      return [
        `Adress: ${data.adress ?? ''}`,
        `Telefon: ${data.telefon ?? ''}`,
        `Email: ${data.epost ?? data.email ?? ''}`,
        `Öppettider: ${JSON.stringify(data.öppettider ?? data.oppettider ?? {})}`,
      ].join('\n')
    default:
      return ''
  }
}

function getPageTypeRules(slug: string): string {
  const rules: Record<string, string> = {
    index: `- Hero med företagsnamn, tagline, primär CTA, Unsplash-bakgrundsbild
- Kort intro (2-3 meningar)
- Featured tjänster-grid (bara strategy.services.featuredForIndex)
- Om recensions-mode är infinity-scroll: horisontell auto-scroll, duplicerade kort, pause on hover, 5-8 recensioner
- Om recensions-mode är statiska-kort: 3 kort i grid
- Kontakt-CTA-sektion med adress, telefon, knapp`,

    tjanster: `- Rubriksektion "Våra tjänster"
- Grupperade per kategori i strategy.services.categoryOrder
- Varje tjänst: namn, beskrivning, pris, varaktighet
- ALLA tjänster från företagsdata.json
- Strukturerad layout (inte kort med bakgrundsbilder)`,

    'om-oss': `- Hero med kort beskrivning
- Historia/värderingar från om_oss-text
- Personal som TEXT (ingen team-grid)
- Eventuell Unsplash-bild av lokaltyp`,

    galleri: `- Bento-grid layout (variarade cell-storlekar)
- 8-12 Unsplash-bilder från strategy.gallery.themes
- ALDRIG infinity-scroll eller carousel
- Hover-effekter tillåtna`,

    kontakt: `- Kontaktformulär (rent visuellt, action="#")
- Adress, telefon, email
- Öppettider som tabell
- Google Maps iframe om adress finns`,
  }
  return rules[slug] ?? ''
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/pipeline/page-prompt.md apps/genflow/server/pipeline/page.ts apps/genflow/server/lib/layout-substitution.ts
git commit -m "feat(genflow): add page prompt, runPagePipeline and layout substitution"
```

---

### Task 20: Polish pass

**Files:**
- Create: `apps/genflow/server/pipeline/polish.ts`

- [ ] **Step 1: Skapa server/pipeline/polish.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/polish.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import type { PageSpec, Strategy, LogFn } from '../lib/types'

export async function runPolish(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string,
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const filePath = join(siteDir, pageSpec.filename)

  if (!existsSync(filePath)) {
    log(`Polish skippas — ${pageSpec.filename} finns inte`)
    return
  }

  log(`Polish startat: ${pageSpec.slug}`)

  const dataPath = join(outputDir, 'företagsdata.json')
  let businessName = ''
  try {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    businessName = data.namn ?? data.name ?? ''
  } catch {
    // ignore
  }

  const prompt = `Du är senior webbutvecklare och kreativ designer. Du granskar OCH förbättrar sidan \`${pageSpec.filename}\`. Layout-mallen har redan genererats och är ansvarig för tema, header, footer och <style>-blocket. Din uppgift är att polera <main>-innehållet.

Företag: ${businessName}
Affärstyp: ${strategy.businessType}
Sida: ${pageSpec.slug}

## STEG 1: Läs filen på EN GÅNG (Read med limit 1000)

## STEG 2: Granska <main>-innehållet

Leta efter:
- Ojämna grids, dålig spacing, överlappande element
- Inkonsekvent typografi
- Dålig kontrast
- Tomma sektioner, placeholder-text
- Brutna Unsplash-URL:er
- Två infinity-scroll-sektioner direkt efter varandra

## STEG 3: Förbättra — lägg till 2-4 av följande

- Hero parallax (OBLIGATORISKT på index.html om sidan har hero)
- Fade-in-on-scroll-animationer
- Hover-effekter på kort och knappar
- Gradient overlays på hero-bilder
- Glassmorphism på kort (backdrop-filter: blur)
- SVG wave-dividers
- Subtila accent-linjer

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan <main> och </main>
- FÖRBJUDET att ändra <head>, <header>, <footer>, <style>
- Sidspecifik CSS → <style>-block DIREKT efter <main>-öppningen, INUTI <main>
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Ändra INTE nav-länkar eller data-page-attribut
- Ändra INTE active-state-klassen
- ALL text på svenska

## Beskriv kort på svenska vad du fixade`

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--bare',
      '-p', prompt,
      '--output-format', 'stream-json',
    ],
    cwd: siteDir,
    log,
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string }> } }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              log(`[${pageSpec.slug} polish] ${block.name}...`)
            }
          }
        }
      } catch {
        // ignore
      }
    },
  })

  verifyPolishedPage(filePath, outputDir, log)
  log(`Polish klar: ${pageSpec.slug}`)
}

function verifyPolishedPage(filePath: string, outputDir: string, log: LogFn): void {
  if (!existsSync(filePath)) {
    log(`Varning: ${filePath} finns inte efter polish`)
    return
  }

  const html = readFileSync(filePath, 'utf-8')

  if (html.includes('<!-- CONTENT -->')) {
    log(`Varning: <!-- CONTENT --> finns kvar i ${filePath} efter polish`)
  }

  // Diff av <head> mot layout.html
  const layoutPath = join(outputDir, 'layout.html')
  if (!existsSync(layoutPath)) return

  const layoutHtml = readFileSync(layoutPath, 'utf-8')
  const headRe = /<head>[\s\S]*?<\/head>/
  const pageHead = html.match(headRe)?.[0]
  const layoutHead = layoutHtml.match(headRe)?.[0]

  if (pageHead && layoutHead) {
    const normalize = (s: string) =>
      s
        .replace(/<title>[^<]*<\/title>/, '<title></title>')
        .replace(/content="[^"]*"/g, 'content=""')
    if (normalize(pageHead) !== normalize(layoutHead)) {
      log(`Varning: <head> modifierad av polish i ${filePath}`)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/pipeline/polish.ts
git commit -m "feat(genflow): add combined review+creative polish pass"
```

---

### Task 21: Image verifier + Unsplash allowlist

**Files:**
- Create: `apps/genflow/pipeline/unsplash-allowlist.json`
- Create: `apps/genflow/server/image-verifier.ts`

- [ ] **Step 1: Skapa pipeline/unsplash-allowlist.json**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/pipeline/unsplash-allowlist.json`:

```json
{
  "frisör": [
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80",
    "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80",
    "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80"
  ],
  "spa": [
    "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&q=80",
    "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&q=80"
  ],
  "nagel": [
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80",
    "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=1200&q=80"
  ],
  "massage": [
    "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1200&q=80",
    "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=1200&q=80"
  ],
  "skönhet": [
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=80",
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80"
  ],
  "klinik": [
    "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200&q=80",
    "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80"
  ],
  "annat": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80"
  ],
  "default": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
  ]
}
```

- [ ] **Step 2: Skapa server/image-verifier.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/image-verifier.ts`:

```ts
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PIPELINE_DIR } from './lib/platform'
import type { LogFn } from './lib/types'

const UNSPLASH_RE = /https:\/\/images\.unsplash\.com\/[^\s"')]+/g

interface Allowlist {
  [businessType: string]: string[]
}

export async function verifyAllImages(
  outputDir: string,
  businessType: string,
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  if (!existsSync(siteDir)) {
    log('Bildverifiering skippas — ingen site-katalog')
    return
  }

  const allowlistPath = join(PIPELINE_DIR, 'unsplash-allowlist.json')
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8')) as Allowlist
  const fallbacks: string[] = allowlist[businessType] ?? allowlist.default ?? []

  if (fallbacks.length === 0) {
    log('Varning: ingen fallback-lista för bildverifiering')
  }

  const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith('.html'))
  log(`Bildverifiering startar på ${htmlFiles.length} filer`)

  for (const file of htmlFiles) {
    const path = join(siteDir, file)
    let html = readFileSync(path, 'utf-8')
    const urls = [...new Set(html.match(UNSPLASH_RE) ?? [])]
    let fallbackIndex = 0
    let replaced = 0

    for (const url of urls) {
      if (!(await isReachable(url))) {
        if (fallbacks.length > 0) {
          const fallback = fallbacks[fallbackIndex % fallbacks.length]
          fallbackIndex++
          html = html.split(url).join(fallback)
          replaced++
        }
      }
    }

    if (replaced > 0) {
      writeFileSync(path, html)
      log(`${file}: ersatte ${replaced} trasiga bild-URL:er`)
    }
  }

  log('Bildverifiering klar')
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/pipeline/unsplash-allowlist.json apps/genflow/server/image-verifier.ts
git commit -m "feat(genflow): add Unsplash allowlist and image verifier"
```

**CHECKPOINT 5:** Efter denna task finns alla pipeline-byggstenar klara (strategy, layout, page, polish, image-verifier), men de är inte orkestrerade än.

---

## Fas 6: Orchestration + deploy (Tasks 22-24)

### Task 22: Scraper wrapper + orchestrator

**Files:**
- Create: `apps/genflow/server/pipeline/scrape.ts`
- Create: `apps/genflow/server/orchestrator.ts`

- [ ] **Step 1: Skapa server/pipeline/scrape.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/scrape.ts`:

```ts
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveScraperCommand, OUTPUT_DIR } from '../lib/platform'
import type { LogFn } from '../lib/types'

export async function runScrape(sourceUrl: string, slug: string, log: LogFn): Promise<string> {
  log(`Scrape startat: ${sourceUrl}`)

  const outputDir = join(OUTPUT_DIR, slug)
  mkdirSync(outputDir, { recursive: true })

  const { cmd, args } = resolveScraperCommand()

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args(sourceUrl), {
      cwd: OUTPUT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) log(`[scrape] ${line.trim()}`)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log(`[scrape err] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`scrape exit code ${code}`))
    })
  })

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Scrape producerade ingen företagsdata.json`)
  }

  log(`Scrape klar: ${outputDir}`)
  return outputDir
}
```

- [ ] **Step 2: Skapa server/orchestrator.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/orchestrator.ts`:

```ts
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runScrape } from './pipeline/scrape'
import { runStrategy } from './pipeline/strategy'
import { runLayout } from './pipeline/layout'
import { runPagePipeline } from './pipeline/page'
import { runPolish } from './pipeline/polish'
import { verifyAllImages } from './image-verifier'
import { renderPageFromLayout } from './lib/layout-substitution'
import type { GenJob, Strategy, LogFn } from './lib/types'

interface JobResult {
  slug: string
  ok: boolean
  error?: string
}

export async function runJob(
  job: GenJob,
  log: LogFn,
): Promise<{ outputDir: string; siteDir: string }> {
  log(`=== Jobb startat: ${job.slug} ===`)

  // 1. Scrape
  const outputDir = await runScrape(job.source_url, job.slug, log)

  // 2. Strategy (sekventiellt)
  const strategy = await runStrategy(outputDir, log)

  // 3. Layout (sekventiellt, delad mall)
  await runLayout(strategy, outputDir, log)

  // 4. Parallell per-sida pipeline + polish
  // p-limit(3) i claude-runner.ts begränsar totalt antal samtidiga Claude-processer
  const results: JobResult[] = await Promise.all(
    strategy.pages.map(async (page): Promise<JobResult> => {
      try {
        await runPagePipeline(page, strategy, outputDir, log)
        renderPageFromLayout(page, strategy, outputDir)
        await runPolish(page, strategy, outputDir, log)
        return { slug: page.slug, ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Sida ${page.slug} misslyckades: ${msg}`)
        return { slug: page.slug, ok: false, error: msg }
      }
    }),
  )

  // 5. Hantera failade sidor
  const failed = results.filter((r) => !r.ok).map((r) => r.slug)
  if (failed.includes('index')) {
    throw new Error('Index-sidan misslyckades — hela jobbet failar')
  }
  if (failed.length > 0) {
    log(`Misslyckade sidor: ${failed.join(', ')}`)
    await removeDeadNavLinks(outputDir, failed, log)
  }

  // 6. Bildverifiering
  await verifyAllImages(outputDir, strategy.businessType, log)

  const siteDir = join(outputDir, 'site')
  log(`=== Jobb klart: ${job.slug} ===`)
  return { outputDir, siteDir }
}

async function removeDeadNavLinks(
  outputDir: string,
  failedSlugs: string[],
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  if (!existsSync(siteDir)) return

  const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith('.html'))

  for (const file of htmlFiles) {
    const path = join(siteDir, file)
    let html = readFileSync(path, 'utf-8')
    let removed = 0

    for (const slug of failedSlugs) {
      // Ta bort <a>-taggen med data-page="<slug>"
      const re = new RegExp(`<a[^>]*data-page=["']${slug}["'][^>]*>[\\s\\S]*?<\\/a>`, 'g')
      const matches = html.match(re)
      if (matches) {
        removed += matches.length
        html = html.replace(re, '')
      }
    }

    if (removed > 0) {
      writeFileSync(path, html)
      log(`${file}: tog bort ${removed} döda nav-länkar`)
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/pipeline/scrape.ts apps/genflow/server/orchestrator.ts
git commit -m "feat(genflow): add scrape wrapper and orchestrator with parallel pages"
```

---

### Task 23: Vercel deploy

**Files:**
- Create: `apps/genflow/server/pipeline/deploy.ts`

- [ ] **Step 1: Skapa server/pipeline/deploy.ts**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/pipeline/deploy.ts`:

```ts
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LogFn } from '../lib/types'

export async function deployToVercel(
  siteDir: string,
  slug: string,
  log: LogFn,
): Promise<string> {
  log(`Deploy startat för ${slug}`)

  if (!existsSync(siteDir)) {
    throw new Error(`Site-katalog saknas: ${siteDir}`)
  }

  // Skapa vercel.json om den inte finns
  const vercelJsonPath = join(siteDir, 'vercel.json')
  if (!existsSync(vercelJsonPath)) {
    writeFileSync(vercelJsonPath, JSON.stringify({
      cleanUrls: true,
    }, null, 2))
  }

  const output: string[] = []

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('vercel', ['deploy', '--prod', '--yes'], {
      cwd: siteDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output.push(text)
      for (const line of text.split('\n')) {
        if (line.trim()) log(`[deploy] ${line.trim()}`)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log(`[deploy err] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`vercel deploy exit code ${code}`))
    })
  })

  // Extrahera URL från output
  const fullOutput = output.join('')
  const urlMatch = fullOutput.match(/https:\/\/[\w-]+\.vercel\.app/g)
  if (!urlMatch || urlMatch.length === 0) {
    throw new Error('Kunde inte hitta deployed URL i vercel output')
  }

  const deployedUrl = urlMatch[urlMatch.length - 1]  // sista URL:en är prod-alias
  log(`Deploy klar: ${deployedUrl}`)
  return deployedUrl
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/pipeline/deploy.ts
git commit -m "feat(genflow): add Vercel deploy wrapper"
```

---

### Task 24: Koppla ihop orchestrator med poller + logger

**Files:**
- Modify: `apps/genflow/server/index.ts`

- [ ] **Step 1: Uppdatera server/index.ts för full pipeline**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/server/index.ts` och ersätt HELA innehållet:

```ts
// Utility process entry point.
import { join } from 'node:path'
import { loadConfig } from './lib/config'
import { startPolling, stopPolling, togglePause } from './poller'
import { runJob } from './orchestrator'
import { deployToVercel } from './pipeline/deploy'
import { completeJob, failJob } from './lib/saleflow-client'
import { createJobLogger } from './lib/logger'
import { killAllActive } from './claude-runner'
import { OUTPUT_DIR } from './lib/platform'
import type { GenJob } from './lib/types'

console.log('[server] utility process started, pid:', process.pid)

type ServerToMainMessage =
  | { type: 'log'; payload: { message: string; jobSlug?: string; timestamp?: string } }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'pong' }
  | { type: 'polling-status'; payload: { running: boolean; paused: boolean } }
  | { type: 'job-start'; payload: { job: GenJob } }
  | { type: 'job-complete'; payload: { job: GenJob; resultUrl: string } }
  | { type: 'job-failed'; payload: { job: GenJob; error: string } }

function send(msg: ServerToMainMessage) {
  process.parentPort?.postMessage(msg)
}

function broadcast(event: { type: string; payload?: unknown }) {
  send(event as ServerToMainMessage)
}

const config = loadConfig()

async function handleJob(job: GenJob): Promise<void> {
  const logPath = join(OUTPUT_DIR, job.slug, 'pipeline.log')
  const { log } = createJobLogger(job.slug, logPath, broadcast)

  log(`Nytt jobb plockat: ${job.slug} (${job.source_url})`)
  broadcast({ type: 'job-start', payload: { job } })

  try {
    const { siteDir } = await runJob(job, log)
    const resultUrl = await deployToVercel(siteDir, job.slug, log)
    await completeJob(job.id, resultUrl, config)
    log(`Jobb komplett: ${resultUrl}`)
    broadcast({ type: 'job-complete', payload: { job, resultUrl } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Jobb misslyckades: ${msg}`)
    try {
      await failJob(job.id, msg, config)
    } catch (failErr) {
      log(`Kunde inte rapportera fail till backend: ${(failErr as Error).message}`)
    }
    broadcast({ type: 'job-failed', payload: { job, error: msg } })
  }
}

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined

  if (msg?.type === 'ping') {
    send({ type: 'pong' })
  }

  if (msg?.type === 'toggle-polling') {
    togglePause()
    console.log('[server] Polling-toggle mottaget')
  }

  if (msg?.type === 'shutdown') {
    console.log('[server] Shutdown mottaget, avslutar')
    killAllActive()
    stopPolling()
    setTimeout(() => process.exit(0), 500)
  }
})

// Heartbeat var 30:e sekund
setInterval(() => {
  send({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

// Starta polling
const startupLog = (message: string) => {
  console.log('[server]', message)
  broadcast({ type: 'log', payload: { message } })
}

if (!config.apiKey) {
  startupLog('Ingen API-nyckel i ~/.genflow/config.json — polling pausad')
  startupLog('Lägg till apiKey i config och restarta appen')
} else {
  startupLog(`Startar polling mot ${config.backendUrl}`)
  startPolling(config, startupLog, broadcast, handleJob).catch((err) => {
    startupLog(`Polling-loop krasch: ${err.message}`)
    process.exit(1)
  })
}
```

- [ ] **Step 2: Bygg och testa**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm build`

Expected: TypeScript-kompilering lyckas. Om det blir fel — läs felen noggrant och fixa innan commit.

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/server/index.ts
git commit -m "feat(genflow): wire up full pipeline in utility process entry"
```

**CHECKPOINT 6:** Efter denna task är hela pipelinen orkestrerad. Med en giltig `apiKey` i `~/.genflow/config.json` ska appen kunna plocka ett jobb, scrapa, köra strategy/layout/pages/polish, verifiera bilder, deploya till Vercel och posta tillbaka result_url. Testa genom att manuellt skapa en `GenerationJob` i saleflow-backend (eller via dashboarden om `use_genflow_jobs=true`).

---

## Fas 7: UI polish (Tasks 25-27)

### Task 25: StatusPanel + ConfigPanel

**Files:**
- Create: `apps/genflow/ui/src/components/StatusPanel.tsx`
- Create: `apps/genflow/ui/src/components/ConfigPanel.tsx`

- [ ] **Step 1: Skapa ui/src/components/StatusPanel.tsx**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/components/StatusPanel.tsx`:

```tsx
interface StatusPanelProps {
  status: 'connected' | 'disconnected' | 'paused' | 'working'
}

export default function StatusPanel({ status }: StatusPanelProps) {
  const statusLabels: Record<string, string> = {
    connected: 'Ansluten',
    working: 'Arbetar',
    paused: 'Pausad',
    disconnected: 'Frånkopplad',
  }

  const statusColors: Record<string, string> = {
    connected: '#22c55e',
    working: '#3b82f6',
    paused: '#eab308',
    disconnected: '#ef4444',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: '#f5f5f5',
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <span style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: statusColors[status],
      }} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>
        {statusLabels[status]}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Skapa ui/src/components/ConfigPanel.tsx**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/components/ConfigPanel.tsx`:

```tsx
import { useState } from 'react'

interface ConfigPanelProps {
  initialBackendUrl: string
  initialApiKey: string
  onSave: (backendUrl: string, apiKey: string) => void
}

export default function ConfigPanel({ initialBackendUrl, initialApiKey, onSave }: ConfigPanelProps) {
  const [backendUrl, setBackendUrl] = useState(initialBackendUrl)
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [isEditing, setIsEditing] = useState(false)

  if (!isEditing) {
    return (
      <div style={{ marginBottom: 16, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Backend URL:</div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>{backendUrl}</div>
        <div style={{ fontSize: 12, color: '#666' }}>API Key:</div>
        <div style={{ fontSize: 14, fontFamily: 'monospace' }}>
          {apiKey ? apiKey.slice(0, 8) + '...' : '(inte satt)'}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          style={{ marginTop: 8, padding: '4px 12px', fontSize: 12 }}
        >
          Redigera
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Backend URL:</div>
        <input
          type="text"
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          style={{ width: '100%', padding: 6, fontSize: 14 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>API Key:</div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: '100%', padding: 6, fontSize: 14, fontFamily: 'monospace' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            onSave(backendUrl, apiKey)
            setIsEditing(false)
          }}
          style={{ padding: '6px 16px', fontSize: 14 }}
        >
          Spara
        </button>
        <button
          onClick={() => setIsEditing(false)}
          style={{ padding: '6px 16px', fontSize: 14 }}
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/ui/src/components
git commit -m "feat(genflow): add StatusPanel and ConfigPanel components"
```

---

### Task 26: LogViewer + JobQueue komponenter

**Files:**
- Create: `apps/genflow/ui/src/components/LogViewer.tsx`
- Create: `apps/genflow/ui/src/components/JobQueue.tsx`

- [ ] **Step 1: Skapa ui/src/components/LogViewer.tsx**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/components/LogViewer.tsx`:

```tsx
import { useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  message: string
  jobSlug?: string
}

interface LogViewerProps {
  logs: LogEntry[]
}

export default function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs.length])

  return (
    <div>
      <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Loggar</h2>
      <div
        ref={containerRef}
        style={{
          background: '#111',
          color: '#ddd',
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 11,
          padding: 12,
          borderRadius: 6,
          height: 400,
          overflow: 'auto',
        }}
      >
        {logs.length === 0 && <div style={{ opacity: 0.5 }}>Inga loggar ännu</div>}
        {logs.map((log, i) => (
          <div key={i} style={{ lineHeight: 1.4 }}>
            <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span>
            {log.jobSlug && (
              <span style={{ color: '#60a5fa' }}> [{log.jobSlug}]</span>
            )}{' '}
            {log.message}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Skapa ui/src/components/JobQueue.tsx**

Skapa `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/components/JobQueue.tsx`:

```tsx
interface Job {
  slug: string
  sourceUrl: string
  status: 'running' | 'ok' | 'failed'
  startedAt: string
  resultUrl?: string
  error?: string
}

interface JobQueueProps {
  jobs: Job[]
}

export default function JobQueue({ jobs }: JobQueueProps) {
  if (jobs.length === 0) {
    return (
      <div>
        <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Jobb</h2>
        <div style={{ color: '#999', fontSize: 13 }}>Inga jobb ännu</div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Jobb</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((job) => (
          <div
            key={`${job.slug}-${job.startedAt}`}
            style={{
              padding: 10,
              background: '#f5f5f5',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 500 }}>
                {job.status === 'ok' ? '✓' : job.status === 'failed' ? '✗' : '⏳'} {job.slug}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>{job.startedAt}</span>
            </div>
            {job.resultUrl && (
              <a href={job.resultUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 11 }}>
                {job.resultUrl}
              </a>
            )}
            {job.error && (
              <div style={{ color: '#ef4444', fontSize: 11 }}>{job.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/ui/src/components
git commit -m "feat(genflow): add LogViewer and JobQueue components"
```

---

### Task 27: App.tsx — integrera alla komponenter

**Files:**
- Modify: `apps/genflow/ui/src/App.tsx`

- [ ] **Step 1: Uppdatera App.tsx att använda alla komponenter**

Öppna `/Users/douglassiteflow/dev/saleflow/apps/genflow/ui/src/App.tsx` och ersätt HELA innehållet:

```tsx
import { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel'
import LogViewer from './components/LogViewer'
import JobQueue from './components/JobQueue'

interface ServerEvent {
  type: string
  payload?: unknown
}

interface LogEntry {
  timestamp: string
  message: string
  jobSlug?: string
}

interface Job {
  slug: string
  sourceUrl: string
  status: 'running' | 'ok' | 'failed'
  startedAt: string
  resultUrl?: string
  error?: string
}

declare global {
  interface Window {
    genflow?: {
      onEvent: (channel: string, listener: (payload: unknown) => void) => () => void
      send: (channel: string, payload: unknown) => void
    }
  }
}

export default function App() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'paused' | 'working'>(
    'disconnected',
  )
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    if (!window.genflow) return

    const unsub = window.genflow.onEvent('server-event', (payload) => {
      const event = payload as ServerEvent

      if (event.type === 'log') {
        const p = event.payload as { message: string; jobSlug?: string; timestamp?: string }
        setLogs((prev) => [
          ...prev.slice(-199),
          {
            timestamp: p.timestamp ?? new Date().toLocaleTimeString('sv-SE'),
            message: p.message,
            jobSlug: p.jobSlug,
          },
        ])
      }

      if (event.type === 'polling-status') {
        const p = event.payload as { running: boolean; paused: boolean }
        setStatus(p.paused ? 'paused' : p.running ? 'connected' : 'disconnected')
      }

      if (event.type === 'job-start') {
        const p = event.payload as { job: { slug: string; source_url: string } }
        setStatus('working')
        setJobs((prev) => [
          {
            slug: p.job.slug,
            sourceUrl: p.job.source_url,
            status: 'running',
            startedAt: new Date().toLocaleTimeString('sv-SE'),
          },
          ...prev.slice(0, 9),
        ])
      }

      if (event.type === 'job-complete') {
        const p = event.payload as { job: { slug: string }; resultUrl: string }
        setStatus('connected')
        setJobs((prev) =>
          prev.map((j) =>
            j.slug === p.job.slug && j.status === 'running'
              ? { ...j, status: 'ok', resultUrl: p.resultUrl }
              : j,
          ),
        )
      }

      if (event.type === 'job-failed') {
        const p = event.payload as { job: { slug: string }; error: string }
        setStatus('connected')
        setJobs((prev) =>
          prev.map((j) =>
            j.slug === p.job.slug && j.status === 'running'
              ? { ...j, status: 'failed', error: p.error }
              : j,
          ),
        )
      }
    })

    return () => unsub()
  }, [])

  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 1000,
        margin: '0 auto',
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Genflow</h1>
      </header>

      <StatusPanel status={status} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <LogViewer logs={logs} />
        <JobQueue jobs={jobs} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Testa i dev-mode**

Run: `cd /Users/douglassiteflow/dev/saleflow/apps/genflow && pnpm dev`

Expected: UI visar StatusPanel, LogViewer och JobQueue bredvid varandra. Om apiKey finns så ansluter pollern till backend.

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add apps/genflow/ui/src/App.tsx
git commit -m "feat(genflow): integrate status, log and job queue components"
```

**CHECKPOINT 7:** Efter denna task har vi en komplett UI med status, loggar och jobbkö som uppdateras i realtid från utility process.

---

## Fas 8: Migration + aktivering (Tasks 28-30)

### Task 28: Backup och radering av gamla kopior

**Files:**
- Create: `scripts/genflow-migration-backup.sh`

- [ ] **Step 1: Skapa backup-script**

Skapa `/Users/douglassiteflow/dev/saleflow/scripts/genflow-migration-backup.sh`:

```bash
#!/bin/bash
# Skapar backup av alla gamla genflow/flowing-ai-kopior innan radering
set -e

BACKUP_DIR="$HOME/backup/genflow-2026-04-09"
mkdir -p "$BACKUP_DIR"

echo "Backup till: $BACKUP_DIR"

for src in \
  "$HOME/dev/flowing-ai" \
  "$HOME/dev/flowing-ai-main" \
  "$HOME/dev/genflow" \
  "$HOME/dev/saleflow/apps/offert_generator/genflow-4.10.2" \
  "$HOME/dev/saleflow/apps/genflow-local-server"
do
  if [ -d "$src" ]; then
    name=$(basename "$src")
    echo "Backupar $src..."
    tar czf "$BACKUP_DIR/$name.tgz" -C "$(dirname "$src")" "$name" 2>/dev/null || true
  else
    echo "Hoppar över (finns inte): $src"
  fi
done

echo ""
echo "Backup klar. Filer i $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"
```

- [ ] **Step 2: Gör scriptet körbart och testa**

```bash
chmod +x /Users/douglassiteflow/dev/saleflow/scripts/genflow-migration-backup.sh
/Users/douglassiteflow/dev/saleflow/scripts/genflow-migration-backup.sh
```

Expected: Skapar tarball-filer för varje befintlig kopia i `~/backup/genflow-2026-04-09/`. Visar storlekarna.

- [ ] **Step 3: Commit backup-scriptet**

```bash
cd /Users/douglassiteflow/dev/saleflow
git add scripts/genflow-migration-backup.sh
git commit -m "chore(genflow): add migration backup script"
```

---

### Task 29: Radera gamla kopior

**Files:**
- Delete: `~/dev/flowing-ai/`
- Delete: `~/dev/flowing-ai-main/`
- Delete: `~/dev/genflow/`
- Delete: `apps/offert_generator/genflow-4.10.2/`
- Delete: `apps/genflow-local-server/`

**VIKTIGT:** Verifiera att Task 28 (backup) kördes framgångsrikt innan denna task. Raderingen är oåterkallelig utan backup.

- [ ] **Step 1: Verifiera att backup finns**

```bash
ls -lh ~/backup/genflow-2026-04-09/
```

Expected: Fem tarball-filer (eller så många kopior som fanns på disk). Om INGEN tarball finns — STOPPA och kör Task 28 först.

- [ ] **Step 2: Radera kopior utanför saleflow-repot (inte spårade av git)**

```bash
rm -rf ~/dev/flowing-ai
rm -rf ~/dev/flowing-ai-main
rm -rf ~/dev/genflow
```

- [ ] **Step 3: Radera kopior INNE i saleflow-repot (med git rm)**

```bash
cd /Users/douglassiteflow/dev/saleflow
git rm -r apps/offert_generator/genflow-4.10.2
git rm -r apps/genflow-local-server
```

- [ ] **Step 4: Verifiera att apps/genflow/ fortfarande finns (ej raderad)**

```bash
ls /Users/douglassiteflow/dev/saleflow/apps/
```

Expected: `genflow` ska finnas kvar. `genflow-local-server` ska vara borta.

- [ ] **Step 5: Commit raderingen**

```bash
cd /Users/douglassiteflow/dev/saleflow
git commit -m "chore(genflow): remove old genflow-local-server and genflow-4.10.2 copies

Delete ~/dev/flowing-ai, ~/dev/flowing-ai-main, ~/dev/genflow manually
after backup to ~/backup/genflow-2026-04-09/. Old copies fully replaced
by apps/genflow/."
```

---

### Task 30: Aktivera use_genflow_jobs i saleflow backend

**Files:**
- Modify: `backend/config/config.exs:48` (eller Fly.io secrets)

- [ ] **Step 1: Läs nuvarande config.exs-rad**

```bash
grep -n use_genflow_jobs /Users/douglassiteflow/dev/saleflow/backend/config/config.exs
```

Expected: `48:config :saleflow, :use_genflow_jobs, false`

- [ ] **Step 2: Uppdatera config.exs**

Öppna `/Users/douglassiteflow/dev/saleflow/backend/config/config.exs`.

Hitta raden:
```elixir
config :saleflow, :use_genflow_jobs, false
```

Ändra till:
```elixir
config :saleflow, :use_genflow_jobs, true
```

- [ ] **Step 3: Starta Genflow-appen på Macen**

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow
pnpm build
./node_modules/.bin/electron dist-electron/main.js
```

Verifiera att appen är igång och statusen är "Ansluten".

- [ ] **Step 4: Testa end-to-end från Saleflow-dashboarden**

1. Öppna saleflow-dashboarden i browsern
2. Gå till en deal i `booking_wizard`-stage
3. Slutför demo-wizarden
4. Observera Genflow-appens logg-panel — du ska se:
   ```
   Nytt jobb plockat: <slug>
   Scrape startat: ...
   Strategisk analys startad...
   Layout-pass startat...
   ...
   Deploy klar: https://...vercel.app
   ```
5. Kontrollera att deal:ens `website_url` uppdateras till Vercel-URL:en

- [ ] **Step 5: Om lokal test fungerar — deploya backend-ändringen till Fly**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend
git add config/config.exs
git commit -m "chore(backend): enable use_genflow_jobs by default

Aktiverar Flowing AI-flödet som default. run_locally() finns kvar som
fallback via env-var USE_GENFLOW_JOBS=false om vi behöver snabb rollback."
fly deploy
```

- [ ] **Step 6: Verifiera i produktion**

Logga in på saleflow prod-dashboarden, skapa en test-demo och verifiera att den går via Genflow-appen. Håll ett öga på pipeline-loggen på Macen under tiden.

**CHECKPOINT 8 (final):** Efter denna task är migration komplett. Saleflow-backend använder det nya Flowing AI-flödet som default, gamla kopior är raderade, och den unified Genflow-appen hanterar alla demo-genereringar.

### Rollback-instruktioner (om något går fel)

Om nya flödet visar problem efter aktivering:

```bash
# Temporärt rollback i prod utan kod-ändring
fly secrets set USE_GENFLOW_JOBS=false -a saleflow
```

Detta får backend att gå tillbaka till `run_locally()` omedelbart. `run_locally()` är orörd i denna implementation så det fungerar som innan.

För att återställa gamla kopior om behövs:

```bash
cd ~/dev
tar xzf ~/backup/genflow-2026-04-09/flowing-ai.tgz
tar xzf ~/backup/genflow-2026-04-09/genflow.tgz
# etc
```

---

## Slutsummering

**Totalt antal tasks:** 30
**Totalt antal commits:** ~32 (en per task + eventuella fixar)
**Förväntad wall-clock-tid:** Beror på erfarenhet. Fas 1-4 (foundation + background service) är den snåriga delen. Fas 5-7 (pipeline + UI) är mestadels kopiera-koden-från-specen. Fas 8 (migration) är snabb men kräver försiktighet.

**Efter komplett implementation:**
- En unified Electron-app i `apps/genflow/`
- Inga gamla genflow/flowing-ai-kopior på disk
- Saleflow backend använder det nya flödet som default
- Pipeline med multi-page, stock-bilder bara, bento-galleri, parallell generering och defensiv Claude-hantering
- Auto-start vid Mac-login, menybar-hybrid, graceful shutdown
- Rollback möjlig via env-var

**Viktiga filer efter implementation:**
- `docs/superpowers/specs/2026-04-09-genflow-unified-redesign.md` — specen
- `docs/superpowers/plans/2026-04-09-genflow-unified-redesign.md` — denna plan
- `apps/genflow/` — hela appen
- `~/.genflow/config.json` — användarkonfig (apiKey etc)
- `~/backup/genflow-2026-04-09/` — backup av gamla kopior (behåll i 2 veckor)

**Framtida cleanup (ej i denna plan):**
När nya flödet varit stabilt i 2 veckor kan `run_locally()` och `backend/priv/demo_generation/brief.md` raderas från saleflow backend. Detta görs i en separat cleanup-spec.
