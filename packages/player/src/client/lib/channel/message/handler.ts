import Channel from '../../lib/channel'

export default class MessageHandler {
    private _channel:Channel
    private _data:object

    constructor(channel:Channel, data:object) {
        this._channel = channel
        this._data = data

        this.handle(this._data)
    }

    handle(data) {
        console.log('[MessageHandler] Handling:', data)
        switch(data.target){
            case '/streaming/sessionLifetimeManagement/serverInitiatedDisconnect': {
                this.completeTransaction(data.id, '')
                const player = this._channel.getPlayer()
                // Tell the app first, so it can show what happened instead of a black screen.
                try { player.onServerDisconnect?.(data.content) } catch(error) { console.error('[MessageHandler] onServerDisconnect failed:', error) }
                player.destroy()
                break
            }
            
            case '/streaming/properties/titleinfo':
                console.log('Title update:', data)
                break
            
            case '/streaming/touchcontrols/showlayoutv2':
                // console.log('Showing touch layout:', data)
                break

            case '/streaming/systemUi/messages/ShowMessageDialog':
                this.handleMessage(data)
                break

            default:
                console.log('[MessageChannel] Unhandled transaction:', data)
        }

    }

    completeTransaction(id, data) {
        const transaction = JSON.stringify({
            'type': 'TransactionComplete',
            'content': JSON.stringify(data),
            // 'content':'{\'Result\':0}',
            'id': id,
            'cv': '',
        })

        this._channel.send(transaction)
    }

    cancelTransaction(id, data) {
        const transaction = JSON.stringify({
            'type': 'ReceiverCancel',
            'content': JSON.stringify(data),
            'id': id,
            'cv': '',
        })

        this._channel.send(transaction)
    }

    /**
     * The console asks the client to show a message (e.g. an inactivity prompt).
     * This used to call window.confirm(), which freezes the whole page until it
     * is dismissed and can be invisible in fullscreen/Gaming Mode. Now the app
     * shows its own dialog via player.onSystemDialog; without one, the primary
     * button is chosen automatically.
     */
    async handleMessage(data) {
        let jsonData: any = {}
        try { jsonData = JSON.parse(data.content) } catch { /* keep defaults */ }
        const labels = [jsonData.CommandLabel1, jsonData.CommandLabel2, jsonData.CommandLabel3].filter((l: any) => typeof l === 'string' && l.length > 0)
        const dialog = {
            title: jsonData.TitleText ?? '',
            text: jsonData.ContentText ?? '',
            buttons: labels.length ? labels : ['OK'],
            primary: Number(jsonData.PrimaryCommandIndex ?? 0),
            cancel: Number(jsonData.CancelCommandIndex ?? (labels.length > 1 ? 1 : 0)),
        }
        console.log('[MessageHandler] System dialog from console:', JSON.stringify(dialog))
        const player = this._channel.getPlayer()
        let result = dialog.primary
        try {
            if(player.onSystemDialog) result = await player.onSystemDialog(dialog)
        } catch(error) {
            console.error('[MessageHandler] onSystemDialog failed:', error)
        }
        this.completeTransaction(data.id, { Result: result })
    }
}