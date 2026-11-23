// Minimal type surface for Greenlight's streaming core, which Vite aliases to
// packages/player/src/client/lib (see vite.config.ts).

declare module '@gl/player' {
  export interface xCloudPlayerOptions {
    renderer?: 'video' | 'webgpu' | 'auto'
    maxVideoBitrate?: number
    codecProfile?: 'auto' | 'high' | 'medium' | 'low'
  }

  export interface PlayerStats {
    _videoCodec: string
    _audioCodec: string
    _videoWidth: number
    _videoHeight: number
    _videoFps: number
    _framesDecoded?: number
    _rtt: number
    _remoteIsLocal: boolean
    _remoteIsIpv6: boolean
  }

  export default class xCloudPlayer {
    constructor(elementId: string, options?: xCloudPlayerOptions)
    _peerConnection: RTCPeerConnection
    init(): void
    createOffer(): Promise<RTCSessionDescriptionInit>
    setRemoteSDP(sdp: string): Promise<void>
    getICECandidates(): Promise<RTCIceCandidate[]>
    setRemoteIceCandidates(candidates: unknown[]): Promise<void>
    getVideoElement(): HTMLElement | undefined
    getStats(): PlayerStats
    destroy(): void
  }
}

declare module '@gl/gamepad' {
  import type xCloudPlayer from '@gl/player'

  export interface GamepadOptions {
    enable_keyboard?: boolean
    enable_gamepad?: boolean
    enable_vibration?: boolean
    gamepad_deadzone?: number
  }

  export default class Gamepad {
    constructor(index: number, options?: GamepadOptions)
    attach(player: xCloudPlayer): void
    detach(): void
    sendButtonState(button: string, value: number): void
  }
}
