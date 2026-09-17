<script>
  import { listValues, scaleBand } from '../lib/traits.js'

  // action: an optional { label, onclick, disabled } button, e.g. "Back to pool".
  let { person, columns = [], tag = null, tone = null, action = null } = $props()
  let open = $state(false)

  function traitText(column, value) {
    if (value === null || value === undefined) return '–'
    if (column.type === 'score') return value + ' / ' + (column.max || 5)
    if (column.type === 'scale') {
      const band = scaleBand(value, column.poles)
      return band ? band.percent + '% ' + band.side : String(value)
    }
    return listValues(value).join(', ') || '–'
  }
</script>

<div class="row" class:signal={tone === 'signal'} class:gold={tone === 'gold'}>
  <span class="name">{person ? person.name : '(not on roster)'}</span>
  {#if tag}
    <span class="tag">{tag}</span>
  {/if}
  <span class="code">#{person ? person.code : '?'}</span>
  {#if action}
    <button type="button" class="act" disabled={action.disabled} onclick={action.onclick} onpointerdown={(e) => e.stopPropagation()}>
      {action.label}
    </button>
  {/if}
  <button
    type="button"
    class="more"
    aria-expanded={open}
    aria-label="{open ? 'Hide' : 'Show'} traits for {person ? person.name : 'student'}"
    onclick={() => (open = !open)}
    onpointerdown={(e) => e.stopPropagation()}
  >
    {open ? '−' : '+'}
  </button>
  {#if open && person}
    <dl class="traits">
      {#each columns as column (column.key)}
        {@const value = person.traits[column.key]}
        <dt>{column.label}</dt>
        <dd>{traitText(column, value)}</dd>
      {/each}
    </dl>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto auto auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.4rem 0.35rem 0.6rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .row.signal {
    background: var(--signal-tint);
    border-color: var(--signal-deep);
  }
  .row.gold {
    background: oklch(0.93 0.07 85);
    border-color: oklch(0.7 0.12 85);
  }
  .name {
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    white-space: nowrap;
  }
  .code {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.05rem;
    color: var(--ink-2);
  }
  .act {
    font-size: 0.72rem;
    font-weight: 650;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    color: var(--ink-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .act:hover:not(:disabled) {
    border-color: var(--ink-2);
    color: var(--ink);
  }
  .act:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .more {
    width: 1.6rem;
    height: 1.6rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
    line-height: 1;
  }
  .more:hover {
    border-color: var(--line);
    background: var(--paper-2);
  }
  .traits {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.6rem;
    margin: 0.3rem 0 0.1rem;
    font-size: 0.8rem;
    cursor: auto;
  }
  dt {
    color: var(--ink-2);
  }
  dd {
    margin: 0;
  }
</style>
