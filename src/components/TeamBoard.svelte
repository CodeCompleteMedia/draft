<script>
  import { teamSizes } from '../shared/draftLogic.js'

  let { teams = [], numTeams = 0, total = 0, turnTeamId = null, pending = false, fresh = null } = $props()

  const pad = (n) => String(n).padStart(2, '0')

  let sizes = $derived(numTeams && total >= numTeams ? teamSizes(total, numTeams) : [])
  let slots = $derived(Array.from({ length: numTeams }, (_, i) => ({ number: i + 1, team: teams[i] || null, size: sizes[i] || 0 })))
  let columns = $derived(numTeams <= 6 ? numTeams : Math.ceil(numTeams / 2))
</script>

<ol class="board" style="--cols: {columns}">
  {#each slots as slot (slot.number)}
    {@const onClock = !!slot.team && slot.team.id === turnTeamId}
    {@const open = Math.max(0, slot.size - 1 - (slot.team ? slot.team.members.length : 0))}
    <li class="team" class:on-clock={onClock}>
      <div class="head">
        <span class="num">{pad(slot.number)}</span>
        {#if onClock}
          <span class="flag">{pending ? 'Pick is in' : 'On the clock'}</span>
        {/if}
      </div>
      {#if slot.team}
        <p class="captain"><span class="c" title="Captain">C</span>{slot.team.captain}</p>
      {:else}
        <p class="captain tbd">Captain to come</p>
      {/if}
      <ul class="members">
        {#if slot.team}
          {#each slot.team.members as name, i (name + i)}
            <li class:fresh={fresh && fresh.teamId === slot.team.id && fresh.name === name}>{name}</li>
          {/each}
        {/if}
        {#each Array(open) as _, i (i)}
          <li class="open" aria-hidden="true"></li>
        {/each}
      </ul>
    </li>
  {/each}
</ol>

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 1.4vw;
    align-content: start;
  }
  .team {
    border-top: 0.45vw solid var(--ink);
    padding: 0.6vw 0.8vw 1vw;
    transition: background-color 300ms var(--ease-out);
  }
  .team.on-clock {
    background: var(--signal-tint);
    border-top-color: var(--signal-deep);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5vw;
  }
  .num {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2rem, 4.2vw, 5.5rem);
    line-height: 0.9;
    font-variant-numeric: tabular-nums;
  }
  .on-clock .num {
    color: var(--signal-deep);
  }
  .flag {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(0.9rem, 1.25vw, 1.6rem);
    text-transform: uppercase;
    background: var(--signal-deep);
    color: var(--paper);
    padding: 0.1em 0.45em;
    border-radius: 4px;
    white-space: nowrap;
  }
  .captain {
    display: flex;
    align-items: center;
    gap: 0.45vw;
    margin: 0.5vw 0 0.6vw;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.3rem, 2.3vw, 3rem);
    line-height: 1;
    text-transform: uppercase;
    min-height: 1.1em;
  }
  .captain.tbd {
    color: var(--ink-2);
    font-weight: 600;
    font-size: clamp(1rem, 1.6vw, 2rem);
  }
  .c {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.05em;
    height: 1.05em;
    font-size: 0.62em;
    border: 0.12em solid currentColor;
    border-radius: 50%;
  }
  .members {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .members li {
    font-family: var(--font-display);
    font-weight: 650;
    font-size: clamp(1.1rem, 1.95vw, 2.6rem);
    line-height: 1.15;
    padding: 0.2vw 0;
    border-bottom: 1px solid var(--line);
    min-height: calc(1.15em + 0.4vw + 1px);
  }
  .members li.open {
    border-bottom-style: dashed;
    border-bottom-color: var(--paper-3);
  }
  .members li.fresh {
    animation: fresh 3.5s var(--ease-out);
  }
  @keyframes fresh {
    0%,
    40% {
      background-color: var(--gold);
    }
    100% {
      background-color: transparent;
    }
  }
</style>
