// Controller input tests for the streaming core: simulates Steam Deck controller
// layouts (16-button virtual pad, dead/grabbed devices, stuck buttons) and checks
// what reaches the Xbox. Run: yarn deck test:gamepad
import Gamepad from '../../player/src/client/lib/input/gamepad'
import InputChannel from '../../player/src/client/lib/channel/input'
import ControlChannel from '../../player/src/client/lib/channel/control'
import MessageHandler from '../../player/src/client/lib/channel/message/handler'
const mk = (index: number, id: string, n = 17, pressed: number[] = [], axes = [0, 0, 0, 0]) => ({ index, id, connected: true, mapping: 'standard', timestamp: 1, axes,
  buttons: Array.from({ length: n }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) })
let pads: any[] = []
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true })
;(globalThis as any).window = { addEventListener() {}, removeEventListener() {} }
const quiet = console.log; console.log = (...a: any[]) => { if (!String(a[0]).startsWith('[Gamepad]')) quiet(...a) }
let pass = 0, fail = 0
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; quiet(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }

function session(initial: any[]) {
  pads = initial
  const handlers: any = {}
  const g = new Gamepad(0, { enable_keyboard: false })
  g.attach({ _channels: { control: { getGamepadHandlers: () => handlers, sendGamepadState(i: number, on: boolean, h: any) { if (on) handlers[i] = h } } } } as any)
  const frame = () => g.getGamepadState() as any
  return { g, frame }
}

// 1. 16-button virtual pad (no Guide button) must not crash, A works
{ const s = session([mk(0, 'Steam Virtual Gamepad', 16)]); s.frame()
  pads[0] = mk(0, 'Steam Virtual Gamepad', 16, [0]); const f = s.frame()
  ok('16-button pad: no crash, A reaches Xbox', f?.A === 1) }

// 2. Dead device listed first (more buttons, never changes) + real pad second
{ const s = session([mk(0, 'Steam Deck (grabbed by Steam)', 17), mk(1, 'Steam Virtual Gamepad', 16)]); s.frame()
  pads[1] = mk(1, 'Steam Virtual Gamepad', 16, [0]); let f = s.frame()
  ok('dead pad first: A from real pad arrives', f?.A === 1)
  pads[1] = mk(1, 'Steam Virtual Gamepad', 16, [], [0.9, 0, 0, 0]); f = s.frame()
  ok('dead pad first: left stick arrives', f?.LeftThumbXAxis > 0.5, `(x=${f?.LeftThumbXAxis?.toFixed(2)})`) }

// 3. Dead device listed second
{ const s = session([mk(0, 'Steam Virtual Gamepad', 17), mk(1, 'Steam Deck (grabbed by Steam)', 17)]); s.frame()
  pads[0] = mk(0, 'Steam Virtual Gamepad', 17, [1]); const f = s.frame()
  ok('dead pad second: B arrives', f?.B === 1) }

// 4. Phantom device with a stuck button must be ignored
{ const s = session([mk(0, 'Phantom (Y stuck)', 17, [3]), mk(1, 'Steam Virtual Gamepad', 17)]); s.frame(); s.frame()
  pads[1] = mk(1, 'Steam Virtual Gamepad', 17, [0]); const f = s.frame()
  ok('stuck-button phantom ignored', f?.A === 1 && f?.Y === 0, `(A=${f?.A} Y=${f?.Y})`) }

// 5. Release works and nothing is held afterwards
{ const s = session([mk(0, 'Steam Virtual Gamepad', 17)]); s.frame()
  pads[0] = mk(0, 'Steam Virtual Gamepad', 17, [0]); s.frame()
  pads[0] = mk(0, 'Steam Virtual Gamepad', 17); const f = s.frame()
  ok('button release reaches Xbox', f?.A === 0) }

// 6. View + Menu still gives the Xbox button on a 16-button pad
{ const s = session([mk(0, 'Steam Virtual Gamepad', 16)]); s.frame()
  pads[0] = mk(0, 'Steam Virtual Gamepad', 16, [8, 9]); const f = s.frame()
  ok('View+Menu → Xbox button', f?.Nexus === 1 && f?.View === 0) }

// 7. Input loop keeps running after a handler throws
{ let calls = 0, sent = 0
  const bad: any = Object.create(Gamepad.prototype); bad.getGamepadState = () => { calls++; if (calls === 1) throw new Error('boom'); return { A: 1 } }
  const ch: any = Object.create(InputChannel.prototype)
  ch.getPlayer = () => ({ _channels: { control: { getGamepadHandlers: () => ({ 0: bad }) } } })
  ch.queueGamepadFrames = () => { sent++ }
  const origErr = console.error; console.error = () => {}
  ch._loopErrorCount = 0
  ch.gamepadStateLoop()
  await new Promise(r => setTimeout(r, 120))
  console.error = origErr
  ok('input loop survives an exception', calls > 3 && sent > 2, `(${calls} polls, ${sent} frames sent)`)
  ;(globalThis as any).__stop = true }

// 8/9. Controller must survive the session handshake, whichever happens first
function controlChannel() {
  const sent: any[] = []
  const ch: any = Object.create(ControlChannel.prototype)
  ch._gamepadHandlers = { 0: undefined, 1: undefined, 2: undefined, 3: undefined }
  ch._authorized = false
  ch.send = (msg: string) => sent.push(JSON.parse(msg))
  return { ch, sent }
}
for (const order of ['attach before handshake', 'attach after handshake']) {
  const { ch, sent } = controlChannel()
  pads = [mk(0, 'Steam Virtual Gamepad', 17)]
  const g = new Gamepad(0, { enable_keyboard: false })
  const player: any = { _channels: { control: ch } }
  ch.getPlayer = () => player
  if (order === 'attach before handshake') { g.attach(player); ch.sendAuthorization() }
  else { ch.sendAuthorization(); g.attach(player) }
  const pad0 = sent.filter(m => m.message === 'gamepadChanged' && m.gamepadIndex === 0)
  const last = pad0[pad0.length - 1]
  ok(`${order}: controller stays attached`, ch._gamepadHandlers[0] === g)
  ok(`${order}: Xbox told it's connected`, !!last && last.wasAdded === true && !pad0.some(m => m.wasAdded === false),
    `(${pad0.map(m => m.wasAdded ? 'added' : 'removed').join(' → ')})`)
}

// 10-12. Messages from the console: session end and system dialogs
{
  const events: string[] = []
  const sent: any[] = []
  const player: any = {
    destroy: () => events.push('destroy'),
    onServerDisconnect: (c: string) => events.push('notified:' + c),
  }
  const channel: any = { getPlayer: () => player, send: (m: string) => sent.push(JSON.parse(m)) }
  ;(globalThis as any).confirm = () => { events.push('CONFIRM CALLED'); return true }
  new MessageHandler(channel, { target: '/streaming/sessionLifetimeManagement/serverInitiatedDisconnect', id: 'd1', content: '{"reason":"idle"}', type: 'Message' })
  ok('console ending the session tells the app before tearing down', events[0] === 'notified:{"reason":"idle"}' && events[1] === 'destroy', `(${events.join(', ')})`)

  events.length = 0
  let shown: any
  player.onSystemDialog = async (d: any) => { shown = d; return 1 }
  new MessageHandler(channel, { target: '/streaming/systemUi/messages/ShowMessageDialog', id: 'm1', type: 'Message',
    content: JSON.stringify({ TitleText: 'Still there?', ContentText: 'Your session will end soon.', CommandLabel1: 'Keep playing', CommandLabel2: 'Quit', PrimaryCommandIndex: 0, CancelCommandIndex: 1 }) })
  await new Promise(r => setTimeout(r, 20))
  const reply = sent.find(m => JSON.stringify(m).includes('m1'))
  ok('console message goes to the app, never a blocking confirm()', !events.includes('CONFIRM CALLED') && shown?.buttons?.join('/') === 'Keep playing/Quit', `(buttons: ${shown?.buttons?.join('/')})`)
  const result = reply ? JSON.parse(reply.content)?.Result : undefined
  ok("the app's choice is sent back to the console", reply?.type === 'TransactionComplete' && result === 1, `(Result: ${result})`)
}

quiet(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
