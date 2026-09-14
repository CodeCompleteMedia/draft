// Draft rules, shared by the Apps Script backend and the in-browser mock.
//
// A draft is an append-only log of actions. The current state is always rebuilt by
// replaying that log, so a refresh, a crashed Chromebook, or tomorrow's class picks
// up exactly where things left off.
//
// Keep this file free of imports and of browser or Apps Script APIs:
// scripts/build-gas.mjs strips the `export` keywords and copies it into gas/.

export const PHASE = {
  SETUP: 'SETUP', // no draft started
  SPIN: 'SPIN', // waiting for the wheel
  CONFIRM_CAPTAIN: 'CONFIRM_CAPTAIN', // wheel landed; teacher confirms or re-spins
  CHOOSING: 'CHOOSING', // captain is looking at the cards
  PENDING_PICK: 'PENDING_PICK', // captain chose; teacher locks it in
  DONE: 'DONE', // everyone is on a team, not saved yet
  COMPLETE: 'COMPLETE', // teams written to the sheet
}

export function initialState(numTeams, studentIds) {
  return {
    numTeams,
    teams: [], // { id, captainId, members[] } in the order captains were spun
    pool: studentIds.slice(),
    bench: [], // "Not here": off the wheel and off the captain dashboard
    spunId: null,
    pendingId: null,
    turnPicks: 0, // picks that used up a turn; decides whose turn it is
    turnLog: [], // { studentId, turnIndex } for turn picks still on a team
    complete: false,
    lastEvent: null, // what the class view should animate
    seq: 0,
  }
}

export function replay(numTeams, studentIds, log) {
  return log.reduce(applyAction, initialState(numTeams, studentIds))
}

// Captain k makes pick k during the captain rounds, then turns go 1-2-3-1-2-3,
// so one formula covers both.
export function turnTeam(state) {
  const captains = state.teams.length
  if (captains === 0) return null
  if (state.turnPicks < captains || captains === state.numTeams) {
    return state.teams[state.turnPicks % state.numTeams]
  }
  return null
}

export function phaseOf(state) {
  if (state.complete) return PHASE.COMPLETE
  if (state.spunId) return PHASE.CONFIRM_CAPTAIN
  if (state.pendingId) return PHASE.PENDING_PICK
  if (turnTeam(state) && state.pool.length > 0) return PHASE.CHOOSING
  if (state.teams.length === state.numTeams) return PHASE.DONE
  return PHASE.SPIN
}

export function applyAction(prev, action) {
  const s = JSON.parse(JSON.stringify(prev))
  const phase = phaseOf(s)
  const id = action.studentId
  s.seq += 1

  switch (action.type) {
    case 'spin':
      expectPhase(phase, PHASE.SPIN, 'spin the wheel')
      expectIn(s.pool, id, 'That student is not on the wheel.')
      s.spunId = id
      s.lastEvent = event(s, 'spin', id)
      break

    case 'respin':
      expectPhase(phase, PHASE.CONFIRM_CAPTAIN, 're-spin')
      s.spunId = null
      break

    case 'captain': {
      expectPhase(phase, PHASE.CONFIRM_CAPTAIN, 'confirm a captain')
      const team = { id: 'T' + (s.teams.length + 1), captainId: s.spunId, members: [] }
      s.teams.push(team)
      remove(s.pool, s.spunId)
      s.spunId = null
      s.lastEvent = event(s, 'captain', team.captainId, team.id)
      break
    }

    case 'uncaptain': {
      const last = s.teams[s.teams.length - 1]
      expect(
        last && s.turnPicks === s.teams.length - 1 && last.members.length === 0 && !s.pendingId && !s.spunId,
        'A captain can only be undone before their team has any teammates.',
      )
      s.teams.pop()
      s.pool.push(last.captainId)
      break
    }

    case 'submit':
      expectPhase(phase, PHASE.CHOOSING, 'choose a teammate')
      expectIn(s.pool, id, 'That student is no longer available.')
      s.pendingId = id
      s.lastEvent = event(s, 'submit', id, turnTeam(s).id)
      break

    case 'reject':
      expectPhase(phase, PHASE.PENDING_PICK, 'send the pick back')
      s.pendingId = null
      s.lastEvent = event(s, 'reject', null, turnTeam(s).id)
      break

    case 'pick': {
      expectPhase(phase, PHASE.PENDING_PICK, 'lock in a pick')
      const team = turnTeam(s)
      expect(!id || id === s.pendingId, "Only the captain's chosen student can be added right now.")
      expect(!action.teamId || action.teamId === team.id, "That isn't the team whose turn it is.")
      const pickId = s.pendingId
      team.members.push(pickId)
      remove(s.pool, pickId)
      s.turnLog.push({ studentId: pickId, turnIndex: s.turnPicks })
      s.turnPicks += 1
      s.pendingId = null
      s.lastEvent = event(s, 'pick', pickId, team.id)
      break
    }

    case 'unpick': {
      expect(!s.complete, 'Reopen the draft before sending anyone back to the pool.')
      const team = memberTeam(s, id)
      expect(team, 'Only teammates can go back to the pool. Captains stay with their team.')
      unpickFrom(s, team, id)
      s.pool.push(id)
      break
    }

    case 'move': {
      const from = memberTeam(s, id)
      const to = findTeam(s, action.teamId)
      expect(from, 'Only teammates can be moved. Captains stay with their team.')
      expect(to, 'That team does not exist.')
      expect(from !== to, 'That student is already on that team.')
      remove(from.members, id)
      to.members.push(id)
      break
    }

    case 'bench': {
      expect(!s.complete, 'Reopen the draft before changing the bench.')
      const team = memberTeam(s, id)
      if (team) {
        unpickFrom(s, team, id)
      } else {
        expectIn(s.pool, id, 'Only students in the pool or on a team can go on the bench.')
        remove(s.pool, id)
      }
      if (s.spunId === id) s.spunId = null
      if (s.pendingId === id) s.pendingId = null
      s.bench.push(id)
      break
    }

    case 'unbench':
      expect(!s.complete, 'Reopen the draft before changing the bench.')
      expectIn(s.bench, id, 'That student is not on the bench.')
      remove(s.bench, id)
      s.pool.push(id)
      break

    case 'place': {
      const to = findTeam(s, action.teamId)
      expectIn(s.bench, id, 'Only students on the "Not here" bench can be placed straight onto a team.')
      expect(to, 'That team does not exist.')
      remove(s.bench, id)
      to.members.push(id)
      break
    }

    case 'complete':
      expectPhase(phase, PHASE.DONE, 'finish the draft')
      s.complete = true
      s.lastEvent = event(s, 'complete')
      break

    case 'reopen':
      expect(s.complete, 'The draft is already open.')
      s.complete = false
      break

    default:
      throw new Error('Unknown draft action: ' + action.type)
  }
  return s
}

// Undoing the pick made on the latest turn hands the turn back to that captain.
// Removing an older pick, or someone placed from the bench, leaves the turn alone.
function unpickFrom(s, team, id) {
  remove(team.members, id)
  const i = s.turnLog.findIndex((t) => t.studentId === id)
  if (i === -1) return
  const entry = s.turnLog.splice(i, 1)[0]
  if (entry.turnIndex === s.turnPicks - 1) {
    s.turnPicks -= 1
    s.spunId = null
    s.pendingId = null
  }
}

export function teamSizes(count, numTeams) {
  const base = Math.floor(count / numTeams)
  const extra = count % numTeams
  return Array.from({ length: numTeams }, (_, i) => base + (i < extra ? 1 : 0))
}

export function setupProblem(count, numTeams) {
  if (!Number.isInteger(numTeams) || numTeams < 2) return 'Choose at least 2 teams.'
  if (count < numTeams * 2) return `${count} students isn't enough for ${numTeams} teams of at least 2.`
  if (count > CODE_LETTERS.length * CODE_DIGITS.length) return 'Too many students for one draft.'
  return null
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_DIGITS = '23456789'

// Anonymous card codes like "K7". Random per draft, so a code never hints at a name.
export function makeCodes(ids, random) {
  const all = []
  for (const letter of CODE_LETTERS) for (const digit of CODE_DIGITS) all.push(letter + digit)
  const chosen = shuffle(all, random)
  const codes = {}
  ids.forEach((id, i) => {
    codes[id] = chosen[i]
  })
  return codes
}

export function shuffle(items, random) {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

function event(s, type, studentId, teamId) {
  return { seq: s.seq, type, studentId: studentId || null, teamId: teamId || null }
}

function memberTeam(s, id) {
  return s.teams.find((t) => t.members.includes(id)) || null
}

function findTeam(s, teamId) {
  return s.teams.find((t) => t.id === teamId) || null
}

function remove(list, id) {
  const i = list.indexOf(id)
  if (i !== -1) list.splice(i, 1)
}

function expect(ok, message) {
  if (!ok) throw new Error(message)
}

function expectIn(list, id, message) {
  expect(id && list.includes(id), message)
}

function expectPhase(phase, wanted, verb) {
  expect(phase === wanted, `Can't ${verb} right now.`)
}
