// Gamepad + keyboard input for the menu UI.
// Polls the Gamepad API every frame, turns button presses into UI actions with
// key-repeat for directions, and in "stream" mode only watches for the
// overlay combo (hold L3 + R3) so every other input goes to the Xbox.

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'accept' | 'back' | 'x' | 'y'
  | 'lb' | 'rb' | 'menu' | 'view'
  | 'overlay'

export type InputMode = 'ui' | 'stream'

// W3C "standard" gamepad mapping (Steam Input exposes the Deck as an Xbox pad).
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 }

const BUTTON_ACTIONS: Array<[number, Action]> = [
  [BTN.A, 'accept'], [BTN.B, 'back'], [BTN.X, 'x'], [BTN.Y, 'y'],
  [BTN.LB, 'lb'], [BTN.RB, 'rb'], [BTN.MENU, 'menu'], [BTN.VIEW, 'view'],
]
const DIRS: Array<[Action, number]> = [['up', BTN.UP], ['down', BTN.DOWN], ['left', BTN.LEFT], ['right', BTN.RIGHT]]

const KEY_ACTIONS: Record<string, Action> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back',
  q: 'lb', e: 'rb', x: 'x', y: 'y', m: 'menu', Tab: 'rb',
}

const REPEAT_DELAY = 380
const REPEAT_RATE = 95
const STICK_THRESHOLD = 0.55
const COMBO_HOLD_MS = 350

type Listener = (action: Action) => void

export class Controller {
  mode: InputMode = 'ui'
  private listeners = new Set<Listener>()
  private prevButtons: boolean[] = []
  private dirHeld: Partial<Record<Action, { since: number; last: number }>> = {}
  private comboSince = 0
  private comboFired = false
  private releaseWaiters: Array<() => void> = []
  private connectedListeners = new Set<(connected: boolean) => void>()
  private raf = 0
  private suppressUntilRelease = false
  private suppressSince = 0

  start() {
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('gamepadconnected', this.onConnectChange)
    window.addEventListener('gamepaddisconnected', this.onConnectChange)
    const loop = () => { this.poll(); this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('gamepadconnected', this.onConnectChange)
    window.removeEventListener('gamepaddisconnected', this.onConnectChange)
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  onConnectionChange(cb: (connected: boolean) => void) {
    this.connectedListeners.add(cb)
    return () => { this.connectedListeners.delete(cb) }
  }

  hasGamepad() {
    return this.pads().length > 0
  }

  setMode(mode: InputMode) {
    this.mode = mode
    this.dirHeld = {}
    // Ignore whatever is held during the switch (e.g. the A that started a stream).
    this.suppressUntilRelease = true
    this.suppressSince = performance.now()
  }

  /**
   * Resolves once no gamepad button is pressed, so a menu press doesn't leak
   * into the game. Gives up after a moment in case some device reports a
   * button that is stuck down.
   */
  waitForRelease(maxWaitMs = 600): Promise<void> {
    if (!this.anyPressed()) return Promise.resolve()
    return new Promise(resolve => {
      let done = false
      const finish = () => { if (!done) { done = true; resolve() } }
      this.releaseWaiters.push(finish)
      setTimeout(finish, maxWaitMs)
    })
  }

  /** Short description of every connected gamepad, for the debug log. */
  describePads(): string {
    const pads = this.pads()
    if (!pads.length) return 'no gamepads visible yet (press a button)'
    return pads.map(p => `#${p.index} "${p.id}" ${p.mapping || 'no-mapping'}`).join(', ')
  }

  private emit(action: Action) {
    for (const l of [...this.listeners]) l(action)
  }

  private onConnectChange = () => {
    const c = this.hasGamepad()
    this.connectedListeners.forEach(cb => cb(c))
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.mode === 'stream') {
      if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); this.emit('overlay') }
      return
    }
    const action = KEY_ACTIONS[e.key]
    if (!action) return
    // Let text inputs keep their own editing keys.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
    e.preventDefault()
    this.emit(action)
  }

  private pads(): Gamepad[] {
    return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected)
  }

  private readButtons(): boolean[] {
    // Merge all connected pads so it doesn't matter which index Steam gives us.
    const merged: boolean[] = []
    for (const p of this.pads()) {
      p.buttons.forEach((b, i) => { merged[i] = merged[i] || b.pressed || b.value > 0.5 })
      const [lx = 0, ly = 0] = p.axes
      if (p.mapping === 'standard' || p.axes.length >= 2) {
        if (ly < -STICK_THRESHOLD) merged[BTN.UP] = true
        if (ly > STICK_THRESHOLD) merged[BTN.DOWN] = true
        if (lx < -STICK_THRESHOLD) merged[BTN.LEFT] = true
        if (lx > STICK_THRESHOLD) merged[BTN.RIGHT] = true
      }
    }
    return merged
  }

  private anyPressed(buttons = this.readButtons()) {
    return buttons.some(Boolean)
  }

  private poll() {
    const buttons = this.readButtons()
    const now = performance.now()
    const pressed = (i: number) => !!buttons[i]
    const justPressed = (i: number) => !!buttons[i] && !this.prevButtons[i]

    if (this.suppressUntilRelease && now - this.suppressSince > 1500) this.suppressUntilRelease = false
    if (!this.anyPressed(buttons)) {
      this.suppressUntilRelease = false
      if (this.releaseWaiters.length) {
        const waiters = this.releaseWaiters
        this.releaseWaiters = []
        waiters.forEach(w => w())
      }
    }

    // Overlay combo works in both modes: hold L3 + R3.
    if (pressed(BTN.L3) && pressed(BTN.R3)) {
      if (!this.comboSince) this.comboSince = now
      if (!this.comboFired && now - this.comboSince >= COMBO_HOLD_MS) {
        this.comboFired = true
        this.emit('overlay')
      }
    } else {
      this.comboSince = 0
      this.comboFired = false
    }

    if (this.mode === 'ui' && !this.suppressUntilRelease) {
      for (const [i, action] of BUTTON_ACTIONS) if (justPressed(i)) this.emit(action)

      for (const [action, i] of DIRS) {
        if (pressed(i)) {
          const held = this.dirHeld[action]
          if (!held) {
            this.dirHeld[action] = { since: now, last: now }
            this.emit(action)
          } else if (now - held.since > REPEAT_DELAY && now - held.last > REPEAT_RATE) {
            held.last = now
            this.emit(action)
          }
        } else {
          delete this.dirHeld[action]
        }
      }
    }

    this.prevButtons = buttons
  }
}

export const controller = new Controller()
