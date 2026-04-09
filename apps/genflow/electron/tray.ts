import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
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
    { label: 'Avsluta', role: 'quit' },
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
