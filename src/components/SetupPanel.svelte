<script>
  import { setupProblem, teamSizes } from '../shared/draftLogic.js'

  let { periods = [], activeDraft = null, onstart, oncancel = null } = $props()

  let period = $state(null)
  let numTeams = $state(2)
  let busy = $state(false)
  let error = $state('')

  function choose(p) {
    period = p.period
    numTeams = p.numTeams
    error = ''
  }

  let chosen = $derived(periods.find((p) => p.period === period) || null)
  let problem = $derived(chosen ? setupProblem(chosen.count, numTeams) : null)
  let sizes = $derived(chosen && !problem ? teamSizes(chosen.count, numTeams) : [])

  async function start() {
    busy = true
    error = ''
    try {
      await onstart(period, numTeams)
    } catch (err) {
      error = err.message
    } finally {
      busy = false
    }
  }
</script>

<section class="setup">
  <h1>New draft</h1>

  <h2>Period</h2>
  {#if periods.length}
    <div class="periods" role="radiogroup" aria-label="Period">
      {#each periods as p (p.period)}
        <button class="period" class:on={period === p.period} role="radio" aria-checked={period === p.period} onclick={() => choose(p)}>
          <span class="p-name">Period {p.period}</span>
          <span class="p-count">{p.count} students</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="warn">No students found. Check the Students tab in the Sheet.</p>
  {/if}

  {#if chosen}
    <h2>Teams</h2>
    <div class="teams">
      <button class="btn step" onclick={() => (numTeams = Math.max(2, numTeams - 1))} aria-label="Fewer teams">−</button>
      <span class="n">{numTeams}</span>
      <button class="btn step" onclick={() => (numTeams = numTeams + 1)} aria-label="More teams">+</button>
      <span class="sizes">
        {#if problem}
          {problem}
        {:else}
          Team sizes: {sizes.join(' · ')}
        {/if}
      </span>
    </div>

    {#if activeDraft}
      <p class="warn">This replaces the current draft for Period {activeDraft.period}. Its picks stay in the Picks tab.</p>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  {/if}

  <div class="actions">
    {#if oncancel}
      <button class="btn quiet big" onclick={oncancel}>Back to the draft</button>
    {/if}
    <button class="btn signal big" disabled={!chosen || !!problem || busy} onclick={start}>{busy ? 'Starting…' : 'Start draft'}</button>
  </div>
</section>

<style>
  .setup {
    max-width: 42rem;
    padding: 2rem 1.5rem 3rem;
  }
  h1 {
    margin: 0 0 1.5rem;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 3rem;
    line-height: 0.9;
    text-transform: uppercase;
  }
  h2 {
    margin: 1.5rem 0 0.6rem;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .periods {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .period {
    display: grid;
    text-align: left;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
    cursor: pointer;
    min-width: 9rem;
  }
  .period:hover {
    border-color: var(--ink-2);
  }
  .period.on {
    border-color: var(--ink);
    box-shadow: 0 0 0 2px var(--ink);
  }
  .p-name {
    font-weight: 700;
  }
  .p-count {
    color: var(--ink-2);
    font-size: 0.9rem;
  }
  .teams {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .step {
    width: 2.5rem;
    padding: 0;
    font-size: 1.2rem;
  }
  .n {
    min-width: 2.5rem;
    text-align: center;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 2.4rem;
    line-height: 1;
  }
  .sizes {
    margin-left: 0.5rem;
    color: var(--ink-2);
  }
  .warn,
  .error {
    margin: 1.25rem 0 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--signal-tint);
  }
  .error {
    background: var(--danger-tint);
    color: var(--danger);
    font-weight: 650;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 2rem;
  }
</style>
