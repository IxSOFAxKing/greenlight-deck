// Types shared by the Electron main process and the renderer UI.

export type Resolution = 720 | 1080
export type RendererKind = 'video' | 'webgpu'
export type VideoFit = 'contain' | 'fill'

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
}

export const defaultSettings: Settings = {
  resolution: 720,
  renderer: 'video',
  videoFit: 'contain',
  showStats: false,
  vibration: true,
  autoWake: true,
  autoUpdateCheck: true,
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

export interface AuthState {
  signedIn: boolean
  profile?: Profile
  hasCloud: boolean
  error?: string
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

/** Methods the renderer may call on the main process (see electron/main.ts). */
export interface DeckApi {
  getAuthState(): Promise<AuthState>
  startSignIn(): Promise<DeviceCodePrompt>
  cancelSignIn(): Promise<void>
  signOut(): Promise<void>

  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>

  listConsoles(): Promise<XboxConsole[]>
  wakeConsole(id: string): Promise<void>
  listCloudTitles(): Promise<CloudTitle[]>

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

  quit(): Promise<void>
  appInfo(): Promise<{ version: string; platform: string; steamDeck: boolean }>
}

export type DeckApiMethod = keyof DeckApi

export interface DeckBridge {
  call<M extends DeckApiMethod>(method: M, ...args: Parameters<DeckApi[M]>): ReturnType<DeckApi[M]>
  onAuthChanged(callback: (state: AuthState) => void): () => void
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
}
