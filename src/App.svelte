<script>
  import { getParams } from './lib/api.js'
  import Admin from './views/Admin.svelte'
  import CaptainDashboard from './views/CaptainDashboard.svelte'
  import ClassView from './views/ClassView.svelte'
  import Launcher from './views/Launcher.svelte'

  let view = $state(null)

  getParams().then((params) => {
    view = params.view || 'home'
  })
</script>

{#if view === 'admin'}
  <Admin />
{:else if view === 'class'}
  <ClassView />
{:else if view === 'captain'}
  <CaptainDashboard />
{:else if view === 'home'}
  <Launcher />
{/if}
