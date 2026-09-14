<script>
  import { call, isMock } from '../lib/api.js'

  let base = $state('')
  call('getAppUrl').then((url) => (base = url))

  const screens = [
    { view: 'class', title: 'Class view', where: 'Projector. Wheel, reveals, and the team board.' },
    { view: 'captain', title: 'Captain station', where: 'The Chromebook at the front. Anonymous cards only.' },
    { view: 'admin', title: 'Admin board', where: 'Your computer. Run the draft (PIN required).' },
  ]
</script>

<main class="launcher">
  <h1>Team Draft Day</h1>
  <p class="lede">Open each screen on its own device. They stay in sync.</p>
  <ol>
    {#each screens as screen, i}
      <li>
        <span class="num">{i + 1}</span>
        <a href={base ? `${base}?view=${screen.view}` : undefined} target="_top">{screen.title}</a>
        <span class="where">{screen.where}</span>
      </li>
    {/each}
  </ol>
  {#if isMock}
    <p class="note">Running with fake students. The admin PIN is 1234.</p>
  {/if}
</main>

<style>
  .launcher {
    min-height: 100vh;
    padding: clamp(2rem, 8vw, 6rem);
    background: var(--paper);
    color: var(--ink);
  }
  h1 {
    font-family: var(--font-display);
    font-size: clamp(3rem, 9vw, 7rem);
    font-weight: 800;
    line-height: 0.9;
    text-transform: uppercase;
    margin: 0;
  }
  .lede {
    font-size: 1.125rem;
    color: var(--ink-2);
    margin: 1rem 0 3rem;
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0;
    max-width: 44rem;
    border-top: 2px solid var(--ink);
  }
  li {
    display: grid;
    grid-template-columns: 3rem 1fr;
    column-gap: 1rem;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--line);
  }
  .num {
    grid-row: span 2;
    font-family: var(--font-display);
    font-size: 2.5rem;
    font-weight: 800;
    line-height: 1;
    color: var(--signal);
  }
  a {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--ink);
  }
  .where {
    color: var(--ink-2);
  }
  .note {
    margin-top: 2rem;
    color: var(--ink-2);
  }
</style>
