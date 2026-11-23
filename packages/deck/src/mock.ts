// Mock backend used only when the UI runs in a plain browser (yarn preview:ui).
// Lets you design and test controller navigation without an Xbox account.
import type { AuthState, CloudTitle, DeckBridge, Settings, XboxConsole } from '../shared/api'
import { defaultSettings } from '../shared/api'

export function createMockBridge(): DeckBridge {
  const params = new URLSearchParams(location.search)
  let signedIn = params.get('mock') !== 'signedout'
  let settings: Settings = { ...defaultSettings }
  const authListeners = new Set<(s: AuthState) => void>()

  const auth = (): AuthState => signedIn
    ? { signedIn: true, hasCloud: true, profile: { gamertag: 'DeckPlayer42', gamerscore: '12840' } }
    : { signedIn: false, hasCloud: false }

  const consoles: XboxConsole[] = [
    { id: 'F4000ABCDEF', name: 'Living Room', consoleType: 'XboxSeriesX', powerState: 'ConnectedStandby', consoleStreamingEnabled: true },
    { id: 'F4000BEEF01', name: 'Office', consoleType: 'XboxSeriesS', powerState: 'On', consoleStreamingEnabled: true },
  ]

  const names = ['Starfall Odyssey', 'Turbo Circuit', 'Hollow Keep', 'Neon Drift', 'Skyward Isles', 'Iron Tide',
    'Pixel Bakery', 'Frontier Echoes', 'Deep Signal', 'Moss & Stone', 'Glacier Run', 'Night Courier']
  const titles: CloudTitle[] = names.map((name, i) => ({
    titleId: `MOCK${i}`, name, recent: i < 4, publisher: 'Sample Studio',
  }))

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  const impl: Record<string, (...a: any[]) => Promise<unknown>> = {
    getAuthState: async () => auth(),
    startSignIn: async () => {
      setTimeout(() => { if (params.get('mock') !== 'signedout') { signedIn = true; authListeners.forEach(l => l(auth())) } }, 4000)
      return { userCode: 'K7Q2-M9XD', verificationUri: 'https://www.microsoft.com/link', expiresIn: 900 }
    },
    cancelSignIn: async () => {},
    signOut: async () => { signedIn = false; authListeners.forEach(l => l(auth())) },
    getSettings: async () => settings,
    saveSettings: async (s: Settings) => (settings = s),
    listConsoles: async () => { await delay(400); return consoles },
    wakeConsole: async () => { await delay(300) },
    listCloudTitles: async () => { await delay(500); return titles },
    streamStart: async () => { await delay(800); return { handle: 'mock', sessionPath: 'v5/sessions/home/mock' } },
    streamStatus: async () => { await delay(500); return { state: 'Failed', errorDetails: { message: 'Mock mode: streaming needs the Electron app.' } } },
    streamSdp: async () => ({ exchangeResponse: null }),
    streamIce: async () => ({ exchangeResponse: null }),
    streamMsal: async () => {},
    streamKeepalive: async () => {},
    streamStop: async () => {},
    quit: async () => { window.close() },
    appInfo: async () => ({ version: '0.1.0-preview', platform: 'browser', steamDeck: false }),
  }

  return {
    call: ((method: string, ...args: unknown[]) => impl[method](...args)) as DeckBridge['call'],
    onAuthChanged(cb) { authListeners.add(cb); return () => { authListeners.delete(cb) } },
  }
}
