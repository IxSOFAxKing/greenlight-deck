import { useEffect, useRef, useState } from 'react'
import type { AuthState, StreamKind } from '../shared/api'
import { call, onAuthChanged } from './api'
import { Spinner } from './components/ui'
import { SignInScreen } from './screens/SignIn'
import { HomeScreen } from './screens/Home'
import { StreamScreen } from './screens/Stream'
import { ProfilePicker } from './screens/Profiles'
import { useSettings } from './state'

export interface StreamTarget {
  kind: StreamKind
  id: string
  name: string
  wake?: boolean
}

export function App() {
  const [auth, setAuth] = useState<AuthState | undefined>()
  const [stream, setStream] = useState<StreamTarget | undefined>()
  const [picker, setPicker] = useState<'launch' | 'modal' | undefined>()
  const [adding, setAdding] = useState(false)
  const { settings, loaded } = useSettings()
  const askedAtLaunch = useRef(false)
  const addingFrom = useRef<{ count: number; active?: string } | undefined>(undefined)

  useEffect(() => {
    call('getAuthState').then(setAuth).catch(err => setAuth({ signedIn: false, hasCloud: false, error: String(err) }))
    return onAuthChanged(setAuth)
  }, [])

  // "Who's playing?" once at launch when several accounts are saved.
  useEffect(() => {
    if (!auth || !loaded || askedAtLaunch.current) return
    askedAtLaunch.current = true
    if ((auth.accounts?.length ?? 0) > 1 && settings.askProfileAtLaunch) setPicker('launch')
  }, [auth, loaded, settings.askProfileAtLaunch])

  // Close "Add account" once the new account is signed in.
  useEffect(() => {
    if (!adding || !auth || !addingFrom.current) return
    const added = (auth.accounts?.length ?? 0) > addingFrom.current.count || auth.activeAccountId !== addingFrom.current.active
    if (auth.signedIn && added) { setAdding(false); setPicker(undefined) }
  }, [auth, adding])

  const startAdding = () => {
    addingFrom.current = { count: auth?.accounts?.length ?? 0, active: auth?.activeAccountId }
    setAdding(true)
  }

  if (!auth) {
    return (
      <div className="screen center boot">
        <div className="brand-mark big">Greenlight<span>Deck</span></div>
        <Spinner />
      </div>
    )
  }

  const accounts = auth.accounts ?? []

  if (adding) {
    return <SignInScreen adding error={auth.signInError} onBack={() => { call('cancelSignIn'); setAdding(false) }} />
  }

  if (picker === 'launch' && accounts.length > 0) {
    return <ProfilePicker accounts={accounts} mode="launch" onDone={() => setPicker(undefined)} onAddAccount={startAdding} />
  }

  if (!auth.signedIn) {
    const others = accounts.filter(a => !a.active)
    return (
      <>
        <SignInScreen error={auth.signInError ?? auth.error}
          onOtherProfiles={others.length ? () => setPicker('modal') : undefined}
          onRetry={auth.offline ? () => call('getAuthState').then(setAuth) : undefined} />
        {picker === 'modal' && <ProfilePicker accounts={accounts} mode="modal" onDone={() => setPicker(undefined)} onAddAccount={startAdding} />}
      </>
    )
  }

  return (
    <>
      <HomeScreen key={auth.activeAccountId} auth={auth} onStream={setStream} hidden={!!stream} onProfiles={() => setPicker('modal')} />
      {stream && <StreamScreen target={stream} onExit={() => setStream(undefined)} />}
      {picker === 'modal' && !stream && <ProfilePicker accounts={accounts} mode="modal" onDone={() => setPicker(undefined)} onAddAccount={startAdding} />}
    </>
  )
}
