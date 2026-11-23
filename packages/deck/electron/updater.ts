// In-app updates from GitHub Releases (AppImage builds only).
// electron-updater downloads the new AppImage (differentially, using the
// .blockmap) and swaps it in place of the running file on restart.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/api'

export const UPDATE_REPO = { owner: 'IxSOFAxKing', repo: 'greenlight-deck' }

export class Updater {
  private status: UpdateStatus
  private onChange: (s: UpdateStatus) => void
  private supported: boolean

  constructor(onChange: (s: UpdateStatus) => void) {
    this.onChange = onChange
    // Only an AppImage launched as an AppImage can replace itself.
    this.supported = process.platform === 'linux' && !!process.env.APPIMAGE && app.isPackaged
    this.status = {
      state: this.supported ? 'idle' : 'unsupported',
      currentVersion: app.getVersion(),
    }
    if (!this.supported) return

    autoUpdater.setFeedURL({ provider: 'github', ...UPDATE_REPO, releaseType: 'release' })
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = console

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', error: undefined }))
    autoUpdater.on('update-available', (info) => this.set({
      state: 'available', version: info.version, notes: plainNotes(info.releaseNotes),
    }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'not-available' }))
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'downloaded', version: info.version, percent: 100 }))
    autoUpdater.on('error', (err) => this.set({ state: 'error', error: friendlyError(err) }))
  }

  get(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    if (!this.supported) return this.status
    if (this.status.state === 'downloading' || this.status.state === 'downloaded') return this.status
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.set({ state: 'error', error: friendlyError(err) })
    }
    return this.status
  }

  async download() {
    if (!this.supported || this.status.state !== 'available') return
    this.set({ state: 'downloading', percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.set({ state: 'error', error: friendlyError(err) })
    }
  }

  install() {
    if (this.status.state !== 'downloaded') return
    // isSilent=true, isForceRunAfter=true: replace the AppImage and relaunch.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }

  private set(patch: Partial<UpdateStatus>) {
    this.status = { ...this.status, ...patch }
    this.onChange(this.status)
  }
}

function plainNotes(notes: unknown): string | undefined {
  const text = Array.isArray(notes) ? notes.map((n: any) => n?.note ?? '').join('\n') : typeof notes === 'string' ? notes : ''
  const plain = text.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return plain ? plain.slice(0, 600) : undefined
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|EAI_AGAIN|net::ERR_INTERNET_DISCONNECTED|net::ERR_NAME_NOT_RESOLVED/.test(msg)) return "Can't reach GitHub. Check that your handheld is online."
  if (/404|latest-linux\.yml/.test(msg)) return 'No downloadable release was found on GitHub yet.'
  if (/EACCES|EPERM|read-only/i.test(msg)) return "The app file can't be replaced. Re-run install.sh to put it in ~/Applications."
  return msg.split('\n')[0].slice(0, 200)
}
