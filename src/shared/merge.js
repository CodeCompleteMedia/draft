import { findCoreColumns, normalizePeriod } from './roster.js'

// Builds the unified Students tab from the three form-response tabs.
//
// Tabs are identified by what their headers contain, never by tab name: linking a
// form to the Sheet creates "Form Responses 1", relinking creates "Form Responses 4",
// and renaming a tab shouldn't break the merge.
//
// Students are matched across the three forms by email first, then by name and
// period. Anyone who matches nothing still lands in Students with blanks for the
// forms they missed, so a student who only filled in one survey is still draftable
// with a thinner card. Nothing is ever dropped for being incomplete.

const KINDS = [
  { kind: 'personality', label: 'personality', matches: (h) => h.some((x) => /^type code$/i.test(x)) },
  { kind: 'eskills', label: 'eSkills', matches: (h) => h.some((x) => /^eskill\s*#?\s*\d+$/i.test(x)) },
  { kind: 'traits', label: 'business traits', matches: (h) => h.some((x) => /business trait$/i.test(x)) },
]

const KIND_ORDER = ['personality', 'eskills', 'traits']

const cellText = (v) => String(v == null ? '' : v).trim()
const isTimestamp = (h) => /^timestamp\b/i.test(h)

// tabs: [{ name, header, rows }]
export function classifySources(tabs) {
  const sources = {}
  const notes = []

  KINDS.forEach(({ kind, label, matches }) => {
    const found = tabs.filter((t) => t.header.some(Boolean) && matches(t.header.map(cellText)))
    if (!found.length) {
      notes.push('No tab holds the ' + label + ' answers.')
      return
    }
    // A leftover tab from a relinked form has the same signature as the live one.
    // The live one has the responses; failing that, the tidier one is the newer.
    const best = found.slice().sort((a, b) => b.rows.length - a.rows.length || a.header.length - b.header.length)[0]
    sources[kind] = best
    if (found.length > 1) {
      const others = found.filter((t) => t !== best).map((t) => '"' + t.name + '"')
      notes.push(found.length + ' tabs look like ' + label + '. Used "' + best.name + '"; ignored ' + others.join(', ') + '. Delete the unused ones.')
    }
  })

  return { sources, notes }
}

// One record per submission, newest last, so a resubmission overwrites the earlier try.
function recordsFrom(tab) {
  const header = tab.header.map(cellText)
  const col = findCoreColumns(header)
  if (col.id === -1 || col.period === -1) return []
  const stamp = header.findIndex(isTimestamp)

  return tab.rows
    .map((row, order) => {
      const first = col.first !== -1 ? cellText(row[col.first]) : ''
      const last = col.last !== -1 ? cellText(row[col.last]) : ''
      const whole = col.name !== -1 ? cellText(row[col.name]).split(' ') : []
      return {
        email: cellText(row[col.id]).toLowerCase(),
        first: first || whole[0] || '',
        last: last || whole.slice(1).join(' '),
        period: normalizePeriod(cellText(row[col.period])),
        at: stamp === -1 ? '' : cellText(row[stamp]),
        order,
        row,
        core: col,
      }
    })
    .filter((r) => r.email || r.first)
    .sort((a, b) => {
      const ta = Date.parse(a.at)
      const tb = Date.parse(b.at)
      if (isNaN(ta) || isNaN(tb)) return a.order - b.order
      return ta - tb || a.order - b.order
    })
}

const nameKey = (r) => (r.first + '|' + r.last + '|' + r.period).toLowerCase()

export function mergeStudents(tabs) {
  const { sources, notes } = classifySources(tabs)
  const present = KIND_ORDER.filter((k) => sources[k])
  if (!present.length) throw new Error('None of the tabs look like form responses. Each needs an email column and a class period column.')

  // Output columns: the four the app needs, then every question from each form.
  const header = ['First Name', 'Last Name', 'Email', 'Class']
  const fields = []
  present.forEach((kind) => {
    const tab = sources[kind]
    const head = tab.header.map(cellText)
    const col = findCoreColumns(head)
    const core = [col.id, col.name, col.first, col.last, col.period]
    head.forEach((name, i) => {
      if (!name || core.indexOf(i) !== -1 || isTimestamp(name) || header.indexOf(name) !== -1) return
      header.push(name)
      fields.push({ kind, index: i, name })
    })
  })

  const students = []
  const byEmail = {}
  const byName = {}
  const stats = { matched: 0, emailOnly: 0, nameFallback: 0, unmatched: 0 }

  present.forEach((kind, kindIndex) => {
    recordsFrom(sources[kind]).forEach((record) => {
      let student = (record.email && byEmail[record.email]) || byName[nameKey(record)]

      if (student && kindIndex > 0 && !student.seen[kind]) {
        if (record.email && byEmail[record.email]) stats.matched += 1
        else stats.nameFallback += 1
      }

      if (!student) {
        student = { first: record.first, last: record.last, email: record.email, period: record.period, rows: {}, seen: {} }
        students.push(student)
      }

      if (record.email) byEmail[record.email] = student
      byName[nameKey(record)] = student

      // A later form fills in anything the earlier one left blank.
      student.first = student.first || record.first
      student.last = student.last || record.last
      student.email = student.email || record.email
      student.period = student.period || record.period
      student.rows[kind] = record.row
      student.seen[kind] = true
    })
  })

  students.forEach((s) => {
    const count = KIND_ORDER.filter((k) => s.seen[k]).length
    if (count < present.length) stats.unmatched += 1
  })
  stats.total = students.length

  const rows = students.map((s) => {
    const out = [s.first, s.last, s.email, s.period]
    fields.forEach(({ kind, index }) => {
      const row = s.rows[kind]
      out.push(row ? row[index] : '')
    })
    return out
  })

  return { header, rows, notes, stats, used: present.map((k) => ({ kind: k, name: sources[k].name })) }
}
