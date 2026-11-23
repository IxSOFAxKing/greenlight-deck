import { useEffect, useRef, useState } from 'react'
import QRCode from 'react-qr-code'
import type { DeviceCodePrompt } from '../../shared/api'
import { call } from '../api'
import { HintBar, Spinner } from '../components/ui'
import { useInputLayer } from '../input/layers'

export function SignInScreen({ error }: { error?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [prompt, setPrompt] = useState<DeviceCodePrompt | undefined>()
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | undefined>()

  const begin = async () => {
    setLoading(true)
    setLocalError(undefined)
    try {
      setPrompt(await call('startSignIn'))
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const cancel = () => {
    call('cancelSignIn')
    setPrompt(undefined)
  }

  // If sign-in fails in the background, the parent re-renders us with an error.
  useEffect(() => { if (error) setPrompt(undefined) }, [error])

  useInputLayer(ref, (action) => {
    if (action === 'back' && prompt) { cancel(); return true }
    if (action === 'menu') { call('quit'); return true }
  })

  const shownError = localError ?? error

  return (
    <div className="screen signin" ref={ref}>
      <div className="signin-hero">
        <div className="brand-mark big">Greenlight<span>Deck</span></div>
        <p className="lede">Play your Xbox from your handheld. Sign in with the Microsoft account you use on your console.</p>
        {shownError && <p className="error-text">{shownError}</p>}
      </div>

      {!prompt ? (
        <div className="signin-start">
          <button className="btn btn-primary btn-xl" data-nav data-autofocus onClick={begin} disabled={loading}>
            {loading ? <Spinner size={22} /> : 'Sign in'}
          </button>
          <button className="btn btn-ghost" data-nav onClick={() => call('quit')}>Quit</button>
        </div>
      ) : (
        <div className="signin-code">
          <div className="qr-card">
            <QRCode value={prompt.verificationUri} size={196} bgColor="#ffffff" fgColor="#0b0d10" />
          </div>
          <div className="code-steps">
            <ol>
              <li>On your phone, scan the code or go to <strong>{prompt.verificationUri.replace(/^https?:\/\//, '')}</strong></li>
              <li>Enter this code:</li>
            </ol>
            <div className="device-code">{prompt.userCode}</div>
            <p className="muted waiting"><Spinner size={18} /> Waiting for you to finish signing in…</p>
            <div className="row">
              <button className="btn" data-nav data-autofocus onClick={begin}>Get a new code</button>
              <button className="btn btn-ghost" data-nav onClick={cancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <HintBar hints={prompt
        ? [{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Cancel', onClick: cancel }]
        : [{ glyph: 'A', label: 'Select' }, { glyph: 'Menu', label: 'Quit', onClick: () => call('quit') }]} />
    </div>
  )
}
