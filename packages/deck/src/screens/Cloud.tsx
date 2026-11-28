import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CloudPrefs, CloudTag, CloudTitle, GameProgress, TitleDetails } from '../../shared/api'
import { call, log } from '../api'
import { Glyph, HintBar, Spinner } from '../components/ui'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { useInputLayer } from '../input/layers'
import { sound } from '../input/sound'
import { useToast } from '../state'
import { AchievementsModal, ProgressBar } from './Social'

export interface CloudLoader { data?: CloudTitle[]; loading: boolean; error?: string; reload: () => void; updating?: boolean; cachedAt?: number }

type View = 'all' | 'favorites' | 'recent'
type Sort = 'name' | 'played' | 'publisher'
interface Refine { genre?: string; tags: CloudTag[]; sort: Sort }

const TAG_LABELS: Record<CloudTag, string> = { multiplayer: 'Multiplayer', coop: 'Co-op', touch: 'Touch controls', kbm: 'Mouse & keyboard' }
const SORT_LABELS: Record<Sort, string> = { name: 'A to Z', played: 'Recently played', publisher: 'Publisher' }

/** Imperative bits the Home screen triggers from controller buttons. */
export interface CloudControls { openSearch: () => void; toggleFavorite: () => void }

export function CloudTab({ state, onPlay, controls, visible = true }: {
  state: CloudLoader
  onPlay: (t: CloudTitle) => void
  controls?: MutableRefObject<CloudControls | undefined>
  visible?: boolean
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState<View>('all')
  const [refine, setRefine] = useState<Refine>({ tags: [], sort: 'name' })
  const [refining, setRefining] = useState(false)
  const [detail, setDetail] = useState<CloudTitle | undefined>()
  const [prefs, setPrefs] = useState<CloudPrefs>({ favorites: [], played: {} })
  const toast = useToast()

  // Reload favorites / recently played when the tab shows (e.g. back from a game).
  useEffect(() => {
    if (!visible) return
    call('getCloudPrefs').then(setPrefs).catch(() => { /* keep what we have */ })
  }, [visible])

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites])
  const list = state.data ?? []

  const toggleFavorite = async (t: CloudTitle) => {
    const on = !favorites.has(t.titleId)
    try {
      setPrefs(await call('setFavorite', t.titleId, on))
      sound.select()
      toast(on ? `Added ${t.name} to favorites` : `Removed ${t.name} from favorites`)
    } catch (err) {
      toast(`Couldn't update favorites: ${err instanceof Error ? err.message : err}`)
    }
  }

  const focusedTitle = () => {
    const id = (document.activeElement as HTMLElement | null)?.dataset.titleId
    return list.find(t => t.titleId === id)
  }

  if (controls) controls.current = {
    openSearch: () => setSearching(true),
    toggleFavorite: () => { const t = focusedTitle(); if (t) toggleFavorite(t) },
  }

  const genres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of list) for (const g of t.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
  }, [list])
  const availableTags = useMemo(() => (Object.keys(TAG_LABELS) as CloudTag[]).filter(k => list.some(t => t.tags?.includes(k))), [list])

  const lastPlayed = (t: CloudTitle) => prefs.played[t.titleId] ?? (t.recent ? 1 : 0)
  const isRecent = (t: CloudTitle) => !!t.recent || !!prefs.played[t.titleId]

  const shown = useMemo(() => {
    const q = normalize(query)
    const out = list.filter(t => {
      if (view === 'favorites' && !favorites.has(t.titleId)) return false
      if (view === 'recent' && !isRecent(t)) return false
      if (refine.genre && !(t.genres ?? []).includes(refine.genre)) return false
      if (refine.tags.some(tag => !t.tags?.includes(tag))) return false
      if (q && !normalize(`${t.name} ${t.publisher ?? ''} ${(t.genres ?? []).join(' ')}`).includes(q)) return false
      return true
    })
    const sort = view === 'recent' ? 'played' : refine.sort
    if (sort === 'played') out.sort((a, b) => lastPlayed(b) - lastPlayed(a) || a.name.localeCompare(b.name))
    else if (sort === 'publisher') out.sort((a, b) => (a.publisher ?? '~').localeCompare(b.publisher ?? '~') || a.name.localeCompare(b.name))
    else if (view !== 'all' || q || refine.genre || refine.tags.length) out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [list, query, view, refine, favorites, prefs.played]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const chip = (label: string, v: View) => (
    <button key={label} className={`chip ${view === v ? 'active' : ''}`} data-nav aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
  )
  const hasRecent = list.some(isRecent)
  const refineCount = (refine.genre ? 1 : 0) + refine.tags.length + (refine.sort !== 'name' ? 1 : 0)
  const clearAll = () => { setQuery(''); setView('all'); setRefine({ tags: [], sort: 'name' }) }

  return (
    <div className="cloud">
      <div className="cloud-toolbar" data-nav-group>
        <button className="search-btn" data-nav onClick={() => setSearching(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="search-label">{query ? `“${query}”` : 'Search'}</span>
          <Glyph name="X" />
        </button>
        {chip('All', 'all')}
        {(favorites.size > 0 || view === 'favorites') && chip(`Favorites (${list.filter(t => favorites.has(t.titleId)).length})`, 'favorites')}
        {hasRecent && chip('Recently played', 'recent')}
        <button className={`chip ${refineCount ? 'active' : ''}`} data-nav onClick={() => setRefining(true)}>
          Filter &amp; sort{refineCount ? ` (${refineCount})` : ''}
        </button>
        {refine.genre && <span className="chip-static">{refine.genre}</span>}
        {refine.tags.map(t => <span key={t} className="chip-static">{TAG_LABELS[t]}</span>)}
      </div>

      <div className="cloud-count muted small">
        {shown.length} {shown.length === 1 ? 'game' : 'games'}
        {query && <> matching “{query}”</>}
        {(query || refineCount > 0) && <> · <button className="linkish" onClick={clearAll} tabIndex={-1}>clear</button></>}
        {state.updating ? <span className="updating"> · <span className="mini-spinner" aria-hidden="true" /> Updating…</span>
          : state.cachedAt ? <span> · updated {ago(state.cachedAt)}</span> : null}
      </div>

      {shown.length === 0 ? (
        <div className="empty slim">
          <p>{view === 'favorites' && !query && !refineCount ? 'No favorites yet. Press ≡ on a game to add it.' : `No games match${query ? ` “${query}”` : ' these filters'}.`}</p>
          <button className="btn" data-nav onClick={clearAll}>Show all games</button>
        </div>
      ) : (
        <div className="poster-grid">
          {shown.map((t, i) => (
            <button key={t.titleId} className="poster" data-nav data-title-id={t.titleId} data-autofocus={i === 0 || undefined} onClick={() => setDetail(t)} title={t.name}>
              <PosterArt title={t} lazy />
              <span className="poster-name">{t.name}</span>
              {isRecent(t) && view !== 'recent' && <span className="poster-badge">Recent</span>}
              {favorites.has(t.titleId) && <span className="poster-fav" aria-label="Favorite"><Heart filled /></span>}
            </button>
          ))}
        </div>
      )}

      {searching && <OnScreenKeyboard value={query} onChange={setQuery} onDone={() => setSearching(false)} label="Search cloud games" />}
      {refining && <RefinePanel refine={refine} genres={genres} tags={availableTags} onChange={setRefine} onClose={() => setRefining(false)} />}
      {detail && <TitleDetail title={detail} favorite={favorites.has(detail.titleId)} onFavorite={() => toggleFavorite(detail)}
        onClose={() => setDetail(undefined)} onPlay={() => { const t = detail; setDetail(undefined); onPlay(t) }} />}
    </div>
  )
}

/** Filter & sort pop-up: sort order, one genre, and any number of features. */
function RefinePanel({ refine, genres, tags, onChange, onClose }: {
  refine: Refine; genres: string[]; tags: CloudTag[]; onChange: (r: Refine) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useInputLayer(ref, (a) => {
    if (a === 'back' || a === 'menu') { onClose(); return true }
    if (a === 'y') { onChange({ tags: [], sort: 'name' }); return true }
    if (a === 'lb' || a === 'rb' || a === 'view' || a === 'x') return true
  })
  const toggleTag = (t: CloudTag) => onChange({ ...refine, tags: refine.tags.includes(t) ? refine.tags.filter(x => x !== t) : [...refine.tags, t] })
  const opt = (label: string, active: boolean, onClick: () => void, autofocus?: boolean) => (
    <button key={label} className={`chip ${active ? 'active' : ''}`} data-nav data-autofocus={autofocus || undefined} aria-pressed={active} onClick={onClick}>
      {active && <span aria-hidden="true">✓ </span>}{label}
    </button>
  )
  return (
    <div className="modal refine" ref={ref} role="dialog" aria-label="Filter and sort">
      <div className="modal-panel refine-panel">
        <h2>Filter &amp; sort</h2>
        <h3>Sort by</h3>
        <div className="chip-wrap">{(Object.keys(SORT_LABELS) as Sort[]).map((k, i) => opt(SORT_LABELS[k], refine.sort === k, () => onChange({ ...refine, sort: k }), i === 0))}</div>
        {tags.length > 0 && <>
          <h3>Features</h3>
          <div className="chip-wrap">{tags.map(t => opt(TAG_LABELS[t], refine.tags.includes(t), () => toggleTag(t)))}</div>
        </>}
        <h3>Genre</h3>
        <div className="chip-wrap refine-genres">
          {opt('Any genre', !refine.genre, () => onChange({ ...refine, genre: undefined }))}
          {genres.map(g => opt(g, refine.genre === g, () => onChange({ ...refine, genre: refine.genre === g ? undefined : g })))}
        </div>
        <div className="row refine-done">
          <button className="btn btn-primary" data-nav onClick={onClose}>Done</button>
        </div>
      </div>
      <HintBar hints={[{ glyph: 'A', label: 'Choose' }, { glyph: 'Y', label: 'Reset', onClick: () => onChange({ tags: [], sort: 'name' }) }, { glyph: 'B', label: 'Done', onClick: onClose }]} />
    </div>
  )
}

function TitleDetail({ title, favorite, onFavorite, onClose, onPlay }: {
  title: CloudTitle; favorite: boolean; onFavorite: () => void; onClose: () => void; onPlay: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [wait, setWait] = useState<number | null | undefined>(undefined)
  const [info, setInfo] = useState<TitleDetails | null | undefined>(undefined)
  const [logoFailed, setLogoFailed] = useState(false)
  const [heroFailed, setHeroFailed] = useState(false)
  const [shot, setShot] = useState<number | undefined>()
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<GameProgress | null | undefined>(undefined)
  const [showAch, setShowAch] = useState(false)
  const xboxTitleId = title.xboxTitleId ?? info?.xboxTitleId

  useEffect(() => {
    let alive = true
    call('cloudWaitTime', title.titleId).then(w => { if (alive) setWait(w) }).catch(() => { if (alive) setWait(null) })
    if (title.productId) call('cloudTitleDetails', title.productId).then(d => { if (alive) setInfo(d) }).catch(() => { if (alive) setInfo(null) })
    else setInfo(null)
    return () => { alive = false }
  }, [title.titleId, title.productId])

  useEffect(() => {
    if (!xboxTitleId) return
    let alive = true
    call('gameProgress', xboxTitleId).then(p => { if (alive) setProgress(p) }).catch(() => { if (alive) setProgress(null) })
    return () => { alive = false }
  }, [xboxTitleId])

  useInputLayer(ref, (a) => {
    if (a === 'back') { onClose(); return true }
    if (a === 'y' || a === 'menu') { onFavorite(); return true }
    if (a === 'lb' || a === 'rb') return true
    // Up from the top row goes back to the very top of the page.
    if (a === 'up' && document.activeElement?.classList.contains('play-btn')) { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return true }
  }, shot === undefined && !reading && !showAch)

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
                <button className={`btn fav-btn ${favorite ? 'on' : ''}`} data-nav onClick={onFavorite} aria-pressed={favorite}>
                  <Heart filled={favorite} /> {favorite ? 'Favorite' : 'Add to favorites'}
                </button>
                <button className="btn" data-nav onClick={onClose}>Back</button>
              </div>
            </div>
          </div>
        </section>

        <section className="detail-body">
          {info === undefined && <div className="muted small detail-loading"><span className="mini-spinner" aria-hidden="true" /> Loading game details…</div>}

          <div className="detail-columns">
            <button className="detail-about" data-nav aria-label="About this game. Press A to read more."
              onClick={() => description && setReading(true)}>
              <h3>About</h3>
              {description ? <p className="detail-desc">{description}</p> : <p className="muted">No description available.</p>}
              {description && <span className="read-more"><Glyph name="A" /> Read more</span>}
              <dl className="facts">
                {(info?.publisher ?? title.publisher) && <><dt>Published by</dt><dd>{info?.publisher ?? title.publisher}</dd></>}
                {info?.developer && <><dt>Developed by</dt><dd>{info.developer}</dd></>}
                {info?.releaseDate && <><dt>Released</dt><dd>{new Date(info.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</dd></>}
              </dl>
            </button>
            {!!capabilities?.length && (
              <div className="detail-caps">
                <h3>Features</h3>
                <ul>{capabilities.map(c => <li key={c}><Check />{c}</li>)}</ul>
              </div>
            )}
          </div>

          {xboxTitleId && (
            <button className="detail-ach" data-nav onClick={() => setShowAch(true)} aria-label="Achievements. Press A to see them all.">
              <h3>Achievements</h3>
              {progress === undefined ? <span className="muted small"><span className="mini-spinner" aria-hidden="true" /> Checking your progress…</span>
                : progress ? <>
                  <ProgressBar percent={progress.percent} />
                  <span className="muted">{progress.total > 0 ? `${progress.earned} of ${progress.total} unlocked · ` : ''}{progress.gamerscore.toLocaleString()} / {progress.totalGamerscore.toLocaleString()} G · {progress.percent}%</span>
                </> : <span className="muted">You haven't unlocked any yet.</span>}
              <span className="read-more"><Glyph name="A" /> See all achievements</span>
            </button>
          )}

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

      {reading && description && (
        <ReadMore title={name} text={description}
          facts={[
            ['Published by', info?.publisher ?? title.publisher],
            ['Developed by', info?.developer],
            ['Released', info?.releaseDate ? new Date(info.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : undefined],
          ]}
          onClose={() => setReading(false)} />
      )}
      {showAch && xboxTitleId && <AchievementsModal titleId={xboxTitleId} name={name} progress={progress} onClose={() => setShowAch(false)} />}
      {shot !== undefined && <Lightbox images={shots} index={shot} onIndex={setShot} onClose={() => setShot(undefined)} />}
      <HintBar hints={[{ glyph: 'A', label: 'Select' }, { glyph: 'Y', label: favorite ? 'Unfavorite' : 'Favorite', onClick: onFavorite }, { glyph: 'B', label: 'Back', onClick: onClose }]} />
    </div>
  )
}

/**
 * Full description in a pop-up with smooth controller scrolling:
 * either stick scrolls at a speed that follows how far it's pushed,
 * D-pad up/down scrolls steadily, LB/RB jump a page, B or A closes.
 */
function ReadMore({ title, text, facts, onClose }: {
  title: string; text: string; facts: Array<[string, string | undefined]>; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [atTop, setAtTop] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const page = (dir: number) => {
    const box = boxRef.current
    if (box) box.scrollBy({ top: dir * box.clientHeight * 0.85, behavior: 'smooth' })
  }

  // The menu input layer swallows directions here; scrolling reads the pad
  // directly every frame so it's continuous rather than step-by-step.
  useInputLayer(ref, (a) => {
    if (a === 'back' || a === 'accept') { onClose(); return true }
    if (a === 'lb') { page(-1); return true }
    if (a === 'rb') { page(1); return true }
    return true
  })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const keys = new Set<string>()
    const down = (e: KeyboardEvent) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') keys.add(e.key) }
    const up = (e: KeyboardEvent) => keys.delete(e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)

    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 1000
      last = now
      let v = 0 // -1..1, positive = down
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p || !p.connected) continue
        const sticks = [p.axes[1] ?? 0, p.axes[3] ?? 0]
        for (const y of sticks) if (Math.abs(y) > 0.15 && Math.abs(y) > Math.abs(v)) v = Math.sign(y) * ((Math.abs(y) - 0.15) / 0.85)
        if (p.buttons[12]?.pressed) v = -0.6
        if (p.buttons[13]?.pressed) v = 0.6
      }
      if (keys.has('ArrowUp')) v = -0.6
      if (keys.has('ArrowDown')) v = 0.6
      const box = boxRef.current
      if (box && v !== 0) {
        // Ease the curve so small pushes scroll gently and a full push is fast.
        const speed = Math.sign(v) * Math.pow(Math.abs(v), 1.6) * 1400
        box.scrollTop += speed * dt
      }
      if (box) {
        setAtTop(box.scrollTop <= 1)
        setAtEnd(box.scrollTop + box.clientHeight >= box.scrollHeight - 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return (
    <div className="modal readmore" ref={ref} role="dialog" aria-label={`About ${title}`}>
      <div className="readmore-panel">
        <h2>{title}</h2>
        <div className={`readmore-text ${atTop ? '' : 'fade-top'} ${atEnd ? '' : 'fade-bottom'}`} ref={boxRef} tabIndex={-1}>
          <p>{text}</p>
          <dl className="facts">
            {facts.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        </div>
        <button className="btn readmore-close" data-nav data-autofocus onClick={onClose}>Close</button>
      </div>
      <HintBar left={<span className="muted small">Use either stick or the D-pad to scroll</span>}
        hints={[{ glyph: 'LB', label: 'Page up', onClick: () => page(-1) }, { glyph: 'RB', label: 'Page down', onClick: () => page(1) }, { glyph: 'B', label: 'Close', onClick: onClose }]} />
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

function Heart({ filled }: { filled?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.6 3.3 4.5 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
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
