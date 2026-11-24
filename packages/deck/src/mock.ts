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
    ...(params.get('consoles') === 'all' ? [
      { id: 'F4000ONEX01', name: "Kid's Room", consoleType: 'XboxOneX', powerState: 'ConnectedStandby', consoleStreamingEnabled: true },
      { id: 'F4000ONES01', name: 'Basement', consoleType: 'XboxOneS', powerState: 'Off', consoleStreamingEnabled: true },
      { id: 'F4000ONE001', name: 'Garage', consoleType: 'XboxOne', powerState: 'Off', consoleStreamingEnabled: true },
    ] : []),
  ]

  const names = ['Starfall Odyssey', 'Turbo Circuit', 'Hollow Keep', 'Neon Drift', 'Skyward Isles', 'Iron Tide',
    'Pixel Bakery', 'Frontier Echoes', 'Deep Signal', 'Moss & Stone', 'Glacier Run', 'Night Courier']
  const genres = [['Action', 'Adventure'], ['Racing'], ['Platformer'], ['Racing', 'Arcade'], ['Adventure'], ['Strategy'],
    ['Simulation'], ['Shooter', 'Action'], ['Puzzle'], ['Adventure', 'Puzzle'], ['Sports'], ['Action']]
  // ?many=1 previews a full-size library (~400 games) for scrolling tests.
  if (params.get('many')) for (let i = names.length; i < 400; i++) { names.push(`Sample Game ${i + 1}`); genres.push(['Action']) }
  const titles: CloudTitle[] = names.map((name, i) => ({
    titleId: `MOCK${i}`, productId: `PROD${i}`, name, recent: i < 4, publisher: 'Sample Studio', genres: genres[i],
    description: `${name} is a sample game used to preview the cloud library on your handheld.`,
    features: i % 2 ? ['Touch controls', 'Online multiplayer'] : ['4K Ultra HD'],
    ...mockArt(name, i),
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
    cloudTitleDetails: async (productId: string) => {
      await delay(500)
      const i = Number(productId.replace('PROD', ''))
      const t = titles[i]
      if (!t || i === 5) return null
      const shot = (n: number) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="hsl(${(i * 47 + n * 30) % 360},45%,${20 + n * 6}%)"/><circle cx="${400 + n * 300}" cy="420" r="260" fill="#fff" opacity=".12"/><text x="80" y="1000" font-family="sans-serif" font-size="64" fill="#fff" opacity=".6">Screenshot ${n + 1}</text></svg>`)
      return {
        productId, title: t.name, publisher: 'Sample Studio', developer: 'Sample Devs',
        description: `${t.name} is a sample game used to preview the cloud library on your handheld.\n\nRace down procedurally generated slopes, build your reputation, and team up with friends online. Every run is different, and every bail counts. This longer description shows how the About panel handles several paragraphs of text from the store.`,
        releaseDate: '2019-05-07T00:00:00Z', genres: t.genres, ageRating: i % 3 === 0 ? 'E' : 'T', ageRatingSystem: 'ESRB',
        userRating: { average: 4.6 - (i % 4) * 0.3, count: 2310 - i * 100 }, maxPlayers: i % 2 ? 8 : undefined,
        capabilities: ['Single player', 'Online co-op (2-8)', 'Online multiplayer (2-8)', '4K Ultra HD', 'HDR10', '120 fps', 'Cloud saves', 'Achievements'],
        screenshots: [0, 1, 2, 3, 4].map(shot),
      }
    },
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

// Sample artwork for preview mode. Title 0 has everything, 1 has no logo,
// 2 has no art at all, 3 has a broken poster link (exercises the fallbacks).
function svgUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function mockArt(name: string, i: number): Partial<CloudTitle> {
  if (i === 2 || i >= 12) return {}
  const hue = (i * 47) % 360
  const poster = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,12%)"/></linearGradient></defs>
    <rect width="360" height="540" fill="url(#g)"/><circle cx="250" cy="170" r="110" fill="hsl(${(hue + 180) % 360},70%,60%)" opacity=".35"/>
    <path d="M0 420 L120 300 L210 380 L300 290 L360 340 L360 540 L0 540 Z" fill="#000" opacity=".45"/>
    <text x="24" y="500" font-family="sans-serif" font-weight="800" font-size="34" fill="#fff">${name}</text></svg>`)
  const hero = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},50%,22%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},65%,40%)"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#h)"/><circle cx="1180" cy="330" r="260" fill="hsl(${(hue + 180) % 360},80%,65%)" opacity=".3"/>
    <path d="M0 700 L380 420 L700 640 L1050 380 L1600 620 L1600 900 L0 900 Z" fill="#000" opacity=".4"/></svg>`)
  const logo = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240">
    <text x="0" y="150" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="112" fill="#fff" stroke="hsl(${hue},80%,60%)" stroke-width="4">${name.split(' ')[0].toUpperCase()}</text>
    <text x="8" y="215" font-family="sans-serif" font-weight="700" font-size="44" letter-spacing="18" fill="hsl(${hue},85%,70%)">${(name.split(' ')[1] ?? '').toUpperCase()}</text></svg>`)
  return {
    posterUrl: i === 3 ? 'https://invalid.example/broken.jpg' : poster,
    posterOriginalUrl: poster,
    imageUrl: poster,
    heroUrl: hero,
    logoUrl: i === 1 ? undefined : logo,
  }
}
