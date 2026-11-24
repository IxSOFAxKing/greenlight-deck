// Mock backend used only when the UI runs in a plain browser (yarn preview:ui).
// Lets you design and test controller navigation without an Xbox account.
import type { AccountSummary, AuthState, CloudTitle, DeckBridge, Settings, UpdateStatus, XboxConsole } from '../shared/api'
import { defaultSettings } from '../shared/api'

export function createMockBridge(): DeckBridge {
  const params = new URLSearchParams(location.search)
  let signedIn = params.get('mock') !== 'signedout'
  let settings: Settings = { ...defaultSettings }
  const authListeners = new Set<(s: AuthState) => void>()
  const updateListeners = new Set<(s: UpdateStatus) => void>()
  let update: UpdateStatus = { state: 'idle', currentVersion: '0.2.0' }
  const setUpdate = (patch: Partial<UpdateStatus>) => { update = { ...update, ...patch }; updateListeners.forEach(l => l(update)) }

  // ?accounts=N previews N saved profiles (default 1).
  const tags = ['DeckPlayer42', 'NightOwlKid', 'CouchCoop', 'SpeedRunSam']
  let accounts: Array<Omit<AccountSummary, 'active'>> = signedIn
    ? tags.slice(0, Math.max(1, Number(params.get('accounts') ?? 1))).map((g, i) => ({ id: `xuid-${i}`, gamertag: g, gamerscore: String(12840 - i * 3100) }))
    : []
  let activeId: string | undefined = accounts[0]?.id
  const summaries = (): AccountSummary[] => accounts.map(a => ({ ...a, active: a.id === activeId }))
  const auth = (): AuthState => {
    const a = accounts.find(x => x.id === activeId)
    return a
      ? { signedIn: true, hasCloud: true, profile: { gamertag: a.gamertag, gamerscore: a.gamerscore }, accounts: summaries(), activeAccountId: activeId }
      : { signedIn: false, hasCloud: false, accounts: summaries() }
  }
  const emit = () => authListeners.forEach(l => l(auth()))

  const consoles: XboxConsole[] = [
    { id: 'F4000ABCDEF', name: 'Living Room', consoleType: 'XboxSeriesX', powerState: 'ConnectedStandby', consoleStreamingEnabled: true },
    { id: 'F4000BEEF01', name: 'Office', consoleType: 'XboxSeriesS', powerState: 'On', consoleStreamingEnabled: true },
  ]

  const names = ['Starfall Odyssey', 'Turbo Circuit', 'Hollow Keep', 'Neon Drift', 'Skyward Isles', 'Iron Tide',
    'Pixel Bakery', 'Frontier Echoes', 'Deep Signal', 'Moss & Stone', 'Glacier Run', 'Night Courier']
  const genres = [['Action', 'Adventure'], ['Racing'], ['Platformer'], ['Racing', 'Arcade'], ['Adventure'], ['Strategy'],
    ['Simulation'], ['Shooter', 'Action'], ['Puzzle'], ['Adventure', 'Puzzle'], ['Sports'], ['Action']]
  // ?many=1 previews a full-size library (~400 games) for scrolling tests.
  if (params.get('many')) for (let i = names.length; i < 400; i++) { names.push(`Sample Game ${i + 1}`); genres.push(['Action']) }
  const titles: CloudTitle[] = names.map((name, i) => ({
    titleId: `MOCK${i}`, name, recent: i < 4, publisher: 'Sample Studio', genres: genres[i],
    description: `${name} is a sample game used to preview the cloud library on your handheld.`,
    features: i % 2 ? ['Touch controls', 'Online multiplayer'] : ['4K Ultra HD'],
  }))

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  const impl: Record<string, (...a: any[]) => Promise<unknown>> = {
    getAuthState: async () => auth(),
    startSignIn: async () => {
      setTimeout(() => {
        if (params.get('mock') === 'signedout' && !params.get('signin')) return
        const tag = tags[accounts.length] ?? `Player${accounts.length + 1}`
        accounts = [...accounts, { id: `xuid-${accounts.length}`, gamertag: tag, gamerscore: '420' }]
        activeId = accounts[accounts.length - 1].id
        signedIn = true
        emit()
      }, Number(params.get('signinDelay') ?? 4000))
      return { userCode: 'K7Q2-M9XD', verificationUri: 'https://www.microsoft.com/link', expiresIn: 900 }
    },
    cancelSignIn: async () => {},
    signOut: async () => { accounts = accounts.filter(a => a.id !== activeId); activeId = accounts[0]?.id; emit() },
    switchAccount: async (id: string) => { await delay(300); activeId = id; emit(); return auth() },
    removeAccount: async (id: string) => { accounts = accounts.filter(a => a.id !== id); if (activeId === id) activeId = accounts[0]?.id; emit(); return auth() },
    getSettings: async () => settings,
    saveSettings: async (s: Settings) => (settings = s),
    listConsoles: async () => { await delay(400); return consoles },
    wakeConsole: async () => { await delay(300) },
    listCloudTitles: async (refresh?: boolean) => { await delay(refresh ? 1200 : 300); return { titles, cachedAt: Date.now() - (refresh ? 0 : 3 * 3600_000) } },
    cloudWaitTime: async (id: string) => { await delay(400); return Number(id.replace('MOCK', '')) % 3 === 0 ? 0 : 95 },
    streamStart: async () => { await delay(800); return { handle: 'mock', sessionPath: 'v5/sessions/home/mock' } },
    streamStatus: async () => { await delay(500); return { state: 'Failed', errorDetails: { message: 'Mock mode: streaming needs the Electron app.' } } },
    streamSdp: async () => ({ exchangeResponse: null }),
    streamIce: async () => ({ exchangeResponse: null }),
    streamMsal: async () => {},
    streamKeepalive: async () => {},
    streamStop: async () => {},
    getUpdateStatus: async () => update,
    checkForUpdates: async () => {
      setUpdate({ state: 'checking' }); await delay(700)
      setUpdate({ state: 'available', version: '0.3.0', notes: 'Smoother menus and a faster connect.' })
      return update
    },
    downloadUpdate: async () => {
      for (let p = 0; p <= 100; p += 20) { setUpdate({ state: 'downloading', percent: p }); await delay(250) }
      setUpdate({ state: 'downloaded', percent: 100 })
    },
    installUpdate: async () => { location.reload() },
    getLogs: async () => ({ entries: Array.from({ length: 30 }, (_, i) => ({ t: Date.now() - (30 - i) * 4000, level: i % 9 === 0 ? 'warn' as const : 'info' as const, source: i % 3 ? 'stream' as const : 'main' as const, msg: `Sample log line ${i + 1}: ${i % 3 ? 'stream state Provisioning' : 'listConsoles ok (2 consoles)'}` })), file: '~/.config/Greenlight Deck/logs/greenlight-deck.log' }),
    copyLogs: async () => 30,
    saveLogs: async () => '~/Downloads/greenlight-deck-log.txt',
    clearLogs: async () => {},
    quit: async () => { window.close() },
    appInfo: async () => ({ version: '0.2.0-preview', platform: 'browser', steamDeck: false }),
  }

  return {
    call: ((method: string, ...args: unknown[]) => impl[method](...args)) as DeckBridge['call'],
    onAuthChanged(cb) { authListeners.add(cb); return () => { authListeners.delete(cb) } },
    log: (level, source, message) => { console.debug(`[${source}] ${level}: ${message}`) },
    onUpdateStatus(cb) { updateListeners.add(cb); return () => { updateListeners.delete(cb) } },
  }
}
