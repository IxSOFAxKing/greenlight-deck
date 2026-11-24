// Types shared by the Electron main process and the renderer UI.

export type Resolution = 720 | 1080
export type RendererKind = 'video' | 'webgpu'
export type VideoFit = 'contain' | 'fill'
export type CodecProfile = 'auto' | 'high' | 'medium' | 'low'

export interface Settings {
  resolution: Resolution
  renderer: RendererKind
  videoFit: VideoFit
  showStats: boolean
  vibration: boolean
  /** Send a wake command to consoles in standby before starting a stream. */
  autoWake: boolean
  /** Look for a new version on GitHub when the app starts. */
  autoUpdateCheck: boolean
  /** With several accounts saved, ask who's playing when the app starts. */
  askProfileAtLaunch: boolean
  /** Cap on video bitrate in Mbps; 0 lets the Xbox decide. */
  maxBitrateMbps: number
  /** Preferred H.264 profile for the stream. */
  codecProfile: CodecProfile
  /** Rejoin automatically when the connection drops mid-game. */
  autoReconnect: boolean
}

export const defaultSettings: Settings = {
  resolution: 720,
  renderer: 'video',
  videoFit: 'contain',
  showStats: false,
  vibration: true,
  autoWake: true,
  autoUpdateCheck: true,
  askProfileAtLaunch: true,
  maxBitrateMbps: 0,
  codecProfile: 'auto',
  autoReconnect: true,
}

export type UpdateState =
  | 'idle' | 'checking' | 'available' | 'not-available'
  | 'downloading' | 'downloaded' | 'error' | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  version?: string
  percent?: number
  notes?: string
  error?: string
}

export interface Profile {
  gamertag: string
  avatarUrl?: string
  gamerscore?: string
}

export interface AccountSummary {
  id: string
  gamertag: string
  avatarUrl?: string
  gamerscore?: string
  active: boolean
}

export interface AuthState {
  signedIn: boolean
  profile?: Profile
  hasCloud: boolean
  error?: string
  /** Every account saved on this device. */
  accounts?: AccountSummary[]
  activeAccountId?: string
  /** The active account's saved sign-in no longer works. */
  expired?: boolean
  /** Couldn't reach Microsoft (offline); the saved sign-in is kept. */
  offline?: boolean
  /** A sign-in attempt (e.g. adding an account) failed or timed out. */
  signInError?: string
}

export interface DeviceCodePrompt {
  userCode: string
  verificationUri: string
  expiresIn: number
}

export interface XboxConsole {
  id: string
  name: string
  consoleType: string
  powerState: string
  remoteManagementEnabled?: boolean
  consoleStreamingEnabled?: boolean
}

export interface CloudTitle {
  titleId: string
  productId?: string
  name: string
  imageUrl?: string
  publisher?: string
  recent?: boolean
  posterUrl?: string
  /** Full-size poster, used if the resized one fails to load. */
  posterOriginalUrl?: string
  heroUrl?: string
  /** The game's title logo (transparent image), when the catalog has one. */
  logoUrl?: string
  description?: string
  genres?: string[]
  features?: string[]
}

export interface CloudLibrary {
  titles: CloudTitle[]
  /** When this list was fetched from Xbox (ms since epoch). */
  cachedAt: number
  account?: string
  v?: number
}

export type StreamKind = 'home' | 'cloud'

export interface StreamStartResult {
  handle: string
  sessionPath: string
}

export interface StreamStatus {
  state: string
  errorDetails?: { code?: string | null; message?: string | null } | null
  estimatedTotalWaitTimeInSeconds?: number
}

export interface LogLine {
  t: number
  level: 'debug' | 'info' | 'warn' | 'error'
  source: 'main' | 'ui' | 'stream'
  msg: string
}

/** Methods the renderer may call on the main process (see electron/main.ts). */
export interface DeckApi {
  getAuthState(): Promise<AuthState>
  startSignIn(): Promise<DeviceCodePrompt>
  cancelSignIn(): Promise<void>
  signOut(): Promise<void>
  switchAccount(id: string): Promise<AuthState>
  removeAccount(id: string): Promise<AuthState>

  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>

  listConsoles(): Promise<XboxConsole[]>
  wakeConsole(id: string): Promise<void>
  /** Cached library when available (fast); pass refresh to fetch it fresh. */
  listCloudTitles(refresh?: boolean): Promise<CloudLibrary>
  /** Estimated xCloud queue time in seconds, or null if unknown. */
  cloudWaitTime(titleId: string): Promise<number | null>

  streamStart(kind: StreamKind, id: string, resolution: Resolution): Promise<StreamStartResult>
  streamStatus(handle: string): Promise<StreamStatus>
  streamSdp(handle: string, offer: RTCSessionDescriptionInit): Promise<{ exchangeResponse: string | null; errorDetails?: unknown }>
  streamIce(handle: string, candidates: string[]): Promise<{ exchangeResponse: string | null }>
  streamMsal(handle: string): Promise<void>
  streamKeepalive(handle: string): Promise<void>
  streamStop(handle: string): Promise<void>

  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>

  getLogs(limit?: number): Promise<{ entries: LogLine[]; file?: string }>
  copyLogs(): Promise<number>
  saveLogs(): Promise<string>
  clearLogs(): Promise<void>

  quit(): Promise<void>
  appInfo(): Promise<{ version: string; platform: string; steamDeck: boolean }>
}

export type DeckApiMethod = keyof DeckApi

export interface DeckBridge {
  call<M extends DeckApiMethod>(method: M, ...args: Parameters<DeckApi[M]>): ReturnType<DeckApi[M]>
  onAuthChanged(callback: (state: AuthState) => void): () => void
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
  /** Fire-and-forget log line into the app's debug log. */
  log(level: LogLine['level'], source: 'ui' | 'stream', message: string): void
}
