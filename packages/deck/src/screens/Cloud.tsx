import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CloudTitle } from '../../shared/api'
import { call } from '../api'
import { Glyph, HintBar, Spinner } from '../components/ui'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { useInputLayer } from '../input/layers'

export interface CloudLoader { data?: CloudTitle[]; loading: boolean; error?: string; reload: () => void; updating?: boolean; cachedAt?: number }

type Filter = { kind: 'all' } | { kind: 'recent' } | { kind: 'genre'; genre: string }

/** Imperative bits the Home screen triggers from controller buttons. */
export interface CloudControls { openSearch: () => void }

export function CloudTab({ state, onPlay, controls }: {
  state: CloudLoader
  onPlay: (t: CloudTitle) => void
  controls?: MutableRefObject<CloudControls | undefined>
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [detail, setDetail] = useState<CloudTitle | undefined>()

  if (controls) controls.current = { openSearch: () => setSearching(true) }

  const list = state.data ?? []

  const genres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of list) for (const g of t.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g)
  }, [list])

  const shown = useMemo(() => {
    const q = normalize(query)
    return list.filter(t => {
      if (filter.kind === 'recent' && !t.recent) return false
      if (filter.kind === 'genre' && !(t.genres ?? []).includes(filter.genre)) return false
      if (q && !normalize(`${t.name} ${t.publisher ?? ''}`).includes(q)) return false
      return true
    })
  }, [list, query, filter])

  if ((state.loading || state.updating) && !state.data) {
    return <div className="center fill"><Spinner /><p className="muted">Loading cloud games… the first time takes a little while. After that, it opens instantly.</p></div>
  }
  if (state.error) {
    return (
      <div className="empty">
        <h2>Couldn't load cloud games</h2>
        <p className="error-text">{state.error}</p>
        <button className="btn btn-primary" data-nav data-autofocus onClick={state.reload}>Try again</button>
      </div>
    )
  }
  if (list.length === 0) {
    return <div className="empty"><h2>No cloud games</h2><p>Cloud gaming needs a Game Pass plan that includes it.</p></div>
  }

  const chip = (label: string, f: Filter, active: boolean) => (
    <button key={label} className={`chip ${active ? 'active' : ''}`} data-nav aria-pressed={active} onClick={() => setFilter(f)}>{label}</button>
  )
  const hasRecent = list.some(t => t.recent)

  return (
    <div className="cloud">
      <div className="cloud-toolbar" data-nav-group>
        <button className="search-btn" data-nav onClick={() => setSearching(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="search-label">{query ? `“${query}”` : 'Search'}</span>
          <Glyph name="X" />
        </button>
        {chip('All', { kind: 'all' }, filter.kind === 'all')}
        {hasRecent && chip('Recently played', { kind: 'recent' }, filter.kind === 'recent')}
        {genres.map(g => chip(g, { kind: 'genre', genre: g }, filter.kind === 'genre' && filter.genre === g))}
      </div>

      <div className="cloud-count muted small">
        {shown.length} {shown.length === 1 ? 'game' : 'games'}
        {query && <> matching “{query}” · <button className="linkish" onClick={() => setQuery('')} tabIndex={-1}>clear</button></>}
        {state.updating ? <span className="updating"> · <span className="mini-spinner" aria-hidden="true" /> Updating…</span>
          : state.cachedAt ? <span> · updated {ago(state.cachedAt)}</span> : null}
      </div>

      {shown.length === 0 ? (
        <div className="empty slim">
          <p>No games match{query ? ` “${query}”` : ''}.</p>
          <button className="btn" data-nav onClick={() => { setQuery(''); setFilter({ kind: 'all' }) }}>Show all games</button>
        </div>
      ) : (
        <div className="poster-grid">
          {shown.map((t, i) => (
            <button key={t.titleId} className="poster" data-nav data-autofocus={i === 0 || undefined} onClick={() => setDetail(t)} title={t.name}>
              {(t.posterUrl ?? t.imageUrl)
                ? <img src={t.posterUrl ?? t.imageUrl} alt="" loading="lazy" />
                : <div className="tile-fallback">{t.name.slice(0, 2)}</div>}
              <span className="poster-name">{t.name}</span>
              {t.recent && <span className="poster-badge">Recent</span>}
            </button>
          ))}
        </div>
      )}

      {searching && <OnScreenKeyboard value={query} onChange={setQuery} onDone={() => setSearching(false)} label="Search cloud games" />}
      {detail && <TitleDetail title={detail} onClose={() => setDetail(undefined)} onPlay={() => { const t = detail; setDetail(undefined); onPlay(t) }} />}
    </div>
  )
}

function TitleDetail({ title, onClose, onPlay }: { title: CloudTitle; onClose: () => void; onPlay: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [wait, setWait] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    call('cloudWaitTime', title.titleId).then(w => { if (alive) setWait(w) }).catch(() => { if (alive) setWait(null) })
    return () => { alive = false }
  }, [title.titleId])

  useInputLayer(ref, (a) => {
    if (a === 'back') { onClose(); return true }
    if (a === 'lb' || a === 'rb') return true
  })

  const waitText = wait === undefined ? 'Checking wait time…'
    : wait === null ? 'Wait time unavailable'
    : wait < 30 ? 'Ready now: no wait'
    : `About ${Math.max(1, Math.round(wait / 60))} min wait`

  return (
    <div className="modal detail-modal" ref={ref} role="dialog" aria-label={title.name}>
      <div className="detail" style={title.heroUrl ? { backgroundImage: `linear-gradient(90deg, rgba(11,13,16,.97) 0%, rgba(11,13,16,.85) 45%, rgba(11,13,16,.35) 100%), url("${title.heroUrl}")` } : undefined}>
        <div className="detail-art">
          {(title.posterUrl ?? title.imageUrl) ? <img src={title.posterUrl ?? title.imageUrl} alt="" /> : <div className="tile-fallback">{title.name.slice(0, 2)}</div>}
        </div>
        <div className="detail-info">
          <h2>{title.name}</h2>
          {title.publisher && <div className="muted">{title.publisher}</div>}
          {!!title.genres?.length && <div className="pill-row">{title.genres.map(g => <span key={g} className="pill">{g}</span>)}</div>}
          {title.description && <p className="detail-desc">{title.description}</p>}
          {!!title.features?.length && <div className="pill-row">{title.features.map(f => <span key={f} className="pill subtle">{f}</span>)}</div>}
          <div className={`wait ${wait !== undefined && wait !== null && wait < 30 ? 'ready' : ''}`}>{waitText}</div>
          <div className="row">
            <button className="btn btn-primary btn-xl" data-nav data-autofocus onClick={onPlay}>Play</button>
            <button className="btn" data-nav onClick={onClose}>Back</button>
          </div>
        </div>
      </div>
      <HintBar hints={[{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Back', onClick: onClose }]} />
    </div>
  )
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}
