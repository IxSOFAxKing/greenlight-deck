import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CloudTitle, TitleDetails } from '../../shared/api'
import { call, log } from '../api'
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
              <PosterArt title={t} lazy />
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [wait, setWait] = useState<number | null | undefined>(undefined)
  const [info, setInfo] = useState<TitleDetails | null | undefined>(undefined)
  const [logoFailed, setLogoFailed] = useState(false)
  const [heroFailed, setHeroFailed] = useState(false)
  const [shot, setShot] = useState<number | undefined>()

  useEffect(() => {
    let alive = true
    call('cloudWaitTime', title.titleId).then(w => { if (alive) setWait(w) }).catch(() => { if (alive) setWait(null) })
    if (title.productId) call('cloudTitleDetails', title.productId).then(d => { if (alive) setInfo(d) }).catch(() => { if (alive) setInfo(null) })
    else setInfo(null)
    return () => { alive = false }
  }, [title.titleId, title.productId])

  useInputLayer(ref, (a) => {
    if (a === 'back') { onClose(); return true }
    if (a === 'lb' || a === 'rb') return true
    // Up from the top row goes back to the very top of the page.
    if (a === 'up' && document.activeElement?.classList.contains('play-btn')) { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return true }
  }, shot === undefined)

  const name = info?.title ?? title.name
  const heroSrc = !heroFailed ? (info?.heroUrl ? sized(info.heroUrl, 1920) : title.heroUrl) : undefined
  const logoSrc = info?.logoUrl ? sized(info.logoUrl, 900) : title.logoUrl
  const blurred = !heroSrc ? (title.posterUrl ?? title.imageUrl) : undefined
  const description = info?.description ?? title.description
  const genres = info?.genres?.length ? info.genres : title.genres
  const capabilities = info?.capabilities?.length ? info.capabilities : title.features
  const year = info?.releaseDate ? new Date(info.releaseDate).getUTCFullYear() : undefined
  const shots = info?.screenshots ?? []
  const waitReady = wait !== undefined && wait !== null && wait < 30
  const waitText = wait === undefined ? 'Checking wait time…'
    : wait === null ? 'Wait time unavailable'
    : waitReady ? 'Ready to play: no wait'
    : `About ${Math.max(1, Math.round(wait / 60))} min wait`

  return (
    <div className="modal detail-modal" ref={ref} role="dialog" aria-label={name}>
      <div className="detail-scroll" ref={scrollRef}>
        <section className="detail-hero">
          {heroSrc && <img className="detail-bg" src={heroSrc} alt="" onError={() => setHeroFailed(true)} />}
          {blurred && <img className="detail-bg blurred" src={blurred} alt="" />}
          <div className="detail-scrim" />
          <div className="detail-hero-content">
            <div className="detail-art"><PosterArt title={info?.posterUrl && !title.posterUrl ? { ...title, posterUrl: sized(info.posterUrl, 500) } : title} /></div>
            <div className="detail-info">
              {logoSrc && !logoFailed
                ? <img className="detail-logo" src={logoSrc} alt={name} onError={() => setLogoFailed(true)} />
                : <h2 className="detail-title">{name}</h2>}
              <div className="detail-badges">
                {info?.ageRating && <span className="age-badge" title={info.ageRatingSystem}>{info.ageRating}</span>}
                {info?.userRating && info.userRating.count > 0 && (
                  <span className="stars"><Star /> {info.userRating.average.toFixed(1)} <span className="muted">({formatCount(info.userRating.count)})</span></span>
                )}
                {year && <span>{year}</span>}
                {info?.maxPlayers && <span>{info.maxPlayers > 1 ? `1-${info.maxPlayers} players` : '1 player'}</span>}
                {genres?.map(g => <span key={g} className="chip-static">{g}</span>)}
              </div>
              <div className={`wait ${waitReady ? 'ready' : ''}`}><span className="wait-dot" aria-hidden="true" />{waitText}</div>
              <div className="row">
                <button className="btn btn-primary btn-xl play-btn" data-nav data-autofocus onClick={onPlay}>
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
                  Play
                </button>
                <button className="btn" data-nav onClick={onClose}>Back</button>
              </div>
            </div>
          </div>
        </section>

        <section className="detail-body">
          {info === undefined && <div className="muted small detail-loading"><span className="mini-spinner" aria-hidden="true" /> Loading game details…</div>}

          <div className="detail-columns">
            <div className="detail-about" data-nav tabIndex={0} aria-label="About this game">
              <h3>About</h3>
              {description ? <p className="detail-desc">{description}</p> : <p className="muted">No description available.</p>}
              <dl className="facts">
                {(info?.publisher ?? title.publisher) && <><dt>Published by</dt><dd>{info?.publisher ?? title.publisher}</dd></>}
                {info?.developer && <><dt>Developed by</dt><dd>{info.developer}</dd></>}
                {info?.releaseDate && <><dt>Released</dt><dd>{new Date(info.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</dd></>}
              </dl>
            </div>
            {!!capabilities?.length && (
              <div className="detail-caps">
                <h3>Features</h3>
                <ul>{capabilities.map(c => <li key={c}><Check />{c}</li>)}</ul>
              </div>
            )}
          </div>

          {shots.length > 0 && (
            <>
              <h3 className="shots-title">Screenshots</h3>
              <div className="shots" data-nav-group>
                {shots.map((u, i) => (
                  <button key={u} className="shot" data-nav onClick={() => setShot(i)} aria-label={`Screenshot ${i + 1}`}>
                    <img src={sized(u, 640)} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {shot !== undefined && <Lightbox images={shots} index={shot} onIndex={setShot} onClose={() => setShot(undefined)} />}
      <HintBar hints={[{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Back', onClick: onClose }]} />
    </div>
  )
}

/** Full-screen screenshot viewer: left/right to browse, B to close. */
function Lightbox({ images, index, onIndex, onClose }: { images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useInputLayer(ref, (a) => {
    if (a === 'back' || a === 'accept') { onClose(); return true }
    if (a === 'left' || a === 'lb') { onIndex((index - 1 + images.length) % images.length); return true }
    if (a === 'right' || a === 'rb') { onIndex((index + 1) % images.length); return true }
    return true
  })
  return (
    <div className="modal lightbox" ref={ref} role="dialog" aria-label="Screenshot">
      <img src={sized(images[index], 1920)} alt={`Screenshot ${index + 1} of ${images.length}`} />
      <HintBar left={<span className="muted small">{index + 1} / {images.length}</span>}
        hints={[{ glyph: 'LB', label: 'Previous' }, { glyph: 'RB', label: 'Next' }, { glyph: 'B', label: 'Close', onClick: onClose }]} />
    </div>
  )
}

function Star() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.3 9.7l6.1-.6z" fill="currentColor" /></svg>
}

function Check() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
}

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

/** Right-size Microsoft Store images; other hosts are left alone. */
function sized(url: string, width: number) {
  try {
    const u = new URL(url)
    if (u.hostname !== 'store-images.s-microsoft.com') return url
    u.searchParams.set('w', String(width))
    u.searchParams.delete('h')
    u.searchParams.set('q', '85')
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Box art with fallbacks: the resized image, then the full-size original, then
 * a designed card with the game's name, so a missing image never looks broken.
 */
function PosterArt({ title, lazy }: { title: CloudTitle; lazy?: boolean }) {
  const sources = [title.posterUrl, title.posterOriginalUrl, title.imageUrl].filter((u, i, a): u is string => !!u && a.indexOf(u) === i)
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [title.titleId])
  const src = sources[index]
  if (!src) {
    if (sources.length === 0) logMissingOnce(title.name)
    return (
      <div className="art-fallback" style={{ background: fallbackGradient(title.name) }}>
        <span>{title.name}</span>
      </div>
    )
  }
  return <img src={src} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => {
    log('warn', 'ui', `[art] ${title.name}: image ${index + 1}/${sources.length} failed to load (${shortUrl(src)})`)
    setIndex(i => i + 1)
  }} />
}

/** A stable, muted gradient per game so placeholder cards don't all look alike. */
function fallbackGradient(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  return `linear-gradient(160deg, hsl(${hue} 32% 26%), hsl(${(hue + 40) % 360} 28% 12%))`
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

const loggedMissing = new Set<string>()
function logMissingOnce(name: string) {
  if (loggedMissing.has(name)) return
  loggedMissing.add(name)
  log('info', 'ui', `[art] ${name}: no cover image in the catalog data`)
}

function shortUrl(u: string) {
  try { const x = new URL(u); return `${x.protocol}//${x.hostname}${x.pathname.slice(0, 40)}` } catch { return u.slice(0, 60) }
}
