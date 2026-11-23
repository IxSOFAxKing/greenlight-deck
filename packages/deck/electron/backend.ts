// Main-process backend: wraps @greenlight/platform (auth, consoles, catalog)
// and @greenlight/player/server (xHome/xCloud session signalling).
// All tokens stay in the main process; the renderer only gets opaque handles.

import { appRouter, createCallerFactory } from '@greenlight/platform'
import XboxApiClient from 'xbox-webapi'
import { randomUUID } from 'node:crypto'
import type {
  AuthState, CloudTitle, DeviceCodePrompt, Profile, Resolution, Settings,
  StreamKind, StreamStartResult, StreamStatus, XboxConsole,
} from '../shared/api'
import { defaultSettings } from '../shared/api'
import { Store } from './store'

const caller = createCallerFactory(appRouter)({})

interface UserToken {
  token_type: string
  scope: string
  expires_in: number
  ext_expires_in: number
  access_token: string
  refresh_token: string
  id_token: string
}

interface StreamToken { token: string; market: string; language: string; host?: string }

interface Session {
  kind: StreamKind
  token: StreamToken
  config: { id: string; type: StreamKind; language: string; host: string; resolution: Resolution }
  sessionPath: string
}

const TOKEN_MAX_AGE_MS = 45 * 60 * 1000

function normalizeUserToken(raw: any): UserToken {
  const t = raw?.data ?? raw
  return {
    token_type: t.token_type ?? 'bearer',
    scope: t.scope ?? '',
    expires_in: Number(t.expires_in ?? 3600),
    ext_expires_in: Number(t.ext_expires_in ?? t.expires_in ?? 3600),
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    id_token: t.id_token ?? '',
  }
}

function language(): string {
  const loc = (Intl.DateTimeFormat().resolvedOptions().locale || 'en-US')
  return loc.includes('-') ? loc : `${loc}-US`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

export class Backend {
  private store: Store
  private onAuthChanged: (s: AuthState) => void

  private userToken: UserToken | undefined
  private webToken: { uhs: string; token: string } | undefined
  private xHome: StreamToken | undefined
  private xCloud: StreamToken | undefined
  private tokensFetchedAt = 0
  private refreshing: Promise<void> | undefined
  private profile: Profile | undefined
  private lastError: string | undefined

  private signInAttempt = 0
  private sessions = new Map<string, Session>()

  constructor(store: Store, onAuthChanged: (s: AuthState) => void) {
    this.store = store
    this.onAuthChanged = onAuthChanged
    const saved = store.get('userToken') as UserToken | undefined
    if (saved?.refresh_token) this.userToken = saved
  }

  // ---------- Auth ----------

  async getAuthState(): Promise<AuthState> {
    if (!this.userToken) return { signedIn: false, hasCloud: false, error: this.lastError }
    try {
      await this.ensureTokens()
      return { signedIn: true, profile: this.profile, hasCloud: !!this.xCloud?.token }
    } catch (err) {
      this.lastError = errorMessage(err)
      return { signedIn: false, hasCloud: false, error: 'Your session expired. Please sign in again.' }
    }
  }

  async startSignIn(): Promise<DeviceCodePrompt> {
    const attempt = ++this.signInAttempt
    const flow: any = await caller.auth_msal_start()

    // Poll in the background; the UI is told via onAuthChanged.
    ;(async () => {
      try {
        const token = await caller.auth_msal_verify(flow.device_code)
        if (attempt !== this.signInAttempt) return
        this.userToken = normalizeUserToken(token)
        this.store.set('userToken', this.userToken)
        this.tokensFetchedAt = 0
        this.lastError = undefined
        this.onAuthChanged(await this.getAuthState())
      } catch (err) {
        if (attempt !== this.signInAttempt) return
        this.lastError = 'Sign-in timed out or was cancelled. Try again.'
        this.onAuthChanged({ signedIn: false, hasCloud: false, error: this.lastError })
      }
    })()

    return {
      userCode: flow.user_code,
      verificationUri: flow.verification_uri,
      expiresIn: flow.expires_in,
    }
  }

  async cancelSignIn() {
    this.signInAttempt++
  }

  async signOut() {
    this.signInAttempt++
    this.userToken = undefined
    this.webToken = undefined
    this.xHome = undefined
    this.xCloud = undefined
    this.profile = undefined
    this.tokensFetchedAt = 0
    this.store.delete('userToken')
    this.onAuthChanged({ signedIn: false, hasCloud: false })
  }

  private ensureTokens(force = false): Promise<void> {
    if (!this.userToken) return Promise.reject(new Error('Not signed in'))
    if (!force && this.webToken && this.xHome && Date.now() - this.tokensFetchedAt < TOKEN_MAX_AGE_MS) {
      return Promise.resolve()
    }
    if (!this.refreshing) {
      this.refreshing = this.refreshTokens().finally(() => { this.refreshing = undefined })
    }
    return this.refreshing
  }

  private async refreshTokens() {
    // Always refresh the MSAL user token first so access tokens are fresh.
    const refreshed = normalizeUserToken(await caller.auth_msal_refresh(this.userToken!))
    if (!refreshed.refresh_token) refreshed.refresh_token = this.userToken!.refresh_token
    this.userToken = refreshed
    this.store.set('userToken', refreshed)

    const [web, streaming]: any[] = await Promise.all([
      caller.auth_get_webtoken(refreshed),
      caller.auth_get_streamingtokens(refreshed),
    ])

    this.webToken = {
      uhs: web.data?.DisplayClaims?.xui?.[0]?.uhs ?? '',
      token: web.data?.Token ?? '',
    }
    this.xHome = this.toStreamToken(streaming.xHomeToken)
    this.xCloud = streaming.xCloudToken ? this.toStreamToken(streaming.xCloudToken) : undefined
    this.tokensFetchedAt = Date.now()

    try {
      this.profile = await this.fetchProfile()
    } catch {
      this.profile = undefined
    }
  }

  private toStreamToken(t: any): StreamToken {
    const data = t?.data ?? t
    const regions: any[] = data?.offeringSettings?.regions ?? []
    const region = regions.find(r => r.isDefault) ?? regions[0]
    return {
      token: data?.gsToken ?? '',
      market: data?.market ?? 'US',
      language: language(),
      host: region?.baseUri,
    }
  }

  private async fetchProfile(): Promise<Profile> {
    const res: any = await caller.profile_get_current(this.webToken!)
    const settings: Array<{ id: string; value: string }> = res?.data?.profileUsers?.[0]?.settings ?? res?.profileUsers?.[0]?.settings ?? []
    const get = (id: string) => settings.find(s => s.id === id)?.value
    return {
      gamertag: get('Gamertag') ?? get('GameDisplayName') ?? 'Xbox player',
      avatarUrl: get('GameDisplayPicRaw'),
      gamerscore: get('Gamerscore'),
    }
  }

  // ---------- Settings ----------

  getSettings(): Settings {
    return { ...defaultSettings, ...(this.store.get('settings') as Partial<Settings> | undefined) }
  }

  saveSettings(settings: Settings): Settings {
    const merged = { ...defaultSettings, ...settings }
    this.store.set('settings', merged)
    return merged
  }

  // ---------- Consoles ----------

  async listConsoles(): Promise<XboxConsole[]> {
    await this.ensureTokens()
    const res: any = await caller.smartglass_consoles_list(this.webToken!)
    const list: any[] = res?.data?.result ?? res?.result ?? []
    return list.map(c => ({
      id: c.id,
      name: c.name,
      consoleType: c.consoleType,
      powerState: c.powerState,
      remoteManagementEnabled: c.remoteManagementEnabled,
      consoleStreamingEnabled: c.consoleStreamingEnabled,
    }))
  }

  async wakeConsole(id: string) {
    await this.ensureTokens()
    const Client = ((XboxApiClient as any).default ?? XboxApiClient) as any
    const client = new Client({ uhs: this.webToken!.uhs, token: this.webToken!.token })
    await client.providers.smartglass.powerOn(id)
  }

  // ---------- Cloud library ----------

  async listCloudTitles(): Promise<CloudTitle[]> {
    await this.ensureTokens()
    if (!this.xCloud?.token) return []
    const tok = { token: this.xCloud.token, market: this.xCloud.market, language: this.xCloud.language }

    const [all, recent]: any[] = await Promise.all([
      caller.gamepass_get_titles(tok).catch(() => undefined),
      caller.gamepass_get_recent_titles(tok).catch(() => undefined),
    ])
    const allResults: any[] = all?.data?.results ?? []
    const recentResults: any[] = recent?.data?.results ?? []
    const recentIds = new Set(recentResults.map(r => r.titleId))

    const byTitle = new Map<string, CloudTitle>()
    for (const r of [...recentResults, ...allResults]) {
      if (!r?.titleId || byTitle.has(r.titleId)) continue
      byTitle.set(r.titleId, {
        titleId: r.titleId,
        productId: r.details?.productId,
        name: r.details?.name ?? r.titleId,
        recent: recentIds.has(r.titleId),
      })
    }

    const productIds = [...byTitle.values()].map(t => t.productId).filter((p): p is string => !!p)
    const catalog: Record<string, any> = {}
    for (let i = 0; i < productIds.length; i += 100) {
      try {
        const res: any = await caller.gamepass_batch_productids({ token: tok, productIds: productIds.slice(i, i + 100) })
        Object.assign(catalog, res?.data?.Products ?? {})
      } catch { /* catalog is best effort */ }
    }

    const url = (u?: string) => u ? (u.startsWith('//') ? `https:${u}` : u) : undefined
    const strings = (v: unknown): string[] => Array.isArray(v)
      ? v.map(x => typeof x === 'string' ? x : (x?.LocalizedName ?? x?.Name ?? '')).filter(Boolean)
      : typeof v === 'string' && v ? [v] : []

    const titles = [...byTitle.values()].map(t => {
      const c = t.productId ? catalog[t.productId] : undefined
      return {
        ...t,
        name: c?.ProductTitle ?? t.name,
        publisher: c?.PublisherName,
        imageUrl: url(c?.Image_Tile?.URL ?? c?.Image_Poster?.URL),
        posterUrl: url(c?.Image_Poster?.URL),
        heroUrl: url(c?.Image_Hero?.URL ?? c?.Image_Poster?.URL),
        description: c?.ProductDescriptionShort ?? c?.ProductDescription,
        genres: [...new Set(strings(c?.Categories ?? c?.LocalizedCategories ?? c?.Category))].slice(0, 4),
        features: strings(c?.Attributes).slice(0, 6),
      }
    })

    return titles.sort((a, b) =>
      Number(!!b.recent) - Number(!!a.recent) || a.name.localeCompare(b.name))
  }

  async cloudWaitTime(titleId: string): Promise<number | null> {
    await this.ensureTokens()
    if (!this.xCloud?.token || !this.xCloud.host) return null
    try {
      const res = await fetch(`${this.xCloud.host}/v1/waittime/${encodeURIComponent(titleId)}`, {
        headers: { Authorization: `Bearer ${this.xCloud.token}`, 'X-Gssv-Client': 'XboxComBrowser' },
      })
      if (!res.ok) return null
      const data: any = await res.json()
      const secs = data?.estimatedTotalWaitTimeInSeconds ?? data?.estimatedProvisioningTimeInSeconds
      return typeof secs === 'number' ? secs : null
    } catch {
      return null
    }
  }

  // ---------- Streaming ----------

  async streamStart(kind: StreamKind, id: string, resolution: Resolution): Promise<StreamStartResult> {
    await this.ensureTokens()
    const token = kind === 'home' ? this.xHome : this.xCloud
    if (!token?.token) throw new Error(kind === 'cloud' ? 'Cloud gaming is not available on this account.' : 'Remote play token missing.')

    const host = token.host ?? (kind === 'home'
      ? 'https://uks.core.gssv-play-prodxhome.xboxlive.com'
      : 'https://uks.core.gssv-play-prod.xboxlive.com')

    const config = { id, type: kind, language: token.language, host, resolution }
    const tok = { token: token.token, market: token.market, language: token.language }
    const res: any = await caller.streaming_start_stream({ token: tok, xCloudStreamConfig: config })
    if (!res?.sessionPath) throw new Error(`Could not start a stream: ${errorMessage(res?.error ?? res)}`)

    const handle = randomUUID()
    this.sessions.set(handle, { kind, token: tok, config, sessionPath: res.sessionPath })
    return { handle, sessionPath: res.sessionPath }
  }

  private session(handle: string): Session {
    const s = this.sessions.get(handle)
    if (!s) throw new Error('Stream session not found')
    return s
  }

  private base(handle: string) {
    const s = this.session(handle)
    return { token: s.token, xCloudStreamConfig: s.config, sessionPath: s.sessionPath }
  }

  async streamStatus(handle: string): Promise<StreamStatus> {
    const res: any = await caller.streaming_get_status(this.base(handle))
    return {
      state: res?.state ?? 'Unknown',
      errorDetails: res?.errorDetails ?? null,
      estimatedTotalWaitTimeInSeconds: res?.estimatedTotalWaitTimeInSeconds,
    }
  }

  async streamSdp(handle: string, offer: RTCSessionDescriptionInit) {
    return await caller.streaming_send_sdp_offer({ ...this.base(handle), sdpOffer: offer }) as any
  }

  async streamIce(handle: string, candidates: string[]) {
    return await caller.streaming_send_ice_candidates({ ...this.base(handle), candidates }) as any
  }

  async streamMsal(handle: string) {
    await this.ensureTokens()
    await caller.streaming_send_msal_token({ ...this.base(handle), refreshToken: this.userToken!.refresh_token })
  }

  async streamKeepalive(handle: string) {
    await caller.streaming_send_keepalive(this.base(handle))
  }

  async streamStop(handle: string) {
    const s = this.sessions.get(handle)
    if (!s) return
    this.sessions.delete(handle)
    try {
      await fetch(`${s.config.host}/${s.sessionPath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${s.token.token}`,
          'X-Gssv-Client': 'XboxComBrowser',
        },
      })
    } catch { /* best effort: the session also expires on its own */ }
  }

  async stopAllStreams() {
    await Promise.all([...this.sessions.keys()].map(h => this.streamStop(h)))
  }
}
