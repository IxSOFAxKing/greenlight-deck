import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Settings } from '../../shared/api'
import { call, isMock } from '../api'
import { Glyph } from '../components/ui'
import { LogViewer } from '../components/LogViewer'
import { useSettings, useUpdate } from '../state'

interface Row<K extends keyof Settings> {
  key: K
  label: string
  help: string
  options: Array<{ value: Settings[K]; label: string }>
}

const rows: Row<any>[] = [
  { key: 'resolution', label: 'Stream quality', help: '720p uses less bandwidth and matches the Deck screen. 1080p looks sharper on an external display.',
    options: [{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }] },
  { key: 'maxBitrateMbps', label: 'Max bitrate', help: 'Limit how much data the stream uses. Lower it if the picture stutters on busy Wi-Fi; Auto lets the Xbox pick.',
    options: [{ value: 0, label: 'Auto' }, { value: 5, label: '5 Mbps' }, { value: 10, label: '10 Mbps' }, { value: 15, label: '15 Mbps' }, { value: 20, label: '20 Mbps' }, { value: 30, label: '30 Mbps' }] },
  { key: 'codecProfile', label: 'Video profile', help: 'High looks sharpest. Low latency is lighter to decode and can feel snappier. Auto tries High first.',
    options: [{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High quality' }, { value: 'medium', label: 'Balanced' }, { value: 'low', label: 'Low latency' }] },
  { key: 'videoFit', label: 'Picture', help: 'Fit keeps 16:9 with thin bars on the Deck\'s 16:10 screen. Fill stretches to the full screen.',
    options: [{ value: 'contain', label: 'Fit' }, { value: 'fill', label: 'Fill screen' }] },
  { key: 'renderer', label: 'Video renderer', help: 'Standard uses hardware video decoding and works best on the Steam Deck. WebGPU is experimental.',
    options: [{ value: 'video', label: 'Standard' }, { value: 'webgpu', label: 'WebGPU (experimental)' }] },
  { key: 'showStats', label: 'Performance stats', help: 'Show resolution, frame rate and latency in a corner while you play.',
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { key: 'vibration', label: 'Vibration', help: 'Pass rumble from the game to your controller.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  { key: 'autoReconnect', label: 'Reconnect automatically', help: 'If Wi-Fi drops mid-game, rejoin the console up to 3 times. Your game keeps running on the Xbox meanwhile.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  { key: 'autoWake', label: 'Wake console automatically', help: 'Send a wake signal to a sleeping Xbox before connecting.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  { key: 'autoUpdateCheck', label: 'Check for updates on launch', help: 'Look for a new version on GitHub each time the app starts. Nothing downloads until you choose to.',
    options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
]

export function SettingsTab() {
  const { settings, update } = useSettings()
  const [info, setInfo] = useState<{ version: string; steamDeck: boolean } | undefined>()
  const [focusedHelp, setFocusedHelp] = useState<string>(rows[0].help)
  const [showLogs, setShowLogs] = useState(false)

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
        <UpdateRow onFocusHelp={setFocusedHelp} />
        <div className="settings-actions">
          <button className="btn" data-nav onFocus={() => setFocusedHelp('See what the app has been doing. Copy or save it when something goes wrong so it can be fixed.')} onClick={() => setShowLogs(true)}>Debug log</button>
          <button className="btn" data-nav onFocus={() => setFocusedHelp('Sign out of your Microsoft account on this device.')} onClick={() => call('signOut')}>Sign out</button>
          <button className="btn btn-ghost" data-nav onFocus={() => setFocusedHelp('Close Greenlight Deck.')} onClick={() => call('quit')}>Quit app</button>
        </div>
      </div>
      {showLogs && <LogViewer onClose={() => setShowLogs(false)} />}
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

/** One button that walks through check -> download -> restart. */
function UpdateRow({ onFocusHelp }: { onFocusHelp: (help: string) => void }) {
  const u = useUpdate()
  const [busy, setBusy] = useState(false)

  let label = 'Check for updates'
  let value = `v${u.currentVersion}`
  let action: (() => Promise<unknown>) | undefined = () => call('checkForUpdates')
  let help = 'Look for a newer version of Greenlight Deck on GitHub.'

  switch (u.state) {
    case 'checking': value = 'Checking…'; action = undefined; break
    case 'not-available': value = `v${u.currentVersion} · up to date`; break
    case 'available':
      label = `Download update ${u.version}`; value = 'New'
      action = () => call('downloadUpdate')
      help = u.notes ? `What's new in ${u.version}: ${u.notes}` : `Version ${u.version} is available.`
      break
    case 'downloading': label = 'Downloading update'; value = `${u.percent ?? 0}%`; action = undefined; break
    case 'downloaded':
      label = `Restart to update to ${u.version}`; value = 'Ready'
      action = () => call('installUpdate')
      help = 'The app will close, swap in the new version and reopen. This takes a few seconds.'
      break
    case 'error': value = 'Try again'; help = u.error ?? 'The update check failed.'; break
    case 'unsupported':
      value = `v${u.currentVersion}`; action = undefined
      help = 'In-app updates work when the app runs from the installed AppImage (via install.sh).'
      break
  }

  useEffect(() => {
    if (document.activeElement?.classList.contains('update-row')) onFocusHelp(help)
  }, [help, onFocusHelp])

  const run = async () => {
    if (!action || busy) return
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }

  return (
    <button className={`setting-row update-row ${u.state === 'available' || u.state === 'downloaded' ? 'highlight' : ''}`}
      data-nav aria-busy={!action || busy} onClick={run} onFocus={() => onFocusHelp(help)}>
      <span className="setting-label">{label}</span>
      <span className="setting-value">{value}</span>
    </button>
  )
}
