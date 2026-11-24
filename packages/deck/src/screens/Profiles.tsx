import { useRef, useState } from 'react'
import type { AccountSummary } from '../../shared/api'
import { call } from '../api'
import { HintBar, Spinner } from '../components/ui'
import { useInputLayer } from '../input/layers'
import { useToast } from '../state'

interface Props {
  accounts: AccountSummary[]
  /** Full screen at launch ("Who's playing?"), or a modal over Home. */
  mode: 'launch' | 'modal'
  onDone: () => void
  onAddAccount: () => void
}

/** Pick, add or remove saved Xbox accounts. A = play as, Y = remove, B = close. */
export function ProfilePicker({ accounts, mode, onDone, onAddAccount }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<string | undefined>()
  const [confirmRemove, setConfirmRemove] = useState<AccountSummary | undefined>()
  const toast = useToast()

  const choose = async (a: AccountSummary) => {
    if (busy) return
    if (a.active) { onDone(); return }
    setBusy(a.id)
    try {
      const state = await call('switchAccount', a.id)
      if (state.signedIn) toast(`Playing as ${a.gamertag}`)
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  useInputLayer(ref, (action) => {
    if (action === 'back' && mode === 'modal') { onDone(); return true }
    if (action === 'back') return true
    if (action === 'y') {
      const id = (document.activeElement as HTMLElement | null)?.dataset.accountId
      const a = accounts.find(x => x.id === id)
      if (a) setConfirmRemove(a)
      return true
    }
    if (action === 'lb' || action === 'rb' || action === 'view') return true
  }, !confirmRemove)

  return (
    <div className={mode === 'modal' ? 'modal profiles' : 'screen profiles'} ref={ref} role="dialog" aria-label="Choose a profile">
      <div className="profiles-body">
        <h1>Who's playing?</h1>
        <div className="profile-cards" data-nav-group>
          {accounts.map((a, i) => (
            <button key={a.id} className={`profile-card ${a.active ? 'current' : ''}`} data-nav data-account-id={a.id}
              data-autofocus={(a.active || (i === 0 && !accounts.some(x => x.active))) || undefined} onClick={() => choose(a)}>
              <Avatar account={a} size={132} />
              <span className="profile-name">{a.gamertag}</span>
              <span className="muted small">{busy === a.id ? <><Spinner size={14} /> Signing in…</> : a.active ? 'Playing now' : a.gamerscore ? `${a.gamerscore} G` : ' '}</span>
            </button>
          ))}
          <button className="profile-card add" data-nav onClick={onAddAccount}>
            <span className="avatar add-avatar" style={{ width: 132, height: 132 }} aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span className="profile-name">Add account</span>
            <span className="muted small">Sign in with your phone</span>
          </button>
        </div>
        <p className="muted small">Each account stays signed in on this device. Switch any time from the home screen with the View button.</p>
      </div>

      {confirmRemove && (
        <ConfirmRemove account={confirmRemove} onCancel={() => setConfirmRemove(undefined)}
          onConfirm={async () => {
            const a = confirmRemove
            setConfirmRemove(undefined)
            const state = await call('removeAccount', a.id)
            toast(`Removed ${a.gamertag} from this device`)
            if (!state.accounts?.length) onDone()
          }} />
      )}

      <HintBar hints={[
        { glyph: 'A', label: 'Play as' },
        { glyph: 'Y', label: 'Remove' },
        ...(mode === 'modal' ? [{ glyph: 'B' as const, label: 'Close', onClick: onDone }] : []),
      ]} />
    </div>
  )
}

function ConfirmRemove({ account, onCancel, onConfirm }: { account: AccountSummary; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useInputLayer(ref, (a) => { if (a === 'back') { onCancel(); return true } })
  return (
    <div className="modal confirm" ref={ref} role="alertdialog" aria-label={`Remove ${account.gamertag}?`}>
      <div className="confirm-box">
        <Avatar account={account} size={72} />
        <h2>Remove {account.gamertag}?</h2>
        <p className="muted">This signs the account out on this device. You can add it again later with your phone.</p>
        <div className="row">
          <button className="btn" data-nav data-autofocus onClick={onCancel}>Keep</button>
          <button className="btn btn-danger" data-nav onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  )
}

export function Avatar({ account, size }: { account: { gamertag: string; avatarUrl?: string }; size: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (account.avatarUrl && !failed) {
    return <img className="avatar" src={account.avatarUrl} alt="" style={style} onError={() => setFailed(true)} />
  }
  return <span className="avatar avatar-letter" style={{ ...style, fontSize: size * 0.42 }} aria-hidden="true">{account.gamertag.slice(0, 1).toUpperCase()}</span>
}
