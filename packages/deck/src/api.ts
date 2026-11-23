import type { AuthState, DeckApi, DeckApiMethod, DeckBridge, UpdateStatus } from '../shared/api'
import { createMockBridge } from './mock'

declare global {
  interface Window { deck?: DeckBridge }
}

// Outside Electron (browser UI preview) we run against mock data.
const bridge: DeckBridge = window.deck ?? createMockBridge()

export const isMock = !window.deck

export function call<M extends DeckApiMethod>(method: M, ...args: Parameters<DeckApi[M]>): ReturnType<DeckApi[M]> {
  return bridge.call(method, ...args)
}

export function onAuthChanged(cb: (s: AuthState) => void) {
  return bridge.onAuthChanged(cb)
}

export function onUpdateStatus(cb: (s: UpdateStatus) => void) {
  return bridge.onUpdateStatus(cb)
}

/** Write a line to the app's debug log (Settings → Debug log). */
export function log(level: 'debug' | 'info' | 'warn' | 'error', source: 'ui' | 'stream', ...parts: unknown[]) {
  let msg = parts.map(p => p instanceof Error ? (p.stack ?? p.message) : typeof p === 'string' ? p : safeJson(p)).join(' ')
  // Connection descriptions (SDP) are huge and rarely useful in a pasted log.
  if (msg.startsWith('[SDP]') && msg.length > 240) msg = `${msg.slice(0, 240)}… (${msg.length} chars)`
  try { bridge.log(level, source, msg) } catch { /* never let logging break the UI */ }
}

function safeJson(v: unknown) {
  try { return JSON.stringify(v) } catch { return String(v) }
}

// Mirror renderer warnings/errors (and the streaming core's console output) into the debug log.
if (!isMock) {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      log(level === 'log' ? 'info' : level, 'ui', ...args)
    }
  }
  window.addEventListener('error', (e) => log('error', 'ui', `Uncaught: ${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => log('error', 'ui', 'Unhandled rejection:', e.reason))
}
