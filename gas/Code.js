// Apps Script backend for Team Draft Day, bound to the unified student Sheet.
//
// Sheet tabs ("Team Draft > Set up draft tabs" creates any that are missing):
//   Students  One row per student. Email, first and last name, and period are found by
//             header (the Google Forms headers work as-is); every other column is a trait.
//   Columns   Column | Label | Group | Type | Max | Show
//             Which Students columns appear on the captain dashboard.
//             Type is badge, tags, personality, score, or text. A Column can combine
//             questions: "eSkill #1 + eSkill #2 + eSkill #3".
//   Periods   Period | Teams
//   Picks     DraftID | Seq | Action | StudentID | TeamID | At   (append-only draft log)
//   Teams     DraftID | Period | Team | Role | StudentID | Name  (written when a draft is finished)
//
// The draft rules, per-view privacy, and API live in Shared.js, which is generated
// from src/shared/ by `npm run build`. This file only connects them to the Sheet.
//
// The active draft (student list and anonymous card codes) and the admin PIN are
// kept in Script Properties, not in the Sheet.

var LOG_CACHE_SECONDS = 21600
var ROSTER_CACHE_SECONDS = 60

// ---- Web app ----

// Deliberately does not serve the app.
//
// This deployment has to accept anonymous requests so the Vercel function can
// reach it, and a page served from here could call getState('class') straight
// through google.script.run — which returns real student names — without ever
// presenting the proxy secret. The secret only guards doPost. So the only way
// in is doPost, and the app is served by Vercel.
function doGet() {
  return HtmlService.createHtmlOutput('<p>Team Draft Day runs at the app URL. This address is the data connection only.</p>').setTitle(
    'Team Draft Day',
  )
}

// JSON API for the Vercel-hosted front end. The web app is deployed
// ANYONE_ANONYMOUS so a Vercel serverless function can reach it without a Google
// identity, so PROXY_SECRET is what actually guards it. Only Vercel knows the
// secret; it never reaches the browser. Set it from Team Draft > Set proxy secret.
//
// getAppUrl is deliberately not callable here: it returns this /exec URL, which
// is the one thing that must not leak to a page. The front end builds its own
// links from location instead.
// A function, not a top-level value, for the same reason as tabHeaders_ below.
function apiFunctions_() {
  return {
    getVersion: getVersion,
    getState: getState,
    checkPin: checkPin,
    startDraft: startDraft,
    act: act,
    submitPick: submitPick,
  }
}

function doPost(e) {
  var body
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return apiError_('Bad request.')
  }

  var expected = PropertiesService.getScriptProperties().getProperty('PROXY_SECRET')
  if (!expected) return apiError_('No PROXY_SECRET is set. Use Team Draft > Set proxy secret.')
  if (!secretsMatch_(String(body.secret || ''), expected)) return apiError_('Not authorized.')

  var fn = apiFunctions_()[body.fn]
  if (!fn) return apiError_('Unknown function.')

  try {
    return apiJson_({ ok: true, result: fn.apply(null, body.args || []) })
  } catch (err) {
    return apiJson_({ ok: false, error: String((err && err.message) || err) })
  }
}

// Compares every character so a wrong secret can't be narrowed down by timing.
function secretsMatch_(a, b) {
  if (a.length !== b.length) return false
  var diff = 0
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function apiError_(message) {
  return apiJson_({ ok: false, error: message })
}

function apiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}

// Everything below without a trailing underscore can be called from the page with
// google.script.run. Each one goes through the shared service, which checks the
// PIN for admin work and only returns what that view is allowed to see.

function getVersion() {
  return draftService_().getVersion()
}

function getState(view, pin) {
  return draftService_().getState(view, pin)
}

function checkPin(pin) {
  return draftService_().checkPin(pin)
}

function startDraft(pin, period, numTeams) {
  return draftService_().startDraft(pin, period, numTeams)
}

function act(pin, action) {
  return draftService_().act(pin, action)
}

function submitPick(code) {
  return draftService_().submitPick(code)
}

function getAppUrl() {
  return ScriptApp.getService().getUrl()
}

// ---- Storage ----

function draftService_() {
  return createService(sheetStore_())
}

function sheetStore_() {
  var props = PropertiesService.getScriptProperties()
  return {
    getRoster: function () {
      return cachedJson_('roster', ROSTER_CACHE_SECONDS, readRoster_)
    },
    getColumns: function () {
      return cachedJson_('columns', ROSTER_CACHE_SECONDS, readColumns_)
    },
    getPeriodTeams: readPeriodTeams_,
    getPin: function () {
      return props.getProperty('ADMIN_PIN')
    },
    getDraft: function () {
      return cachedJson_('draft', LOG_CACHE_SECONDS, function () {
        return JSON.parse(props.getProperty('ACTIVE_DRAFT') || 'null')
      })
    },
    saveDraft: function (draft) {
      props.setProperty('ACTIVE_DRAFT', JSON.stringify(draft))
      putJson_('draft', draft, LOG_CACHE_SECONDS)
    },
    getLog: function (draftId) {
      return cachedJson_('log:' + draftId, LOG_CACHE_SECONDS, function () {
        return readLog_(draftId)
      })
    },
    appendLog: function (draftId, entries) {
      var log = this.getLog(draftId)
      var sheet = tab_('Picks')
      var rows = entries.map(function (e, i) {
        return [draftId, log.length + i + 1, e.type, e.studentId || '', e.teamId || '', e.at]
      })
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows)
      putJson_('log:' + draftId, log.concat(entries), LOG_CACHE_SECONDS)
    },
    writeTeams: writeTeams_,
    withLock: function (fn) {
      var lock = LockService.getScriptLock()
      lock.waitLock(15000)
      try {
        return fn()
      } finally {
        lock.releaseLock()
      }
    },
  }
}

function readRoster_() {
  var values = tab_('Students').getDataRange().getDisplayValues()
  var header = values.shift()
  return rosterFromRows(header, values)
}

function studentsHeader_() {
  var sheet = tab_('Students')
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0]
}

function readColumns_() {
  var rows = tab_('Columns')
    .getDataRange()
    .getValues()
    .slice(1)
    .map(function (r) {
      return { column: r[0], label: r[1], group: r[2], type: r[3], max: r[4], show: r[5] }
    })
  return columnsFromConfig(rows, studentsHeader_())
}

function readPeriodTeams_() {
  var teams = {}
  tab_('Periods')
    .getDataRange()
    .getDisplayValues()
    .slice(1)
    .forEach(function (r) {
      if (String(r[0]).trim()) teams[String(r[0]).trim()] = Number(r[1]) || 0
    })
  return teams
}

function readLog_(draftId) {
  return tab_('Picks')
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (r) {
      return r[0] === draftId
    })
    .sort(function (a, b) {
      return a[1] - b[1]
    })
    .map(function (r) {
      return { type: r[2], studentId: r[3] || null, teamId: r[4] || null, at: String(r[5]) }
    })
}

function writeTeams_(draft, rows) {
  var sheet = tab_('Teams')
  var width = 6
  var kept = sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (r) {
      return r[0] !== '' && r[0] !== draft.id
    })
  var next = kept.concat(
    rows.map(function (r) {
      return [draft.id, draft.period, r.team, r.role, r.studentId, r.name]
    }),
  )
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, width).clearContent()
  if (next.length) sheet.getRange(2, 1, next.length, width).setValues(next)
}

// A function, not a top-level value: Shared.js (with SAMPLE_HEADER) may load after this file.
function tabHeaders_() {
  return {
    Students: SAMPLE_HEADER,
    Columns: ['Column', 'Label', 'Group', 'Type', 'Max', 'Show'],
    Periods: ['Period', 'Teams'],
    Picks: ['DraftID', 'Seq', 'Action', 'StudentID', 'TeamID', 'At'],
    Teams: ['DraftID', 'Period', 'Team', 'Role', 'StudentID', 'Name'],
  }
}

function tab_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name)
  if (!sheet) throw new Error('The Sheet is missing its "' + name + '" tab. Use Team Draft > Set up draft tabs.')
  return sheet
}

function cachedJson_(key, seconds, load) {
  var hit = CacheService.getScriptCache().get(key)
  if (hit !== null) return JSON.parse(hit)
  var value = load()
  putJson_(key, value, seconds)
  return value
}

function putJson_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds)
  } catch (err) {
    // Values over 100 KB can't be cached; they're read from the Sheet each time instead.
  }
}

// ---- Sheet menu ----
// Each menu function starts with SpreadsheetApp.getUi(), which only works from the
// Sheet itself. That stops them from being run through the web app.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Team Draft')
    .addItem('Set up draft tabs', 'menuSetUpTabs')
    .addItem('Build Students tab from forms', 'menuBuildStudents')
    .addItem('Set admin PIN…', 'menuSetPin')
    .addItem('Set proxy secret…', 'menuSetProxySecret')
    .addItem('Add fake students for testing', 'menuAddFakeStudents')
    .addItem('Refresh cached data', 'menuClearCache')
    .addToUi()
}

function menuSetUpTabs() {
  var ui = SpreadsheetApp.getUi()
  var ss = SpreadsheetApp.getActive()
  var created = []
  var headers = tabHeaders_()
  Object.keys(headers).forEach(function (name) {
    if (ss.getSheetByName(name)) return
    var sheet = ss.insertSheet(name)
    sheet.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]).setFontWeight('bold')
    sheet.setFrozenRows(1)
    created.push(name)
  })

  var filled = []
  if (tab_('Columns').getLastRow() <= 1 && tab_('Students').getLastColumn() > 0) {
    fillColumnsFromStudents_()
    filled.push('Columns (review the Show and Type choices)')
  }
  if (tab_('Periods').getLastRow() <= 1 && tab_('Students').getLastRow() > 1) {
    fillPeriodsFromStudents_()
    filled.push('Periods (4 students per team as a starting point)')
  }
  CacheService.getScriptCache().removeAll(['roster', 'columns'])

  ui.alert(
    'Team Draft tabs',
    (created.length ? 'Created: ' + created.join(', ') + '\n' : 'All tabs already exist.\n') +
      (filled.length ? 'Filled in: ' + filled.join('; ') : ''),
    ui.ButtonSet.OK,
  )
}

// Fills the Columns tab from the Students headers (see suggestColumns in Shared.js),
// with a dropdown for Type and checkboxes for Show.
function fillColumnsFromStudents_() {
  var values = tab_('Students').getDataRange().getDisplayValues()
  var header = values.shift()
  var rows = suggestColumns(header, values).map(function (c) {
    return [c.column, c.label, c.group, c.type, c.max, c.show]
  })
  if (!rows.length) return
  var sheet = tab_('Columns')
  sheet.getRange(2, 1, rows.length, 6).setValues(rows)
  sheet.getRange(2, 4, rows.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(COLUMN_TYPES, true).build())
  sheet.getRange(2, 6, rows.length, 1).insertCheckboxes()
}

function fillPeriodsFromStudents_() {
  var counts = {}
  readRoster_().forEach(function (s) {
    counts[s.period] = (counts[s.period] || 0) + 1
  })
  var rows = Object.keys(counts)
    .sort()
    .map(function (p) {
      return [p, Math.max(2, Math.round(counts[p] / 4))]
    })
  if (rows.length) tab_('Periods').getRange(2, 1, rows.length, 2).setValues(rows)
}

// Rebuilds the Students tab from whatever form-response tabs are in this Sheet.
// Safe to re-run: it replaces Students entirely, and Students is derived data —
// the draft itself lives in Script Properties and the Picks tab.
function menuBuildStudents() {
  var ui = SpreadsheetApp.getUi()
  var tabs = readFormTabs_()
  if (!tabs.length) {
    ui.alert('No form responses', 'Link your forms to this Sheet first (Responses > Select destination for responses).', ui.ButtonSet.OK)
    return
  }

  var result
  try {
    result = mergeStudents(tabs)
  } catch (err) {
    ui.alert('Could not build Students', String(err.message || err), ui.ButtonSet.OK)
    return
  }

  var sheet = SpreadsheetApp.getActive().getSheetByName('Students')
  if (!sheet) sheet = SpreadsheetApp.getActive().insertSheet('Students')
  sheet.clear()
  sheet.getRange(1, 1, 1, result.header.length).setValues([result.header]).setFontWeight('bold')
  if (result.rows.length) sheet.getRange(2, 1, result.rows.length, result.header.length).setValues(result.rows)
  sheet.setFrozenRows(1)

  CacheService.getScriptCache().removeAll(['roster', 'columns'])

  // A fresh Columns tab needs the suggestions; an edited one is left alone.
  var filledColumns = false
  if (SpreadsheetApp.getActive().getSheetByName('Columns') && tab_('Columns').getLastRow() <= 1 && result.rows.length) {
    fillColumnsFromStudents_()
    filledColumns = true
  }

  var lines = ['Wrote ' + result.rows.length + ' students.', '']
  result.used.forEach(function (u) {
    lines.push('  ' + u.kind + ': "' + u.name + '"')
  })
  if (result.stats.unmatched) {
    lines.push('', result.stats.unmatched + ' student(s) did not fill in every form. They are still in the draft, with blanks.')
  }
  if (result.stats.nameFallback) {
    lines.push(result.stats.nameFallback + ' matched by name and period because the email differed between forms.')
  }
  if (result.notes.length) lines.push('', result.notes.join('\n'))
  if (filledColumns) lines.push('', 'Filled in the Columns tab. Review the Show and Type choices.')

  ui.alert('Students tab rebuilt', lines.join('\n'), ui.ButtonSet.OK)
}

// Every tab that isn't one of the app's own is a candidate form-response tab.
function readFormTabs_() {
  var own = tabHeaders_()
  return SpreadsheetApp.getActive()
    .getSheets()
    .filter(function (sheet) {
      return !own.hasOwnProperty(sheet.getName()) && sheet.getLastRow() > 0 && sheet.getLastColumn() > 0
    })
    .map(function (sheet) {
      var values = sheet.getDataRange().getDisplayValues()
      return { name: sheet.getName(), header: values.shift(), rows: values }
    })
}

function menuSetPin() {
  var ui = SpreadsheetApp.getUi()
  var answer = ui.prompt('Admin PIN', 'Choose a PIN for the admin view (at least 5 digits).', ui.ButtonSet.OK_CANCEL)
  if (answer.getSelectedButton() !== ui.Button.OK) return
  var pin = answer.getResponseText().trim()
  if (!/^\d{5,}$/.test(pin)) {
    ui.alert('The PIN needs to be at least 5 digits.')
    return
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', pin)
  ui.alert('Admin PIN saved.')
}

// Generates the secret the Vercel function sends with every API call. Copy it
// into the Vercel project as GAS_PROXY_SECRET. Running this again rotates it,
// which locks out the old value until Vercel is updated too.
function menuSetProxySecret() {
  var ui = SpreadsheetApp.getUi()
  var secret = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '')
  PropertiesService.getScriptProperties().setProperty('PROXY_SECRET', secret)
  ui.alert(
    'Proxy secret',
    'Copy this into Vercel as GAS_PROXY_SECRET, then redeploy the Vercel project:\n\n' +
      secret +
      '\n\nUntil Vercel has it, the web app will answer every API call with "Not authorized."',
    ui.ButtonSet.OK,
  )
}

function menuClearCache() {
  var ui = SpreadsheetApp.getUi()
  var cache = CacheService.getScriptCache()
  var draft = JSON.parse(PropertiesService.getScriptProperties().getProperty('ACTIVE_DRAFT') || 'null')
  cache.removeAll(['roster', 'columns', 'draft'].concat(draft ? ['log:' + draft.id] : []))
  ui.alert('Cached data cleared. Open screens will pick up Sheet changes within a few seconds.')
}

function menuAddFakeStudents() {
  var ui = SpreadsheetApp.getUi()
  var sheet = tab_('Students')
  if (sheet.getLastRow() > 1) {
    ui.alert('The Students tab already has data. Add fake students to a copy of the Sheet instead.')
    return
  }
  var rows = sampleRows({ 1: 28 }, Math.random)
  sheet.getRange(1, 1, 1, SAMPLE_HEADER.length).setValues([SAMPLE_HEADER]).setFontWeight('bold')
  sheet.getRange(2, 1, rows.length, SAMPLE_HEADER.length).setValues(rows)
  CacheService.getScriptCache().removeAll(['roster', 'columns'])
  ui.alert('Added 28 fake students in period 1. Now run Team Draft > Set up draft tabs.')
}
