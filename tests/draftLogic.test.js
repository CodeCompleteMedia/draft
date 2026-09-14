import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHASE,
  applyAction,
  initialState,
  makeCodes,
  phaseOf,
  replay,
  setupProblem,
  teamSizes,
  turnTeam,
} from '../src/shared/draftLogic.js'

function seeded(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ids = (n) => Array.from({ length: n }, (_, i) => `s${i + 1}`)

// Runs one step the way the three views would, and records the action.
function step(state, log, random) {
  const pickFrom = (list) => list[Math.floor(random() * list.length)]
  const action = {
    [PHASE.SPIN]: () => ({ type: 'spin', studentId: pickFrom(state.pool) }),
    [PHASE.CONFIRM_CAPTAIN]: () => ({ type: 'captain' }),
    [PHASE.CHOOSING]: () => ({ type: 'submit', studentId: pickFrom(state.pool) }),
    [PHASE.PENDING_PICK]: () => ({ type: 'pick', teamId: turnTeam(state).id }),
    [PHASE.DONE]: () => ({ type: 'complete' }),
  }[phaseOf(state)]()
  log.push(action)
  return applyAction(state, action)
}

function runDraft(count, numTeams, seed = 1) {
  const random = seeded(seed)
  const log = []
  let state = initialState(numTeams, ids(count))
  while (phaseOf(state) !== PHASE.COMPLETE) state = step(state, log, random)
  return { state, log }
}

function run(state, ...actions) {
  return actions.reduce(applyAction, state)
}

// Gets a draft to the rotation rounds: every team has a captain and one teammate.
function throughCaptainRounds(count, numTeams) {
  let state = initialState(numTeams, ids(count))
  const random = seeded(7)
  const log = []
  while (!(state.teams.length === numTeams && state.turnPicks === numTeams)) state = step(state, log, random)
  return state
}

function assigned(state) {
  return state.teams.flatMap((t) => [t.captainId, ...t.members])
}

test('a full draft puts every student on exactly one team', () => {
  const { state } = runDraft(28, 6)
  const all = assigned(state)
  assert.equal(all.length, 28)
  assert.equal(new Set(all).size, 28)
  assert.deepEqual(state.pool, [])
})

test('extra students go to the earliest captains', () => {
  const { state } = runDraft(28, 6)
  assert.deepEqual(
    state.teams.map((t) => 1 + t.members.length),
    [5, 5, 5, 5, 4, 4],
  )
})

test('team sizes never differ by more than one, for many class sizes', () => {
  for (let count = 8; count <= 40; count++) {
    for (let numTeams = 2; numTeams <= Math.min(8, count / 2); numTeams++) {
      const { state } = runDraft(count, numTeams, count * numTeams)
      const sizes = state.teams.map((t) => 1 + t.members.length)
      assert.deepEqual(sizes, teamSizes(count, numTeams), `${count} students, ${numTeams} teams`)
    }
  }
})

test('captain rounds interleave spin, captain, pick; then turns go 1-2-3-1-2-3', () => {
  const { log } = runDraft(12, 3)
  const kinds = log.map((a) => a.type).filter((t) => t !== 'submit')
  assert.deepEqual(kinds.slice(0, 9), ['spin', 'captain', 'pick', 'spin', 'captain', 'pick', 'spin', 'captain', 'pick'])
  const pickTeams = log.filter((a) => a.type === 'pick').map((a) => a.teamId)
  assert.deepEqual(pickTeams, ['T1', 'T2', 'T3', 'T1', 'T2', 'T3', 'T1', 'T2', 'T3'])
})

test('replaying the log rebuilds the same state (resume after refresh)', () => {
  const random = seeded(3)
  const log = []
  let state = initialState(4, ids(20))
  for (let i = 0; i < 30; i++) state = step(state, log, random)
  assert.deepEqual(replay(4, ids(20), log), state)
})

test('re-spin clears the wheel result and keeps that student on the wheel', () => {
  let s = run(initialState(3, ids(9)), { type: 'spin', studentId: 's4' })
  assert.equal(phaseOf(s), PHASE.CONFIRM_CAPTAIN)
  s = run(s, { type: 'respin' })
  assert.equal(phaseOf(s), PHASE.SPIN)
  assert.equal(s.spunId, null)
  assert.ok(s.pool.includes('s4'))
})

test('benching a spun captain who is absent goes back to the wheel without them', () => {
  let s = run(initialState(3, ids(9)), { type: 'spin', studentId: 's4' }, { type: 'bench', studentId: 's4' })
  assert.equal(phaseOf(s), PHASE.SPIN)
  assert.ok(!s.pool.includes('s4'))
  assert.deepEqual(s.bench, ['s4'])
})

test('rejecting a pending pick lets the same captain choose again', () => {
  let s = run(
    initialState(3, ids(9)),
    { type: 'spin', studentId: 's1' },
    { type: 'captain' },
    { type: 'submit', studentId: 's5' },
  )
  assert.equal(phaseOf(s), PHASE.PENDING_PICK)
  s = run(s, { type: 'reject' })
  assert.equal(phaseOf(s), PHASE.CHOOSING)
  assert.equal(turnTeam(s).id, 'T1')
  assert.ok(s.pool.includes('s5'))
})

test('a pick must be the pending student, for the team whose turn it is', () => {
  const s = run(
    initialState(2, ids(8)),
    { type: 'spin', studentId: 's1' },
    { type: 'captain' },
    { type: 'submit', studentId: 's5' },
  )
  assert.throws(() => applyAction(s, { type: 'pick', studentId: 's6' }), /chosen student/)
  assert.throws(() => applyAction(s, { type: 'pick', teamId: 'T2' }), /whose turn/)
  assert.throws(() => applyAction(initialState(2, ids(8)), { type: 'pick' }), /right now/)
})

test('undoing the most recent pick hands the turn back to that captain', () => {
  const s = throughCaptainRounds(12, 3)
  assert.equal(turnTeam(s).id, 'T1')
  const lastPicked = s.teams[2].members[0] // T3 made the latest pick
  const undone = run(s, { type: 'unpick', studentId: lastPicked })
  assert.equal(turnTeam(undone).id, 'T3')
  assert.equal(phaseOf(undone), PHASE.CHOOSING)
  assert.ok(undone.pool.includes(lastPicked))
})

test('sending an older pick back to the pool does not change whose turn it is', () => {
  const s = throughCaptainRounds(12, 3)
  const olderPick = s.teams[0].members[0]
  const after = run(s, { type: 'unpick', studentId: olderPick })
  assert.equal(after.turnPicks, s.turnPicks)
  assert.equal(turnTeam(after).id, 'T1')
})

test('undoing the latest pick while another pick is pending clears the pending pick', () => {
  let s = throughCaptainRounds(12, 3)
  const lastPicked = s.teams[2].members[0]
  s = run(s, { type: 'submit', studentId: s.pool[0] })
  s = run(s, { type: 'unpick', studentId: lastPicked })
  assert.equal(s.pendingId, null)
  assert.equal(turnTeam(s).id, 'T3')
})

test('moving a teammate between teams does not change the turn; captains cannot move', () => {
  const s = throughCaptainRounds(12, 3)
  const mover = s.teams[0].members[0]
  const after = run(s, { type: 'move', studentId: mover, teamId: 'T2' })
  assert.ok(after.teams[1].members.includes(mover))
  assert.equal(after.turnPicks, s.turnPicks)
  assert.throws(() => applyAction(s, { type: 'move', studentId: s.teams[0].captainId, teamId: 'T2' }), /Captains/)
  assert.throws(() => applyAction(s, { type: 'unpick', studentId: s.teams[0].captainId }), /Captains/)
})

test('bench, unbench, and placing a late student onto a team', () => {
  let s = throughCaptainRounds(12, 3)
  const absent = s.pool[0]
  s = run(s, { type: 'bench', studentId: absent })
  assert.ok(!s.pool.includes(absent))
  s = run(s, { type: 'unbench', studentId: absent })
  assert.ok(s.pool.includes(absent))
  s = run(s, { type: 'bench', studentId: absent })
  const turnBefore = s.turnPicks
  s = run(s, { type: 'place', studentId: absent, teamId: 'T2' })
  assert.ok(s.teams[1].members.includes(absent))
  assert.equal(s.turnPicks, turnBefore)
  assert.throws(() => applyAction(s, { type: 'place', studentId: s.pool[0], teamId: 'T1' }), /bench/)
})

test('benching a teammate works like sending them to the pool first', () => {
  const s = throughCaptainRounds(12, 3)
  const lastPicked = s.teams[2].members[0]
  const after = run(s, { type: 'bench', studentId: lastPicked })
  assert.deepEqual(after.bench, [lastPicked])
  assert.equal(turnTeam(after).id, 'T3')
})

test('a captain can be undone only before their team has a teammate', () => {
  let s = run(initialState(3, ids(9)), { type: 'spin', studentId: 's1' }, { type: 'captain' })
  const undone = run(s, { type: 'uncaptain' })
  assert.equal(undone.teams.length, 0)
  assert.ok(undone.pool.includes('s1'))
  s = run(s, { type: 'submit', studentId: 's2' }, { type: 'pick' })
  assert.throws(() => applyAction(s, { type: 'uncaptain' }), /before/)
})

test('complete only when everyone is placed; reopen allows changes again', () => {
  const s = throughCaptainRounds(12, 3)
  assert.throws(() => applyAction(s, { type: 'complete' }), /right now/)
  const { state } = runDraft(9, 3)
  assert.equal(phaseOf(state), PHASE.COMPLETE)
  assert.throws(() => applyAction(state, { type: 'unpick', studentId: state.teams[0].members[0] }), /Reopen/)
  const moved = run(state, { type: 'move', studentId: state.teams[0].members[0], teamId: 'T2' })
  assert.equal(phaseOf(moved), PHASE.COMPLETE)
  assert.equal(phaseOf(run(state, { type: 'reopen' })), PHASE.DONE)
})

test('the class view gets a new event for every spin, captain, and pick', () => {
  let s = run(initialState(2, ids(6)), { type: 'spin', studentId: 's3' })
  assert.deepEqual(s.lastEvent, { seq: 1, type: 'spin', studentId: 's3', teamId: null })
  s = run(s, { type: 'captain' })
  assert.deepEqual(s.lastEvent, { seq: 2, type: 'captain', studentId: 's3', teamId: 'T1' })
  s = run(s, { type: 'submit', studentId: 's5' }, { type: 'pick' })
  assert.deepEqual(s.lastEvent, { seq: 4, type: 'pick', studentId: 's5', teamId: 'T1' })
})

test('anonymous codes are unique and do not follow roster order', () => {
  const roster = ids(40)
  const codes = makeCodes(roster, seeded(11))
  const values = Object.values(codes)
  assert.equal(new Set(values).size, 40)
  assert.ok(values.every((c) => /^[A-HJ-NP-Z][2-9]$/.test(c)))
  assert.notDeepEqual(values, values.slice().sort())
  assert.deepEqual(makeCodes(roster, seeded(11)), codes)
})

test('setup checks and team size preview', () => {
  assert.equal(setupProblem(28, 6), null)
  assert.match(setupProblem(9, 5), /isn't enough/)
  assert.match(setupProblem(20, 1), /at least 2/)
  assert.deepEqual(teamSizes(28, 6), [5, 5, 5, 5, 4, 4])
})
