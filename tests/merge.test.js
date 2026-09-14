import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySources, mergeStudents } from '../src/shared/merge.js'
import { rosterFromRows } from '../src/shared/roster.js'

// The real headers from the Patino Team Draft Day Sheet, so these break if a form
// is edited in a way the merge can't follow.

const PERSONALITY = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Class',
  'Type', 'Type Code', 'Identity Letter', "Selected Type's Code", 'Type Match',
  'Energy (as shown)', 'Mind (as shown)', 'Nature (as shown)', 'Tactics (as shown)', 'Identity (as shown)',
  'Energy 0-100 (0=Extraverted, 100=Introverted)', 'Mind 0-100 (0=Intuitive, 100=Observant)',
  'Nature 0-100 (0=Thinking, 100=Feeling)', 'Tactics 0-100 (0=Judging, 100=Prospecting)',
  'Identity 0-100 (0=Assertive, 100=Turbulent)',
]
const ESKILLS = ['Timestamp', 'First Name', 'Last Name', 'Email Address', "What's Your Class Period?", 'eSkill #1', 'eSkill #2', 'eSkill #3']
const TRAITS = ['Timestamp', 'First Name', 'Last Name', 'Email Address', "What's Your Class Period?", 'My First Business Trait', 'My Second Business Trait', 'My Third Business Trait']
const ESKILLS_STALE = ESKILLS.concat(['Rank your #1 selected skill', 'Rank your #2 selected skill', 'Rank your #3 selected skill'])

const person = (t, first, last, email, period) => [t, first, last, email, period, 'Architect', 'INTJ-A', 'A', 'INTJ', 'Yes', '60% Introverted', '55% Intuitive', '58% Thinking', '70% Judging', '40% Assertive', '60', '55', '58', '70', '40']
const eskill = (t, first, last, email, period, a, b, c) => [t, first, last, email, period, a, b, c]
const trait = (t, first, last, email, period, a, b, c) => [t, first, last, email, period, a, b, c]

const tab = (name, header, rows = []) => ({ name, header, rows })

test('finds each form by its headers, whatever the tab is called', () => {
  const { sources } = classifySources([
    tab('Form Responses 3', TRAITS),
    tab('Form Responses 2', ESKILLS),
    tab('Slider Responses', PERSONALITY),
  ])
  assert.equal(sources.personality.name, 'Slider Responses')
  assert.equal(sources.eskills.name, 'Form Responses 2')
  assert.equal(sources.traits.name, 'Form Responses 3')
})

test('a relinked form leaves a stale twin; the live tab wins and it is reported', () => {
  const { sources, notes } = classifySources([
    tab('Form Responses 1', ESKILLS_STALE),
    tab('Form Responses 4', ESKILLS, [eskill('9/14/2026 09:00', 'Ada', 'L', 'ada@fresnou.org', '1st Period', 'Coding', 'Design', 'Data')]),
    tab('Slider Responses', PERSONALITY),
    tab('Form Responses 3', TRAITS),
  ])
  assert.equal(sources.eskills.name, 'Form Responses 4')
  assert.ok(notes.some((n) => /2 tabs look like eSkills/.test(n)), notes.join(' | '))
})

test('with no responses anywhere, the tidier tab is preferred over the stale one', () => {
  const { sources } = classifySources([tab('old', ESKILLS_STALE), tab('new', ESKILLS)])
  assert.equal(sources.eskills.name, 'new')
})

test('joins the three forms on email', () => {
  const { header, rows, stats } = mergeStudents([
    tab('p', PERSONALITY, [person('9/14/2026 09:00', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period')]),
    tab('e', ESKILLS, [eskill('9/14/2026 09:05', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period', 'Coding', 'Design', 'Data')]),
    tab('t', TRAITS, [trait('9/14/2026 09:09', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period', 'Creative', 'Driven', 'Organized')]),
  ])
  assert.equal(rows.length, 1)
  assert.equal(stats.unmatched, 0)

  const at = (name) => rows[0][header.indexOf(name)]
  assert.equal(at('First Name'), 'Ada')
  assert.equal(at('Email'), 'ada@fresnou.org')
  assert.equal(at('Class'), '1')
  assert.equal(at('Type Code'), 'INTJ-A')
  assert.equal(at('eSkill #1'), 'Coding')
  assert.equal(at('My First Business Trait'), 'Creative')
})

test('the merged rows are readable by the app itself', () => {
  const { header, rows } = mergeStudents([
    tab('p', PERSONALITY, [person('9/14/2026 09:00', 'Ada', 'Lovelace', 'Ada@Fresnou.org', '1st Period')]),
    tab('e', ESKILLS, [eskill('9/14/2026 09:05', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period', 'Coding', 'Design', 'Data')]),
    tab('t', TRAITS, [trait('9/14/2026 09:09', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period', 'Creative', 'Driven', 'Organized')]),
  ])
  const roster = rosterFromRows(header, rows)
  assert.equal(roster.length, 1)
  assert.equal(roster[0].name, 'Ada Lovelace')
  assert.equal(roster[0].period, '1')
  assert.equal(roster[0].fields['eSkill #1'], 'Coding')
})

test('a student who typed a different email on one form still matches by name and period', () => {
  const { rows, stats } = mergeStudents([
    tab('p', PERSONALITY, [person('9/14/2026 09:00', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period')]),
    tab('e', ESKILLS, [eskill('9/14/2026 09:05', 'Ada', 'Lovelace', 'ada.lovelace@gmail.com', '1st Period', 'Coding', 'Design', 'Data')]),
  ])
  assert.equal(rows.length, 1, 'the two rows are the same student')
  assert.equal(stats.nameFallback, 1)
})

test('same name in a different period is a different student', () => {
  const { rows } = mergeStudents([
    tab('p', PERSONALITY, [
      person('9/14/2026 09:00', 'Alex', 'Kim', 'alex1@fresnou.org', '1st Period'),
      person('9/14/2026 09:01', 'Alex', 'Kim', 'alex2@fresnou.org', '5th Period'),
    ]),
  ])
  assert.equal(rows.length, 2)
})

test('a resubmission replaces the earlier answer', () => {
  const { header, rows } = mergeStudents([
    tab('e', ESKILLS, [
      eskill('9/14/2026 09:00', 'Ada', 'L', 'ada@fresnou.org', '1st Period', 'Coding', 'Design', 'Data'),
      eskill('9/14/2026 11:30', 'Ada', 'L', 'ada@fresnou.org', '1st Period', 'Marketing', 'Finance', 'Sales'),
    ]),
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0][header.indexOf('eSkill #1')], 'Marketing')
})

test('a student who filled in only one form is still drafted, with blanks', () => {
  const { header, rows, stats } = mergeStudents([
    tab('p', PERSONALITY, [person('9/14/2026 09:00', 'Ada', 'Lovelace', 'ada@fresnou.org', '1st Period')]),
    tab('e', ESKILLS, [eskill('9/14/2026 09:05', 'Grace', 'Hopper', 'grace@fresnou.org', '2nd Period', 'Coding', 'Ops', 'Data')]),
  ])
  assert.equal(rows.length, 2)
  assert.equal(stats.unmatched, 2, 'neither student completed both forms')

  const grace = rows.find((r) => r[header.indexOf('First Name')] === 'Grace')
  assert.equal(grace[header.indexOf('Type Code')], '', 'no personality answers')
  assert.equal(grace[header.indexOf('eSkill #1')], 'Coding')
  // Still a draftable student.
  assert.equal(rosterFromRows(header, rows).length, 2)
})

test('the Rank columns come through if the stale tab is the only one, rather than failing', () => {
  const { header } = mergeStudents([tab('e', ESKILLS_STALE, [eskill('9/14/2026', 'Ada', 'L', 'a@f.org', '1st Period', 'A', 'B', 'C').concat(['1', '2', '3'])])])
  assert.ok(header.includes('Rank your #1 selected skill'))
})

test('refuses tabs that are not form responses', () => {
  assert.throws(() => mergeStudents([tab('Picks', ['DraftID', 'Seq', 'Action'])]), /None of the tabs look like form responses/)
})
