<script>
  import { onMount } from 'svelte'
  import { gsap } from 'gsap'
  import confetti from 'canvas-confetti'
  import * as sounds from '../lib/sounds.js'
  import { CAPTAIN_MS, REDUCED_MOTION, REVEAL_HOLD_MS, SUSPENSE_MS } from '../lib/timing.js'

  // moment: { kind: 'captain' | 'pick', name, team, captain?, pickNumber? }
  let { moment, ondone } = $props()

  let root
  let nameEl
  let display = $state('')
  let stage = $state('intro')

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const CONFETTI = ['#e4532f', '#e3b94c', '#f6f1e7', '#1f4a7f', '#151a2b']
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  // Same length every time, so the scramble doesn't hint at the name.
  const scramble = (length) => Array.from({ length }, () => LETTERS[Math.floor(Math.random() * 26)]).join('')

  let timer
  let stopRoll = () => {}

  onMount(() => {
    run()
    return () => {
      clearInterval(timer)
      stopRoll()
    }
  })

  async function run() {
    const target = moment.name.toUpperCase()
    enter()

    if (moment.kind === 'pick') {
      stage = 'suspense'
      stopRoll = sounds.drumroll(SUSPENSE_MS / 1000)
      if (REDUCED_MOTION) {
        display = '···'
      } else {
        timer = setInterval(() => (display = scramble(8)), 65)
      }
      await wait(SUSPENSE_MS)
      clearInterval(timer)
      if (!REDUCED_MOTION) await settle(target, 420)
      display = target
      stage = 'revealed'
      sounds.fanfare()
      slam()
      celebrate()
      await wait(REVEAL_HOLD_MS)
    } else {
      display = target
      stage = 'revealed'
      await wait(REDUCED_MOTION ? 150 : 650)
      sounds.boom()
      slam()
      await wait(CAPTAIN_MS)
    }

    await exit()
    ondone()
  }

  function settle(target, ms) {
    return new Promise((resolve) => {
      const start = performance.now()
      timer = setInterval(() => {
        const locked = Math.floor(((performance.now() - start) / ms) * target.length)
        if (locked >= target.length) {
          clearInterval(timer)
          resolve()
        } else {
          display = target.slice(0, locked) + scramble(target.length - locked)
        }
      }, 35)
    })
  }

  function enter() {
    if (REDUCED_MOTION) return gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(root, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'expo.out' })
  }

  function slam() {
    if (REDUCED_MOTION || !nameEl) return
    gsap.fromTo(nameEl, { scale: 1.22, opacity: 0.3 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'expo.out' })
  }

  function celebrate() {
    if (REDUCED_MOTION) return
    confetti({ particleCount: 140, spread: 80, startVelocity: 55, origin: { x: 0.5, y: 0.6 }, colors: CONFETTI, zIndex: 60 })
    setTimeout(() => {
      confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: CONFETTI, zIndex: 60 })
      confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: CONFETTI, zIndex: 60 })
    }, 280)
  }

  // Capped with a timer so a screen that stops drawing frames can't hold up the draft.
  function exit() {
    const tween = REDUCED_MOTION
      ? gsap.to(root, { opacity: 0, duration: 0.2 })
      : gsap.to(root, { clipPath: 'inset(0 0 0 100%)', duration: 0.4, ease: 'power3.in' })
    return Promise.race([tween.then(() => {}), wait(700)])
  }
</script>

<div class="overlay {moment.kind}" class:suspense={stage === 'suspense'} bind:this={root}>
  <div class="inner">
    {#if moment.kind === 'pick'}
      <p class="kicker">Pick {moment.pickNumber}</p>
      <p class="lead">Team {moment.team}{moment.captain ? `, ${moment.captain},` : ''} selects</p>
    {:else}
      <p class="kicker">Team {moment.team}</p>
      <p class="lead">Your captain</p>
    {/if}
    <p class="name" class:scrambling={stage === 'suspense'} bind:this={nameEl}>{display}</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    align-items: center;
    padding: 5vw 6vw;
    overflow: hidden;
  }
  .overlay.pick {
    background: var(--signal);
    color: var(--ink);
  }
  .overlay.captain {
    background: var(--ink);
    color: var(--paper);
  }
  /* Broadcast stripes that crawl while the drumroll plays. */
  .overlay.suspense::before {
    content: '';
    position: absolute;
    inset: -20%;
    background: repeating-linear-gradient(-55deg, transparent 0 3vw, oklch(0.21 0.025 265 / 0.07) 3vw 6vw);
    animation: crawl 1.2s linear infinite;
    will-change: transform;
  }
  @keyframes crawl {
    to {
      transform: translateX(6.9vw);
    }
  }
  .inner {
    position: relative;
  }
  .kicker,
  .lead,
  .name {
    margin: 0;
    font-family: var(--font-display);
    text-transform: uppercase;
  }
  .kicker {
    font-weight: 800;
    font-size: clamp(1.5rem, 3.2vw, 4rem);
    letter-spacing: 0.02em;
  }
  .lead {
    font-weight: 600;
    font-size: clamp(1.5rem, 3.6vw, 4.6rem);
    line-height: 1;
    padding-bottom: 1.2vw;
    margin-bottom: 1.6vw;
    border-bottom: 0.5vw solid currentColor;
  }
  .captain .kicker {
    color: var(--gold);
  }
  .name {
    font-weight: 900;
    font-size: clamp(4rem, 14vw, 17rem);
    line-height: 0.86;
    letter-spacing: -0.01em;
    text-wrap: balance;
    transform-origin: left center;
  }
  .captain .name {
    color: var(--gold);
  }
  .name.scrambling {
    opacity: 0.35;
  }
</style>
