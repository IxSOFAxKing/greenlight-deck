import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Settings } from '../shared/api'
import { defaultSettings } from '../shared/api'
import { call } from './api'

interface SettingsCtx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const Ctx = createContext<SettingsCtx>({ settings: defaultSettings, update: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => { call('getSettings').then(setSettings).catch(() => {}) }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      call('saveSettings', next).catch(() => {})
      return next
    })
  }, [])

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>
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
