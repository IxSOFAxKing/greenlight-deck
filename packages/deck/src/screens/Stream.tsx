import { useEffect, useRef, useState } from 'react'
import type { StreamTarget } from '../App'
import { call, log } from '../api'
import { HintBar, Spinner } from '../components/ui'
import { controller } from '../input/controller'
import { useInputLayer } from '../input/layers'
import { sound } from '../input/sound'
import { StreamSession, type StreamStats, type StreamUpdate } from '../stream/session'
import { useSettings } from '../state'

const PLAYER_ID = 'gl-player'
const MAX_RECONNECTS = 3
const RECONNECT_DELAYS = [1500, 4000, 9000]

interface Reconnect { attempt: number; reason: string; waitingForNetwork?: boolean }

export function StreamScreen({ target, onExit }: { target: StreamTarget; onExit: () => void }) {
  const { settings, update } = useSettings()
  const rootRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<StreamSession | undefined>(undefined)
  const [status, setStatus] = useState<StreamUpdate>({ phase: 'requesting', message: 'Starting…' })
  const [overlay, setOverlay] = useState(false)
  const [stats, setStats] = useState<StreamStats | undefined>()
  const [attempt, setAttempt] = useState(0)
  const [reconnect, setReconnect] = useState<Reconnect | undefined>()
  const reconnectRef = useRef<Reconnect | undefined>(undefined)
  reconnectRef.current = reconnect

  const playing = status.phase === 'playing'

  const onUpdate = (u: StreamUpdate) => {
    if (u.phase === 'playing' && reconnectRef.current) {
      log('info', 'stream', `Reconnected after ${reconnectRef.current.attempt} attempt(s)`)
      setReconnect(undefined)
    }
    // A stream that was playing (or a reconnect attempt) dropped: try again on our own.
    const tries = reconnectRef.current?.attempt ?? 0
    if (u.phase === 'error' && (u.recoverable || reconnectRef.current) && settings.autoReconnect && tries < MAX_RECONNECTS) {
      setOverlay(false)
      scheduleReconnect(tries + 1, u.message ?? 'Connection lost')
      return
    }
    if (u.phase === 'error' && reconnectRef.current) setReconnect(undefined)
    setStatus(u)
  }

  const scheduleReconnect = (n: number, reason: string) => {
    const next: Reconnect = { attempt: n, reason, waitingForNetwork: !navigator.onLine }
    setReconnect(next)
    setStatus({ phase: 'requesting', message: reason })
    const go = () => setAttempt(a => a + 1)
    const delay = RECONNECT_DELAYS[n - 1] ?? 9000
    log('warn', 'stream', `Reconnect ${n}/${MAX_RECONNECTS} in ${delay}ms: ${reason}`)
    if (!navigator.onLine) {
      // Wait (up to a minute) for the network to come back first.
      const onOnline = () => { window.removeEventListener('online', onOnline); clearTimeout(giveUp); setReconnect({ ...next, waitingForNetwork: false }); setTimeout(go, 1000) }
      const giveUp = setTimeout(() => { window.removeEventListener('online', onOnline); go() }, 60_000)
      window.addEventListener('online', onOnline)
    } else {
      setTimeout(go, delay)
    }
  }

  // Start (or restart) the session.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (target.kind === 'home' && target.wake && settings.autoWake && !reconnectRef.current) {
        setStatus({ phase: 'requesting', message: `Waking ${target.name}…` })
        try { await call('wakeConsole', target.id) } catch { /* the stream request can still wake it */ }
        await new Promise(r => setTimeout(r, 2500))
      }
      if (cancelled) return
      const session = new StreamSession({
        kind: target.kind,
        id: target.id,
        resolution: settings.resolution,
        renderer: settings.renderer,
        vibration: settings.vibration,
        maxBitrateMbps: settings.maxBitrateMbps,
        codecProfile: settings.codecProfile,
        elementId: PLAYER_ID,
        onUpdate,
      })
      sessionRef.current = session
      session.start()
    }
    run()
    return () => {
      cancelled = true
      sessionRef.current?.stop()
      sessionRef.current = undefined
    }
    // Settings are read once per attempt on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, attempt])

  // Controller goes to the game while playing (and the overlay is closed).
  useEffect(() => {
    const streaming = playing && !overlay
    controller.setMode(streaming ? 'stream' : 'ui')
    return () => controller.setMode('ui')
  }, [playing, overlay])

  // Overlay combo (hold L3+R3, or Esc on a keyboard).
  const overlayOpen = useRef(false)
  overlayOpen.current = overlay
  useEffect(() => controller.on((a) => {
    if (a !== 'overlay' || !sessionRef.current || sessionRef.current.getPhase() !== 'playing') return
    if (overlayOpen.current) {
      resume()
    } else {
      sessionRef.current.setInputPaused(true)
      setOverlay(true)
    }
  }), [])

  // Stats ticker.
  useEffect(() => {
    if (!playing || (!settings.showStats && !overlay)) return
    const t = setInterval(() => setStats(sessionRef.current?.stats()), 1000)
    setStats(sessionRef.current?.stats())
    return () => clearInterval(t)
  }, [playing, settings.showStats, overlay])

  const resume = async () => {
    setOverlay(false)
    // Don't let the button that closed the menu reach the game.
    await controller.waitForRelease()
    sessionRef.current?.setInputPaused(false)
  }

  const xboxButton = async () => {
    await resume()
    sessionRef.current?.pressButton('Nexus')
  }

  const exit = () => {
    setReconnect(undefined)
    reconnectRef.current = undefined
    sound.back()
    sessionRef.current?.stop()
    onExit()
  }

  // Layer for the connecting / error view.
  useInputLayer(rootRef, (a) => {
    if (a === 'back') { exit(); return true }
  }, !playing)

  // Layer for the in-game overlay.
  useInputLayer(overlayRef, (a) => {
    if (a === 'back' || a === 'menu') { resume(); return true }
  }, overlay)

  const fitClass = settings.videoFit === 'fill' ? 'fit-fill' : 'fit-contain'
  const showConnecting = status.phase !== 'playing' && status.phase !== 'error' && status.phase !== 'ended'

  return (
    <div className={`screen stream ${fitClass}`} ref={rootRef}>
      <div id={PLAYER_ID} className="player" />

      {showConnecting && (
        <div className="stream-status">
          <Spinner size={64} />
          <h2>{reconnect ? `Reconnecting to ${target.name}` : target.name}</h2>
          <p>{reconnect
            ? reconnect.waitingForNetwork ? 'Waiting for Wi-Fi to come back…' : `${reconnect.reason} Trying again (${reconnect.attempt} of ${MAX_RECONNECTS})…`
            : status.message}</p>
          {reconnect && target.kind === 'home' && <p className="muted">Your game keeps running on the console.</p>}
          {reconnect && target.kind === 'cloud' && <p className="muted">Cloud games may restart in a new session.</p>}
          {status.phase === 'queued' && status.waitSeconds ? <p className="muted">About {Math.ceil(status.waitSeconds / 60)} min</p> : null}
          <Steps phase={status.phase} />
          <button className="btn btn-ghost" data-nav data-autofocus onClick={exit}>Cancel</button>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="stream-status">
          <h2>{status.recoverable ? `Lost connection to ${target.name}` : `Couldn't connect to ${target.name}`}</h2>
          <p className="error-text wide">{status.message}</p>
          <div className="row">
            <button className="btn btn-primary" data-nav data-autofocus onClick={() => setAttempt(n => n + 1)}>Try again</button>
            <button className="btn" data-nav onClick={exit}>Back</button>
          </div>
        </div>
      )}

      {playing && settings.showStats && !overlay && stats && <StatsHud stats={stats} />}

      {overlay && (
        <div className="overlay-backdrop">
          <div className="overlay-panel" ref={overlayRef}>
            <h3>{target.name}</h3>
            <button className="overlay-item" data-nav data-autofocus onClick={resume}>Resume</button>
            <button className="overlay-item" data-nav onClick={xboxButton}>Press Xbox button</button>
            <button className="overlay-item" data-nav onClick={() => update({ videoFit: settings.videoFit === 'fill' ? 'contain' : 'fill' })}>
              Picture: {settings.videoFit === 'fill' ? 'Fill screen' : 'Fit'}
            </button>
            <button className="overlay-item" data-nav onClick={() => update({ showStats: !settings.showStats })}>
              Performance stats: {settings.showStats ? 'On' : 'Off'}
            </button>
            <button className="overlay-item danger" data-nav onClick={exit}>Disconnect</button>
            {stats && <StatsHud stats={stats} inline />}
          </div>
          <HintBar hints={[{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Resume', onClick: resume }]} />
        </div>
      )}

      {!playing && (
        <HintBar hints={status.phase === 'error'
          ? [{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Back', onClick: exit }]
          : [{ glyph: 'B', label: 'Cancel', onClick: exit }]} />
      )}
    </div>
  )
}

function Steps({ phase }: { phase: StreamUpdate['phase'] }) {
  const order = ['requesting', 'provisioning', 'connecting', 'playing']
  const idx = Math.max(0, order.indexOf(phase === 'queued' ? 'provisioning' : phase))
  const labels = ['Request', 'Console ready', 'Connect', 'Play']
  return (
    <ol className="steps">
      {labels.map((l, i) => <li key={l} className={i < idx ? 'done' : i === idx ? 'current' : ''}>{l}</li>)}
    </ol>
  )
}

function StatsHud({ stats, inline }: { stats: StreamStats; inline?: boolean }) {
  const rttCls = stats.rttMs > 75 ? 'bad' : stats.rttMs > 40 ? 'warn' : 'good'
  return (
    <div className={inline ? 'stats inline' : 'stats'}>
      <span>{stats.width}×{stats.height}</span>
      <span>{stats.fps} fps</span>
      <span className={rttCls}>{stats.rttMs} ms</span>
      <span>{stats.local ? 'Local' : 'Remote'}{stats.ipv6 ? ' · IPv6' : ''}</span>
    </div>
  )
}

