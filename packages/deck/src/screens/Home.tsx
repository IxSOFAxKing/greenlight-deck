import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthState, CloudTitle, XboxConsole } from '../../shared/api'
import type { StreamTarget } from '../App'
import { call } from '../api'
import { ConsoleArt, Glyph, HintBar, Spinner, consoleLabel, powerLabel } from '../components/ui'
import type { Hint } from '../components/ui'
import { useInputLayer } from '../input/layers'
import { focusFirst } from '../input/spatial'
import { sound } from '../input/sound'
import { useToast } from '../state'
import { SettingsTab } from './Settings'

type Tab = 'consoles' | 'cloud' | 'settings'

interface Props {
  auth: AuthState
  onStream: (t: StreamTarget) => void
  hidden?: boolean
}

export function HomeScreen({ auth, onStream, hidden }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tabs: Tab[] = auth.hasCloud ? ['consoles', 'cloud', 'settings'] : ['consoles', 'settings']
  const [tab, setTab] = useState<Tab>('consoles')
  const toast = useToast()

  const consoles = useLoader(() => call('listConsoles'))
  const cloud = useLoader(() => auth.hasCloud ? call('listCloudTitles') : Promise.resolve([] as CloudTitle[]), tab === 'cloud')

  const switchTab = (delta: number) => {
    const i = tabs.indexOf(tab)
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    setTab(next)
    sound.move()
  }

  // Move focus into the new tab's content.
  useEffect(() => {
    const t = requestAnimationFrame(() => { if (contentRef.current) focusFirst(contentRef.current) })
    return () => cancelAnimationFrame(t)
  }, [tab, consoles.data, cloud.data])

  const focusedConsole = (): XboxConsole | undefined => {
    const id = (document.activeElement as HTMLElement | null)?.dataset.consoleId
    return consoles.data?.find(c => c.id === id)
  }

  const wake = async (c: XboxConsole) => {
    try {
      await call('wakeConsole', c.id)
      toast(`Sent wake signal to ${c.name}`)
      setTimeout(consoles.reload, 6000)
    } catch (err) {
      toast(`Couldn't wake ${c.name}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const streamConsole = (c: XboxConsole) => onStream({ kind: 'home', id: c.id, name: c.name, wake: c.powerState !== 'On' })

  useInputLayer(ref, (action) => {
    if (action === 'lb') { switchTab(-1); return true }
    if (action === 'rb') { switchTab(1); return true }
    if (action === 'y') {
      if (tab === 'consoles') consoles.reload()
      if (tab === 'cloud') cloud.reload()
      return true
    }
    if (action === 'x' && tab === 'consoles') {
      const c = focusedConsole()
      if (c) wake(c)
      return true
    }
    // Left/right on an option row changes its value instead of moving focus.
    if (action === 'left' || action === 'right') {
      const el = document.activeElement as HTMLElement | null
      if (el?.dataset.cycle !== undefined) {
        el.dispatchEvent(new CustomEvent('cycle', { detail: action === 'left' ? -1 : 1 }))
        sound.move()
        return true
      }
    }
    if (action === 'back') return true
  }, !hidden)

  const hints: Hint[] = tab === 'consoles'
    ? [{ glyph: 'A', label: 'Stream' }, { glyph: 'X', label: 'Wake' }, { glyph: 'Y', label: 'Refresh', onClick: consoles.reload }]
    : tab === 'cloud'
      ? [{ glyph: 'A', label: 'Play' }, { glyph: 'Y', label: 'Refresh', onClick: cloud.reload }]
      : [{ glyph: 'A', label: 'Change' }]

  return (
    <div className="screen home" ref={ref} style={hidden ? { visibility: 'hidden' } : undefined}>
      <header className="topbar">
        <div className="brand-mark">Greenlight<span>Deck</span></div>
        <nav className="tabs">
          <span className="tab-glyph" onClick={() => switchTab(-1)}><Glyph name="LB" /></span>
          {tabs.map(t => (
            <button key={t} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)} tabIndex={-1}>
              {t === 'consoles' ? 'My Xbox' : t === 'cloud' ? 'Cloud' : 'Settings'}
            </button>
          ))}
          <span className="tab-glyph" onClick={() => switchTab(1)}><Glyph name="RB" /></span>
        </nav>
        <div className="profile">
          {auth.profile?.avatarUrl ? <img src={auth.profile.avatarUrl} alt="" /> : <div className="avatar-fallback">{auth.profile?.gamertag?.[0] ?? '?'}</div>}
          <div>
            <div className="gamertag">{auth.profile?.gamertag ?? 'Signed in'}</div>
            {auth.profile?.gamerscore && <div className="muted small">{auth.profile.gamerscore} G</div>}
          </div>
        </div>
      </header>

      <main className="content" ref={contentRef}>
        {tab === 'consoles' && <ConsolesTab state={consoles} onStream={streamConsole} onWake={wake} />}
        {tab === 'cloud' && <CloudTab state={cloud} onPlay={t => onStream({ kind: 'cloud', id: t.titleId, name: t.name })} />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      <HintBar hints={hints} left={<span className="muted small">Hold <Glyph name="L3R3" /> in-game for the menu</span>} />
    </div>
  )
}

// ---------- Consoles ----------

function ConsolesTab({ state, onStream, onWake }: {
  state: Loader<XboxConsole[]>
  onStream: (c: XboxConsole) => void
  onWake: (c: XboxConsole) => void
}) {
  if (state.loading && !state.data) return <div className="center fill"><Spinner /></div>
  if (state.error) return <ErrorPanel message={state.error} onRetry={state.reload} />

  const list = state.data ?? []
  if (list.length === 0) {
    return (
      <div className="empty">
        <h2>No consoles found</h2>
        <p>On your Xbox, go to <strong>Settings → Devices &amp; connections → Remote features</strong> and turn on <strong>Enable remote features</strong>. Set power mode to <strong>Sleep</strong> so it can wake up.</p>
        <button className="btn btn-primary" data-nav data-autofocus onClick={state.reload}>Check again</button>
      </div>
    )
  }

  return (
    <div className="console-row" data-nav-group>
      {list.map((c, i) => {
        const p = powerLabel(c.powerState)
        return (
          <button key={c.id} className="console-card" data-nav data-autofocus={i === 0 || undefined} data-console-id={c.id} onClick={() => onStream(c)}>
            <div className="console-art-wrap"><ConsoleArt type={c.consoleType} /></div>
            <div className="console-info">
              <div className="console-name">{c.name}</div>
              <div className="muted">{consoleLabel(c.consoleType)}</div>
              <div className={`pill ${p.cls}`}>{p.text}</div>
              {c.consoleStreamingEnabled === false && <div className="warn small">Remote play is off on this console</div>}
            </div>
            <div className="console-actions">
              <span><Glyph name="A" /> {c.powerState === 'On' ? 'Stream' : 'Wake & stream'}</span>
              {c.powerState !== 'On' && <span onClick={e => { e.stopPropagation(); onWake(c) }}><Glyph name="X" /> Wake</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Cloud ----------

function CloudTab({ state, onPlay }: { state: Loader<CloudTitle[]>; onPlay: (t: CloudTitle) => void }) {
  if (state.loading && !state.data) return <div className="center fill"><Spinner /></div>
  if (state.error) return <ErrorPanel message={state.error} onRetry={state.reload} />
  const list = state.data ?? []
  if (list.length === 0) {
    return <div className="empty"><h2>No cloud games</h2><p>Cloud gaming needs a Game Pass plan that includes it.</p></div>
  }
  const recent = list.filter(t => t.recent)
  const rest = list.filter(t => !t.recent)
  return (
    <div className="cloud">
      {recent.length > 0 && <>
        <h3 className="section-title">Jump back in</h3>
        <div className="tile-row" data-nav-group>{recent.map((t, i) => <TitleTile key={t.titleId} t={t} first={i === 0} onPlay={onPlay} />)}</div>
      </>}
      <h3 className="section-title">All cloud games</h3>
      <div className="tile-grid">{rest.map((t, i) => <TitleTile key={t.titleId} t={t} first={recent.length === 0 && i === 0} onPlay={onPlay} />)}</div>
    </div>
  )
}

function TitleTile({ t, first, onPlay }: { t: CloudTitle; first?: boolean; onPlay: (t: CloudTitle) => void }) {
  return (
    <button className="tile" data-nav data-autofocus={first || undefined} onClick={() => onPlay(t)} title={t.name}>
      {t.imageUrl ? <img src={t.imageUrl} alt="" loading="lazy" /> : <div className="tile-fallback">{t.name.slice(0, 2)}</div>}
      <span className="tile-name">{t.name}</span>
    </button>
  )
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty">
      <h2>Something went wrong</h2>
      <p className="error-text">{message}</p>
      <button className="btn btn-primary" data-nav data-autofocus onClick={onRetry}>Try again</button>
    </div>
  )
}

// ---------- data loader ----------

interface Loader<T> { data?: T; loading: boolean; error?: string; reload: () => void }

function useLoader<T>(fn: () => Promise<T>, enabled = true): Loader<T> {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [loadedOnce, setLoadedOnce] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(() => {
    setLoading(true)
    setError(undefined)
    fnRef.current()
      .then(d => { setData(d); setLoadedOnce(true) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (enabled && !loadedOnce) reload() }, [enabled, loadedOnce, reload])

  return { data, loading, error, reload }
}
