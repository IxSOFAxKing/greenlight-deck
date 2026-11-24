import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Backend } from './backend'
import { Store } from './store'
import { Updater } from './updater'
import { logger } from './logger'
import type { DeckApiMethod } from '../shared/api'

const args = process.argv.slice(1)
const windowed = args.includes('--windowed')
const devUrl = process.env.DECK_DEV_URL

function isSteamDeck(): boolean {
  if (process.env.SteamDeck === '1') return true
  try {
    return fs.readFileSync('/sys/devices/virtual/dmi/id/board_vendor', 'utf8').trim() === 'Valve'
  } catch {
    return false
  }
}

// Chromium flags: hardware video decode on the Deck's AMD APU (VA-API), let
// audio autoplay without a click, and keep running smoothly in the background.
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
// --vulkan renders through Vulkan instead of OpenGL, so Vulkan layers such as
// lsfg-vk (Lossless Scaling frame generation) can hook the window. Experimental.
const useVulkan = args.includes('--vulkan') || process.env.DECK_VULKAN === '1'
const features = [
  'VaapiVideoDecoder',
  'VaapiVideoDecodeLinuxGL',
  'VaapiIgnoreDriverChecks',
  'AcceleratedVideoDecodeLinuxGL',
  'AcceleratedVideoDecodeLinuxZeroCopyGL',
]
if (useVulkan) {
  features.push('Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan')
  app.commandLine.appendSwitch('use-angle', 'vulkan')
}
app.commandLine.appendSwitch('enable-features', features.join(','))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
if (args.includes('--webgpu')) app.commandLine.appendSwitch('enable-unsafe-webgpu')

app.setName('Greenlight Deck')

function friendly(message: string): string {
  const host = message.match(/"hostname":"([^"]+)"/)?.[1]
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH/.test(message)) return `Can't reach ${host ?? 'Xbox services'}. Check that your handheld is online.`
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/.test(message)) return `The connection to ${host ?? 'Xbox services'} failed. Try again in a moment.`
  return message
}

let win: BrowserWindow | undefined
let backend: Backend
let updater: Updater

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    fullscreen: !windowed,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'Greenlight Deck',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  win.setMenuBarVisibility(false)

  // Never navigate the app window away; open real links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  // F11 toggles fullscreen, Ctrl+Q quits (handy in desktop mode).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') win?.setFullScreen(!win.isFullScreen())
    if (input.key.toLowerCase() === 'q' && input.control) app.quit()
  })

  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function logReport(): string {
  const s = backend.getSettings()
  const header = [
    `Greenlight Deck ${app.getVersion()} · Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`,
    `Platform: ${process.platform} ${process.arch}${isSteamDeck() ? ' (Steam Deck)' : ''} · AppImage: ${process.env.APPIMAGE ? 'yes' : 'no'} · Vulkan: ${useVulkan ? 'on' : 'off'}`,
    `Settings: ${JSON.stringify(s)}`,
    '',
  ]
  return header.join('\n') + logger.text()
}

app.whenReady().then(() => {
  logger.init()
  const store = new Store()
  backend = new Backend(store, (state) => win?.webContents.send('auth-changed', state))
  updater = new Updater((status) => win?.webContents.send('update-status', status))

  const api: Record<DeckApiMethod, (...a: any[]) => unknown> = {
    getAuthState: () => backend.getAuthState(),
    startSignIn: () => backend.startSignIn(),
    cancelSignIn: () => backend.cancelSignIn(),
    signOut: () => backend.signOut(),
    switchAccount: (id) => backend.switchAccount(id),
    removeAccount: (id) => backend.removeAccount(id),
    getSettings: () => backend.getSettings(),
    saveSettings: (s) => backend.saveSettings(s),
    listConsoles: () => backend.listConsoles(),
    wakeConsole: (id) => backend.wakeConsole(id),
    listCloudTitles: (refresh) => backend.listCloudTitles(!!refresh),
    cloudWaitTime: (id) => backend.cloudWaitTime(id),
    cloudTitleDetails: (id) => backend.cloudTitleDetails(id),
    streamStart: (kind, id, res) => backend.streamStart(kind, id, res),
    streamStatus: (h) => backend.streamStatus(h),
    streamSdp: (h, offer) => backend.streamSdp(h, offer),
    streamIce: (h, c) => backend.streamIce(h, c),
    streamMsal: (h) => backend.streamMsal(h),
    streamKeepalive: (h) => backend.streamKeepalive(h),
    streamStop: (h) => backend.streamStop(h),
    getUpdateStatus: () => updater.get(),
    checkForUpdates: () => updater.check(),
    downloadUpdate: () => updater.download(),
    installUpdate: () => updater.install(),
    getLogs: (limit) => ({ entries: logger.recent(limit ?? 400), file: logger.filePath() }),
    copyLogs: () => { const text = logReport(); clipboard.writeText(text); return text.split('\n').length },
    saveLogs: () => {
      const home = app.getPath('home')
      let dir = app.getPath('downloads')
      if (dir === home) dir = path.join(home, 'Downloads')
      const file = path.join(dir, `greenlight-deck-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, logReport())
      return file
    },
    clearLogs: () => logger.clear(),
    quit: async () => { await backend.stopAllStreams(); app.quit() },
    appInfo: () => ({ version: app.getVersion(), platform: process.platform, steamDeck: isSteamDeck() }),
  }

  ipcMain.on('deck-log', (_e, level, source, message) => {
    if (['debug', 'info', 'warn', 'error'].includes(level) && (source === 'ui' || source === 'stream')) {
      logger.add(level, source, String(message))
    }
  })

  ipcMain.handle('deck-api', async (_e, method: DeckApiMethod, callArgs: unknown[]) => {
    const fn = api[method]
    if (!fn) return { ok: false, error: `Unknown method ${method}` }
    try {
      return { ok: true, value: await fn(...(callArgs ?? [])) }
    } catch (err) {
      console.error(`[deck-api] ${method} failed:`, err instanceof Error ? err.message : err)
      return { ok: false, error: friendly(err instanceof Error ? err.message : String(err)) }
    }
  })

  createWindow()

  // Warm the cloud library cache in the background so the Cloud tab opens instantly.
  setTimeout(() => backend.prefetchCloud(), 5000)

  // Quietly look for an update shortly after launch.
  setTimeout(() => {
    if (backend.getSettings().autoUpdateCheck) updater.check()
  }, 8000)
})

app.on('before-quit', () => { backend?.stopAllStreams() })
app.on('window-all-closed', () => app.quit())
