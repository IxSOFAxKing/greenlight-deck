import { useEffect, useRef, useState } from 'react'
import type { LogLine } from '../../shared/api'
import { call } from '../api'
import { useInputLayer } from '../input/layers'
import { useToast } from '../state'
import { HintBar } from './ui'

/** Full-screen debug log viewer. D-pad up/down scrolls while the log is focused. */
export function LogViewer({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<LogLine[]>([])
  const [file, setFile] = useState<string | undefined>()
  const [errorsOnly, setErrorsOnly] = useState(false)
  const toast = useToast()

  const load = () => call('getLogs', 600).then(r => { setEntries(r.entries); setFile(r.file) }).catch(() => {})

  useEffect(() => { load() }, [])
  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [entries, errorsOnly])

  useInputLayer(ref, (action) => {
    if (action === 'back') { onClose(); return true }
    if (action === 'y') { load(); return true }
    const box = boxRef.current
    if (box && document.activeElement === box && (action === 'up' || action === 'down')) {
      // At the top edge, let "up" move focus out of the log as usual.
      if (action === 'up' && box.scrollTop <= 0) return false
      if (action === 'down' && box.scrollTop + box.clientHeight >= box.scrollHeight - 2) return false
      box.scrollBy({ top: action === 'up' ? -160 : 160, behavior: 'smooth' })
      return true
    }
  })

  const shown = errorsOnly ? entries.filter(e => e.level === 'warn' || e.level === 'error') : entries

  return (
    <div className="modal" ref={ref} role="dialog" aria-label="Debug log">
      <div className="modal-panel log-panel">
        <div className="log-head">
          <h2>Debug log</h2>
          <span className="muted small">{shown.length} lines{file ? ` · saved to ${file}` : ''}</span>
        </div>
        <div className="row log-actions">
          <button className="btn btn-primary" data-nav data-autofocus onClick={async () => {
            const n = await call('copyLogs'); toast(`Copied ${n} lines to the clipboard`)
          }}>Copy to clipboard</button>
          <button className="btn" data-nav onClick={async () => {
            const f = await call('saveLogs'); toast(`Saved to ${f.replace(/^.*\/(Downloads\/)/, '~/$1')}`)
          }}>Save to Downloads</button>
          <button className="btn" data-nav onClick={() => setErrorsOnly(v => !v)}>{errorsOnly ? 'Show everything' : 'Warnings & errors only'}</button>
          <button className="btn btn-ghost" data-nav onClick={async () => { await call('clearLogs'); load() }}>Clear</button>
        </div>
        <div className="log-box" ref={boxRef} tabIndex={0} data-nav aria-label="Log lines">
          {shown.length === 0 && <div className="muted">Nothing logged yet.</div>}
          {shown.map((e, i) => (
            <div key={i} className={`log-line ${e.level}`}>
              <span className="log-time">{new Date(e.t).toLocaleTimeString()}</span>
              <span className="log-src">{e.source}</span>
              <span className="log-msg">{e.msg}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Tokens and passwords are removed automatically, so it's safe to paste this into a GitHub issue or a chat.</p>
      </div>
      <HintBar hints={[{ glyph: 'A', label: 'Select' }, { glyph: 'Y', label: 'Refresh', onClick: load }, { glyph: 'B', label: 'Close', onClick: onClose }]} />
    </div>
  )
}
