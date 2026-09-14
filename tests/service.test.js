import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHASE } from '../src/shared/draftLogic.js'
import { createService } from '../src/shared/service.js'

const COLUMNS = [
  { key: 'personality', label: 'Personality', group: 'Personality', type: 'badge' },
  { key: 'communication', label: 'Communication', group: 'E-skills', type: 'score', max: 5 },
  { key: 'strengths', label: 'Strengths', group: 'Strengths', type: 'tags' },
]

function makeRoster() {
  const roster = []
  for (let i = 1; i <= 12; i++) {
    roster.push({
      id: `s${i}@school.org`,
      name: `Student Name ${i}`,
      period: '3',
      fields: { personality: `TRAIT-P-${i}`, communication: String((i % 5) + 1), strengths: `TRAIT-S-${i}, Drawing` },
    })
  }
  for (let i = 13; i <= 17; i++) {
    roster.push({ id: `s${i}@school.org`, name: `Other Period ${i}`, period: '4', fields: {} })
  }
  return roster
}

function setup({ pin = '1234' } = {}) {
  const roster = makeRoster()
  let draft = null
  const logs = {}
  const written = { rows: null }
  const store = {
    getRoster: () => roster,
    getColumns: () => COLUMNS,
    getPeriodTeams: () => ({ 3: 3 }),
    getPin: () => pin,
    getDraft: () => draft,
    saveDraft: (d) => {
      draft = d
    },
    getLog: (id) => logs[id] || [],
    appendLog: (id, entries) => {
      logs[id] = (logs[id] || []).concat(entries)
    },
    writeTeams: (d, rows) => {
      written.rows = rows
    },
    withLock: (fn) => fn(),
  }
  let n = 0
  const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  return { service: createService(store, random), roster, written }
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out))
  return out
}

function started() {
  const ctx = setup()
  ctx.service.startDraft('1234', '3', 3)
  return ctx
}

function nameOf(ctx, id) {
  return ctx.roster.find((s) => s.id === id).name
}

test('before a draft starts, captain and class views show setup; admin needs the PIN', () => {
  const { service } = setup()
  assert.equal(service.getState('captain').phase, PHASE.SETUP)
  assert.equal(service.getState('class').phase, PHASE.SETUP)
  assert.throws(() => service.getState('admin', '0000'), /Wrong PIN/)
  const admin = service.getState('admin', '1234')
  assert.deepEqual(admin.periods, [
    { period: '3', count: 12, numTeams: 3 },
    { period: '4', count: 5, numTeams: 2 },
  ])
})

test('admin actions refuse a missing PIN setup and a wrong PIN', () => {
  // The message has to name something the teacher can actually find in the Sheet.
  assert.throws(() => setup({ pin: '' }).service.getState('admin', ''), /Team Draft > Set admin PIN/)
  const { service } = started()
  assert.throws(() => service.act('9999', { type: 'spin' }), /Wrong PIN/)
})

test('starting a draft checks the class size and only includes that period', () => {
  const { service } = setup()
  assert.throws(() => service.startDraft('1234', '4', 3), /isn't enough/)
  const admin = service.startDraft('1234', '3', 3)
  assert.equal(Object.keys(admin.people).length, 12)
  assert.equal(admin.phase, PHASE.SPIN)
})

test('the captain dashboard never receives names or emails of unpicked students', () => {
  const ctx = started()
  const { service } = ctx
  assert.equal(service.getState('captain').cards, undefined, 'no cards while waiting for the wheel')

  let admin = service.act('1234', { type: 'spin' })
  admin = service.act('1234', { type: 'captain' })
  const captain = service.getState('captain')
  assert.equal(captain.phase, PHASE.CHOOSING)
  assert.equal(captain.cards.length, 11)

  const seen = strings(captain)
  for (const id of admin.pool) {
    assert.ok(!seen.includes(id), 'email leaked')
    assert.ok(!seen.includes(nameOf(ctx, id)), 'name leaked')
  }
  assert.ok(seen.includes(nameOf(ctx, admin.teams[0].captainId)), 'captain sees their own name')
})

test('the class view never receives traits or card codes', () => {
  const { service } = started()
  service.act('1234', { type: 'spin' })
  service.act('1234', { type: 'captain' })
  const admin = service.getState('admin', '1234')
  const codes = Object.values(admin.people).map((p) => p.code)
  const seen = strings(service.getState('class')).join('|')
  assert.ok(!seen.includes('TRAIT-'), 'trait leaked')
  for (const s of strings(service.getState('class'))) assert.ok(!codes.includes(s), 'code leaked')
})

test('a submitted pick stays nameless on the class view until the teacher locks it in', () => {
  const ctx = started()
  const { service } = ctx
  service.act('1234', { type: 'spin' })
  service.act('1234', { type: 'captain' })
  const card = service.getState('captain').cards[4]
  const captain = service.submitPick(card.code)
  assert.equal(captain.phase, PHASE.PENDING_PICK)
  assert.equal(captain.pendingCode, card.code)

  const pendingClass = service.getState('class')
  assert.equal(pendingClass.phase, PHASE.PENDING_PICK)
  assert.equal(pendingClass.lastEvent.type, 'submit')
  assert.equal(pendingClass.lastEvent.name, null)

  const admin = service.getState('admin', '1234')
  const pickedId = admin.pendingId
  assert.equal(admin.people[pickedId].code, card.code)
  service.act('1234', { type: 'pick', studentId: pickedId, teamId: admin.turnTeamId })
  const revealed = service.getState('class')
  assert.equal(revealed.lastEvent.type, 'pick')
  assert.equal(revealed.lastEvent.name, nameOf(ctx, pickedId))
  assert.deepEqual(revealed.teams[0].members, [nameOf(ctx, pickedId)])
})

test('the wheel spun on the server shows the same name on the class view', () => {
  const ctx = started()
  const admin = ctx.service.act('1234', { type: 'spin' })
  const cls = ctx.service.getState('class')
  assert.equal(cls.spun.name, nameOf(ctx, admin.spunId))
  assert.equal(cls.wheel[cls.spun.index], cls.spun.name)
  assert.equal(cls.wheel.length, 12)
})

test('re-spin never lands on the same student twice in a row', () => {
  const { service } = started()
  let admin = service.act('1234', { type: 'spin' })
  for (let i = 0; i < 20; i++) {
    const before = admin.spunId
    admin = service.act('1234', { type: 'respin' })
    assert.notEqual(admin.spunId, before)
  }
})

test('a rejected action writes nothing', () => {
  const { service } = started()
  const before = service.getVersion()
  assert.throws(() => service.act('1234', { type: 'captain' }), /right now/)
  assert.throws(() => service.submitPick('Z9'), /no longer available/)
  assert.throws(() => service.act('1234', { type: 'hack' }), /Unknown action/)
  assert.equal(service.getVersion(), before)
})

test('the version changes after every action, so screens know to refresh', () => {
  const { service } = started()
  const v1 = service.getVersion()
  service.act('1234', { type: 'spin' })
  const v2 = service.getVersion()
  assert.notEqual(v1, v2)
  assert.equal(service.getState('class').version, v2)
})

test('finishing the draft writes the teams, and later moves rewrite them', () => {
  const ctx = started()
  const { service } = ctx
  let admin = service.getState('admin', '1234')
  while (admin.phase !== PHASE.DONE) {
    if (admin.phase === PHASE.SPIN) admin = service.act('1234', { type: 'spin' })
    else if (admin.phase === PHASE.CONFIRM_CAPTAIN) admin = service.act('1234', { type: 'captain' })
    else if (admin.phase === PHASE.CHOOSING) {
      service.submitPick(service.getState('captain').cards[0].code)
      admin = service.getState('admin', '1234')
    } else admin = service.act('1234', { type: 'pick', studentId: admin.pendingId, teamId: admin.turnTeamId })
  }
  assert.equal(ctx.written.rows, null)
  admin = service.act('1234', { type: 'complete' })
  assert.equal(admin.phase, PHASE.COMPLETE)
  assert.equal(ctx.written.rows.length, 12)
  assert.equal(ctx.written.rows.filter((r) => r.role === 'Captain').length, 3)

  const mover = admin.teams[0].members[0]
  service.act('1234', { type: 'move', studentId: mover, teamId: 'T2' })
  const moved = ctx.written.rows.find((r) => r.studentId === mover)
  assert.equal(moved.team, 'Team 2')
})
