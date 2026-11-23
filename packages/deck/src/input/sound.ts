// Subtle UI tick sounds generated with WebAudio (no audio files to ship).
let ctx: AudioContext | undefined
let enabled = true

function blip(freq: number, duration = 0.035, gain = 0.035) {
  if (!enabled) return
  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.value = gain
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.connect(g).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch { /* audio not available */ }
}

export const sound = {
  move: () => blip(880),
  select: () => blip(1320, 0.05),
  back: () => blip(520, 0.05),
  setEnabled: (v: boolean) => { enabled = v },
}
