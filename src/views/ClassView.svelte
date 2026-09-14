<script>
  import { onDestroy, tick } from 'svelte'
  import { watchState } from '../lib/api.js'
  import * as sounds from '../lib/sounds.js'
  import { SPIN_MS } from '../lib/timing.js'
  import { teamNumber } from '../lib/traits.js'
  import { PHASE } from '../shared/draftLogic.js'
  import RevealOverlay from '../components/RevealOverlay.svelte'
  import TeamBoard from '../components/TeamBoard.svelte'
  import Wheel from '../components/Wheel.svelte'

  const ANIMATED = ['spin', 'captain', 'pick', 'submit']

  let started = $state(false)
  let muted = $state(sounds.isMuted())
  let shown = $state(null) // what's on screen; lags the server while a moment plays
  let fresh = $state(null)
  let moment = $state(null)
  let spinning = $state(false)
  let offline = $state(false)
  let now = $state(Date.now())
  let clockStart = $state(Date.now())

  let wheel = $state()
  let latest = null
  let lastSeq = null
  let busy = false
  let finishMoment = null
  let freshTimer
  const queue = []

  const watcher = watchState('class', {
    onState: receive,
    onError: (err) => (offline = !!err),
  })
  const ticker = setInterval(() => (now = Date.now()), 1000)

  onDestroy(() => {
    watcher.stop()
    clearInterval(ticker)
    clearTimeout(freshTimer)
  })

  // Big moments play one at a time, and the board only updates after each one,
  // so a new name never shows on the board before its reveal.
  function receive(state) {
    latest = state
    const event = state.lastEvent
    if (lastSeq === null) {
      lastSeq = event ? event.seq : 0
    } else if (event && event.seq > lastSeq) {
      lastSeq = event.seq
      if (ANIMATED.includes(event.type)) queue.push({ event, state })
    }
    drain()
  }

  async function drain() {
    if (busy) return
    busy = true
    while (queue.length) await play(queue.shift())
    busy = false
    if (latest) show(latest)
  }

  async function play({ event, state }) {
    if (event.type === 'spin') {
      show({ ...state, spun: null })
      await tick()
      spinning = true
      if (wheel && state.spun) await wheel.spinTo(state.spun.index, SPIN_MS)
      spinning = false
      show(state)
      sounds.chime()
    } else if (event.type === 'captain') {
      await reveal({ kind: 'captain', name: event.name, team: teamNumber(event.teamId) })
      show(state)
    } else if (event.type === 'pick') {
      const team = state.teams.find((t) => t.id === event.teamId)
      const picks = state.teams.reduce((sum, t) => sum + t.members.length, 0)
      await reveal({ kind: 'pick', name: event.name, team: teamNumber(event.teamId), captain: team && team.captain, pickNumber: picks })
      show(state, { teamId: event.teamId, name: event.name })
    } else if (event.type === 'submit') {
      show(state)
      sounds.chime()
    }
  }

  function reveal(next) {
    return new Promise((resolve) => {
      finishMoment = resolve
      moment = next
    })
  }

  function momentDone() {
    moment = null
    if (finishMoment) finishMoment()
    finishMoment = null
  }

  async function show(state, highlight = null) {
    const turnKey = (s) => (s && s.turn ? s.turn.teamId + ':' + s.phase : null)
    if (turnKey(state) !== turnKey(shown)) clockStart = Date.now()
    shown = state
    if (highlight) {
      fresh = highlight
      clearTimeout(freshTimer)
      freshTimer = setTimeout(() => (fresh = null), 4000)
    }
    if (state.spun && !spinning) {
      await tick()
      if (wheel) wheel.setTo(state.spun.index)
    }
  }

  function start() {
    sounds.unlock()
    started = true
    try {
      document.documentElement.requestFullscreen?.()
    } catch {}
  }

  function toggleSound() {
    muted = !muted
    sounds.setMuted(muted)
    if (!muted) sounds.unlock()
  }

  let phase = $derived(shown ? shown.phase : null)
  let wheelUp = $derived(!!shown && shown.wheel && shown.wheel.length > 0)
  let assigned = $derived(shown && shown.teams ? shown.teams.reduce((sum, t) => sum + 1 + t.members.length, 0) : 0)
  let total = $derived(assigned + (shown && shown.remaining ? shown.remaining : 0))
  let captainsSoFar = $derived(shown && shown.teams ? shown.teams.length : 0)
  let elapsed = $derived(Math.max(0, Math.floor((now - clockStart) / 1000)))
  let clock = $derived(`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`)
  const pad = (n) => String(n).padStart(2, '0')
</script>

<div class="stage">
  <header class="topbar">
    <span class="brand">Team Draft Day</span>
    {#if shown && shown.teams}
      <span class="counter">
        {captainsSoFar} of {shown.numTeams} captains · {shown.remaining} left in the pool
      </span>
    {/if}
    <button class="sound" onclick={toggleSound} aria-pressed={!muted}>{muted ? 'Sound off' : 'Sound on'}</button>
  </header>

  {#if !shown || phase === PHASE.SETUP}
    <section class="idle">
      <p class="kicker">Tonight's event</p>
      <h1>Draft Day</h1>
      <p class="sub">{shown ? 'Waiting for your teacher to start the draft.' : 'Connecting…'}</p>
    </section>
  {:else if wheelUp}
    <section class="draw">
      <div class="wheel-wrap">
        <Wheel names={shown.wheel} bind:this={wheel} />
      </div>
      <div class="draw-info">
        <p class="kicker">Captain draw</p>
        <p class="round">Captain {Math.min(captainsSoFar + 1, shown.numTeams)} of {shown.numTeams}</p>
        <div class="plate" class:landed={shown.spun && !spinning}>
          {#if spinning}
            <p class="plate-label">Spinning…</p>
          {:else if shown.spun}
            <p class="plate-label">The wheel says</p>
            <p class="plate-name">{shown.spun.name}</p>
          {:else}
            <p class="plate-label">Waiting for the spin</p>
          {/if}
        </div>
        {#if shown.teams.length}
          <ol class="captains">
            {#each shown.teams as team (team.id)}
              <li><span class="n">{pad(teamNumber(team.id))}</span>{team.captain}</li>
            {/each}
          </ol>
        {/if}
      </div>
    </section>
  {:else}
    <section class="boardview">
      {#if shown.turn}
        <div class="banner" class:pending={phase === PHASE.PENDING_PICK}>
          <span class="banner-num">{pad(teamNumber(shown.turn.teamId))}</span>
          <div class="banner-text">
            <p class="banner-kicker">{phase === PHASE.PENDING_PICK ? 'The pick is in' : 'On the clock'}</p>
            <p class="banner-name">{shown.turn.captain}</p>
          </div>
          <span class="banner-clock">{phase === PHASE.PENDING_PICK ? '' : clock}</span>
        </div>
      {:else if phase === PHASE.DONE || phase === PHASE.COMPLETE}
        <div class="banner final">
          <div class="banner-text">
            <p class="banner-kicker">{phase === PHASE.COMPLETE ? 'Draft complete' : 'Every pick is in'}</p>
            <p class="banner-name">Final teams</p>
          </div>
        </div>
      {:else if shown.remaining === 0}
        <div class="banner final">
          <div class="banner-text">
            <p class="banner-kicker">Hold on</p>
            <p class="banner-name">No one left on the wheel</p>
          </div>
        </div>
      {/if}
      <TeamBoard
        teams={shown.teams}
        numTeams={shown.numTeams}
        {total}
        turnTeamId={shown.turn ? shown.turn.teamId : null}
        pending={phase === PHASE.PENDING_PICK}
        {fresh}
      />
    </section>
  {/if}

  {#if offline}
    <p class="offline">Reconnecting…</p>
  {/if}
</div>

{#if moment}
  <RevealOverlay {moment} ondone={momentDone} />
{/if}

{#if !started}
  <div class="gate">
    <button class="btn primary big" onclick={start}>Start the show</button>
    <p>Turns on sound and goes full screen.</p>
  </div>
{/if}

<style>
  .stage {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--paper);
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 2vw;
    padding: 0.8vw 2.4vw;
    border-bottom: 0.4vw solid var(--ink);
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.1rem, 1.8vw, 2.4rem);
    text-transform: uppercase;
  }
  .counter {
    margin-left: auto;
    font-family: var(--font-display);
    font-weight: 650;
    font-size: clamp(1rem, 1.5vw, 2rem);
    text-transform: uppercase;
    font-variant-numeric: tabular-nums;
  }
  .sound {
    border: 1px solid var(--line);
    background: transparent;
    border-radius: var(--radius);
    padding: 0.3rem 0.7rem;
    color: var(--ink-2);
    cursor: pointer;
  }

  .kicker {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.1rem, 2vw, 2.6rem);
    text-transform: uppercase;
    color: var(--signal-deep);
  }

  .idle {
    display: grid;
    align-content: center;
    padding: 0 6vw;
  }
  .idle h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(5rem, 20vw, 24rem);
    line-height: 0.82;
    text-transform: uppercase;
  }
  .idle .sub {
    font-size: clamp(1.2rem, 2vw, 2.4rem);
    color: var(--ink-2);
    margin: 2vw 0 0;
  }

  .draw {
    display: grid;
    grid-template-columns: min(calc(100vh - 8vw), 56vw) 1fr;
    gap: 3vw;
    align-items: center;
    padding: 2vw 2.4vw;
  }
  .wheel-wrap {
    aspect-ratio: 1;
    width: 100%;
  }
  .round {
    margin: 0.2vw 0 2vw;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2rem, 4vw, 5.5rem);
    line-height: 0.95;
    text-transform: uppercase;
  }
  .plate {
    border-top: 0.45vw solid var(--ink);
    border-bottom: 0.45vw solid var(--ink);
    padding: 1.2vw 0;
    min-height: 13vw;
    transition: background-color 300ms var(--ease-out);
  }
  .plate.landed {
    background: var(--gold);
    padding-inline: 1vw;
  }
  .plate-label {
    margin: 0;
    font-size: clamp(1rem, 1.6vw, 2rem);
    font-weight: 650;
    color: var(--ink-2);
  }
  .plate.landed .plate-label {
    color: var(--ink);
  }
  .plate-name {
    margin: 0.3vw 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(3rem, 7vw, 9rem);
    line-height: 0.9;
    text-transform: uppercase;
    text-wrap: balance;
  }
  .captains {
    list-style: none;
    padding: 0;
    margin: 2vw 0 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2vw;
  }
  .captains li {
    display: flex;
    gap: 0.8vw;
    align-items: baseline;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(1.1rem, 1.9vw, 2.5rem);
    text-transform: uppercase;
    border-bottom: 1px solid var(--line);
    padding: 0.3vw 0;
  }
  .captains .n {
    color: var(--signal-deep);
    font-variant-numeric: tabular-nums;
  }

  .boardview {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.6vw;
    padding: 1.6vw 2.4vw 2.4vw;
  }
  .banner {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: stretch;
    background: var(--ink);
    color: var(--paper);
    position: relative;
    overflow: hidden;
  }
  .banner-num {
    display: grid;
    place-items: center;
    padding: 0 2vw;
    background: var(--signal);
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(3rem, 7vw, 9rem);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .banner-text {
    padding: 1vw 2vw;
    position: relative;
  }
  .banner-kicker {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.1rem, 2vw, 2.6rem);
    text-transform: uppercase;
    color: var(--gold);
  }
  .banner-name {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(2.4rem, 5vw, 6.5rem);
    line-height: 0.92;
    text-transform: uppercase;
  }
  .banner-clock {
    align-self: center;
    padding: 0 2vw;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2rem, 4.2vw, 5.5rem);
    font-variant-numeric: tabular-nums;
    position: relative;
  }
  .banner.pending::before {
    content: '';
    position: absolute;
    inset: 0 -10%;
    background: repeating-linear-gradient(-55deg, transparent 0 1.6vw, oklch(0.83 0.13 85 / 0.14) 1.6vw 3.2vw);
    animation: crawl 1s linear infinite;
    will-change: transform;
  }
  @keyframes crawl {
    to {
      transform: translateX(3.7vw);
    }
  }
  .banner.final {
    grid-template-columns: 1fr;
  }

  .offline {
    position: fixed;
    right: 1.5vw;
    bottom: 1.5vw;
    margin: 0;
    padding: 0.4rem 0.8rem;
    background: var(--danger);
    color: var(--paper);
    border-radius: var(--radius);
    font-weight: 650;
  }

  .gate {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.5rem;
    background: oklch(0.965 0.012 85 / 0.9);
  }
  .gate p {
    margin: 0;
    color: var(--ink-2);
  }
</style>
