import { createService } from '../shared/service.js'
import { columns, periodTeams, roster } from './mockData.js'

// Stands in for Apps Script under `npm run dev`. State lives in localStorage, so
// the admin, class, and captain views can run in separate tabs and stay in sync
// through the same polling they use in production. The PIN is 1234.

// Bump the version when the fake roster changes, so old drafts don't linger.
const PREFIX = 'teamDraftDay.mock.v4.'

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

const store = {
  getRoster: () => roster,
  getColumns: () => columns,
  getPeriodTeams: () => periodTeams,
  getPin: () => '1234',
  getDraft: () => read('draft', null),
  saveDraft: (draft) => write('draft', draft),
  getLog: (draftId) => read('log.' + draftId, []),
  appendLog: (draftId, entries) => write('log.' + draftId, read('log.' + draftId, []).concat(entries)),
  writeTeams: (draft, rows) => write('teams', rows),
  withLock: (fn) => fn(),
}

export const mockService = Object.assign(createService(store), {
  getAppUrl: () => location.origin + location.pathname,
  resetMock() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
    return true
  },
})
