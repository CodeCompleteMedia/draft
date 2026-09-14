// Drumroll, fanfare, and wheel ticks, synthesized with Web Audio so there are no
// audio files to bundle. Browsers only allow sound after a click, so the class
// view calls unlock() from its "Start" button.

let ctx = null
let muted = false

try {
  muted = localStorage.getItem('teamDraftDay.muted') === '1'
} catch {}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem('teamDraftDay.muted', value ? '1' : '0')
  } catch {}
}

export function unlock() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
}

function ready() {
  return ctx && !muted && ctx.state === 'running'
}

function noiseBuffer() {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

// A short click for each segment the wheel passes.
export function tick() {
  if (!ready()) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = 1800
  gain.gain.setValueAtTime(0.06, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.04)
}

// Snare roll that builds for `seconds`. Returns a function that cuts it off early.
export function drumroll(seconds) {
  if (!ready()) return () => {}
  const start = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.08, start)
  master.gain.linearRampToValueAtTime(0.5, start + seconds)
  master.connect(ctx.destination)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2200
  filter.connect(master)

  const buffer = noiseBuffer()
  const sources = []
  for (let t = 0; t < seconds; t += 0.045) {
    const src = ctx.createBufferSource()
    const hit = ctx.createGain()
    src.buffer = buffer
    hit.gain.setValueAtTime(0.9, start + t)
    hit.gain.exponentialRampToValueAtTime(0.01, start + t + 0.04)
    src.connect(hit).connect(filter)
    src.start(start + t)
    src.stop(start + t + 0.05)
    sources.push(src)
  }
  return () => {
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(0, ctx.currentTime)
    sources.forEach((s) => {
      try {
        s.stop()
      } catch {}
    })
  }
}

function brass(freq, at, length, volume) {
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(900, at)
  filter.frequency.linearRampToValueAtTime(3200, at + 0.08)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(volume, at + 0.03)
  gain.gain.setValueAtTime(volume, at + length - 0.08)
  gain.gain.linearRampToValueAtTime(0, at + length)
  osc.connect(filter).connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + length + 0.05)
}

// Rising call and a held major chord.
export function fanfare() {
  if (!ready()) return
  const t = ctx.currentTime + 0.02
  const C5 = 523.25
  const E5 = 659.25
  const G5 = 783.99
  const C6 = 1046.5
  brass(G5 / 2, t, 0.14, 0.12)
  brass(C5, t + 0.15, 0.14, 0.12)
  brass(E5, t + 0.3, 0.14, 0.12)
  brass(G5, t + 0.45, 0.28, 0.13)
  ;[C5, E5, G5, C6].forEach((f) => brass(f, t + 0.78, 1.3, 0.07))
}

// Low "boom" when a captain is confirmed.
export function boom() {
  if (!ready()) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.5)
  gain.gain.setValueAtTime(0.6, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.65)
}

// Two-note chime for "the pick is in".
export function chime() {
  if (!ready()) return
  const t = ctx.currentTime
  ;[
    [880, 0],
    [1318.5, 0.16],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t + offset)
    gain.gain.linearRampToValueAtTime(0.25, t + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.9)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 1)
  })
}
