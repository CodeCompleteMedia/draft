<script>
  import { onDestroy } from 'svelte'
  import { flip } from 'svelte/animate'
  import { dndzone, TRIGGERS } from 'svelte-dnd-action'
  import { call, watchState } from '../lib/api.js'
  import { CAPTAIN_MS, REVEAL_MS, SPIN_MS } from '../lib/timing.js'
  import { teamNumber } from '../lib/traits.js'
  import { PHASE } from '../shared/draftLogic.js'
  import PersonRow from '../components/PersonRow.svelte'
  import SetupPanel from '../components/SetupPanel.svelte'

  const PIN_KEY = 'teamDraftDay.pin'
  const FLIP_MS = 150
  // The class view lags up to one poll behind, so holds run a little long.
  const POLL_SLACK_MS = 1500
  const dropTargetStyle = { outline: '2px dashed oklch(0.52 0.19 33)', outlineOffset: '-3px' }

  const savedPin = readPin()
  let pin = $state(savedPin)
  let pinInput = $state('')
  let pinError = $state('')
  let board = $state(null)
  let zones = $state({ pool: [], bench: [] })
  let busy = $state(false)
  let message = $state(null)
  let showSetup = $state(false)
  let offline = $state(false)
  let holdUntil = $state(0)
  let now = $state(Date.now())
  let baseUrl = $state('')

  let watcher = null
  let dragging = false
  let deferred = null
  let messageTimer

  const ticker = setInterval(() => (now = Date.now()), 250)
  onDestroy(() => {
    clearInterval(ticker)
    clearTimeout(messageTimer)
    if (watcher) watcher.stop()
  })

  if (savedPin) connect()

  function readPin() {
    try {
      return sessionStorage.getItem(PIN_KEY) || ''
    } catch {
      return ''
    }
  }

  async function unlock(event) {
    event.preventDefault()
    pinError = ''
    try {
      await call('checkPin', pinInput)
      pin = pinInput
      try {
        sessionStorage.setItem(PIN_KEY, pin)
      } catch {}
      connect()
    } catch (err) {
      pinError = err.message
    }
  }

  function lock() {
    if (watcher) watcher.stop()
    watcher = null
    pin = ''
    pinInput = ''
    board = null
    try {
      sessionStorage.removeItem(PIN_KEY)
    } catch {}
  }

  function connect() {
    watcher = watchState('admin', {
      getPin: () => pin,
      onState: receive,
      onError(err) {
        offline = !!err && !/PIN/.test(err.message)
        if (err && /PIN/.test(err.message)) {
          pinError = err.message
          lock()
        }
      },
    })
    call('getAppUrl').then((url) => (baseUrl = url))
  }

  function receive(next) {
    if (dragging) deferred = next
    else apply(next)
  }

  function apply(next) {
    const before = board && board.lastEvent ? board.lastEvent.seq : null
    const event = next.lastEvent
    if (board && event && event.seq !== before) {
      const hold = { spin: SPIN_MS, captain: CAPTAIN_MS, pick: REVEAL_MS }[event.type]
      if (hold) {
        // Refresh the clock too: the ticker can fall behind when the browser slows timers.
        now = Date.now()
        holdUntil = now + hold + POLL_SLACK_MS
      }
    }
    board = next
    zones = buildZones(next)
    if (next.phase === PHASE.SETUP) showSetup = false
  }

  function buildZones(b) {
    const z = { pool: [], bench: [] }
    if (!b.teams) return z
    // The student waiting on the teacher (a pending pick or the wheel's landing) sits
    // at the top of the pool, so there's nothing to scroll for.
    const featured = [b.pendingId, b.spunId].filter((id) => id && b.pool.includes(id))
    z.pool = featured.concat(b.pool.filter((id) => !featured.includes(id))).map((id) => ({ id }))
    z.bench = b.bench.map((id) => ({ id }))
    b.teams.forEach((t) => (z[t.id] = t.members.map((id) => ({ id }))))
    return z
  }

  function resync() {
    dragging = false
    if (deferred) {
      apply(deferred)
      deferred = null
    } else if (board) {
      zones = buildZones(board)
    }
  }

  function say(text, tone = 'info') {
    message = { text, tone }
    clearTimeout(messageTimer)
    messageTimer = setTimeout(() => (message = null), tone === 'error' ? 7000 : 4000)
  }

  async function run(action, success = null) {
    busy = true
    try {
      const next = await call('act', pin, action)
      deferred = null
      watcher.accept(next)
      if (success) say(success)
    } catch (err) {
      say(err.message, 'error')
      resync()
    } finally {
      busy = false
    }
  }

  async function startDraft(period, numTeams) {
    const next = await call('startDraft', pin, period, numTeams)
    showSetup = false
    holdUntil = 0
    watcher.accept(next)
    say(`Draft started for Period ${period}.`)
  }

  // ---- Drag and drop ----

  function consider(zone, event) {
    dragging = true
    zones[zone] = event.detail.items
  }

  function finalize(zone, event) {
    zones[zone] = event.detail.items
    const { trigger, id } = event.detail.info
    if (trigger === TRIGGERS.DROPPED_INTO_ZONE) drop(id, zone)
    else if (trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY) resync()
  }

  function whereIs(id) {
    if (board.pool.includes(id)) return 'pool'
    if (board.bench.includes(id)) return 'bench'
    const team = board.teams.find((t) => t.members.includes(id))
    return team ? team.id : null
  }

  const isTeam = (zone) => /^T\d+$/.test(zone)
  const teamLabel = (teamId) => `Team ${teamNumber(teamId)}`

  function drop(id, to) {
    const from = whereIs(id)
    const name = nameOf(id)
    if (!from || from === to) return resync()

    if (from === 'pool' && isTeam(to)) {
      if (id === board.pendingId && to === board.turnTeamId) return run({ type: 'pick', studentId: id, teamId: to })
      say(
        id === board.pendingId
          ? `${name} is ${teamLabel(board.turnTeamId)}'s pick. Drop them on ${teamLabel(board.turnTeamId)}.`
          : 'Captains draft students from the pool. To place someone by hand, move them to Not here first.',
        'error',
      )
      return resync()
    }
    if (from === 'pool' && to === 'bench') return run({ type: 'bench', studentId: id }, `${name} moved to Not here.`)
    if (from === 'bench' && to === 'pool') return run({ type: 'unbench', studentId: id }, `${name} is back in the pool.`)
    if (from === 'bench' && isTeam(to)) return run({ type: 'place', studentId: id, teamId: to }, `${name} placed on ${teamLabel(to)}.`)
    if (isTeam(from) && to === 'pool') {
      const undo = id === board.latestPickId
      return run(
        { type: 'unpick', studentId: id },
        undo ? `Pick undone. ${teamLabel(from)} is back on the clock.` : `${name} is back in the pool. Turn order didn't change.`,
      )
    }
    if (isTeam(from) && to === 'bench') return run({ type: 'bench', studentId: id }, `${name} moved to Not here.`)
    if (isTeam(from) && isTeam(to)) return run({ type: 'move', studentId: id, teamId: to }, `${name} moved to ${teamLabel(to)}.`)
    resync()
  }

  // ---- Display helpers ----

  const pad = (n) => String(n).padStart(2, '0')

  function nameOf(id) {
    return board && board.people[id] ? board.people[id].name : ''
  }

  function poolTag(id) {
    if (id === board.pendingId) return { tag: `${teamLabel(board.turnTeamId)}'s pick`, tone: 'signal' }
    if (id === board.spunId) return { tag: 'Wheel', tone: 'gold' }
    return { tag: null, tone: null }
  }

  let phase = $derived(board ? board.phase : null)
  let hasDraft = $derived(!!board && board.phase !== PHASE.SETUP)
  let holdLeft = $derived(Math.max(0, Math.ceil((holdUntil - now) / 1000)))
  let turnTeam = $derived(board && board.turnTeamId ? board.teams.find((t) => t.id === board.turnTeamId) : null)
  let placeholders = $derived(board && board.draft ? Math.max(0, board.draft.numTeams - board.teams.length) : 0)
</script>

{#if !pin}
  <main class="gate">
    <form onsubmit={unlock}>
      <h1>Admin board</h1>
      <label for="pin">PIN</label>
      <input id="pin" type="password" inputmode="numeric" autocomplete="off" bind:value={pinInput} />
      {#if pinError}
        <p class="error" role="alert">{pinError}</p>
      {/if}
      <button class="btn primary big" type="submit" disabled={!pinInput}>Open</button>
    </form>
  </main>
{:else if !board}
  <main class="gate"><p>Loading the draft…</p></main>
{:else}
  <div class="admin">
    <header class="top">
      <div class="title">
        <span class="app">Team Draft Day</span>
        {#if hasDraft}
          <span class="meta">Period {board.draft.period} · {Object.keys(board.people).length} students · {board.draft.numTeams} teams</span>
        {/if}
      </div>
      <nav class="links">
        {#if baseUrl}
          <a href="{baseUrl}?view=class" target="_blank" rel="noopener">Class view ↗</a>
          <a href="{baseUrl}?view=captain" target="_blank" rel="noopener">Captain station ↗</a>
        {/if}
        {#if hasDraft && !showSetup}
          <button class="btn quiet" onclick={() => (showSetup = true)}>New draft</button>
        {/if}
        <button class="btn quiet" onclick={lock}>Lock</button>
      </nav>
    </header>

    {#if !hasDraft || showSetup}
      <SetupPanel
        periods={board.periods}
        activeDraft={hasDraft ? board.draft : null}
        onstart={startDraft}
        oncancel={hasDraft ? () => (showSetup = false) : null}
      />
    {:else}
      <section class="control" aria-live="polite">
        <div class="status">
          {#if phase === PHASE.SPIN}
            <p class="step">{board.teams.length === 0 ? 'Spin for the first captain.' : `Spin for captain ${board.teams.length + 1} of ${board.draft.numTeams}.`}</p>
            <div class="actions">
              <button class="btn signal big" disabled={busy || holdLeft > 0 || board.pool.length === 0} onclick={() => run({ type: 'spin' })}>
                {holdLeft > 0 ? `Class is watching… ${holdLeft}` : 'Spin the wheel'}
              </button>
            </div>
          {:else if phase === PHASE.CONFIRM_CAPTAIN}
            <p class="step">The wheel landed on: <strong>{nameOf(board.spunId)}</strong></p>
            <div class="actions">
              <button class="btn signal big" disabled={busy || holdLeft > 0} onclick={() => run({ type: 'captain' })}>
                {holdLeft > 0 ? `Wheel spinning… ${holdLeft}` : `Make ${nameOf(board.spunId)} captain`}
              </button>
              <button class="btn big" disabled={busy} onclick={() => run({ type: 'respin' })}>Re-spin</button>
              <button class="btn quiet big" disabled={busy} onclick={() => run({ type: 'bench', studentId: board.spunId }, `${nameOf(board.spunId)} moved to Not here. Spin again.`)}>
                Not here
              </button>
            </div>
          {:else if phase === PHASE.CHOOSING}
            <p class="step">
              <strong>{teamLabel(board.turnTeamId)}</strong> ({nameOf(turnTeam.captainId)}) is choosing at the captain station.
            </p>
            <div class="actions">
              {#if board.canUncaptain}
                <button class="btn quiet" disabled={busy} onclick={() => run({ type: 'uncaptain' }, 'Captain undone. They are back on the wheel.')}>Undo captain</button>
              {/if}
            </div>
          {:else if phase === PHASE.PENDING_PICK}
            <p class="step">
              <strong>{teamLabel(board.turnTeamId)}</strong> picked <strong>{nameOf(board.pendingId)}</strong>
              (#{board.people[board.pendingId].code}). Drag them onto {teamLabel(board.turnTeamId)}, or
            </p>
            <div class="actions">
              <button class="btn signal big" disabled={busy} onclick={() => run({ type: 'pick', studentId: board.pendingId, teamId: board.turnTeamId })}>Lock in pick</button>
              <button class="btn big" disabled={busy} onclick={() => run({ type: 'reject' }, 'Pick sent back to the captain.')}>Send back</button>
            </div>
          {:else if phase === PHASE.DONE}
            <p class="step">Every student is on a team.</p>
            <div class="actions">
              <button class="btn signal big" disabled={busy} onclick={() => run({ type: 'complete' }, 'Teams saved to the Teams tab.')}>Finish and save teams</button>
            </div>
          {:else if phase === PHASE.COMPLETE}
            <p class="step">Teams are saved to the Teams tab. Moves you make now are saved too.</p>
            <div class="actions">
              <button class="btn quiet" disabled={busy} onclick={() => run({ type: 'reopen' })}>Reopen draft</button>
            </div>
          {/if}
        </div>
        {#if message}
          <p class="message" class:error={message.tone === 'error'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>
        {/if}
      </section>

      <div class="layout">
        <aside class="side">
          <div class="zone-head">
            <h2>Pool</h2>
            <span class="count">{board.pool.length}</span>
          </div>
          <div
            class="zone"
            class:empty={zones.pool.length === 0}
            data-empty="Everyone's on a team."
            use:dndzone={{ items: zones.pool, flipDurationMs: FLIP_MS, type: 'people', dropTargetStyle }}
            onconsider={(e) => consider('pool', e)}
            onfinalize={(e) => finalize('pool', e)}
          >
            {#each zones.pool as item (item.id)}
              {@const t = poolTag(item.id)}
              <div animate:flip={{ duration: FLIP_MS }}>
                <PersonRow person={board.people[item.id]} columns={board.columns} tag={t.tag} tone={t.tone} />
              </div>
            {/each}
          </div>

          <div class="zone-head">
            <h2>Not here</h2>
            <span class="count">{board.bench.length}</span>
          </div>
          <div
            class="zone bench"
            class:empty={zones.bench.length === 0}
            data-empty="Drag absent students here. Drag them onto a team later."
            use:dndzone={{ items: zones.bench, flipDurationMs: FLIP_MS, type: 'people', dropTargetStyle }}
            onconsider={(e) => consider('bench', e)}
            onfinalize={(e) => finalize('bench', e)}
          >
            {#each zones.bench as item (item.id)}
              <div animate:flip={{ duration: FLIP_MS }}>
                <PersonRow person={board.people[item.id]} columns={board.columns} />
              </div>
            {/each}
          </div>
        </aside>

        <section class="teams">
          {#each board.teams as team (team.id)}
            {@const onClock = team.id === board.turnTeamId}
            <article class="team" class:on-clock={onClock} class:target={onClock && phase === PHASE.PENDING_PICK}>
              <header class="team-head">
                <span class="num">{pad(teamNumber(team.id))}</span>
                <span class="captain">
                  <span class="captain-name">{nameOf(team.captainId)}</span>
                  <span class="captain-label">Captain · #{board.people[team.captainId] ? board.people[team.captainId].code : ''}</span>
                </span>
                <span class="size">{1 + team.members.length}</span>
              </header>
              {#if onClock}
                <p class="flag">{phase === PHASE.PENDING_PICK ? `Drop ${nameOf(board.pendingId)} here` : 'On the clock'}</p>
              {/if}
              <div
                class="zone members"
                class:empty={(zones[team.id] || []).length === 0}
                data-empty="No teammates yet"
                use:dndzone={{ items: zones[team.id] || [], flipDurationMs: FLIP_MS, type: 'people', dropTargetStyle }}
                onconsider={(e) => consider(team.id, e)}
                onfinalize={(e) => finalize(team.id, e)}
              >
                {#each zones[team.id] || [] as item (item.id)}
                  <div animate:flip={{ duration: FLIP_MS }}>
                    <PersonRow person={board.people[item.id]} columns={board.columns} tag={item.id === board.latestPickId ? 'Latest' : null} />
                  </div>
                {/each}
              </div>
            </article>
          {/each}
          {#each Array(placeholders) as _, i (i)}
            <article class="team placeholder">
              <header class="team-head">
                <span class="num">{pad(board.teams.length + i + 1)}</span>
                <span class="captain"><span class="captain-label">Captain not drawn yet</span></span>
              </header>
            </article>
          {/each}
        </section>
      </div>
    {/if}

    {#if offline}
      <p class="offline">Can't reach the server. Retrying…</p>
    {/if}
  </div>
{/if}

<style>
  .gate {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: var(--paper-2);
  }
  .gate form {
    display: grid;
    gap: 0.6rem;
    width: min(20rem, 90vw);
    padding: 2rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .gate h1 {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 2.4rem;
    line-height: 0.9;
    text-transform: uppercase;
  }
  .gate label {
    font-weight: 650;
  }
  .gate input {
    min-height: 2.75rem;
    padding: 0 0.75rem;
    font-size: 1.3rem;
    letter-spacing: 0.3em;
    border: 1px solid var(--ink-2);
    border-radius: var(--radius);
    background: var(--paper);
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 650;
  }

  .admin {
    min-height: 100vh;
    background: var(--paper-2);
  }
  .top {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1.25rem;
    background: var(--ink);
    color: var(--paper);
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }
  .app {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.5rem;
    text-transform: uppercase;
  }
  .meta {
    color: var(--paper-3);
  }
  .links {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .links a {
    color: var(--paper);
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius);
    text-decoration: none;
  }
  .links a:hover {
    background: oklch(0.32 0.03 265);
  }
  .top .btn.quiet {
    color: var(--paper);
  }
  .top .btn.quiet:hover {
    background: oklch(0.32 0.03 265);
  }

  .control {
    padding: 0.9rem 1.25rem;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.25rem;
  }
  .step {
    margin: 0;
    font-size: 1.15rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .message {
    margin: 0.7rem 0 0;
    padding: 0.45rem 0.75rem;
    border-radius: var(--radius);
    background: var(--paper-2);
    width: fit-content;
  }
  .message.error {
    background: var(--danger-tint);
    color: var(--danger);
    font-weight: 650;
  }

  .layout {
    display: grid;
    grid-template-columns: 19rem 1fr;
    gap: 1.25rem;
    padding: 1rem 1.25rem 2rem;
    align-items: start;
  }
  .side {
    position: sticky;
    top: 3.4rem;
    max-height: calc(100vh - 4.5rem);
    overflow-y: auto;
    display: grid;
    gap: 0.4rem;
  }
  .zone-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 0.4rem;
  }
  h2 {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .count {
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }
  .zone {
    display: grid;
    gap: 0.3rem;
    align-content: start;
    min-height: 3rem;
    padding: 0.35rem;
    border-radius: var(--radius);
    background: var(--paper-3);
  }
  .zone.bench {
    background: transparent;
    border: 1px dashed var(--ink-2);
  }
  .zone.empty::before {
    content: attr(data-empty);
    padding: 0.4rem;
    font-size: 0.85rem;
    color: var(--ink-2);
  }

  .teams {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.9rem;
    align-items: start;
  }
  .team {
    background: var(--paper);
    border: 1px solid var(--line);
    border-top: 4px solid var(--ink);
    border-radius: var(--radius);
    padding: 0.5rem;
  }
  .team.on-clock {
    border-top-color: var(--signal-deep);
    box-shadow: 0 0 0 1px var(--signal-deep);
  }
  .team.target .zone {
    background: var(--signal-tint);
    outline: 2px dashed var(--signal-deep);
    outline-offset: -3px;
  }
  .team.placeholder {
    background: transparent;
    border-style: dashed;
    border-top-style: solid;
    border-top-color: var(--line);
  }
  .team-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.15rem 0.45rem;
  }
  .num {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 2rem;
    line-height: 1;
  }
  .on-clock .num {
    color: var(--signal-deep);
  }
  .captain {
    display: grid;
    min-width: 0;
  }
  .captain-name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .captain-label {
    font-size: 0.78rem;
    color: var(--ink-2);
  }
  .size {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--ink-2);
  }
  .flag {
    margin: 0 0 0.45rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: var(--signal-deep);
    color: var(--paper);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .offline {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    margin: 0;
    padding: 0.5rem 0.9rem;
    border-radius: var(--radius);
    background: var(--danger);
    color: var(--paper);
    font-weight: 650;
  }
</style>
