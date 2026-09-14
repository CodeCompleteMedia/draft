<script>
  import { gsap } from 'gsap'
  import { tick as tickSound } from '../lib/sounds.js'

  let { names = [] } = $props()

  const R = 480
  const COLORS = [
    { fill: 'var(--ink)', text: 'var(--paper)' },
    { fill: 'var(--signal)', text: 'var(--ink)' },
    { fill: 'var(--field)', text: 'var(--paper)' },
    { fill: 'var(--paper-3)', text: 'var(--ink)' },
  ]

  let group
  let lastIndex = -1
  let lastTickAt = 0

  let segments = $derived.by(() => {
    const n = names.length
    const size = 360 / Math.max(n, 1)
    const fontSize = Math.max(14, Math.min(46, ((2 * Math.PI * R * 0.8) / Math.max(n, 1)) * 0.55))
    return names.map((name, i) => {
      // Keep the last slice from matching the first when they touch.
      const colorIndex = n > 1 && i === n - 1 && i % COLORS.length === 0 ? 2 : i % COLORS.length
      return {
        label: name.length > 15 ? name.slice(0, 14) + '…' : name,
        path: slicePath(i, n),
        mid: (i + 0.5) * size,
        color: COLORS[colorIndex],
        fontSize,
      }
    })
  })

  function slicePath(i, n) {
    if (n <= 1) return null
    const a0 = ((i * 360) / n) * (Math.PI / 180)
    const a1 = (((i + 1) * 360) / n) * (Math.PI / 180)
    const large = 360 / n > 180 ? 1 : 0
    return `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`
  }

  // The pointer sits at 3 o'clock. Returns the slice under it for a rotation.
  function indexAt(rotation) {
    const n = names.length
    if (!n) return -1
    const angle = (((360 - (rotation % 360)) % 360) + 360) % 360
    return Math.floor(angle / (360 / n)) % n
  }

  function currentRotation() {
    return Number(gsap.getProperty(group, 'rotation')) || 0
  }

  export function spinTo(index, ms) {
    return new Promise((resolve) => {
      const n = names.length
      if (!group || !n || index < 0) return resolve()
      const size = 360 / n
      const current = currentRotation()
      const landing = (index + 0.5) * size + (Math.random() - 0.5) * size * 0.6
      const wanted = (360 - (landing % 360)) % 360
      let target = current - (((current % 360) + 360) % 360) + wanted
      const turns = ms < 2000 ? 1 : 7
      while (target < current + 360 * turns) target += 360
      lastIndex = indexAt(current)
      // If the browser stops drawing frames (a sleeping or background screen),
      // land anyway so the draft never waits on an animation.
      const fallback = setTimeout(() => {
        gsap.killTweensOf(group)
        gsap.set(group, { rotation: target, svgOrigin: '0 0' })
        resolve()
      }, ms + 1500)
      gsap.to(group, {
        rotation: target,
        svgOrigin: '0 0',
        duration: ms / 1000,
        ease: 'power4.out',
        onUpdate() {
          const i = indexAt(currentRotation())
          const now = performance.now()
          if (i !== lastIndex && now - lastTickAt > 45) {
            lastTickAt = now
            tickSound()
          }
          lastIndex = i
        },
        onComplete() {
          clearTimeout(fallback)
          resolve()
        },
      })
    })
  }

  export function setTo(index) {
    const n = names.length
    if (!group || !n || index < 0 || indexAt(currentRotation()) === index) return
    gsap.set(group, { rotation: (360 - (((index + 0.5) * 360) / n) % 360) % 360, svgOrigin: '0 0' })
  }
</script>

<svg class="wheel" viewBox="-530 -530 1060 1060" role="img" aria-label="Wheel of names">
  <g bind:this={group}>
    {#if names.length === 1}
      <circle r={R} style="fill: var(--signal)" />
    {/if}
    {#each segments as s, i (i)}
      {#if s.path}
        <path d={s.path} style="fill: {s.color.fill}" />
      {/if}
      <text
        transform="rotate({s.mid})"
        x={R - 30}
        y="0"
        text-anchor="end"
        dominant-baseline="central"
        style="fill: {names.length === 1 ? 'var(--ink)' : s.color.text}; font-size: {s.fontSize}px"
      >
        {s.label}
      </text>
    {/each}
  </g>
  <circle r={R} class="rim" />
  <circle r="78" class="hub" />
  <text class="hub-text" text-anchor="middle" dominant-baseline="central">DRAFT</text>
  <polygon class="pointer" points="448,0 526,-40 526,40" />
</svg>

<style>
  .wheel {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  text {
    font-family: var(--font-display);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.01em;
  }
  .rim {
    fill: none;
    stroke: var(--ink);
    stroke-width: 14;
  }
  .hub {
    fill: var(--paper);
    stroke: var(--ink);
    stroke-width: 12;
  }
  .hub-text {
    fill: var(--ink);
    font-size: 38px;
    font-weight: 800;
  }
  .pointer {
    fill: var(--signal-deep);
    stroke: var(--paper);
    stroke-width: 8;
    stroke-linejoin: round;
  }
</style>
