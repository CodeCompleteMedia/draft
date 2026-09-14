<script>
  import { onDestroy } from 'svelte'
  import { call, watchState } from '../lib/api.js'
  import { filterOptions, listValues, matchesFilters, scoreFraction, sortCards, sortOptions, teamNumber, teamSummary } from '../lib/traits.js'
  import { PHASE } from '../shared/draftLogic.js'
  import { BUSINESS_TRAITS, ESKILLS, describeOption } from '../shared/formOptions.js'
  import Meter from '../components/Meter.svelte'
  import ProspectCard from '../components/ProspectCard.svelte'

  let station = $state(null)
  let sortKey = $state('code')
  let filters = $state({})
  let selected = $state(null)
  let submitting = $state(false)
  let notice = $state(null)
  let offline = $state(false)
  let grid = $state()

  let turnKey = null
  let previous = null

  const watcher = watchState('captain', {
    onState: receive,
    onError: (err) => (offline = !!err),
  })
  onDestroy(() => watcher.stop())

  function receive(next) {
    const key = next.captain ? next.captain.teamId + ':' + next.team.length : null
    if (key !== turnKey) {
      // A new captain walked up: nothing from the last captain's search carries over.
      turnKey = key
      sortKey = 'code'
      filters = {}
      selected = null
      notice = null
      if (grid) grid.scrollTop = 0
    } else if (previous && previous.phase === PHASE.PENDING_PICK && next.phase === PHASE.CHOOSING) {
      notice = 'Your teacher sent that pick back. Choose again.'
      selected = null
    }
    if (next.cards && selected && !next.cards.some((c) => c.code === selected)) selected = null
    previous = next
    station = next
  }

  async function lockIn() {
    if (!selected) return
    submitting = true
    notice = null
    try {
      watcher.accept(await call('submitPick', selected))
    } catch (err) {
      notice = err.message
      selected = null
    } finally {
      submitting = false
    }
  }

  function toggleFilter(key, value) {
    const current = filters[key] || []
    filters = { ...filters, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] }
  }

  let phase = $derived(station ? station.phase : null)
  let columns = $derived(station && station.columns ? station.columns : [])
  let cards = $derived(station && station.cards ? station.cards : [])
  let visible = $derived(sortCards(cards.filter((c) => matchesFilters(c, filters, options)), sortKey, columns))
  let options = $derived(filterOptions(cards, columns))
  let sorts = $derived(sortOptions(columns))
  let activeFilters = $derived(Object.values(filters).reduce((n, chosen) => n + chosen.length, 0))
  // Descriptions from the forms, for the answers that appear on today's cards.
  let legend = $derived.by(() => {
    const shown = new Set(cards.flatMap((card) => columns.filter((c) => c.type === 'tags' || c.type === 'badge').flatMap((c) => listValues(card.traits[c.key]))))
    return ESKILLS.concat(BUSINESS_TRAITS).filter((option) => option.description && shown.has(option.label))
  })
  let filtering = $derived(Object.values(filters).some((v) => v.length))
  let summary = $derived(station && station.team ? teamSummary(station.team, columns) : [])
  const pad = (n) => String(n).padStart(2, '0')
</script>

{#if phase === PHASE.CHOOSING}
  <div class="station">
    <header class="head">
      <span class="num">{pad(teamNumber(station.captain.teamId))}</span>
      <div>
        <h1>{station.captain.name}, you're on the clock</h1>
        <p>Choose one teammate. Names stay hidden until your teacher locks in the pick.</p>
      </div>
    </header>

    <div class="body">
      <aside class="team">
        <h2>Your team so far</h2>
        <ul class="roster">
          {#each station.team as person, i (i)}
            <li>{person.name}{#if person.captain}<span class="cap">Captain</span>{/if}</li>
          {/each}
        </ul>
        {#each summary as item (item.column.key)}
          {#if item.column.type === 'score'}
            <div class="sum-score">
              <span>{item.column.label}</span>
              <span class="bar" aria-hidden="true"><span style="width: {scoreFraction(item.average, item.column) * 100}%"></span></span>
              <span class="avg">{item.average === null ? '–' : item.average.toFixed(1)}</span>
            </div>
          {:else if item.column.type === 'scale'}
            <div class="sum-meter">
              <Meter value={item.average} poles={item.column.poles} label={item.column.label} compact />
            </div>
          {:else if item.column.type === 'personality'}
            {#if item.types.length}
              <div class="sum-badges">
                <span class="sum-label">{item.column.label}</span>
                <span>{item.types.map(([v, n]) => (n > 1 ? `${v} ×${n}` : v)).join(' · ')}</span>
                {#if item.groups.length}
                  <span class="dim">{item.groups.map(([v, n]) => `${v} ${n}`).join(' · ')}</span>
                {/if}
                {#if item.identities.length}
                  <span class="dim">{item.identities.map(([v, n]) => `${v} ${n}`).join(' · ')}</span>
                {/if}
              </div>
            {/if}
          {:else if item.column.type !== 'text' && item.counts.length}
            <div class="sum-badges">
              <span class="sum-label">{item.column.label}</span>
              <span>{item.counts.map(([v, n]) => (n > 1 ? `${v} ×${n}` : v)).join(' · ')}</span>
            </div>
          {/if}
        {/each}
      </aside>

      <main class="pool">
        <div class="tools">
          <label class="sort">
            <span>Sort</span>
            <select bind:value={sortKey}>
              {#each sorts as option (option.key)}
                <option value={option.key}>{option.label}</option>
              {/each}
            </select>
          </label>
          <span class="count">{visible.length === cards.length ? `${cards.length} available` : `${visible.length} of ${cards.length}`}</span>
          {#if filtering}
            <button class="btn quiet" onclick={() => (filters = {})}>Clear filters</button>
          {/if}
        </div>
        {#if options.length}
          <details class="panel" open={activeFilters > 0}>
            <summary>Filters{#if activeFilters}<span class="count-badge">{activeFilters}</span>{/if}</summary>
            <div class="panel-body filters">
              {#each options as option (option.id)}
                <div class="filter-row" role="group" aria-label={option.label}>
                  <span class="filter-label">{option.label}</span>
                  {#each option.values as value (value)}
                    {@const on = (filters[option.id] || []).includes(value)}
                    <button class="chip" class:on aria-pressed={on} title={describeOption(value) || undefined} onclick={() => toggleFilter(option.id, value)}>{value}</button>
                  {/each}
                </div>
              {/each}
            </div>
          </details>
        {/if}

        {#if legend.length}
          <details class="panel legend">
            <summary>What these mean</summary>
            <dl class="panel-body">
              {#each legend as item (item.label)}
                <div><dt>{item.label}</dt><dd>{item.description}</dd></div>
              {/each}
            </dl>
          </details>
        {/if}

        {#if notice}
          <p class="notice" role="status">{notice}</p>
        {/if}

        <div class="grid" bind:this={grid}>
          {#each visible as card (card.code)}
            <ProspectCard {card} {columns} selected={selected === card.code} onselect={(code) => (selected = selected === code ? null : code)} />
          {:else}
            <p class="empty">No one matches those filters. <button class="btn quiet" onclick={() => (filters = {})}>Clear filters</button></p>
          {/each}
        </div>
      </main>
    </div>

    <footer class="confirm" class:open={!!selected}>
      {#if selected}
        <p>Pick <strong>#{selected}</strong> for your team?</p>
        <button class="btn quiet big" onclick={() => (selected = null)} disabled={submitting}>Keep looking</button>
        <button class="btn signal big" onclick={lockIn} disabled={submitting}>{submitting ? 'Sending…' : 'Lock in pick'}</button>
      {:else}
        <p class="hint">Tap a card to choose it.</p>
      {/if}
    </footer>
  </div>
{:else if phase === PHASE.PENDING_PICK}
  <div class="rest submitted">
    <p class="kicker">Pick submitted</p>
    <p class="big-code">#{station.pendingCode}</p>
    <p class="sub">Head back to your seat. Your teacher will reveal the name on the projector.</p>
  </div>
{:else}
  <div class="rest">
    <p class="kicker">Captain station</p>
    <p class="headline">Eyes on the projector</p>
    <p class="sub">
      {#if !station}
        Connecting…
      {:else if phase === PHASE.SETUP}
        The draft hasn't started yet.
      {:else if phase === PHASE.SPIN || phase === PHASE.CONFIRM_CAPTAIN}
        The wheel is choosing the next captain.
      {:else}
        Every team is set.
      {/if}
    </p>
  </div>
{/if}

{#if offline}
  <p class="offline">Reconnecting…</p>
{/if}

<style>
  .station {
    height: 100dvh;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--paper-2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 1.25rem;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
  }
  .num {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 2.8rem;
    line-height: 1;
    padding: 0.15rem 0.6rem;
    background: var(--signal);
    border-radius: 6px;
  }
  h1 {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.2;
  }
  .head p {
    margin: 0.1rem 0 0;
    color: var(--ink-2);
  }
  .body {
    min-height: 0;
    display: grid;
    grid-template-columns: 16rem 1fr;
  }
  .team {
    overflow-y: auto;
    padding: 1rem 1.1rem;
    background: var(--paper);
    border-right: 1px solid var(--line);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .roster {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  .roster li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--line);
    font-weight: 650;
  }
  .cap {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .sum-score {
    display: grid;
    grid-template-columns: 1fr 3.5rem 1.8rem;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    padding: 0.15rem 0;
  }
  .bar {
    height: 0.45rem;
    background: var(--paper-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--ink);
  }
  .avg {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }
  .sum-meter {
    padding: 0.2rem 0 0.15rem;
  }
  .sum-badges {
    display: grid;
    font-size: 0.82rem;
    padding: 0.35rem 0 0.1rem;
  }
  .sum-label {
    font-weight: 650;
  }
  .dim {
    color: var(--ink-2);
    font-size: 0.78rem;
  }

  .pool {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 1.25rem 0.4rem;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 650;
  }
  select {
    min-height: 2.25rem;
    padding: 0 0.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
  }
  .count {
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .panel {
    margin: 0 1.25rem 0.5rem;
    font-size: 0.85rem;
  }
  .panel > summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: fit-content;
    padding: 0.15rem 0;
    cursor: pointer;
    font-weight: 650;
    color: var(--ink-2);
  }
  .panel > summary:hover {
    color: var(--ink);
  }
  .count-badge {
    min-width: 1.2rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.75rem;
    text-align: center;
  }
  .panel-body {
    max-height: 32dvh;
    overflow-y: auto;
    margin: 0.4rem 0 0;
    padding: 0.6rem 0.8rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .filters.panel-body {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.25rem;
  }
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .filter-label {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink-2);
    margin-right: 0.15rem;
  }
  .chip {
    min-height: 1.9rem;
    padding: 0 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--paper);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 150ms var(--ease-out);
  }
  .chip:hover {
    border-color: var(--ink-2);
  }
  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .legend dl {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.15rem 1.25rem;
  }
  .legend dl div {
    display: flex;
    gap: 0.4rem;
  }
  .legend dt {
    font-weight: 650;
    white-space: nowrap;
  }
  .legend dd {
    margin: 0;
    color: var(--ink-2);
  }
  .notice {
    margin: 0 1.25rem 0.6rem;
    padding: 0.55rem 0.8rem;
    border-radius: var(--radius);
    background: var(--signal-tint);
    font-weight: 650;
  }
  .grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    align-content: start;
    gap: 0.75rem;
    padding: 0.2rem 1.25rem 1.25rem;
  }
  .empty {
    color: var(--ink-2);
  }

  .confirm {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    min-height: 4.25rem;
    padding: 0.6rem 1.25rem;
    background: var(--paper);
    border-top: 1px solid var(--line);
  }
  .confirm.open {
    background: var(--ink);
    color: var(--paper);
  }
  .confirm p {
    margin: 0 auto 0 0;
    font-size: 1.15rem;
  }
  .confirm strong {
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 900;
    color: var(--gold);
  }
  .confirm .btn.quiet {
    color: var(--paper);
  }
  .confirm .btn.quiet:hover:not(:disabled) {
    background: oklch(0.32 0.03 265);
  }
  .hint {
    color: var(--ink-2);
  }

  .rest {
    min-height: 100vh;
    display: grid;
    align-content: center;
    padding: 0 8vw;
    background: var(--paper);
  }
  .kicker {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.6rem;
    text-transform: uppercase;
    color: var(--signal-deep);
  }
  .headline,
  .big-code {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(4rem, 11vw, 9rem);
    line-height: 0.88;
    text-transform: uppercase;
  }
  .sub {
    font-size: 1.25rem;
    color: var(--ink-2);
    max-width: 36rem;
  }
  .submitted {
    background: var(--ink);
    color: var(--paper);
  }
  .submitted .kicker {
    color: var(--gold);
  }
  .submitted .sub {
    color: var(--paper-3);
  }
  .offline {
    position: fixed;
    right: 1rem;
    bottom: 5rem;
    margin: 0;
    padding: 0.4rem 0.8rem;
    background: var(--danger);
    color: var(--paper);
    border-radius: var(--radius);
    font-weight: 650;
  }
</style>
