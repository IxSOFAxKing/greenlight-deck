import ChatChannel from './channel/chat'
import ControlChannel from './channel/control'
import InputChannel from './channel/input'
import MessageChannel from './channel/message'

import Ice from './ice'
import Sdp from './sdp'
import Stats from './stats'

import VideoComponent from './render/video'
import WebGpuComponent from './render/webgpu'
import AudioComponent from './render/audio'

export interface xCloudPlayerOptions {
    /** 'video' uses a <video> element (hardware decode, most compatible). 'webgpu' uses the WebGPU renderer. 'auto' picks webgpu when available. */
    renderer?: 'video' | 'webgpu' | 'auto'
    /** Ask the host to cap video at this many kbps (SDP b=AS). 0 = let the host decide. */
    maxVideoBitrate?: number
    /** Preferred H.264 profile. 'high' looks best, 'low' decodes fastest. 'auto' = high, then medium, then low. */
    codecProfile?: 'auto' | 'high' | 'medium' | 'low'
}

export default class xCloudPlayer {

    _peerConnection = new RTCPeerConnection({})
    _channels = {
        chat: new ChatChannel(this),
        control: new ControlChannel(this),
        input: new InputChannel(this),
        message: new MessageChannel(this),
    }

    private _elementId: string
    private _isDestoyed: boolean = false
    private _iceHelper = new Ice(this)
    private _sdpHelper = new Sdp(this)
    private _statsHelper = new Stats(this)

    private _videoComponent: VideoComponent | WebGpuComponent | undefined
    private _audioComponent: AudioComponent | undefined

    readonly options: Required<xCloudPlayerOptions>

    /** The console ended the session (e.g. after inactivity). Called before the player is destroyed. */
    onServerDisconnect?: (content?: string) => void
    /** The console wants a message shown; resolve with the index of the chosen button. */
    onSystemDialog?: (dialog: { title: string; text: string; buttons: string[]; primary: number; cancel: number }) => Promise<number>

    constructor(elementId: string, options: xCloudPlayerOptions = {}) {
        console.log('xCloudPlayer constructing...');

        this.options = { renderer: 'webgpu', maxVideoBitrate: 0, codecProfile: 'auto', ...options }
        this._elementId = elementId;
        this._peerConnection.addTransceiver('audio', { direction: 'sendrecv' })
        const videoTransceiver = this._peerConnection.addTransceiver('video', { direction: 'recvonly' })
        videoTransceiver.setCodecPreferences(this._sdpHelper.getDefaultCodecPreferences(this.options.codecProfile))

        this._peerConnection.ontrack = (event) => {

            if(event.track.kind === 'video'){
                const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
                const useWebGpu = this.options.renderer === 'webgpu' || (this.options.renderer === 'auto' && hasWebGpu)
                this._videoComponent = useWebGpu ? new WebGpuComponent(this) : new VideoComponent(this)
                this._videoComponent.create(event.streams[0])

            } else if(event.track.kind === 'audio'){
                this._audioComponent = new AudioComponent(this)
                this._audioComponent.create(event.streams[0])

            } else {
                console.log('[xPlayer] Detected an unknown stream type: ', event.track.kind)
            }
        }

        console.log('xCloudPlayer constructed.');
    }

    init() {
        console.log('xCloudPlayer init called.');
    }

    getElementId() {
        return this._elementId
    }

    async createOffer() {
        const offer = await this._peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        })
        const finalOffer = this._sdpHelper.setLocalSDP(offer)
        this._peerConnection.setLocalDescription(finalOffer)

        return finalOffer
    }

    async setRemoteSDP(sdp: string) {
        const finalSdp = this._sdpHelper.setRemoteSDP(sdp)
        return await this._peerConnection.setRemoteDescription({
            type: 'answer',
            sdp: finalSdp,
        })
    }

    async getICECandidates() {
        return this._iceHelper.getCandidates()
    }

    async setRemoteIceCandidates(candidates:RTCIceCandidate[]) {
        // @TODO: Sort ipv4 and ipv6, and use best route as preference (ipv6 only etc)

        this._iceHelper.setRemoteCandidates(candidates)
    }

    getVideoElement() {
        if(this._videoComponent){
            return this._videoComponent.getElement()
        } else {
            return undefined
        }
    }

    getAudioElement() {
        if(this._audioComponent){
            return this._audioComponent.getElement()
        } else {
            return undefined
        }
    }

    toggleDebugOverlay() {
        if(this._videoComponent){
            this._videoComponent.toggleDebugOverlay()
        }
    }

    getStats() {
        return this._statsHelper
    }

    destroy() {
        if(this._isDestoyed === false){
            this._peerConnection.close()

            if(this._peerConnection.onconnectionstatechange){
                this._peerConnection.onconnectionstatechange(new Event('connectionstatechanged'))
            }
            
            for(const channel in this._channels) {
                this._channels[channel].destroy()
            }

            this._statsHelper.destroy()
            if(this._videoComponent){ this._videoComponent.destroy() }
            if(this._audioComponent){ this._audioComponent.destroy() }

            this._isDestoyed = true
        } else {
            console.log('Cannot destroy because the player is already destroyed.')
        }
    }
}