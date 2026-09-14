<script>
  import { groupColumns, listValues, roleGroupOf, scoreFraction } from '../lib/traits.js'
  import { PERSONALITY_ROLES, describeOption } from '../shared/formOptions.js'
  import { personalityIdentity, personalityParts, personalityType } from '../shared/roster.js'
  import Meter from './Meter.svelte'

  let { card, columns, selected = false, onselect } = $props()

  let groups = $derived(groupColumns(columns))
  // With the sliders on the card, the list of preference words would just repeat them.
  let hasScales = $derived(columns.some((c) => c.type === 'scale'))
</script>

<button type="button" class="card" class:selected aria-pressed={selected} onclick={() => onselect(card.code)}>
  <span class="jersey"><span class="hash">#</span>{card.code}</span>
  {#each groups as group (group.name)}
    <span class="group">
      <span class="group-name">{group.name}</span>
      {#each group.columns as column (column.key)}
        {@const value = card.traits[column.key]}
        {#if value === null || value === undefined}
          <span class="missing">{group.columns.length > 1 ? `${column.label}: ` : ''}No answer yet</span>
        {:else if column.type === 'personality'}
          {@const type = personalityType(value)}
          {@const identity = personalityIdentity(value)}
          {@const roles = roleGroupOf(value)}
          <span class="ptype">
            <span class="ptype-code">{value}{#if PERSONALITY_ROLES[type]}<span class="ptype-role">{PERSONALITY_ROLES[type]}</span>{/if}</span>
            {#if roles || identity}
              <span class="badges">
                {#if roles}<span class="badge">{roles}</span>{/if}
                {#if identity}<span class="badge">{identity}</span>{/if}
              </span>
            {/if}
            {#if !hasScales && personalityParts(value).length}
              <span class="ptype-words">{personalityParts(value).join(' · ')}</span>
            {/if}
          </span>
        {:else if column.type === 'scale'}
          <Meter {value} poles={column.poles} label={column.label} />
        {:else if column.type === 'score'}
          <span class="score" title="{column.label}: {value} of {column.max || 5}">
            <span class="label">{column.label}</span>
            <span class="meter" aria-hidden="true">
              {#each Array(column.max || 5) as _, i (i)}
                <span class="seg" class:on={i < Math.round(scoreFraction(value, column) * (column.max || 5))}></span>
              {/each}
            </span>
            <span class="visually-hidden">{value} of {column.max || 5}</span>
          </span>
        {:else if column.type === 'text'}
          <span class="text">{#if group.columns.length > 1}<span class="label">{column.label}</span>{/if}{value}</span>
        {:else}
          <span class="badges">
            {#if group.columns.length > 1}<span class="visually-hidden">{column.label}:</span>{/if}
            {#each listValues(value) as v (v)}
              <span class="badge" title={describeOption(v) || undefined}>{v}</span>
            {/each}
          </span>
        {/if}
      {/each}
    </span>
  {/each}
</button>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    text-align: left;
    padding: 0.8rem 0.9rem 0.95rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 150ms var(--ease-out),
      box-shadow 150ms var(--ease-out),
      transform 150ms var(--ease-out);
  }
  .card:hover {
    border-color: var(--ink-2);
    box-shadow: 0 6px 18px -10px oklch(0.21 0.025 265 / 0.35);
  }
  .card.selected {
    border-color: var(--ink);
    box-shadow:
      0 0 0 2px var(--ink),
      0 10px 24px -12px oklch(0.21 0.025 265 / 0.45);
    transform: translateY(-2px);
  }
  .jersey {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 2.6rem;
    line-height: 0.85;
    letter-spacing: -0.01em;
  }
  .selected .jersey {
    color: var(--signal-deep);
  }
  .hash {
    font-size: 0.55em;
    vertical-align: 0.55em;
    margin-right: 0.05em;
    color: var(--ink-2);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .group-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ink-2);
  }
  .ptype {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ptype-code {
    font-family: var(--font-display);
    font-weight: 850;
    font-size: 1.9rem;
    line-height: 1;
    letter-spacing: 0.02em;
  }
  .ptype-role {
    margin-left: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: 0;
    color: var(--ink-2);
  }
  .ptype-words {
    font-size: 0.8rem;
    color: var(--ink-2);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .badge {
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--paper-2);
    border: 1px solid var(--line);
  }
  .missing {
    font-size: 0.82rem;
    font-style: italic;
    color: var(--ink-2);
  }
  .score {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.5rem;
  }
  .label {
    font-size: 0.82rem;
    color: var(--ink);
  }
  .meter {
    display: flex;
    gap: 2px;
  }
  .seg {
    width: 0.9rem;
    height: 0.55rem;
    border-radius: 2px;
    background: var(--paper-3);
  }
  .seg.on {
    background: var(--ink);
  }
  .text {
    font-size: 0.85rem;
    color: var(--ink-2);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .text .label {
    display: block;
    font-weight: 650;
  }
</style>
