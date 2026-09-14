import { PHASE, applyAction, makeCodes, phaseOf, replay, setupProblem } from './draftLogic.js'
import { adminView, captainView, classView } from './views.js'

// The backend API. Apps Script (gas/Code.js) and the dev mock (src/lib/mockBackend.js)
// each wrap this with their own storage, so the rules and privacy boundaries are the
// same in both places.
//
// store = {
//   getRoster()                  [{ id, name, period, fields }]
//   getColumns()                 [{ key, label, group, type, max }]
//   getPeriodTeams()             { [period]: numTeams }
//   getPin()                     string
//   getDraft()                   { id, period, numTeams, studentIds, codes, startedAt } | null
//   saveDraft(draft)
//   getLog(draftId)              [{ type, studentId, teamId, at }]
//   appendLog(draftId, entries)
//   writeTeams(draft, rows)
//   withLock(fn)
// }

const ADMIN_ACTIONS = ['spin', 'respin', 'captain', 'uncaptain', 'reject', 'pick', 'unpick', 'move', 'bench', 'unbench', 'place', 'complete', 'reopen']

export function createService(store, random = Math.random, now = () => new Date()) {
  function checkPin(pin) {
    const expected = store.getPin()
    if (!expected) throw new Error('No admin PIN is set yet. In the Apps Script editor, run setAdminPin.')
    if (String(pin) !== String(expected)) throw new Error('Wrong PIN.')
  }

  function load() {
    const draft = store.getDraft()
    if (!draft) return null
    const log = store.getLog(draft.id)
    const students = {}
    store.getRoster().forEach((s) => {
      students[s.id] = s
    })
    return {
      draft,
      log,
      students,
      columns: store.getColumns(),
      state: replay(draft.numTeams, draft.studentIds, log),
      version: draft.id + ':' + log.length,
    }
  }

  function requireDraft() {
    const loaded = load()
    if (!loaded) throw new Error('No draft has been started.')
    return loaded
  }

  function periods() {
    const saved = store.getPeriodTeams()
    const counts = {}
    store.getRoster().forEach((s) => {
      counts[s.period] = (counts[s.period] || 0) + 1
    })
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((period) => ({
        period,
        count: counts[period],
        numTeams: Number(saved[period]) || Math.max(2, Math.round(counts[period] / 4)),
      }))
  }

  function getVersion() {
    const draft = store.getDraft()
    return draft ? draft.id + ':' + store.getLog(draft.id).length : 'none'
  }

  function getState(view, pin) {
    if (view === 'admin') {
      checkPin(pin)
      const loaded = load()
      const base = loaded ? adminView(loaded) : { view: 'admin', version: 'none', phase: PHASE.SETUP }
      return Object.assign(base, { periods: periods() })
    }
    if (view !== 'captain' && view !== 'class') throw new Error('Unknown view: ' + view)
    const loaded = load()
    if (!loaded) return { view, version: 'none', phase: PHASE.SETUP }
    return view === 'captain' ? captainView(loaded) : classView(loaded)
  }

  function startDraft(pin, period, numTeams) {
    checkPin(pin)
    numTeams = Number(numTeams)
    store.withLock(() => {
      const ids = store
        .getRoster()
        .filter((s) => String(s.period) === String(period))
        .map((s) => s.id)
      const problem = setupProblem(ids.length, numTeams)
      if (problem) throw new Error(problem)
      const startedAt = now().toISOString()
      store.saveDraft({
        id: 'P' + period + '-' + startedAt.replace(/\D/g, '').slice(0, 14),
        period: String(period),
        numTeams,
        studentIds: ids,
        codes: makeCodes(ids, random),
        startedAt,
      })
    })
    return getState('admin', pin)
  }

  function act(pin, action) {
    checkPin(pin)
    if (!action || ADMIN_ACTIONS.indexOf(action.type) === -1) throw new Error('Unknown action.')
    store.withLock(() => {
      const loaded = requireDraft()
      commit(loaded, expand(loaded.state, action))
    })
    return getState('admin', pin)
  }

  function submitPick(code) {
    store.withLock(() => {
      const loaded = requireDraft()
      const studentId = Object.keys(loaded.draft.codes).filter((id) => loaded.draft.codes[id] === code)[0]
      if (!studentId || loaded.state.pool.indexOf(studentId) === -1) throw new Error('That card is no longer available.')
      commit(loaded, [{ type: 'submit', studentId }])
    })
    return getState('captain')
  }

  // Every action is checked against the draft rules before anything is written.
  function commit(loaded, actions) {
    const state = actions.reduce(applyAction, loaded.state)
    const at = now().toISOString()
    store.appendLog(
      loaded.draft.id,
      actions.map((a) => ({ type: a.type, studentId: a.studentId || null, teamId: a.teamId || null, at })),
    )
    if (phaseOf(state) === PHASE.COMPLETE) store.writeTeams(loaded.draft, teamRows(loaded, state))
  }

  // The server spins the wheel, so every screen lands on the same name.
  function expand(state, action) {
    const clean = { type: action.type, studentId: action.studentId || null, teamId: action.teamId || null }
    if (clean.type === 'spin') return [spinFrom(state.pool)]
    if (clean.type === 'respin') return [clean, spinFrom(state.pool.filter((id) => id !== state.spunId))]
    return [clean]
  }

  function spinFrom(ids) {
    if (ids.length === 0) throw new Error('No one is left on the wheel.')
    return { type: 'spin', studentId: ids[Math.floor(random() * ids.length)] }
  }

  function teamRows(loaded, state) {
    const name = (id) => (loaded.students[id] ? loaded.students[id].name : '')
    const rows = []
    state.teams.forEach((t, i) => {
      const team = 'Team ' + (i + 1)
      rows.push({ team, role: 'Captain', studentId: t.captainId, name: name(t.captainId) })
      t.members.forEach((id) => rows.push({ team, role: 'Teammate', studentId: id, name: name(id) }))
    })
    state.bench.forEach((id) => rows.push({ team: 'Not placed', role: '', studentId: id, name: name(id) }))
    return rows
  }

  return {
    getVersion,
    getState,
    checkPin(pin) {
      checkPin(pin)
      return true
    },
    startDraft,
    act,
    submitPick,
  }
}
