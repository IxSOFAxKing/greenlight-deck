import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Settings, UpdateStatus } from '../shared/api'
import { defaultSettings } from '../shared/api'
import { call, onUpdateStatus } from './api'

interface SettingsCtx {
  settings: Settings
  loaded: boolean
  update: (patch: Partial<Settings>) => void
}

const Ctx = createContext<SettingsCtx>({ settings: defaultSettings, loaded: false, update: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { call('getSettings').then(setSettings).catch(() => {}).finally(() => setLoaded(true)) }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      call('saveSettings', next).catch(() => {})
      return next
    })
  }, [])

  return <Ctx.Provider value={{ settings, loaded, update }}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)

// --- Toasts ---
type ToastFn = (msg: string) => void
const ToastCtx = createContext<ToastFn>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; msg: string } | undefined>()
  const show = useCallback((msg: string) => setToast({ id: Date.now(), msg }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(undefined), 3200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div key={toast.id} className="toast" role="status">{toast.msg}</div>}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

// --- Updates ---
const UpdateCtx = createContext<UpdateStatus>({ state: 'idle', currentVersion: '' })

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' })
  const toast = useToast()

  useEffect(() => {
    call('getUpdateStatus').then(setStatus).catch(() => {})
    let announced: string | undefined
    return onUpdateStatus((s) => {
      setStatus(s)
      if (s.state === 'available' && s.version && announced !== s.version) {
        announced = s.version
        toast(`Update ${s.version} is available. Open Settings to install it.`)
      }
      if (s.state === 'downloaded') toast('Update ready. Restart from Settings to finish.')
    })
  }, [toast])

  return <UpdateCtx.Provider value={status}>{children}</UpdateCtx.Provider>
}

export const useUpdate = () => useContext(UpdateCtx)
