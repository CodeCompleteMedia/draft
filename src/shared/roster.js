// Reads the unified Students tab. Finds the email, name, and period columns by their
// headers (the Google Forms headers work as they are), tidies what students typed, and
// suggests how every other column should appear on the captain dashboard.
// Shared by gas/Code.js, the dev mock, and the tests.

export const COLUMN_TYPES = ['badge', 'tags', 'personality', 'scale', 'score', 'text', 'flag']

// Preference names from 16Personalities, where students look up their four letters.
export const PERSONALITY_DIMENSIONS = [
  { I: 'Introverted', E: 'Extraverted' },
  { N: 'Intuitive', S: 'Observant' },
  { T: 'Thinking', F: 'Feeling' },
  { J: 'Judging', P: 'Prospecting' },
]

export const PERSONALITY_IDENTITY = { A: 'Assertive', T: 'Turbulent' }

const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', '1st', '2nd', '3rd', '4th', '5th']

export function findCoreColumns(header) {
  const names = header.map((h) => String(h).trim().toLowerCase())
  const find = (...tests) => {
    for (const test of tests) {
      const i = names.findIndex(test)
      if (i !== -1) return i
    }
    return -1
  }
  return {
    id: find((h) => h === 'studentid' || h === 'email address', (h) => h.indexOf('email') !== -1),
    name: find((h) => h === 'name' || h === 'full name' || h === 'student name'),
    first: find((h) => h.indexOf('first name') !== -1),
    last: find((h) => h.indexOf('last name') !== -1),
    period: find((h) => h === 'period', (h) => h.indexOf('period') !== -1, (h) => /\bclass\b/.test(h)),
  }
}

export function rosterFromRows(header, rows) {
  const col = findCoreColumns(header)
  if (col.id === -1) throw new Error('The Students tab needs a school email column, like "Email Address".')
  if (col.first === -1 && col.name === -1) throw new Error('The Students tab needs a "First Name" column.')
  if (col.period === -1) throw new Error('The Students tab needs a class period column, like "What\'s Your Class Period?".')
  const core = coreIndexes(col)
  const seen = {}
  const roster = []

  rows.forEach((row) => {
    const id = cell(row, col.id).toLowerCase()
    if (!id) return

    let first
    let last
    if (col.first !== -1) {
      first = tidyName(cell(row, col.first))
      last = tidyName(cell(row, col.last))
    } else {
      const parts = tidyName(cell(row, col.name)).split(' ')
      first = parts[0]
      last = parts.slice(1).join(' ')
    }

    const fields = {}
    header.forEach((h, i) => {
      // A header repeated by a form edit is read once, from its first column.
      const key = String(h).trim()
      if (key && core.indexOf(i) === -1 && !isIgnoredHeader(key) && !(key in fields)) fields[key] = row[i]
    })
    const student = { id, name: (first + ' ' + last).trim() || id, first, last, period: normalizePeriod(cell(row, col.period)), fields }

    // Students resubmit forms to fix answers, so a later row replaces an earlier one
    // instead of stopping the draft.
    if (seen[id] === undefined) {
      seen[id] = roster.length
      roster.push(student)
    } else {
      roster[seen[id]] = student
    }
  })

  return withShortNames(roster)
}

// "Maya Rodriguez" shows as "Maya R." on the projector, unless someone else in the
// same period would get the same short name.
function withShortNames(roster) {
  const keyOf = (s) => [s.period, s.first.toLowerCase(), s.last.charAt(0).toLowerCase()].join('|')
  const counts = {}
  roster.forEach((s) => {
    counts[keyOf(s)] = (counts[keyOf(s)] || 0) + 1
  })
  return roster.map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.first && s.last && counts[keyOf(s)] === 1 ? s.first + ' ' + s.last.charAt(0).toUpperCase() + '.' : s.name,
    period: s.period,
    fields: s.fields,
  }))
}

// Fixes names typed in all lowercase or all caps. Mixed case (McDonald) is left alone.
export function tidyName(value) {
  const s = String(value == null ? '' : value).trim().replace(/\s+/g, ' ')
  if (!/\p{L}/u.test(s) || (s !== s.toLowerCase() && s !== s.toUpperCase())) return s
  return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (match, sep, letter) => sep + letter.toUpperCase())
}

// "Period 3", "3rd Period", "P3", and "3" all become "3". Anything else is kept as typed.
export function normalizePeriod(value) {
  const s = String(value == null ? '' : value).trim()
  const m = s.match(/period\s*#?\s*(\d+)/i) || s.match(/^p?(\d+)(?:st|nd|rd|th)?\b/i) || s.match(/\b(\d+)(?:st|nd|rd|th)\b/i)
  return m ? String(Number(m[1])) : s
}

// Turns whatever the sheet holds into a type code. The capture script's "ESTJ-T" keeps
// its identity letter; the old dropdown's "Architect - (INTJ-A / INTJ-T)" offers both
// letters, so that one becomes plain "INTJ". Anything that isn't a type is left alone.
export function normalizePersonality(value) {
  const raw = String(value == null ? '' : value).trim()
  const upper = raw.toUpperCase()
  const identity = singleIdentity(upper)
  const inParens = upper.match(/\(([^)]*)\)/)
  const candidates = (inParens ? [inParens[1]] : []).concat([upper])
  for (const text of candidates) {
    const letters = text.replace(/[^A-Z]/g, '')
    const m = letters.match(/^([IE])([NS])([TF])([JP])/)
    const onlyAType = /^[IE][NS][TF][JP][AT]?$/.test(letters)
    if (!m || (text === upper && !onlyAType)) continue
    return withIdentity(m[1] + m[2] + m[3] + m[4], identity || (onlyAType ? letters.charAt(4) : ''))
  }
  const word = upper.match(/\b([IE][NS][TF][JP])(?:-([AT]))?\b/)
  return word ? withIdentity(word[1], identity || word[2]) : raw
}

function withIdentity(type, letter) {
  return letter === 'A' || letter === 'T' ? type + '-' + letter : type
}

// "INTJ-A / INTJ-T" lists both, so no identity is taken from it.
function singleIdentity(upper) {
  const found = upper.match(/\b[IE][NS][TF][JP]-[AT]\b/g) || []
  const letters = found.map((m) => m.charAt(m.length - 1))
  return letters.length && letters.every((l) => l === letters[0]) ? letters[0] : null
}

export function personalityType(code) {
  const m = String(code == null ? '' : code).toUpperCase().match(/^([IE][NS][TF][JP])/)
  return m ? m[1] : ''
}

export function personalityIdentity(code) {
  const m = String(code == null ? '' : code).toUpperCase().match(/^[IE][NS][TF][JP]-([AT])$/)
  return m ? PERSONALITY_IDENTITY[m[1]] : null
}

// "Energy 0-100 (0=Extraverted, 100=Introverted)" → { low: 'Extraverted', high: 'Introverted' }
export function scalePoles(header) {
  const m = String(header == null ? '' : header).match(/\(\s*0\s*=\s*([^,]+?)\s*,\s*100\s*=\s*([^)]+?)\s*\)/i)
  return m ? { low: m[1], high: m[2] } : null
}

export function scaleLabel(header) {
  return String(header == null ? '' : header)
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s*0\s*-\s*100\s*$/i, '')
    .trim()
}

// Choices that carry their own explanation ("Persistence - A person who never gives up.")
// show as just the label.
export function optionLabel(value) {
  const s = String(value == null ? '' : value).trim()
  const m = s.match(/^(.{1,40}?)\s+-\s+(.{12,})$/)
  return m ? m[1] : s
}

export function personalityParts(code) {
  const type = personalityType(code)
  return type ? PERSONALITY_DIMENSIONS.map((dimension, i) => dimension[type.charAt(i)]) : []
}

// Starting rows for the Columns tab. Numbered questions (eSkill #1, #2, #3 or
// "My First/Second/Third Business Trait") become one list. Long free-text answers
// start hidden, because they're the easiest way to recognize who wrote them.
export function suggestColumns(header, rows) {
  const core = coreIndexes(findCoreColumns(header))
  const candidates = []
  const listed = {}
  header.forEach((h, i) => {
    const key = String(h).trim()
    if (!key || core.indexOf(i) !== -1 || isIgnoredHeader(key) || listed[key]) return
    listed[key] = true
    candidates.push({ key, index: i, stem: seriesStem(key) })
  })
  const stemCount = {}
  candidates.forEach((c) => {
    if (c.stem) stemCount[c.stem] = (stemCount[c.stem] || 0) + 1
  })

  const suggestions = []
  const merged = {}
  candidates.forEach((c) => {
    if (c.stem && stemCount[c.stem] > 1) {
      if (merged[c.stem]) return
      merged[c.stem] = true
      const label = pluralize(c.stem.replace(/^my\s+/i, ''))
      const members = candidates.filter((m) => m.stem === c.stem).map((m) => m.key)
      suggestions.push({ column: members.join(' + '), label, group: label, type: 'tags', max: '', show: true })
    } else {
      suggestions.push(suggestSingle(c, rows))
    }
  })
  return suggestions
}

function suggestSingle(c, rows) {
  // The capture script's 0-100 columns name their own poles.
  const poles = scalePoles(c.key)
  if (poles) return { column: c.key, label: scaleLabel(c.key), group: 'Preferences', type: 'scale', max: '', show: true }
  // A "Type Match" style column is the capture script telling us the student's
  // sliders disagree with the type they picked. Never a trait: the teacher sees it
  // on the admin board, the captain never does.
  if (/\bmatch$/i.test(c.key)) return { column: c.key, label: c.key, group: 'Checks', type: 'flag', max: '', show: false }
  if (/type code/i.test(c.key) || /personality/i.test(c.key)) {
    return { column: c.key, label: 'Personality type', group: 'Personality', type: 'personality', max: '', show: true }
  }
  // These all repeat something the card already works out from the type code:
  // "Energy (as shown)" repeats the slider, "Type" and "Selected Type's Code" repeat
  // the picked role, and "Identity Letter" repeats the code's suffix.
  if (/\(as shown\)/i.test(c.key)) return { column: c.key, label: scaleLabel(c.key), group: 'Preferences', type: 'badge', max: '', show: false }
  if (/^type$/i.test(c.key) || /selected type/i.test(c.key) || /identity letter/i.test(c.key)) {
    return { column: c.key, label: c.key, group: 'Personality', type: 'badge', max: '', show: false }
  }
  const sample = rows
    .map((r) => cell(r, c.index))
    .filter(Boolean)
    .slice(0, 50)
  const numbers = sample.map(Number).filter((n) => !isNaN(n))
  const isQuizScore = /^score$/i.test(c.key)
  if (isQuizScore || (sample.length && numbers.length === sample.length)) {
    return { column: c.key, label: c.key, group: 'Scores', type: 'score', max: Math.max.apply(null, numbers.concat([5])), show: !isQuizScore }
  }
  const averageLength = sample.join('').length / Math.max(sample.length, 1)
  if (averageLength > 40) return { column: c.key, label: c.key, group: 'Traits', type: 'text', max: '', show: false }
  const type = sample.some((v) => v.indexOf(',') !== -1) ? 'tags' : 'badge'
  return { column: c.key, label: c.key, group: 'Traits', type, max: '', show: true }
}

// Turns Columns tab rows into dashboard columns, checking every header exists.
// A Column cell can combine questions: "eSkill #1 + eSkill #2 + eSkill #3".
export function columnsFromConfig(configRows, header) {
  const headers = header.map((h) => String(h).trim())
  const core = coreIndexes(findCoreColumns(header)).map((i) => headers[i])
  return configRows
    // Flags are kept even when Show is off: the admin board always wants them.
    .filter((r) => text(r.column) !== '' && (isYes(r.show) || text(r.type).toLowerCase() === 'flag'))
    .map((r) => {
      const key = text(r.column)
      const sources = key
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean)
      sources.forEach((source) => {
        if (headers.indexOf(source) === -1) {
          throw new Error('The Columns tab lists "' + source + '", but the Students tab has no column with that name.')
        }
        if (core.indexOf(source) !== -1) throw new Error('"' + source + '" can\'t be shown on the captain dashboard.')
      })
      const type = text(r.type).toLowerCase() || 'badge'
      if (COLUMN_TYPES.indexOf(type) === -1) {
        throw new Error('"' + text(r.type) + '" isn\'t a column type. Use one of: ' + COLUMN_TYPES.join(', ') + '.')
      }
      const column = { key, label: text(r.label) || key, group: text(r.group) || 'Traits', type, max: Number(r.max) || 5, sources }
      if (type === 'scale') column.poles = scalePoles(key) || scalePoles(column.label)
      return column
    })
}

export function isYes(value) {
  return value === true || /^(y|yes|true|x|1)$/i.test(String(value).trim())
}

function coreIndexes(col) {
  return [col.id, col.name, col.first, col.last, col.period].filter((i) => i !== -1)
}

function isIgnoredHeader(key) {
  return /^timestamp\b/i.test(key)
}

function seriesStem(key) {
  const numbered = key.replace(/\s*#\s*\d+\s*$/, '')
  if (numbered !== key) return numbered.trim()
  const words = key.split(/\s+/)
  const i = words.findIndex((w) => ORDINAL_WORDS.indexOf(w.toLowerCase()) !== -1)
  if (i === -1) return null
  return words.slice(0, i).concat(words.slice(i + 1)).join(' ')
}

function pluralize(label) {
  return /s$/i.test(label) ? label : label + 's'
}

function cell(row, i) {
  return i === -1 || row[i] === undefined || row[i] === null ? '' : String(row[i]).trim()
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}
