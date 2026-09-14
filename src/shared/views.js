import { PHASE, applyAction, phaseOf, turnTeam } from './draftLogic.js'
import { normalizePersonality, optionLabel } from './roster.js'

// What each screen is allowed to know. The backend only ever sends one of these,
// so a student with DevTools open still can't connect a name to a card.
//
//   captain  anonymous cards for unpicked students; names only for the current
//            captain's own team, and only during their turn
//   class    short names only; never traits or card codes
//   admin    everything (the service checks the PIN)

const REVEALED_EVENTS = ['spin', 'captain', 'pick']

export function captainView({ state, draft, students, columns, version }) {
  const phase = phaseOf(state)
  const base = { view: 'captain', version, phase }
  if (phase !== PHASE.CHOOSING && phase !== PHASE.PENDING_PICK) return base

  const team = turnTeam(state)
  // Teacher-only checks never leave the server for this view.
  const shown = columns.filter((c) => c.type !== 'flag')
  return Object.assign(base, {
    captain: { teamId: team.id, name: shortOf(students, team.captainId) },
    team: [team.captainId].concat(team.members).map((id) => ({
      name: shortOf(students, id),
      captain: id === team.captainId,
      traits: traitsOf(students[id], shown),
    })),
    cards: state.pool
      .map((id) => ({ code: draft.codes[id], traits: traitsOf(students[id], shown) }))
      .sort((a, b) => (a.code < b.code ? -1 : 1)),
    pendingCode: state.pendingId ? draft.codes[state.pendingId] : null,
    columns: shown,
  })
}

export function classView({ state, students, version }) {
  const phase = phaseOf(state)
  const team = turnTeam(state)
  const name = (id) => shortOf(students, id)
  const wheelUp = state.teams.length < state.numTeams && (phase === PHASE.SPIN || phase === PHASE.CONFIRM_CAPTAIN)
  // Sorted by name so a spot on the wheel can't be matched to a card's position.
  const wheel = wheelUp ? state.pool.map(name).sort((a, b) => a.localeCompare(b)) : []
  const e = state.lastEvent

  return {
    view: 'class',
    version,
    phase,
    numTeams: state.numTeams,
    wheel,
    spun: state.spunId ? { name: name(state.spunId), index: wheel.indexOf(name(state.spunId)) } : null,
    teams: state.teams.map((t) => ({ id: t.id, captain: name(t.captainId), members: t.members.map(name) })),
    turn: phase === PHASE.CHOOSING || phase === PHASE.PENDING_PICK ? { teamId: team.id, captain: name(team.captainId) } : null,
    remaining: state.pool.length,
    // A submitted pick stays nameless until the teacher locks it in.
    lastEvent: e
      ? {
          seq: e.seq,
          type: e.type,
          teamId: e.teamId,
          name: REVEALED_EVENTS.indexOf(e.type) !== -1 && e.studentId ? name(e.studentId) : null,
        }
      : null,
  }
}

export function adminView({ state, draft, students, columns, version }) {
  const phase = phaseOf(state)
  const team = turnTeam(state)
  const byName = (a, b) => nameOf(students, a).localeCompare(nameOf(students, b))
  const people = {}
  draft.studentIds.forEach((id) => {
    people[id] = { id, name: nameOf(students, id), code: draft.codes[id], traits: traitsOf(students[id], columns) }
  })
  const latest = state.turnLog.filter((t) => t.turnIndex === state.turnPicks - 1)[0]

  return {
    view: 'admin',
    version,
    phase,
    draft: { id: draft.id, period: draft.period, numTeams: draft.numTeams, startedAt: draft.startedAt },
    columns,
    people,
    teams: state.teams,
    pool: state.pool.slice().sort(byName),
    bench: state.bench.slice().sort(byName),
    spunId: state.spunId,
    pendingId: state.pendingId,
    turnTeamId: phase === PHASE.CHOOSING || phase === PHASE.PENDING_PICK ? team.id : null,
    latestPickId: latest ? latest.studentId : null,
    canUncaptain: allowed(state, { type: 'uncaptain' }),
    lastEvent: state.lastEvent,
  }
}

function allowed(state, action) {
  try {
    applyAction(state, action)
    return true
  } catch (err) {
    return false
  }
}

function nameOf(students, id) {
  return students[id] ? students[id].name : '(not on roster)'
}

function shortOf(students, id) {
  const s = students[id]
  return s ? s.shortName || s.name : '(not on roster)'
}

// A column can read several questions at once (eSkill #1 + #2 + #3).
function traitsOf(student, columns) {
  const traits = {}
  columns.forEach((c) => {
    const sources = c.sources && c.sources.length ? c.sources : [c.key]
    traits[c.key] = student ? normalizeTrait(sources.map((s) => student.fields[s]), c.type) : null
  })
  return traits
}

function normalizeTrait(values, type) {
  const filled = values.filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
  if (!filled.length) return null
  if (type === 'tags') {
    const list = []
    filled.forEach((v) => {
      // One question per value when combined; a single column may hold "a, b, c".
      const parts = Array.isArray(v) ? v : values.length > 1 ? [v] : String(v).split(/[,;]/)
      parts
        .map((p) => optionLabel(p))
        .filter(Boolean)
        .forEach((p) => {
          if (list.indexOf(p) === -1) list.push(p)
        })
    })
    return list.length ? list : null
  }
  const first = filled[0]
  if (type === 'scale') {
    const n = Number(first)
    return isNaN(n) ? null : Math.max(0, Math.min(100, n))
  }
  if (type === 'score') {
    const n = Number(first)
    return isNaN(n) ? null : n
  }
  if (type === 'personality') return normalizePersonality(first)
  if (type === 'badge') return optionLabel(first)
  return String(first).trim()
}
