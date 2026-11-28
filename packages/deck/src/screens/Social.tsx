import { useEffect, useRef, useState } from 'react'
import type { Achievement, Friend, GameProgress, TitleAchievements } from '../../shared/api'
import { call } from '../api'
import { HintBar, Spinner } from '../components/ui'
import { useInputLayer } from '../input/layers'
import { Avatar } from './Profiles'

export interface Loaded<T> { data?: T; loading: boolean; error?: string; reload: () => void }

// ---------- Friends ----------

export function FriendsTab({ state }: { state: Loaded<Friend[]> }) {
  if (state.loading && !state.data) return <div className="center fill"><Spinner /></div>
  if (state.error && !state.data) {
    return (
      <div className="empty">
        <h2>Couldn't load your friends</h2>
        <p className="error-text">{state.error}</p>
        <button className="btn btn-primary" data-nav data-autofocus onClick={state.reload}>Try again</button>
      </div>
    )
  }
  const list = state.data ?? []
  if (list.length === 0) {
    return <div className="empty"><h2>No friends yet</h2><p>People you follow on Xbox show up here, with what they're playing.</p></div>
  }
  const online = list.filter(f => f.presence !== 'Offline')
  const offline = list.filter(f => f.presence === 'Offline')
  return (
    <div className="friends">
      <h3 className="section-title">Online <span className="muted">· {online.length}</span></h3>
      {online.length === 0 ? <p className="muted friends-none">None of your friends are online right now.</p> : <FriendGrid list={online} autofocus />}
      {offline.length > 0 && <>
        <h3 className="section-title">Offline <span className="muted">· {offline.length}</span></h3>
        <FriendGrid list={offline} autofocus={online.length === 0} />
      </>}
    </div>
  )
}

function FriendGrid({ list, autofocus }: { list: Friend[]; autofocus?: boolean }) {
  return (
    <div className="friend-grid">
      {list.map((f, i) => (
        <button key={f.xuid} className={`friend ${f.presence.toLowerCase()}`} data-nav data-autofocus={(autofocus && i === 0) || undefined}
          aria-label={`${f.gamertag}, ${f.presence}${f.presenceText ? `, ${f.presenceText}` : ''}`}>
          <span className="friend-avatar">
            <Avatar account={f} size={56} />
            <span className="presence-dot" aria-hidden="true" />
          </span>
          <span className="friend-text">
            <span className="friend-name">{f.gamertag}{f.favorite && <span className="fav-star" aria-label="Favorite"> ★</span>}</span>
            {f.realName && <span className="muted small">{f.realName}</span>}
            <span className={`friend-status small ${f.presence === 'Online' ? 'accent' : 'muted'}`}>{f.presenceText ?? f.presence}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------- Achievements ----------

export function AchievementsTab({ state }: { state: Loaded<GameProgress[]> }) {
  const [open, setOpen] = useState<GameProgress | undefined>()
  if (state.loading && !state.data) return <div className="center fill"><Spinner /></div>
  if (state.error && !state.data) {
    return (
      <div className="empty">
        <h2>Couldn't load achievements</h2>
        <p className="error-text">{state.error}</p>
        <button className="btn btn-primary" data-nav data-autofocus onClick={state.reload}>Try again</button>
      </div>
    )
  }
  const list = state.data ?? []
  if (list.length === 0) return <div className="empty"><h2>No achievements yet</h2><p>Games you play on Xbox show your progress here.</p></div>
  const total = list.reduce((n, g) => n + g.gamerscore, 0)
  return (
    <div className="progress-list-wrap">
      <div className="cloud-count muted small">{list.length} games · {total.toLocaleString()} G earned in these games</div>
      <div className="progress-list">
        {list.map((g, i) => (
          <button key={g.titleId} className="game-progress" data-nav data-autofocus={i === 0 || undefined} onClick={() => setOpen(g)}>
            <GameIcon url={g.imageUrl} name={g.name} />
            <span className="gp-text">
              <span className="gp-name">{g.name}</span>
              <ProgressBar percent={g.percent} />
              <span className="muted small">
                {g.total > 0 ? `${g.earned} of ${g.total} achievements · ` : ''}{g.gamerscore.toLocaleString()} / {g.totalGamerscore.toLocaleString()} G
                {g.lastPlayed && <> · played {shortDate(g.lastPlayed)}</>}
              </span>
            </span>
            <span className="gp-percent">{g.percent}%</span>
          </button>
        ))}
      </div>
      {open && <AchievementsModal titleId={open.titleId} name={open.name} progress={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

export function ProgressBar({ percent }: { percent: number }) {
  return <span className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></span>
}

function GameIcon({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) return <span className="gp-icon gp-icon-letter" aria-hidden="true">{name.slice(0, 1)}</span>
  return <img className="gp-icon" src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/** Every achievement in one game: unlocked first (newest first), then the rest. */
export function AchievementsModal({ titleId, name, progress, onClose }: {
  titleId: string; name: string; progress?: GameProgress | null; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<TitleAchievements | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [show, setShow] = useState<'all' | 'unlocked' | 'locked'>('all')

  useEffect(() => {
    let alive = true
    call('titleAchievements', titleId)
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [titleId])

  const cycle = () => setShow(s => s === 'all' ? 'unlocked' : s === 'unlocked' ? 'locked' : 'all')
  const page = (dir: number) => { const el = listRef.current; if (el) el.scrollBy({ top: dir * el.clientHeight * 0.85, behavior: 'smooth' }) }

  useInputLayer(ref, (a) => {
    if (a === 'back') { onClose(); return true }
    if (a === 'y') { cycle(); return true }
    if (a === 'lb') { page(-1); return true }
    if (a === 'rb') { page(1); return true }
    if (a === 'view' || a === 'menu') return true
  })

  const all = data?.achievements ?? []
  const earned = all.filter(a => a.unlocked)
  const shown = show === 'unlocked' ? earned : show === 'locked' ? all.filter(a => !a.unlocked) : all
  const gs = earned.reduce((n, a) => n + a.gamerscore, 0)
  const totalGs = all.reduce((n, a) => n + a.gamerscore, 0)
  const percent = all.length ? Math.round(earned.length / all.length * 100) : (progress?.percent ?? 0)

  return (
    <div className="modal achievements-modal" ref={ref} role="dialog" aria-label={`${name} achievements`}>
      <div className="modal-panel">
        <div className="ach-head">
          <div>
            <h2>{data?.name ?? name}</h2>
            <div className="muted">
              {all.length ? `${earned.length} of ${all.length} achievements · ${gs.toLocaleString()} / ${totalGs.toLocaleString()} G` : progress ? `${progress.gamerscore} / ${progress.totalGamerscore} G` : ''}
            </div>
          </div>
          <div className="ach-percent">{percent}%</div>
        </div>
        <ProgressBar percent={percent} />
        {all.length > 0 && (
          <div className="row ach-filter">
            {(['all', 'unlocked', 'locked'] as const).map(k => (
              <button key={k} className={`chip ${show === k ? 'active' : ''}`} data-nav aria-pressed={show === k} onClick={() => setShow(k)}>
                {k === 'all' ? `All (${all.length})` : k === 'unlocked' ? `Unlocked (${earned.length})` : `Locked (${all.length - earned.length})`}
              </button>
            ))}
          </div>
        )}
        <div className="ach-list" ref={listRef}>
          {!data && !error && <div className="center fill"><Spinner /></div>}
          {error && <p className="error-text">Couldn't load achievements: {error}</p>}
          {data && all.length === 0 && <p className="muted">This game doesn't have achievements, or Xbox hasn't shared them.</p>}
          {shown.map((a, i) => <AchievementRow key={a.id} a={a} autofocus={i === 0} />)}
        </div>
      </div>
      <HintBar hints={[
        { glyph: 'Y', label: show === 'all' ? 'Show unlocked' : show === 'unlocked' ? 'Show locked' : 'Show all', onClick: cycle },
        { glyph: 'LB', label: 'Page up', onClick: () => page(-1) },
        { glyph: 'RB', label: 'Page down', onClick: () => page(1) },
        { glyph: 'B', label: 'Close', onClick: onClose },
      ]} />
    </div>
  )
}

function AchievementRow({ a, autofocus }: { a: Achievement; autofocus?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <button className={`ach ${a.unlocked ? 'unlocked' : 'locked'}`} data-nav data-autofocus={autofocus || undefined}>
      {a.iconUrl && !failed
        ? <img className="ach-icon" src={a.iconUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <span className="ach-icon ach-icon-blank" aria-hidden="true">{a.secret ? '?' : '🏆'}</span>}
      <span className="ach-text">
        <span className="ach-name">{a.name}</span>
        <span className="ach-desc">{a.description}</span>
        {a.progress !== undefined && <ProgressBar percent={a.progress} />}
        <span className="muted small">
          {a.unlocked ? `Unlocked${a.unlockedAt ? ` ${shortDate(a.unlockedAt)}` : ''}` : a.progress !== undefined ? `${a.progress}% done` : 'Locked'}
          {a.rarity !== undefined && <> · {a.rarity < 5 ? 'Rare: ' : ''}{a.rarity.toFixed(a.rarity < 10 ? 1 : 0)}% of players</>}
        </span>
      </span>
      <span className="ach-gs">{a.gamerscore} G</span>
    </button>
  )
}

function shortDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2001) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000)
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
