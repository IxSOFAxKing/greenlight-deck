// Main-process backend: wraps @greenlight/platform (auth, consoles, catalog)
// and @greenlight/player/server (xHome/xCloud session signalling).
// All tokens stay in the main process; the renderer only gets opaque handles.

import { appRouter, createCallerFactory } from '@greenlight/platform'
import XboxApiClient from 'xbox-webapi'
import { randomUUID } from 'node:crypto'
import type {
  AccountSummary, AuthState, CloudLibrary, CloudTitle, DeviceCodePrompt, Profile, Resolution, Settings,
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

interface StoredAccount {
  /** Xbox user id once known; "pending-…" until the first token refresh. */
  id: string
  gamertag?: string
  avatarUrl?: string
  gamerscore?: string
  userToken: UserToken
  addedAt: number
}

interface Session {
  kind: StreamKind
  token: StreamToken
  config: { id: string; type: StreamKind; language: string; host: string; resolution: Resolution }
  sessionPath: string
}

const TOKEN_MAX_AGE_MS = 45 * 60 * 1000
/** Cloud library cache counts as fresh for this long; older caches show instantly, then refresh. */
const CLOUD_CACHE_FRESH_MS = 60 * 60 * 1000

/** Bump when the shape of cached titles changes, so old caches refresh. */
const CLOUD_CACHE_VERSION = 2

/**
 * Ask Microsoft's store image CDN for a right-sized image instead of the
 * multi-megabyte original. Only store-images supports these parameters; other
 * hosts get the original URL (the UI also falls back to it if a resized one fails).
 */
function sizedImage(u: string | undefined, w: number, h: number): string | undefined {
  if (!u) return undefined
  const url = u.startsWith('//') ? `https:${u}` : u
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'store-images.s-microsoft.com') {
      parsed.searchParams.set('w', String(w))
      parsed.searchParams.set('h', String(h))
      parsed.searchParams.set('q', '85')
      return parsed.toString()
    }
  } catch { /* fall through */ }
  return url
}

function absolute(u: string | undefined) {
  return u ? (u.startsWith('//') ? `https:${u}` : u) : undefined
}

/**
 * Catalog entries name their images in a few different ways (Image_Poster,
 * Image_BoxArt, an Images array with ImagePurpose…). Try each purpose in order.
 */
function pickImage(c: any, purposes: string[]): string | undefined {
  if (!c) return undefined
  for (const purpose of purposes) {
    const v = c[`Image_${purpose}`]
    const u = typeof v === 'string' ? v : v?.URL ?? v?.Uri ?? v?.url
    if (u) return absolute(u)
  }
  const arrays = [c.Images, c.LocalizedProperties?.[0]?.Images, c.images].filter(Array.isArray) as any[][]
  for (const purpose of purposes) {
    for (const arr of arrays) {
      const m = arr.find(i => String(i?.ImagePurpose ?? i?.Purpose ?? i?.purpose ?? '').toLowerCase() === purpose.toLowerCase())
      const u = m?.Uri ?? m?.URL ?? m?.url
      if (u) return absolute(u)
    }
  }
  return undefined
}

const POSTER_PURPOSES = ['Poster', 'BoxArt', 'Tile', 'FeaturePromotionalSquareArt', 'BrandedKeyArt']
const SQUARE_PURPOSES = ['Tile', 'BoxArt', 'FeaturePromotionalSquareArt', 'Poster']
const HERO_PURPOSES = ['SuperHeroArt', 'Hero', 'TitledHeroArt', 'BrandedKeyArt', 'Screenshot', 'Poster']
const LOGO_PURPOSES = ['Logo', 'TitleLogo', 'ProductLogo']

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

  // Saved accounts (each with its own sign-in token) and which one is active.
  private accounts: StoredAccount[] = []
  private activeId: string | undefined

  private webToken: { uhs: string; token: string } | undefined
  private xHome: StreamToken | undefined
  private xCloud: StreamToken | undefined
  private xuid: string | undefined
  private tokensFetchedAt = 0
  private refreshing: Promise<void> | undefined
  private profile: Profile | undefined
  private lastError: string | undefined

  private cloudFetch: Promise<CloudLibrary> | undefined
  private signInAttempt = 0
  private sessions = new Map<string, Session>()

  constructor(store: Store, onAuthChanged: (s: AuthState) => void) {
    this.store = store
    this.onAuthChanged = onAuthChanged

    const saved = store.get('accounts') as { list?: StoredAccount[]; activeId?: string } | undefined
    this.accounts = (saved?.list ?? []).filter(a => a?.userToken?.refresh_token)
    this.activeId = saved?.activeId

    // Versions before 0.4 kept a single token: carry it over as the first account.
    const legacy = store.get('userToken') as UserToken | undefined
    if (legacy?.refresh_token && this.accounts.length === 0) {
      this.accounts.push({ id: `pending-${randomUUID()}`, userToken: legacy, addedAt: Date.now() })
      this.activeId = this.accounts[0].id
      this.saveAccounts()
      const legacyCache = store.get('cloudCache')
      if (legacyCache) store.set(`cloudCache:${this.activeId}`, legacyCache)
    }
    if (legacy) store.delete('userToken')
    store.delete('cloudCache')

    if (!this.accounts.some(a => a.id === this.activeId)) this.activeId = this.accounts[0]?.id
    const active = this.active()
    if (active?.gamertag) this.profile = { gamertag: active.gamertag, avatarUrl: active.avatarUrl, gamerscore: active.gamerscore }
  }

  // ---------- Accounts ----------

  private active(): StoredAccount | undefined {
    return this.accounts.find(a => a.id === this.activeId)
  }

  private saveAccounts() {
    this.store.set('accounts', { list: this.accounts, activeId: this.activeId })
  }

  private summaries(): AccountSummary[] {
    return this.accounts.map(a => ({
      id: a.id,
      gamertag: a.gamertag ?? 'Xbox account',
      avatarUrl: a.avatarUrl,
      gamerscore: a.gamerscore,
      active: a.id === this.activeId,
    }))
  }

  /** Forget the tokens of the account we were using (another one becomes active). */
  private resetSession() {
    this.signInAttempt++
    this.webToken = undefined
    this.xHome = undefined
    this.xCloud = undefined
    this.xuid = undefined
    this.tokensFetchedAt = 0
    this.refreshing = undefined
    this.cloudFetch = undefined
    const a = this.active()
    this.profile = a?.gamertag ? { gamertag: a.gamertag, avatarUrl: a.avatarUrl, gamerscore: a.gamerscore } : undefined
  }

  async switchAccount(id: string): Promise<AuthState> {
    if (!this.accounts.some(a => a.id === id)) throw new Error('That account is no longer saved.')
    if (id !== this.activeId) {
      await this.stopAllStreams()
      this.activeId = id
      this.saveAccounts()
      this.resetSession()
      console.info(`[accounts] switched to ${this.active()?.gamertag ?? id}`)
    }
    const state = await this.getAuthState()
    this.onAuthChanged(state)
    if (state.signedIn) this.prefetchCloud()
    return state
  }

  async removeAccount(id: string): Promise<AuthState> {
    const wasActive = id === this.activeId
    const removed = this.accounts.find(a => a.id === id)
    this.accounts = this.accounts.filter(a => a.id !== id)
    this.store.delete(`cloudCache:${id}`)
    if (wasActive) {
      await this.stopAllStreams()
      this.activeId = this.accounts[0]?.id
      this.resetSession()
    }
    this.saveAccounts()
    console.info(`[accounts] removed ${removed?.gamertag ?? id}`)
    const state = await this.getAuthState()
    this.onAuthChanged(state)
    return state
  }

  // ---------- Auth ----------

  async getAuthState(): Promise<AuthState> {
    const accounts = this.summaries()
    if (!this.active()) return { signedIn: false, hasCloud: false, error: this.lastError, accounts }
    try {
      await this.ensureTokens()
      return { signedIn: true, profile: this.profile, hasCloud: !!this.xCloud?.token, accounts: this.summaries(), activeAccountId: this.activeId }
    } catch (err) {
      this.lastError = errorMessage(err)
      console.warn('[accounts] token refresh failed:', this.lastError)
      if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(this.lastError)) {
        return {
          signedIn: false, hasCloud: false, accounts, activeAccountId: this.activeId, offline: true,
          error: "Can't reach Xbox services. Check that your Deck is online, then try again.",
        }
      }
      return {
        signedIn: false, hasCloud: false, accounts, activeAccountId: this.activeId, expired: true,
        error: `${this.active()?.gamertag ?? 'This account'}'s sign-in expired. Sign in again, or pick another profile.`,
      }
    }
  }

  /** Start a device-code sign-in. Signing in to a new account adds it; an existing one is updated. */
  async startSignIn(): Promise<DeviceCodePrompt> {
    const attempt = ++this.signInAttempt
    const flow: any = await caller.auth_msal_start()

    // Poll in the background; the UI is told via onAuthChanged.
    ;(async () => {
      const previousActive = this.activeId
      try {
        const token = await caller.auth_msal_verify(flow.device_code)
        if (attempt !== this.signInAttempt) return
        const pending: StoredAccount = { id: `pending-${randomUUID()}`, userToken: normalizeUserToken(token), addedAt: Date.now() }
        this.accounts.push(pending)
        this.activeId = pending.id
        this.resetSession()
        this.signInAttempt = attempt // resetSession bumps it; keep this sign-in current
        this.lastError = undefined
        try {
          await this.ensureTokens() // learns the Xbox user id and merges duplicates
        } catch (err) {
          this.accounts = this.accounts.filter(a => a.id !== pending.id)
          this.activeId = previousActive
          this.resetSession()
          throw err
        }
        this.saveAccounts()
        this.onAuthChanged(await this.getAuthState())
        this.prefetchCloud()
      } catch (err) {
        if (attempt !== this.signInAttempt) return
        console.warn('[accounts] sign-in failed:', errorMessage(err))
        this.lastError = 'Sign-in timed out or was cancelled. Try again.'
        this.onAuthChanged({ ...(await this.getAuthState()), signInError: this.lastError })
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

  /** Sign out = remove the active account from this device. */
  async signOut() {
    if (this.activeId) await this.removeAccount(this.activeId)
  }

  private ensureTokens(force = false): Promise<void> {
    if (!this.active()) return Promise.reject(new Error('Not signed in'))
    if (!force && this.webToken && this.xHome && Date.now() - this.tokensFetchedAt < TOKEN_MAX_AGE_MS) {
      return Promise.resolve()
    }
    if (!this.refreshing) {
      const forAccount = this.activeId
      const run = this.refreshTokens(forAccount!).finally(() => { if (this.refreshing === run) this.refreshing = undefined })
      this.refreshing = run
    }
    return this.refreshing
  }

  private async refreshTokens(accountId: string) {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error('Not signed in')

    // Always refresh the MSAL user token first so access tokens are fresh.
    const refreshed = normalizeUserToken(await caller.auth_msal_refresh(account.userToken))
    if (!refreshed.refresh_token) refreshed.refresh_token = account.userToken.refresh_token
    account.userToken = refreshed

    const [web, streaming]: any[] = await Promise.all([
      caller.auth_get_webtoken(refreshed),
      caller.auth_get_streamingtokens(refreshed),
    ])
    // The user switched accounts while this was running: drop the result.
    if (this.activeId !== accountId) { this.saveAccounts(); return }

    const xui = web.data?.DisplayClaims?.xui?.[0] ?? {}
    this.webToken = { uhs: xui.uhs ?? '', token: web.data?.Token ?? '' }
    this.xuid = xui.xid
    this.xHome = this.toStreamToken(streaming.xHomeToken)
    this.xCloud = streaming.xCloudToken ? this.toStreamToken(streaming.xCloudToken) : undefined
    this.tokensFetchedAt = Date.now()

    try {
      this.profile = await this.fetchProfile()
    } catch {
      this.profile = this.profile ?? (xui.gtg ? { gamertag: xui.gtg } : undefined)
    }

    account.gamertag = this.profile?.gamertag ?? xui.gtg ?? account.gamertag
    account.avatarUrl = this.profile?.avatarUrl ?? account.avatarUrl
    account.gamerscore = this.profile?.gamerscore ?? account.gamerscore

    // Key the account by its Xbox user id. Signing in to an account that is
    // already saved replaces the old entry instead of adding a duplicate.
    if (this.xuid && account.id !== this.xuid) {
      const oldId = account.id
      const duplicate = this.accounts.find(a => a.id === this.xuid)
      if (duplicate) this.accounts = this.accounts.filter(a => a !== duplicate)
      account.id = this.xuid
      if (this.activeId === oldId) this.activeId = account.id
      const cache = this.store.get(`cloudCache:${oldId}`)
      if (cache) { this.store.set(`cloudCache:${account.id}`, cache); this.store.delete(`cloudCache:${oldId}`) }
    }
    this.saveAccounts()
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

  /**
   * Cloud library. Returns the on-disk cache straight away when there is one
   * (the UI then asks for a refresh in the background), otherwise fetches.
   */
  async listCloudTitles(refresh = false): Promise<CloudLibrary> {
    // (Signing out deletes the cache, so it always belongs to the current account.)
    const cached = this.store.get(this.cloudCacheKey()) as CloudLibrary | undefined
    if (!refresh && cached?.titles?.length) {
      // Caches from older versions lack newer fields (logos…): show them, but as stale.
      return cached.v === CLOUD_CACHE_VERSION ? cached : { ...cached, cachedAt: 0 }
    }
    if (!this.cloudFetch) {
      this.cloudFetch = this.fetchCloudTitles().finally(() => { this.cloudFetch = undefined })
    }
    return this.cloudFetch
  }

  /** Warm the cloud cache after sign-in so the Cloud tab opens instantly. */
  async prefetchCloud() {
    try {
      await this.ensureTokens()
      if (!this.xCloud?.token) return
      const cached = this.store.get(this.cloudCacheKey()) as CloudLibrary | undefined
      if (cached && cached.v === CLOUD_CACHE_VERSION && Date.now() - cached.cachedAt < CLOUD_CACHE_FRESH_MS) return
      await this.listCloudTitles(true)
    } catch (err) {
      console.warn('[cloud] prefetch failed:', errorMessage(err))
    }
  }

  private cloudCacheKey() {
    return `cloudCache:${this.activeId ?? 'none'}`
  }

  private async fetchCloudTitles(): Promise<CloudLibrary> {
    const t0 = Date.now()
    const forAccount = this.activeId
    await this.ensureTokens()
    if (!this.xCloud?.token) return { titles: [], cachedAt: Date.now() }
    const tok = { token: this.xCloud.token, market: this.xCloud.market, language: this.xCloud.language }
    // Use the region the token was issued for (Greenlight's helper is hard-wired to Western Europe).
    const host = this.xCloud.host ?? 'https://weu.core.gssv-play-prod.xboxlive.com'
    const gssv = async (path: string) => {
      const res = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${tok.token}`, 'X-Gssv-Client': 'XboxComBrowser' } })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
      return res.json() as Promise<any>
    }

    const [all, recent] = await Promise.all([
      gssv('/v2/titles').catch((e) => { console.warn('[cloud] titles failed:', errorMessage(e)); return undefined }),
      gssv('/v2/titles/mru?mr=25').catch(() => undefined),
    ])
    const allResults: any[] = all?.results ?? []
    const recentResults: any[] = recent?.results ?? []
    const recentIds = new Set(recentResults.map(r => r.titleId))
    const t1 = Date.now()

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

    // Look up names/art for all games at once (batches in parallel, not one after another).
    const productIds = [...byTitle.values()].map(t => t.productId).filter((p): p is string => !!p)
    const batches: string[][] = []
    for (let i = 0; i < productIds.length; i += 100) batches.push(productIds.slice(i, i + 100))
    const catalog: Record<string, any> = {}
    await Promise.all(batches.map(async (ids) => {
      try {
        const res: any = await caller.gamepass_batch_productids({ token: tok, productIds: ids })
        Object.assign(catalog, res?.data?.Products ?? {})
      } catch (e) {
        console.warn('[cloud] catalog batch failed:', errorMessage(e))
      }
    }))
    const t2 = Date.now()

    const strings = (v: unknown): string[] => Array.isArray(v)
      ? v.map(x => typeof x === 'string' ? x : (x?.LocalizedName ?? x?.Name ?? '')).filter(Boolean)
      : typeof v === 'string' && v ? [v] : []

    let missingArt = 0
    let sampleKeys: string | undefined
    const titles = [...byTitle.values()].map(t => {
      const c = t.productId ? catalog[t.productId] : undefined
      const poster = pickImage(c, POSTER_PURPOSES)
      const square = pickImage(c, SQUARE_PURPOSES)
      const hero = pickImage(c, HERO_PURPOSES)
      const logo = pickImage(c, LOGO_PURPOSES)
      if (!poster && !square) {
        missingArt++
        if (!sampleKeys) sampleKeys = c ? `${t.name}: ${Object.keys(c).filter(k => /image/i.test(k)).join(', ') || 'no image fields'}` : `${t.name}: no catalog entry`
      }
      return {
        ...t,
        name: c?.ProductTitle ?? t.name,
        publisher: c?.PublisherName,
        imageUrl: sizedImage(square ?? poster, 300, 300),
        posterUrl: sizedImage(poster ?? square, 360, 540),
        posterOriginalUrl: poster ?? square,
        heroUrl: sizedImage(hero, 1600, 900),
        logoUrl: sizedImage(logo, 800, 400),
        description: c?.ProductDescriptionShort ?? c?.ProductDescription,
        genres: [...new Set(strings(c?.Categories ?? c?.LocalizedCategories ?? c?.Category))].slice(0, 4),
        features: strings(c?.Attributes).slice(0, 6),
      }
    }).sort((a, b) => Number(!!b.recent) - Number(!!a.recent) || a.name.localeCompare(b.name))
    if (missingArt) console.info(`[cloud] ${missingArt} title(s) without box art. Example: ${sampleKeys}`)

    const library: CloudLibrary = { titles, cachedAt: Date.now(), account: this.profile?.gamertag, v: CLOUD_CACHE_VERSION }
    if (titles.length && this.activeId === forAccount) this.store.set(this.cloudCacheKey(), library)
    console.info(`[cloud] ${titles.length} titles from ${new URL(host).hostname}: list ${t1 - t0}ms, details ${t2 - t1}ms (${batches.length} batches), total ${Date.now() - t0}ms`)
    return library
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
    await caller.streaming_send_msal_token({ ...this.base(handle), refreshToken: this.active()!.userToken.refresh_token })
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
