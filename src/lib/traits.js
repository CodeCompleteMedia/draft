import { PERSONALITY_DIMENSIONS, PERSONALITY_IDENTITY, personalityIdentity, personalityParts, personalityType } from '../shared/roster.js'
import { ROLE_GROUP_NAMES, roleGroup } from '../shared/formOptions.js'

// Formatting, sorting, and filtering for trait columns on cards and team summaries.

export function groupColumns(columns) {
  const groups = []
  for (const column of columns) {
    let group = groups.find((g) => g.name === column.group)
    if (!group) groups.push((group = { name: column.group, columns: [] }))
    group.columns.push(column)
  }
  return groups
}

export function scoreFraction(value, column) {
  if (value === null || value === undefined) return 0
  return Math.max(0, Math.min(1, value / (column.max || 5)))
}

// A 0-100 scale read the way 16Personalities shows it: a side and a percentage,
// plus a word for how strong the preference is.
export function scaleBand(value, poles) {
  if (typeof value !== 'number') return null
  const low = poles ? poles.low : 'Low'
  const high = poles ? poles.high : 'High'
  const distance = Math.abs(value - 50)
  const band = distance < 5 ? 'Balanced' : distance < 15 ? 'Slightly' : distance < 30 ? 'Moderately' : 'Strongly'
  const side = value <= 50 ? low : high
  return {
    side,
    percent: Math.round(value <= 50 ? 100 - value : value),
    band,
    label: band === 'Balanced' ? 'Balanced' : band + ' ' + side,
  }
}

export function listValues(value) {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function roleGroupOf(code) {
  return roleGroup(personalityType(code))
}

// For "Your team so far": averages for numbers, counts for everything else.
export function teamSummary(people, columns) {
  return columns.map((column) => {
    const values = people.map((p) => p.traits[column.key])
    if (column.type === 'score' || column.type === 'scale') {
      const numbers = values.filter((v) => typeof v === 'number')
      return { column, average: numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null }
    }
    if (column.type === 'personality') {
      const codes = values.filter(Boolean)
      return {
        column,
        types: countValues(codes),
        groups: countValues(codes.map(roleGroupOf).filter(Boolean)),
        identities: countValues(codes.map(personalityIdentity).filter(Boolean)),
      }
    }
    return { column, counts: countValues(values.flatMap(listValues)) }
  })
}

function countValues(values) {
  const counts = {}
  values.forEach((v) => (counts[v] = (counts[v] || 0) + 1))
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

// One row of chips per thing worth filtering on. A personality column gives three:
// the four preferences, the identity, and the role group.
export function filterOptions(cards, columns) {
  const options = []
  const add = (option) => {
    if (option.values.length > 1) options.push(option)
  }

  columns.forEach((column) => {
    const valuesOf = (card) => card.traits[column.key]

    if (column.type === 'personality') {
      const codes = cards.map(valuesOf).filter(Boolean)
      add({
        id: column.key + '::preferences',
        label: column.label,
        values: PERSONALITY_DIMENSIONS.flatMap((d) => Object.values(d)).filter((w) => codes.some((c) => personalityParts(c).includes(w))),
        // Within a pair any choice matches; every pair with a choice has to match.
        match: (card, chosen) => {
          const parts = personalityParts(valuesOf(card))
          return PERSONALITY_DIMENSIONS.every((dimension) => {
            const picked = chosen.filter((word) => Object.values(dimension).includes(word))
            return !picked.length || picked.some((word) => parts.includes(word))
          })
        },
      })
      add({
        id: column.key + '::identity',
        label: 'Identity',
        values: Object.values(PERSONALITY_IDENTITY).filter((w) => codes.some((c) => personalityIdentity(c) === w)),
        match: (card, chosen) => chosen.includes(personalityIdentity(valuesOf(card))),
      })
      add({
        id: column.key + '::group',
        label: 'Role group',
        values: ROLE_GROUP_NAMES.filter((g) => codes.some((c) => roleGroupOf(c) === g)),
        match: (card, chosen) => chosen.includes(roleGroupOf(valuesOf(card))),
      })
      return
    }

    if (column.type !== 'badge' && column.type !== 'tags') return
    const values = new Set()
    cards.forEach((card) => listValues(valuesOf(card)).forEach((v) => values.add(v)))
    add({
      id: column.key,
      label: column.label,
      values: [...values].sort((a, b) => a.localeCompare(b)),
      match: (card, chosen) => listValues(valuesOf(card)).some((v) => chosen.includes(v)),
    })
  })
  return options
}

// filters: { [optionId]: string[] }. Chips inside a row are either-or; every row
// with a choice has to match.
export function matchesFilters(card, filters, options) {
  return options.every((option) => {
    const chosen = filters[option.id] || []
    return !chosen.length || option.match(card, chosen)
  })
}

export function sortOptions(columns) {
  const options = [{ key: 'code', label: 'Card number' }]
  columns.forEach((column) => {
    if (column.type === 'score') options.push({ key: column.key, label: 'Highest ' + column.label.toLowerCase() })
    else if (column.type === 'scale') options.push({ key: column.key, label: column.label + ': ' + (column.poles ? column.poles.low : 'low') + ' first' })
    else if (column.type === 'badge' || column.type === 'personality') options.push({ key: column.key, label: column.label })
  })
  return options
}

export function sortCards(cards, sortKey, columns) {
  const column = columns.find((c) => c.key === sortKey)
  const sorted = cards.slice()
  const byCode = (a, b) => (a.code < b.code ? -1 : 1)
  if (!column) return sorted.sort(byCode)
  if (column.type === 'score') {
    return sorted.sort((a, b) => (b.traits[sortKey] ?? -1) - (a.traits[sortKey] ?? -1) || byCode(a, b))
  }
  if (column.type === 'scale') {
    return sorted.sort((a, b) => (a.traits[sortKey] ?? 999) - (b.traits[sortKey] ?? 999) || byCode(a, b))
  }
  return sorted.sort((a, b) => String(listValues(a.traits[sortKey])[0] ?? '~').localeCompare(String(listValues(b.traits[sortKey])[0] ?? '~')))
}

export function teamNumber(teamId) {
  return Number(String(teamId).replace(/\D/g, '')) || 0
}
