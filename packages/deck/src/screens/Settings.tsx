import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Settings } from '../../shared/api'
import { call, isMock } from '../api'
import { Glyph } from '../components/ui'
import { useSettings } from '../state'

interface Row<K extends keyof Settings> {
  key: K
  label: string
  help: string
  options: Array<{ value: Settings[K]; label: string }>
}

const rows: Row<any>[] = [
  { key: 'resolution', label: 'Stream quality', help: '720p uses less bandwidth and matches the Deck screen. 1080p looks sharper on an external display.',
    options: [{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }] },
  { key: 'videoFit', label: 'Picture', help: 'Fit keeps 16:9 with thin bars on the Deck\'s 16:10 screen. Fill stretches to the full screen.',
    options: [{ value: 'contain', label: 'Fit' }, { value: 'fill', label: 'Fill screen' }] },
  { key: 'renderer', label: 'Video renderer', help: 'Standard uses hardware video decoding and works best on the Steam Deck. WebGPU is experimental.',
    options: [{ value: 'video', label: 'Standard' }, { value: 'webgpu', label: 'WebGPU (experimental)' }] },
  { key: 'showStats', label: 'Performance stats', help: 'Show resolution, frame rate and latency in a corner while you play.',
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { key: 'vibration', label: 'Vibration', help: 'Pass rumble from the game to your controller.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  { key: 'autoWake', label: 'Wake console automatically', help: 'Send a wake signal to a sleeping Xbox before connecting.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
]

export function SettingsTab() {
  const { settings, update } = useSettings()
  const [info, setInfo] = useState<{ version: string; steamDeck: boolean } | undefined>()
  const [focusedHelp, setFocusedHelp] = useState<string>(rows[0].help)

  useEffect(() => { call('appInfo').then(setInfo).catch(() => {}) }, [])

  const cycle = (row: Row<any>, delta = 1) => {
    const i = row.options.findIndex(o => o.value === settings[row.key as keyof Settings])
    const n = row.options.length
    const next = row.options[(((i + delta) % n) + n) % n]
    update({ [row.key]: next.value } as Partial<Settings>)
  }

  return (
    <div className="settings">
      <div className="settings-list">
        {rows.map((row, idx) => {
          const current = row.options.find(o => o.value === settings[row.key as keyof Settings]) ?? row.options[0]
          return (
            <CycleButton key={row.key} autofocus={idx === 0} onCycle={d => cycle(row, d)} onFocus={() => setFocusedHelp(row.help)}>
              <span className="setting-label">{row.label}</span>
              <span className="setting-value">‹ {current.label} ›</span>
            </CycleButton>
          )
        })}
        <div className="settings-actions">
          <button className="btn" data-nav onFocus={() => setFocusedHelp('Sign out of your Microsoft account on this device.')} onClick={() => call('signOut')}>Sign out</button>
          <button className="btn btn-ghost" data-nav onFocus={() => setFocusedHelp('Close Greenlight Deck.')} onClick={() => call('quit')}>Quit app</button>
        </div>
      </div>
      <aside className="settings-help">
        <p>{focusedHelp}</p>
        <div className="help-box">
          <h4>While playing</h4>
          <p><Glyph name="L3R3" /> hold both sticks in to open the menu</p>
          <p><Glyph name="View" /> + <Glyph name="Menu" /> press together for the Xbox button</p>
        </div>
        <p className="muted small">Greenlight Deck {info?.version ?? ''}{info?.steamDeck ? ' · Steam Deck' : ''}{isMock ? ' · preview mode' : ''}<br />
          Streaming by the open-source Greenlight project. Not affiliated with Microsoft or Xbox.</p>
      </aside>
    </div>
  )
}

/** A row that cycles its value with A / click (forward) and left / right. */
function CycleButton({ children, autofocus, onCycle, onFocus }: {
  children: ReactNode; autofocus?: boolean; onCycle: (delta: number) => void; onFocus: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const cb = useRef(onCycle)
  cb.current = onCycle
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: Event) => cb.current((e as CustomEvent<number>).detail)
    el.addEventListener('cycle', handler)
    return () => el.removeEventListener('cycle', handler)
  }, [])
  return (
    <button ref={ref} className="setting-row" data-nav data-cycle="" data-autofocus={autofocus || undefined}
      onClick={() => onCycle(1)} onFocus={onFocus}>
      {children}
    </button>
  )
}
