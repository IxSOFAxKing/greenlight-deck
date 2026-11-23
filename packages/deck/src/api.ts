import type { AuthState, DeckApi, DeckApiMethod, DeckBridge } from '../shared/api'
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
