import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  columnsFromConfig,
  findCoreColumns,
  normalizePeriod,
  normalizePersonality,
  optionLabel,
  personalityIdentity,
  personalityParts,
  personalityType,
  rosterFromRows,
  scaleLabel,
  scalePoles,
  suggestColumns,
  tidyName,
} from '../src/shared/roster.js'
import { BUSINESS_TRAITS, ESKILLS, PERSONALITY_ROLES, describeOption, personalityChoice, roleGroup } from '../src/shared/formOptions.js'
import { SAMPLE_HEADER, sampleRows } from '../src/shared/sampleData.js'
import { createService } from '../src/shared/service.js'

// Header rows as they come from the Google Forms response sheets.
const PERSONALITY_FORM = [
  'Timestamp',
  'Score',
  'First Name',
  'Last Name',
  'Please Use Your School Email Address (fresnou.org) Please',
  'Check Your Personality Type (the letters from the website such as I.N.T.J or E.N.T.P)',
  "What's Your Class?",
]
const ESKILLS_FORM = ['Timestamp', 'First Name', 'Last Name', 'Email Address', "What's Your Class Period?", 'eSkill #1', 'eSkill #2', 'eSkill #3']
// The custom capture script's "Slider Responses" tab.
const SLIDER_SHEET = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Class', 'Type', 'Type Code', 'Identity Letter', "Selected Type's Code", 'Type Match']

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const at = (name) => SAMPLE_HEADER.indexOf(name)

test('finds email, name, and period in every response sheet', () => {
  assert.deepEqual(findCoreColumns(PERSONALITY_FORM), { id: 4, name: -1, first: 2, last: 3, period: 6 })
  assert.deepEqual(findCoreColumns(ESKILLS_FORM), { id: 3, name: -1, first: 1, last: 2, period: 4 })
  assert.deepEqual(findCoreColumns(SLIDER_SHEET), { id: 3, name: -1, first: 1, last: 2, period: 4 })
})

test('type codes keep the identity letter when the answer has only one', () => {
  const cases = {
    'ESTJ-T': 'ESTJ-T',
    'INFJ-A': 'INFJ-A',
    ' I.S.F.P-T ': 'ISFP-T',
    'Architect - (INTJ-A / INTJ-T)': 'INTJ',
    'I.N.T.J': 'INTJ',
    entp: 'ENTP',
    'e n f p': 'ENFP',
    "I'm an INTJ": 'INTJ',
    idk: 'idk',
    '': '',
  }
  for (const [typed, expected] of Object.entries(cases)) assert.equal(normalizePersonality(typed), expected, typed)
})

test('a type code gives preferences, identity, role, and role group', () => {
  assert.deepEqual(personalityParts('ESTJ-T'), ['Extraverted', 'Observant', 'Thinking', 'Judging'])
  assert.deepEqual(personalityParts('INTJ'), ['Introverted', 'Intuitive', 'Thinking', 'Judging'])
  assert.deepEqual(personalityParts('idk'), [])
  assert.equal(personalityIdentity('ESTJ-T'), 'Turbulent')
  assert.equal(personalityIdentity('INTJ-A'), 'Assertive')
  assert.equal(personalityIdentity('INTJ'), null)
  assert.equal(personalityType('ESTJ-T'), 'ESTJ')
  assert.equal(PERSONALITY_ROLES[personalityType('ESTJ-T')], 'Executive')
  assert.deepEqual(['INTJ', 'INFP', 'ESTJ', 'ISFP', 'nope'].map(roleGroup), ['Analysts', 'Diplomats', 'Sentinels', 'Explorers', null])
})

test('a 0-100 column names its own two ends', () => {
  const header = 'Energy 0-100 (0=Extraverted, 100=Introverted)'
  assert.deepEqual(scalePoles(header), { low: 'Extraverted', high: 'Introverted' })
  assert.equal(scaleLabel(header), 'Energy')
  assert.equal(scalePoles('eSkill #1'), null)
})

test('periods come out as plain numbers', () => {
  const cases = { '1st Period': '1', '2rd Period': '2', '5th Period': '5', '1st': '1', '2nd': '2', '5th': '5', 2: '2', 'Period 3': '3', P4: '4', '02': '2', Marketing: 'Marketing' }
  for (const [typed, expected] of Object.entries(cases)) assert.equal(normalizePeriod(typed), expected, typed)
})

test('names typed in all lowercase or all caps are fixed; mixed case is left alone', () => {
  assert.equal(tidyName('maya'), 'Maya')
  assert.equal(tidyName('DE LA CRUZ'), 'De La Cruz')
  assert.equal(tidyName('McDonald'), 'McDonald')
  assert.equal(tidyName("o'brien"), "O'Brien")
  assert.equal(tidyName('josé  luis'), 'José Luis')
})

test('roster: lowercase email as ID, full and short names, no personal columns in the traits', () => {
  const row = (first, last, email, period) => {
    const r = new Array(SAMPLE_HEADER.length).fill('')
    r[at('First Name')] = first
    r[at('Last Name')] = last
    r[at('Email')] = email
    r[at('Class')] = period
    r[at('Type Code')] = 'INTJ-A'
    return r
  }
  const roster = rosterFromRows(SAMPLE_HEADER, [
    row('maya', 'rodriguez', 'Maya.R@FresnoU.org', '1st Period'),
    row('Marcus', 'Reyes', 'marcus@fresnou.org', '2nd'),
    row('Marcus', 'Ramirez', 'marcus.ram@fresnou.org', '2nd'),
    row('Marcus', 'Rivera', 'marcus.riv@fresnou.org', '5th'),
    row('', '', '', ''),
  ])
  assert.deepEqual(
    roster.map((s) => [s.id, s.name, s.shortName, s.period]),
    [
      ['maya.r@fresnou.org', 'Maya Rodriguez', 'Maya R.', '1'],
      ['marcus@fresnou.org', 'Marcus Reyes', 'Marcus Reyes', '2'],
      ['marcus.ram@fresnou.org', 'Marcus Ramirez', 'Marcus Ramirez', '2'],
      ['marcus.riv@fresnou.org', 'Marcus Rivera', 'Marcus R.', '5'],
    ],
  )
  const keys = Object.keys(roster[0].fields)
  for (const personal of ['First Name', 'Last Name', 'Email', 'Class']) assert.ok(!keys.includes(personal), personal)
})

test('a resubmission replaces the earlier row instead of stopping the draft', () => {
  const header = ['First Name', 'Last Name', 'Email', 'Period', 'eSkill #1']
  const roster = rosterFromRows(header, [
    ['Ana', 'Ruiz', 'ana@fresnou.org', '1', 'Pitching'],
    ['Ana', 'Ruiz', 'ANA@fresnou.org', '2', 'Ideating'],
    ['Ben', 'Cruz', 'ben@fresnou.org', '1', 'Writing'],
  ])
  assert.equal(roster.length, 2)
  assert.equal(roster[0].period, '2', 'the later answers win')
  assert.equal(roster[0].fields['eSkill #1'], 'Ideating')
  assert.deepEqual(roster.map((s) => s.id), ['ana@fresnou.org', 'ben@fresnou.org'])
})

test('a header repeated by a form edit is read once, not treated as an error', () => {
  const header = ['First Name', 'Last Name', 'Email', 'Period', 'eSkill #1', 'eSkill #1']
  const roster = rosterFromRows(header, [['Ana', 'Ruiz', 'ana@fresnou.org', '1', 'Pitching', 'Ignored']])
  assert.equal(roster[0].fields['eSkill #1'], 'Pitching')
  assert.equal(suggestColumns(header, []).filter((c) => c.column === 'eSkill #1').length, 1)
  assert.throws(() => rosterFromRows(['First Name', 'Period'], []), /email/)
})

test('suggested dashboard columns for the unified sheet', () => {
  const header = ['Timestamp', 'Score'].concat(SAMPLE_HEADER)
  const suggestions = suggestColumns(header, sampleRows({ 1: 10 }, seeded(4)))
  assert.deepEqual(
    suggestions.map((s) => [s.label, s.type, s.show]),
    [
      ['Score', 'score', false],
      ['Type', 'badge', false],
      ['Personality type', 'personality', true],
      ['Identity Letter', 'badge', false],
      ["Selected Type's Code", 'badge', false],
      ['Type Match', 'flag', false],
      ['Energy', 'badge', false],
      ['Mind', 'badge', false],
      ['Nature', 'badge', false],
      ['Tactics', 'badge', false],
      ['Identity', 'badge', false],
      ['Energy', 'scale', true],
      ['Mind', 'scale', true],
      ['Nature', 'scale', true],
      ['Tactics', 'scale', true],
      ['Identity', 'scale', true],
      ['eSkills', 'tags', true],
      ['Business Traits', 'tags', true],
    ],
  )
  assert.equal(suggestions.find((s) => s.type === 'tags').column, 'eSkill #1 + eSkill #2 + eSkill #3')
})

test('the Columns tab is checked against the Students headers, and scales keep their ends', () => {
  const rows = [
    { column: 'eSkill #1 + eSkill #2 + eSkill #3', label: 'eSkills', type: 'tags', show: true },
    { column: 'Energy 0-100 (0=Extraverted, 100=Introverted)', label: 'Energy', type: 'scale', show: true },
    { column: 'Score', type: 'score', show: false },
  ]
  const columns = columnsFromConfig(rows, SAMPLE_HEADER.concat(['Score']))
  assert.deepEqual(columns[0].sources, ['eSkill #1', 'eSkill #2', 'eSkill #3'])
  assert.deepEqual(columns[1].poles, { low: 'Extraverted', high: 'Introverted' })
  assert.equal(columns.length, 2)
  assert.throws(() => columnsFromConfig([{ column: 'eSkill #9', show: 'TRUE' }], SAMPLE_HEADER), /no column/)
  assert.throws(() => columnsFromConfig([{ column: 'Email', show: 'x' }], SAMPLE_HEADER), /can't be shown/)
  assert.throws(() => columnsFromConfig([{ column: 'eSkill #1', type: 'emoji', show: true }], SAMPLE_HEADER), /isn't a column type/)
})

test('captain cards carry the type code, the sliders, and one combined list per question set', () => {
  const rows = sampleRows({ 1: 16 }, seeded(9))
  rows[0][at('Type Code')] = 'ENFP-T'
  rows[0][at('Energy 0-100 (0=Extraverted, 100=Introverted)')] = 35
  rows[0].splice(at('eSkill #1'), 6, 'Pitching', '', 'Pitching', 'Leader', 'Persistence - A person who never gives up.', 'Creative')

  const roster = rosterFromRows(SAMPLE_HEADER, rows)
  const columns = columnsFromConfig(suggestColumns(SAMPLE_HEADER, rows), SAMPLE_HEADER)
  let draft = null
  const logs = {}
  const service = createService({
    getRoster: () => roster,
    getColumns: () => columns,
    getPeriodTeams: () => ({}),
    getPin: () => '1234',
    getDraft: () => draft,
    saveDraft: (d) => (draft = d),
    getLog: (id) => logs[id] || [],
    appendLog: (id, entries) => (logs[id] = (logs[id] || []).concat(entries)),
    writeTeams: () => {},
    withLock: (fn) => fn(),
  })
  service.startDraft('1234', '1', 2)
  let admin = service.act('1234', { type: 'spin' })
  if (admin.spunId === roster[0].id) admin = service.act('1234', { type: 'respin' })
  service.act('1234', { type: 'captain' })

  const captain = service.getState('captain')
  const code = service.getState('admin', '1234').people[roster[0].id].code
  const card = captain.cards.find((c) => c.code === code)
  const key = (label) => columns.find((c) => c.label === label).key
  assert.equal(card.traits[key('Personality type')], 'ENFP-T')
  assert.equal(card.traits[key('Energy')], 35)
  assert.deepEqual(card.traits[key('eSkills')], ['Pitching'])
  assert.deepEqual(card.traits[key('Business Traits')], ['Leader', 'Persistence', 'Creative'])

  const seen = JSON.stringify(captain)
  for (const s of roster.filter((r) => admin.pool.includes(r.id))) {
    assert.ok(!seen.includes(s.name) && !seen.includes(s.id), 'name or email leaked')
  }
  assert.ok(service.getState('class').teams[0].captain.endsWith('.'), 'class view uses short names')
})

test('every choice on the forms reads back correctly', () => {
  for (const type of Object.keys(PERSONALITY_ROLES)) assert.equal(normalizePersonality(personalityChoice(type)), type)
  for (const trait of BUSINESS_TRAITS) assert.equal(optionLabel(trait.choice || trait.label), trait.label)
  for (const skill of ESKILLS) assert.equal(optionLabel(skill.label), skill.label)
  assert.equal(describeOption('Persistence'), 'A person who never gives up.')
  assert.equal(describeOption('Leader'), null)
})

test('the fake students match the capture script: code from the sliders, never 50%', () => {
  const rows = sampleRows({ 1: 40 }, seeded(21))
  const sides = [
    ['E', 'I'],
    ['N', 'S'],
    ['T', 'F'],
    ['J', 'P'],
    ['A', 'T'],
  ]
  let mismatches = 0
  for (const row of rows) {
    const code = row[at('Type Code')]
    if (!code) continue
    const values = SAMPLE_HEADER.filter((h) => scalePoles(h)).map((h) => row[at(h)])
    const expected = values.map((v, i) => sides[i][v <= 50 ? 0 : 1])
    assert.equal(code, expected.slice(0, 4).join('') + '-' + expected[4])
    assert.equal(row[at('Identity Letter')], expected[4])
    for (const value of values) assert.notEqual(value, 50, 'no trait sits on the fence')
    // "Type" is the role the student picked, which is what Type Match reports on.
    const picked = row[at("Selected Type's Code")]
    assert.equal(row[at('Type')], PERSONALITY_ROLES[picked])
    assert.equal(row[at('Type Match')], picked === expected.slice(0, 4).join('') ? 'Yes' : 'No')
    if (row[at('Type Match')] === 'No') mismatches++
  }
  assert.ok(mismatches > 0, 'some students disagree with their own sliders')
})

test("a student's Type Match check stays with the teacher and never reaches the captain", () => {
  const rows = sampleRows({ 1: 16 }, seeded(3))
  rows[0][at('Type Match')] = 'No'
  const roster = rosterFromRows(SAMPLE_HEADER, rows)
  const columns = columnsFromConfig(suggestColumns(SAMPLE_HEADER, rows), SAMPLE_HEADER)
  const flagColumn = columns.find((c) => c.type === 'flag')
  assert.ok(flagColumn, 'Type Match is kept as a flag')

  let draft = null
  const logs = {}
  const service = createService({
    getRoster: () => roster,
    getColumns: () => columns,
    getPeriodTeams: () => ({}),
    getPin: () => '1234',
    getDraft: () => draft,
    saveDraft: (d) => (draft = d),
    getLog: (id) => logs[id] || [],
    appendLog: (id, entries) => (logs[id] = (logs[id] || []).concat(entries)),
    writeTeams: () => {},
    withLock: (fn) => fn(),
  })
  service.startDraft('1234', '1', 2)
  let admin = service.act('1234', { type: 'spin' })
  if (admin.spunId === roster[0].id) admin = service.act('1234', { type: 'respin' })
  admin = service.act('1234', { type: 'captain' })

  assert.equal(admin.people[roster[0].id].traits[flagColumn.key], 'No')
  assert.ok(admin.columns.some((c) => c.type === 'flag'))

  const captain = service.getState('captain')
  assert.ok(!captain.columns.some((c) => c.type === 'flag'), 'no check columns on the dashboard')
  for (const card of captain.cards) assert.ok(!(flagColumn.key in card.traits), 'no check values on a card')
})

test('every sample row is exactly as wide as SAMPLE_HEADER', () => {
  // The Sheet writes these with setValues over a fixed-width range, so a single
  // ragged row rejects the whole batch: "The data has 24 but the range has 25".
  // The blank-personality branch had a hand-counted width that was one short, and
  // it only fires for about one student in twenty.
  for (let trial = 0; trial < 200; trial++) {
    const rows = sampleRows({ 1: 28, 2: 26, 5: 30 }, Math.random)
    for (const row of rows) {
      assert.equal(row.length, SAMPLE_HEADER.length, `row was ${row.length} wide: ${JSON.stringify(row)}`)
    }
  }
})
