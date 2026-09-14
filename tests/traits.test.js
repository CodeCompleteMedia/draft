import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOptions, matchesFilters, roleGroupOf, scaleBand, sortOptions, teamSummary } from '../src/lib/traits.js'

const COLUMNS = [
  { key: 'code', label: 'Personality type', group: 'Personality', type: 'personality', sources: ['code'] },
  { key: 'energy', label: 'Energy', group: 'Preferences', type: 'scale', poles: { low: 'Extraverted', high: 'Introverted' }, sources: ['energy'] },
  { key: 'eskills', label: 'eSkills', group: 'eSkills', type: 'tags', sources: ['a', 'b'] },
]

const CARDS = [
  { code: 'A1', traits: { code: 'INTJ-A', energy: 88, eskills: ['Pitching', 'Writing'] } },
  { code: 'B2', traits: { code: 'ENFP-T', energy: 20, eskills: ['Ideating'] } },
  { code: 'C3', traits: { code: 'ESTJ-T', energy: 48, eskills: ['Pitching'] } },
]

test('a 0-100 value reads as a side, a percentage, and a strength', () => {
  const poles = { low: 'Extraverted', high: 'Introverted' }
  assert.deepEqual(scaleBand(35, poles), { side: 'Extraverted', percent: 65, band: 'Moderately', label: 'Moderately Extraverted' })
  assert.deepEqual(scaleBand(88, poles), { side: 'Introverted', percent: 88, band: 'Strongly', label: 'Strongly Introverted' })
  assert.equal(scaleBand(48, poles).label, 'Balanced')
  assert.equal(scaleBand(58, poles).label, 'Slightly Introverted')
  assert.equal(scaleBand(null, poles), null)
})

test('a personality column gives three rows of filter chips', () => {
  const options = filterOptions(CARDS, COLUMNS)
  assert.deepEqual(
    options.map((o) => [o.id, o.label]),
    [
      ['code::preferences', 'Personality type'],
      ['code::identity', 'Identity'],
      ['code::group', 'Role group'],
      ['eskills', 'eSkills'],
    ],
  )
  assert.deepEqual(options[1].values, ['Assertive', 'Turbulent'])
  assert.deepEqual(options[2].values, ['Analysts', 'Diplomats', 'Sentinels'])
})

test('chips in a row are either-or; rows combine', () => {
  const options = filterOptions(CARDS, COLUMNS)
  const only = (filters) => CARDS.filter((c) => matchesFilters(c, filters, options)).map((c) => c.code)
  assert.deepEqual(only({}), ['A1', 'B2', 'C3'])
  // Two choices in the same preference pair widen the search.
  assert.deepEqual(only({ 'code::preferences': ['Introverted', 'Extraverted'] }), ['A1', 'B2', 'C3'])
  // Choices in different pairs narrow it: introverted AND thinking.
  assert.deepEqual(only({ 'code::preferences': ['Introverted', 'Thinking'] }), ['A1'])
  assert.deepEqual(only({ 'code::identity': ['Turbulent'] }), ['B2', 'C3'])
  assert.deepEqual(only({ 'code::group': ['Analysts', 'Diplomats'] }), ['A1', 'B2'])
  assert.deepEqual(only({ eskills: ['Pitching'] }), ['A1', 'C3'])
  // Separate rows have to both match.
  assert.deepEqual(only({ eskills: ['Pitching'], 'code::identity': ['Turbulent'] }), ['C3'])
})

test('team summary counts types, role groups, and identities, and averages the sliders', () => {
  const people = CARDS.map((c) => ({ traits: c.traits }))
  const [personality, energy, eskills] = teamSummary(people, COLUMNS)
  assert.deepEqual(personality.groups, [
    ['Analysts', 1],
    ['Diplomats', 1],
    ['Sentinels', 1],
  ])
  assert.deepEqual(personality.identities, [
    ['Turbulent', 2],
    ['Assertive', 1],
  ])
  assert.equal(Math.round(energy.average), 52)
  assert.deepEqual(eskills.counts[0], ['Pitching', 2])
})

test('sort options cover the card number, the sliders, and the type', () => {
  assert.deepEqual(
    sortOptions(COLUMNS).map((o) => o.label),
    ['Card number', 'Personality type', 'Energy: Extraverted first'],
  )
  assert.equal(roleGroupOf('ESTJ-T'), 'Sentinels')
})
