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
