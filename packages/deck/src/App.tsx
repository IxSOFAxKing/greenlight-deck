import { useEffect, useState } from 'react'
import type { AuthState, StreamKind } from '../shared/api'
import { call, onAuthChanged } from './api'
import { Spinner } from './components/ui'
import { SignInScreen } from './screens/SignIn'
import { HomeScreen } from './screens/Home'
import { StreamScreen } from './screens/Stream'

export interface StreamTarget {
  kind: StreamKind
  id: string
  name: string
  wake?: boolean
}

export function App() {
  const [auth, setAuth] = useState<AuthState | undefined>()
  const [stream, setStream] = useState<StreamTarget | undefined>()

  useEffect(() => {
    call('getAuthState').then(setAuth).catch(err => setAuth({ signedIn: false, hasCloud: false, error: String(err) }))
    return onAuthChanged(setAuth)
  }, [])

  if (!auth) {
    return (
      <div className="screen center boot">
        <div className="brand-mark big">Greenlight<span>Deck</span></div>
        <Spinner />
      </div>
    )
  }

  if (!auth.signedIn) return <SignInScreen error={auth.error} />

  return (
    <>
      <HomeScreen auth={auth} onStream={setStream} hidden={!!stream} />
      {stream && <StreamScreen target={stream} onExit={() => setStream(undefined)} />}
    </>
  )
}
