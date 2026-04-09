import { app, BrowserWindow, utilityProcess, UtilityProcess } from 'electron'
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
  startServerProcess()
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
