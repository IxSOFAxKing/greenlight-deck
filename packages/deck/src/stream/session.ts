// Drives one xHome / xCloud stream: session request -> provisioning ->
// WebRTC SDP/ICE exchange -> playing. Signalling goes through the main
// process (which holds the tokens); media flows straight to Greenlight's player.

import xCloudPlayer from '@gl/player'
import Gamepad from '@gl/gamepad'
import { call } from '../api'
import type { RendererKind, Resolution, StreamKind } from '../../shared/api'

export type StreamPhase =
  | 'requesting'    // asking Xbox services for a session
  | 'queued'        // xCloud waiting for a server
  | 'provisioning'  // console/server getting ready
  | 'connecting'    // WebRTC handshake
  | 'playing'
  | 'error'
  | 'ended'

export interface StreamUpdate {
  phase: StreamPhase
  message?: string
  waitSeconds?: number
}

export interface StreamStats {
  width: number
  height: number
  fps: number
  rttMs: number
  codec: string
  local: boolean
  ipv6: boolean
}

export interface StreamOptions {
  kind: StreamKind
  id: string
  resolution: Resolution
  renderer: RendererKind
  vibration: boolean
  elementId: string
  onUpdate: (u: StreamUpdate) => void
}

const PROVISION_TIMEOUT_MS = 120_000
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export class StreamSession {
  private opts: StreamOptions
  private handle: string | undefined
  private player: xCloudPlayer | undefined
  private gamepad: Gamepad | undefined
  private keepalive: ReturnType<typeof setInterval> | undefined
  private stopped = false
  private phase: StreamPhase = 'requesting'

  constructor(opts: StreamOptions) {
    this.opts = opts
  }

  private update(u: StreamUpdate) {
    if (this.stopped && u.phase !== 'ended') return
    this.phase = u.phase
    this.opts.onUpdate(u)
  }

  getPhase() { return this.phase }

  async start() {
    try {
      this.update({ phase: 'requesting', message: this.opts.kind === 'home' ? 'Contacting your Xbox…' : 'Requesting a cloud server…' })
      const res = await call('streamStart', this.opts.kind, this.opts.id, this.opts.resolution)
      this.handle = res.handle
      if (this.stopped) { await call('streamStop', res.handle); return }

      await this.waitForProvisioned()
      if (this.stopped) return
      await this.connect()
    } catch (err) {
      this.fail(err)
    }
  }

  private async waitForProvisioned() {
    const started = Date.now()
    let sentMsal = false

    while (!this.stopped) {
      if (Date.now() - started > PROVISION_TIMEOUT_MS) throw new Error('The console took too long to respond. Make sure it is on or in Sleep mode with remote features enabled.')

      const status = await call('streamStatus', this.handle!)
      switch (status.state) {
        case 'Provisioned':
          return
        case 'ReadyToConnect':
          if (!sentMsal) {
            sentMsal = true
            this.update({ phase: 'provisioning', message: 'Signing in to the session…' })
            await call('streamMsal', this.handle!)
          }
          break
        case 'WaitingForResources':
          this.update({ phase: 'queued', message: 'Waiting in line for a cloud server…', waitSeconds: status.estimatedTotalWaitTimeInSeconds })
          break
        case 'Failed':
          throw new Error(status.errorDetails?.message || 'The session failed to start.')
        default:
          this.update({ phase: 'provisioning', message: this.opts.kind === 'home' ? 'Waking up your Xbox…' : 'Preparing the cloud server…' })
      }
      await sleep(1000)
    }
  }

  private async connect() {
    this.update({ phase: 'connecting', message: 'Connecting video…' })
    const player = new xCloudPlayer(this.opts.elementId, { renderer: this.opts.renderer })
    this.player = player
    player.init()

    player._peerConnection.addEventListener('connectionstatechange', () => {
      const s = player._peerConnection.connectionState
      if (s === 'connected') this.update({ phase: 'playing' })
      if ((s === 'failed' || s === 'disconnected') && this.phase !== 'ended') {
        this.fail(new Error(s === 'failed' ? 'The connection to the Xbox failed.' : 'Lost connection to the Xbox.'))
      }
    })

    const offer = await player.createOffer()
    const sdp = await call('streamSdp', this.handle!, offer)
    if (!sdp.exchangeResponse) throw new Error('The Xbox did not answer the connection request.')
    const remote = JSON.parse(sdp.exchangeResponse)
    if (remote.status === 'failed' || !remote.sdp) throw new Error(remote.error || 'The Xbox rejected the connection request.')
    await player.setRemoteSDP(remote.sdp)

    const local = await player.getICECandidates()
    const candidates = local.map(c => JSON.stringify({
      candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment,
    }))
    const ice = await call('streamIce', this.handle!, candidates)
    if (!ice.exchangeResponse) throw new Error('Network negotiation with the Xbox failed.')
    await player.setRemoteIceCandidates(JSON.parse(ice.exchangeResponse))

    this.keepalive = setInterval(() => {
      if (this.handle) call('streamKeepalive', this.handle).catch(() => {})
    }, 30_000)

    this.gamepad = new Gamepad(0, { enable_keyboard: false, enable_vibration: this.opts.vibration })
    this.gamepad.attach(player)
  }

  /** Stop sending controller input to the Xbox (while the overlay is open). */
  setInputPaused(paused: boolean) {
    if (this.gamepad) (this.gamepad as any)._isFocused = !paused
  }

  /** Tap a virtual Xbox-pad button, e.g. 'Nexus' for the Xbox/Guide button. */
  pressButton(button: string) {
    if (!this.gamepad) return
    this.gamepad.sendButtonState(button, 1)
    setTimeout(() => this.gamepad?.sendButtonState(button, 0), 120)
  }

  stats(): StreamStats | undefined {
    const s = this.player?.getStats()
    if (!s) return undefined
    return {
      width: s._videoWidth, height: s._videoHeight, fps: s._videoFps,
      rttMs: Math.round((s._rtt || 0) * 1000), codec: s._videoCodec.split(' ')[0] || '—',
      local: s._remoteIsLocal, ipv6: s._remoteIsIpv6,
    }
  }

  private fail(err: unknown) {
    if (this.stopped) return
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Something went wrong.'
    this.update({ phase: 'error', message: friendlyError(message) })
    this.teardown()
  }

  private teardown() {
    clearInterval(this.keepalive)
    this.keepalive = undefined
    try { this.gamepad?.detach() } catch { /* noop */ }
    this.gamepad = undefined
    try { this.player?.destroy() } catch { /* noop */ }
    this.player = undefined
    if (this.handle) {
      const h = this.handle
      this.handle = undefined
      call('streamStop', h).catch(() => {})
    }
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.teardown()
    this.update({ phase: 'ended' })
  }
}

function friendlyError(message: string): string {
  if (/401|403|unauthor/i.test(message)) return 'Xbox services rejected the request. Try signing out and back in.'
  if (/404/.test(message)) return 'The console could not be found. Check that remote features are enabled on your Xbox.'
  if (/Remote play token/i.test(message)) return 'Remote play is not available for this account.'
  return message.length > 220 ? message.slice(0, 220) + '…' : message
}
