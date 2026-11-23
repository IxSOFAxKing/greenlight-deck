import Gamepad from '../input/gamepad'
import MouseKeyboard from '../input/mousekeyboard'
import Touch from '../input/touch'
import Channel from './channel'

interface GamepadHandlers {
    0: undefined|Gamepad|MouseKeyboard|Touch;
    1: undefined|Gamepad|MouseKeyboard|Touch;
    2: undefined|Gamepad|MouseKeyboard|Touch;
    3: undefined|Gamepad|MouseKeyboard|Touch;
}

export default class ControlChannel extends Channel {
    _keyframeInterval
    private _authorized = false
    _gamepadHandlers:GamepadHandlers = {
        0: undefined,
        1: undefined,
        2: undefined,
        3: undefined,
    }

    getChannelName() {
        return 'control'
    }

    getChannelConfig() {
        return {
            protocol: 'controlV1',
            ordered: true,
        }
    }

    destroy() {
        // console.log('DebugChannel destroy() called')
        clearInterval(this._keyframeInterval)

        this._gamepadHandlers[0]?.detach()
        this._gamepadHandlers[1]?.detach()
        this._gamepadHandlers[2]?.detach()
        this._gamepadHandlers[3]?.detach()
    }

    sendAuthorization(){
        const authRequest = JSON.stringify({
            'message':'authorizationRequest',
            'accessKey':'4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E',
        })

        this.send(authRequest)
        this._authorized = true

        // Announce controllers that were attached before the session was ready.
        // (This used to send "added" + "removed" for index 0, and the removal also
        // dropped an already-attached controller: input then never reached the
        // console whenever the controller attached before the handshake finished.)
        let announced = 0
        for(const index of [0, 1, 2, 3] as const){
            if(this._gamepadHandlers[index] !== undefined){
                this.announceGamepad(index, true)
                announced++
            }
        }
        if(announced === 0){
            // Nothing attached yet: register pad 0 so the console expects input; the
            // handler announces itself again when it attaches.
            this.announceGamepad(0, true)
        }
        console.log('[ControlChannel] Authorized; announced', announced, 'attached controller(s)')

        // if(this.getPlayer()._config.keyframe_interval > 0) {
        //     this._keyframeInterval = setInterval(() => {
        //         this.requestKeyframeRequest(true)
        //     }, this.getPlayer()._config.keyframe_interval*1000)
        // }
    }

    sendGamepadState(gamepadIndex, wasAdded = true, handler:undefined|Gamepad|MouseKeyboard|Touch = undefined) {
       
        if(wasAdded === true){
            if(handler !== undefined){
                if(this._gamepadHandlers[gamepadIndex] !== undefined){
                    this._gamepadHandlers[gamepadIndex]?.detach()
                }
                this._gamepadHandlers[gamepadIndex] = handler
            }
        } else {
            this._gamepadHandlers[gamepadIndex] = undefined
        }

        // Before authorization the console would ignore this; sendAuthorization() announces it then.
        if(this._authorized){
            this.announceGamepad(gamepadIndex, wasAdded)
        }
    }

    private announceGamepad(gamepadIndex: number, wasAdded: boolean){
        const gamepadRequest = JSON.stringify({
            'message': 'gamepadChanged',
            'gamepadIndex': gamepadIndex,
            'wasAdded': wasAdded,
        })
        console.log('[ControlChannel] gamepadChanged', gamepadIndex, wasAdded ? 'added' : 'removed')
        this.send(gamepadRequest)
    }

    requestKeyframeRequest(ifrRequested = false) {
        // console.log('xCloudPlayer Channel/Control.ts - ['+this._channelName+'] User requested Video KeyFrame')
        const keyframeRequest = JSON.stringify({
            message: 'videoKeyframeRequested',
            ifrRequested: ifrRequested,
        })

        this.send(keyframeRequest)
    }

    getGamepadHandlers(){
        return this._gamepadHandlers
    }

    getGamepadHandler(index):Gamepad|undefined{
        for(const gamepad in this.getPlayer()._channels.control.getGamepadHandlers()){
            if(
                this.getPlayer()._channels.control.getGamepadHandlers()[gamepad] instanceof Gamepad &&
                (this.getPlayer()._channels.control.getGamepadHandlers()[gamepad] as Gamepad).getPhysicalGamepadId() === index
            ) {
                return this.getPlayer()._channels.control.getGamepadHandlers()[gamepad]
            }
        }

        return undefined
    }
}