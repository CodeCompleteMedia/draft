import { columnsFromConfig, rosterFromRows, suggestColumns } from '../shared/roster.js'
import { SAMPLE_HEADER, sampleRows } from '../shared/sampleData.js'

// Fake students for `npm run dev`, built the same way the Sheet is read: form-style
// headers, messy typing, and the Columns tab suggestions.

function seeded(seed) {
  return function () {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const rows = sampleRows({ 1: 28, 2: 26, 5: 30 }, seeded(2026))

export const roster = rosterFromRows(SAMPLE_HEADER, rows)
export const columns = columnsFromConfig(suggestColumns(SAMPLE_HEADER, rows), SAMPLE_HEADER)
export const periodTeams = { 1: 6, 2: 6, 5: 7 }
