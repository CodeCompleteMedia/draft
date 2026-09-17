<script>
  import { scaleBand } from '../lib/traits.js'

  // A diverging meter: the fill grows from the 50% baseline toward whichever side
  // the student leans, so direction reads before the number does. Cool for the low
  // end, warm for the high end, neutral grey when it sits on the fence.
  //
  // Only a team average sits on the fence. One student always leans somewhere, however
  // slightly, so an individual meter always names the side and the percentage. The grey
  // is reserved for `average`, where a middle reading is real information: the team has
  // no pull either way yet, and the next pick could give it one.
  let { value, poles, label, compact = false, average = false } = $props()

  let band = $derived(scaleBand(value, poles))
  let balanced = $derived(average && band !== null && band.band === 'Balanced')
  let side = $derived(balanced ? 'mid' : value <= 50 ? 'low' : 'high')
</script>

{#if band}
  <span class="meter" class:compact title={poles ? `${poles.low} ← → ${poles.high}` : label}>
    <span class="head">
      <span class="name">{label}</span>
      <span class="read">{balanced ? 'Balanced' : `${band.percent}% ${band.side}`}</span>
    </span>
    <span class="track" aria-hidden="true">
      <span class="fill {side}" style="left: {Math.min(value, 50)}%; right: {100 - Math.max(value, 50)}%"></span>
      <span class="baseline"></span>
    </span>
    <span class="visually-hidden">
      {label}: {balanced ? 'Balanced' : `${band.percent}% toward ${band.side}`}{poles ? `; the scale runs ${poles.low} to ${poles.high}` : ''}
    </span>
  </span>
{/if}

<style>
  .meter {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    line-height: 1.2;
  }
  .name {
    font-size: 0.8rem;
    color: var(--ink-2);
  }
  .read {
    font-size: 0.85rem;
    font-weight: 700;
    text-align: right;
  }
  .compact .name,
  .compact .read {
    font-size: 0.78rem;
  }
  .track {
    position: relative;
    height: 10px;
    border-radius: 5px;
    background: var(--meter-track);
  }
  .compact .track {
    height: 7px;
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 3px;
  }
  /* Square at the baseline, rounded at the data end. */
  .fill.low {
    border-radius: 5px 0 0 5px;
    background: var(--meter-low);
  }
  .fill.high {
    border-radius: 0 5px 5px 0;
    background: var(--meter-high);
  }
  .fill.mid {
    border-radius: 5px;
    background: var(--meter-mid);
  }
  .baseline {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 1px;
    background: var(--meter-baseline);
  }
</style>
