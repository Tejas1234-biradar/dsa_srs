import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel } from '../shared/types'

// Expose a typed, safe bridge to the renderer
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: IpcChannel, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
})
