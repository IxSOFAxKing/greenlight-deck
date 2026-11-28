import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthState, CloudTitle, PowerAction, XboxConsole } from '../../shared/api'
import type { StreamTarget } from '../App'
import { call } from '../api'
import { ConsoleArt, Glyph, HintBar, Spinner, consoleLabel, powerLabel } from '../components/ui'
import type { Hint } from '../components/ui'
import { useInputLayer } from '../input/layers'
import { focusFirst } from '../input/spatial'
import { sound } from '../input/sound'
import { useToast, useUpdate } from '../state'
import { SettingsTab } from './Settings'
import { Avatar } from './Profiles'
import { CloudTab, type CloudControls } from './Cloud'
import { AchievementsTab, FriendsTab } from './Social'

type Tab = 'consoles' | 'cloud' | 'friends' | 'achievements' | 'settings'

const TAB_LABELS: Record<Tab, string> = { consoles: 'My Xbox', cloud: 'Cloud', friends: 'Friends', achievements: 'Achievements', settings: 'Settings' }

interface Props {
  auth: AuthState
  onStream: (t: StreamTarget) => void
  hidden?: boolean
  onProfiles: () => void
}

export function HomeScreen({ auth, onStream, hidden, onProfiles }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tabs: Tab[] = auth.hasCloud ? ['consoles', 'cloud', 'friends', 'achievements', 'settings'] : ['consoles', 'friends', 'achievements', 'settings']
  const [tab, setTab] = useState<Tab>('consoles')
  const toast = useToast()
  const cloudControls = useRef<CloudControls | undefined>(undefined)
  const update = useUpdate()
  const updateBadge = update.state === 'available' || update.state === 'downloaded'

  const consoles = useLoader(() => call('listConsoles'))
  const cloud = useCloudLibrary(auth.hasCloud, tab === 'cloud')
  const friends = useLoader(() => call('listFriends'), tab === 'friends')
  const progress = useLoader(() => call('listGameProgress'), tab === 'achievements')
  const [powerFor, setPowerFor] = useState<XboxConsole | undefined>()

  // Friends' status changes often: refresh when you come back to the tab.
  const lastTab = useRef(tab)
  useEffect(() => {
    if (tab === 'friends' && lastTab.current !== 'friends' && friends.data) friends.reload()
    lastTab.current = tab
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (delta: number) => {
    const i = tabs.indexOf(tab)
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    setTab(next)
    sound.move()
  }

  // Switching tabs moves focus into the new tab's content.
  useEffect(() => {
    const t = requestAnimationFrame(() => { if (contentRef.current) focusFirst(contentRef.current) })
    return () => cancelAnimationFrame(t)
  }, [tab])

  // When a list finishes loading (or refreshes in the background), only place
  // focus if nothing is focused yet; never yank it away from where the user is.
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      const active = document.activeElement
      if (contentRef.current && (!active || active === document.body || !ref.current?.contains(active))) {
        if (!document.querySelector('.modal')) focusFirst(contentRef.current)
      }
    })
    return () => cancelAnimationFrame(t)
  }, [consoles.data, cloud.data, friends.data, progress.data])

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

  const power = async (c: XboxConsole, action: PowerAction) => {
    try {
      await call('powerConsole', c.id, action)
      toast(action === 'off' ? `Turning off ${c.name}` : `Restarting ${c.name}`)
      setTimeout(consoles.reload, action === 'off' ? 8000 : 45000)
    } catch (err) {
      toast(`Couldn't ${action === 'off' ? 'turn off' : 'restart'} ${c.name}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const streamConsole = (c: XboxConsole) => onStream({ kind: 'home', id: c.id, name: c.name, wake: c.powerState !== 'On' })

  useInputLayer(ref, (action) => {
    if (action === 'view') { onProfiles(); return true }
    if (action === 'lb') { switchTab(-1); return true }
    if (action === 'rb') { switchTab(1); return true }
    if (action === 'y') {
      if (tab === 'consoles') consoles.reload()
      if (tab === 'cloud') cloud.refresh()
      if (tab === 'friends') friends.reload()
      if (tab === 'achievements') progress.reload()
      return true
    }
    if (action === 'x' && tab === 'cloud') { cloudControls.current?.openSearch(); return true }
    if (action === 'menu' && tab === 'cloud') { cloudControls.current?.toggleFavorite(); return true }
    if (action === 'menu' && tab === 'consoles') {
      const c = focusedConsole()
      if (c) setPowerFor(c)
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
  }, !hidden && !powerFor)

  const hints: Hint[] = tab === 'consoles'
    ? [{ glyph: 'A', label: 'Stream' }, { glyph: 'X', label: 'Wake' }, { glyph: 'Menu', label: 'Power' }, { glyph: 'Y', label: 'Refresh', onClick: consoles.reload }]
    : tab === 'cloud'
      ? [{ glyph: 'A', label: 'Details' }, { glyph: 'Menu', label: 'Favorite', onClick: () => cloudControls.current?.toggleFavorite() }, { glyph: 'X', label: 'Search', onClick: () => cloudControls.current?.openSearch() }, { glyph: 'Y', label: 'Refresh', onClick: cloud.refresh }]
      : tab === 'friends'
        ? [{ glyph: 'Y', label: 'Refresh', onClick: friends.reload }]
        : tab === 'achievements'
          ? [{ glyph: 'A', label: 'Achievements' }, { glyph: 'Y', label: 'Refresh', onClick: progress.reload }]
          : [{ glyph: 'A', label: 'Change' }]

  return (
    <div className="screen home" ref={ref} style={hidden ? { visibility: 'hidden' } : undefined}>
      <header className="topbar">
        <div className="brand-mark">Greenlight<span>Deck</span></div>
        <nav className="tabs">
          <span className="tab-glyph" onClick={() => switchTab(-1)}><Glyph name="LB" /></span>
          {tabs.map(t => (
            <button key={t} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)} tabIndex={-1}>
              {TAB_LABELS[t]}
              {t === 'settings' && updateBadge && <span className="badge-dot" aria-label="Update available" />}
            </button>
          ))}
          <span className="tab-glyph" onClick={() => switchTab(1)}><Glyph name="RB" /></span>
        </nav>
        <button className="profile" onClick={onProfiles} tabIndex={-1} aria-label="Switch profile">
          <Avatar account={{ gamertag: auth.profile?.gamertag ?? '?', avatarUrl: auth.profile?.avatarUrl }} size={44} />
          <div>
            <div className="gamertag">{auth.profile?.gamertag ?? 'Signed in'}</div>
            <div className="muted small">{(auth.accounts?.length ?? 0) > 1 ? <><Glyph name="View" /> Switch</> : auth.profile?.gamerscore ? `${auth.profile.gamerscore} G` : ''}</div>
          </div>
        </button>
      </header>

      <main className="content" ref={contentRef}>
        {tab === 'consoles' && <ConsolesTab state={consoles} onStream={streamConsole} onWake={wake} />}
        {tab === 'cloud' && <CloudTab state={cloud} controls={cloudControls} visible={!hidden} onPlay={t => onStream({ kind: 'cloud', id: t.titleId, name: t.name })} />}
        {tab === 'friends' && <FriendsTab state={friends} />}
        {tab === 'achievements' && <AchievementsTab state={progress} />}
        {tab === 'settings' && <SettingsTab onProfiles={onProfiles} gamertag={auth.profile?.gamertag} />}
      </main>

      {powerFor && <PowerMenu console={powerFor} onClose={() => setPowerFor(undefined)}
        onWake={() => { const c = powerFor; setPowerFor(undefined); wake(c) }}
        onStream={() => { const c = powerFor; setPowerFor(undefined); streamConsole(c) }}
        onPower={(a) => { const c = powerFor; setPowerFor(undefined); power(c, a) }} />}

      <HintBar hints={hints} left={<span className="muted small"><Glyph name="View" /> Profiles · Hold <Glyph name="L3R3" /> in-game for the menu</span>} />
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
              <span><Glyph name="Menu" /> Power</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Console power options: stream, wake, restart, turn off (the last two ask first). */
function PowerMenu({ console: c, onClose, onWake, onStream, onPower }: {
  console: XboxConsole
  onClose: () => void
  onWake: () => void
  onStream: () => void
  onPower: (a: PowerAction) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [confirm, setConfirm] = useState<PowerAction | undefined>()
  useInputLayer(ref, (a) => {
    if (a === 'back') { if (confirm) setConfirm(undefined); else onClose(); return true }
    if (a === 'menu') { onClose(); return true }
    if (a === 'lb' || a === 'rb' || a === 'view' || a === 'x' || a === 'y') return true
  })
  const on = c.powerState === 'On'
  return (
    <div className="modal confirm" ref={ref} role="dialog" aria-label={`${c.name} power`}>
      <div className="confirm-box power-box" key={confirm ?? 'menu'}>
        <div className="console-art-wrap small"><ConsoleArt type={c.consoleType} /></div>
        {confirm ? (
          <>
            <h2>{confirm === 'off' ? `Turn off ${c.name}?` : `Restart ${c.name}?`}</h2>
            <p className="muted">{confirm === 'off'
              ? 'Anyone playing on it will be signed out. If it is set to Sleep, you can wake it from here later.'
              : 'Anyone playing on it will lose unsaved progress. It takes about a minute to come back.'}</p>
            <div className="row">
              <button className="btn" data-nav data-autofocus onClick={() => setConfirm(undefined)}>Cancel</button>
              <button className="btn btn-danger" data-nav onClick={() => onPower(confirm)}>{confirm === 'off' ? 'Turn off' : 'Restart'}</button>
            </div>
          </>
        ) : (
          <>
            <h2>{c.name}</h2>
            <p className="muted">{powerLabel(c.powerState).text}</p>
            <div className="power-actions">
              <button className="overlay-item" data-nav data-autofocus onClick={onStream}>{on ? 'Stream' : 'Wake & stream'}</button>
              {!on && <button className="overlay-item" data-nav onClick={onWake}>Wake up</button>}
              {on && <button className="overlay-item" data-nav onClick={() => setConfirm('restart')}>Restart</button>}
              {on && <button className="overlay-item danger" data-nav onClick={() => setConfirm('off')}>Turn off</button>}
              <button className="overlay-item" data-nav onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
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

// ---------- cloud library: show the cached list instantly, refresh quietly ----------

const CLOUD_STALE_MS = 60 * 60 * 1000

interface CloudState extends Loader<CloudTitle[]> { refresh: () => void; updating: boolean; cachedAt?: number }

function useCloudLibrary(hasCloud: boolean, enabled: boolean): CloudState {
  const [data, setData] = useState<CloudTitle[] | undefined>()
  const [cachedAt, setCachedAt] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const started = useRef(false)

  const refresh = useCallback(() => {
    if (!hasCloud) return
    setUpdating(true)
    call('listCloudTitles', true)
      .then(lib => { setData(lib.titles); setCachedAt(lib.cachedAt); setError(undefined) })
      .catch(e => { setError(prev => data ? prev : (e instanceof Error ? e.message : String(e))) })
      .finally(() => setUpdating(false))
  }, [hasCloud, data])

  const load = useCallback(() => {
    if (!hasCloud) { setData([]); return }
    setLoading(true)
    setError(undefined)
    call('listCloudTitles')
      .then(lib => {
        setData(lib.titles)
        setCachedAt(lib.cachedAt)
        // Cached copy is old: show it now, fetch a fresh one in the background.
        if (Date.now() - lib.cachedAt > CLOUD_STALE_MS) {
          setUpdating(true)
          call('listCloudTitles', true)
            .then(fresh => { setData(fresh.titles); setCachedAt(fresh.cachedAt) })
            .catch(() => { /* keep showing the cached list */ })
            .finally(() => setUpdating(false))
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [hasCloud])

  useEffect(() => {
    if (enabled && !started.current) { started.current = true; load() }
  }, [enabled, load])

  return { data, loading, error, reload: load, refresh, updating, cachedAt }
}
