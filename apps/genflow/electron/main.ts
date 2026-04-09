import { app, BrowserWindow, utilityProcess, UtilityProcess, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTray, destroyTray, TrayStatus } from './tray'

declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.APP_ROOT = path.join(__dirname, '..')
process.env.VITE_PUBLIC = app.isPackaged
  ? path.join(process.env.APP_ROOT, 'dist')
  : path.join(process.env.APP_ROOT, 'public')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

const startedHidden = process.argv.includes('--hidden')

// Single instance lock — only ONE Genflow can run on this machine
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[main] Another Genflow instance is already running — exiting')
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null

let serverProc: UtilityProcess | null = null

let currentStatus: TrayStatus = 'disconnected'
let recentJobs: { slug: string; status: 'ok' | 'failed' | 'running' }[] = []

let lastHeartbeat = Date.now()
const HEARTBEAT_TIMEOUT_MS = 90_000  // 3 heartbeats (30s vardera) måste missas

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
      recentJobs = [{ slug: job.slug, status: 'running' as const }, ...recentJobs].slice(0, 5)
    }

    if (typedMsg.type === 'job-complete') {
      currentStatus = 'connected'
      const job = (typedMsg.payload as { job: { slug: string } }).job
      recentJobs = recentJobs.map((j) =>
        j.slug === job.slug ? { slug: j.slug, status: 'ok' as const } : j,
      )
    }

    if (typedMsg.type === 'job-failed') {
      currentStatus = 'connected'
      const job = (typedMsg.payload as { job: { slug: string } }).job
      recentJobs = recentJobs.map((j) =>
        j.slug === job.slug ? { slug: j.slug, status: 'failed' as const } : j,
      )
    }

    // Forward till renderer
    mainWindow?.webContents.send('server-event', typedMsg)
  })

  serverProc.on('exit', (code: number) => {
    console.log('[main] server exited with code', code)
    serverProc = null
  })
}

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

// IPC från renderer → forward till utility process
ipcMain.on('trigger-test', (_event, payload: { sourceUrl?: string }) => {
  console.log('[main] trigger-test mottaget, vidarebefordrar till server')
  serverProc?.postMessage({ type: 'trigger-test', sourceUrl: payload?.sourceUrl })
})

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 1000,
    minHeight: 640,
    title: 'Genflow',
    show: !startedHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

// När en andra instans försöker starta — visa befintliga fönster istället
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    if (process.platform === 'darwin') app.dock?.show()
  } else {
    createMainWindow()
  }
})

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
  startHeartbeatWatchdog()

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

app.on('window-all-closed', () => {
  // Förhindra att appen stängs när alla fönster är stängda
  // Tray-ikonen håller appen igång
  // Appen fortsätter att köra i bakgrunden med tray-ikon
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
})

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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
