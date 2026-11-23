import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AuthState, DeckBridge, UpdateStatus } from '../shared/api'

const bridge: DeckBridge = {
  call: (async (method: string, ...args: unknown[]) => {
    const res = await ipcRenderer.invoke('deck-api', method, args)
    if (!res.ok) throw new Error(res.error)
    return res.value
  }) as DeckBridge['call'],

  onAuthChanged(callback) {
    const listener = (_e: IpcRendererEvent, state: AuthState) => callback(state)
    ipcRenderer.on('auth-changed', listener)
    return () => { ipcRenderer.removeListener('auth-changed', listener) }
  },

  onUpdateStatus(callback) {
    const listener = (_e: IpcRendererEvent, status: UpdateStatus) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => { ipcRenderer.removeListener('update-status', listener) }
  },
}

contextBridge.exposeInMainWorld('deck', bridge)
