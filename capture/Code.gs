/**
 * Personality slider transcription: web app backend
 * -------------------------------------------------
 * THIS IS A SEPARATE, STANDALONE APPS SCRIPT PROJECT. Do not paste it into the
 * Team Draft project bound to the Sheet, and do not bind it to the Sheet.
 *
 * Two reasons, and the second is the important one:
 *
 *   1. Both projects define doGet. One global scope means only one survives.
 *
 *   2. A page served by doGet can call ANY top-level function in its project
 *      through google.script.run. If this page lived in the Team Draft project,
 *      a student on the personality form could open DevTools and run
 *      google.script.run.getState('class') — which returns the class view, with
 *      real student names, and takes no PIN. Keeping the projects separate is
 *      what stops that.
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as:      Me
 *   Who has access:  Anyone   (students are on fresnou.org and this script is on
 *                              codecompletemedia.com, so a same-domain
 *                              restriction would lock them out)
 *
 * Create the deployment in the editor, not with clasp: a CLI-created deployment
 * does not reliably pick up the manifest's webapp settings and answers every
 * request with a Drive "Access Denied" page.
 *
 * Responses land on the "Slider Responses" tab of the Sheet named below.
 */

/** The Team Draft Sheet. This script is standalone, so it opens it by ID. */
var SPREADSHEET_ID = '1xhOj7j5fe16UsIulEg_5zshKi3qnDybNjrfCY-RLBOQ';

var SHEET_NAME = 'Slider Responses';

/** Must stay in sync with the DIMENSIONS array in Index.html. */
var DIMENSIONS = [
  { axis: 'Energy',   left: 'Extraverted', right: 'Introverted',  leftCode: 'E', rightCode: 'I' },
  { axis: 'Mind',     left: 'Intuitive',   right: 'Observant',    leftCode: 'N', rightCode: 'S' },
  { axis: 'Nature',   left: 'Thinking',    right: 'Feeling',      leftCode: 'T', rightCode: 'F' },
  { axis: 'Tactics',  left: 'Judging',     right: 'Prospecting',  leftCode: 'J', rightCode: 'P' },
  { axis: 'Identity', left: 'Assertive',   right: 'Turbulent',    leftCode: 'A', rightCode: 'T' }
];

var TYPES = [
  'Architect', 'Logician', 'Commander', 'Debater',
  'Advocate', 'Mediator', 'Protagonist', 'Campaigner',
  'Logistician', 'Defender', 'Executive', 'Consul',
  'Virtuoso', 'Adventurer', 'Entrepreneur', 'Entertainer'
];

/**
 * The four-letter code behind each type name, per the NERIS type table.
 * Identity is deliberately absent: every name covers both the -A and -T
 * variant, so the name fixes four letters and Identity is independent.
 */
var TYPE_CODES = {
  'Architect': 'INTJ',    'Logician': 'INTP',
  'Commander': 'ENTJ',    'Debater': 'ENTP',
  'Advocate': 'INFJ',     'Mediator': 'INFP',
  'Protagonist': 'ENFJ',  'Campaigner': 'ENFP',
  'Logistician': 'ISTJ',  'Defender': 'ISFJ',
  'Executive': 'ESTJ',    'Consul': 'ESFJ',
  'Virtuoso': 'ISTP',     'Adventurer': 'ISFP',
  'Entrepreneur': 'ESTP', 'Entertainer': 'ESFP'
};

var PERIODS = ['1st Period', '2nd Period', '5th Period'];

// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Personality Traits')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Called from the client. Validates, then appends one row.
 * Returns { ok: true, typeCode } or throws with a readable message.
 */
function submitEntry(payload) {
  var firstName = cleanText_(payload.firstName, 'First name');
  var lastName = cleanText_(payload.lastName, 'Last name');
  var email = cleanText_(payload.email, 'Email');
  var period = payload.period;
  var typeName = payload.typeName;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That email address does not look right. Check the spelling.');
  }
  if (PERIODS.indexOf(period) === -1) {
    throw new Error('Choose your class period.');
  }
  if (TYPES.indexOf(typeName) === -1) {
    throw new Error('Choose your personality type.');
  }

  var positions = payload.positions || {};
  var code = '';
  var normalized = [];
  var readable = [];

  DIMENSIONS.forEach(function (dim) {
    var pos = Number(positions[dim.axis]);
    if (isNaN(pos) || pos < 0 || pos > 100) {
      throw new Error('The ' + dim.axis + ' slider is missing a value.');
    }
    pos = Math.round(pos);

    var isRight = pos >= 50;
    var pct = isRight ? pos : 100 - pos;

    code += isRight ? dim.rightCode : dim.leftCode;
    normalized.push(pos);
    readable.push(pct + '% ' + (isRight ? dim.right : dim.left));
  });

  var typeCode = code.slice(0, 4) + '-' + code.slice(4);
  var identityLetter = code.slice(4);
  var typeMatches = (TYPE_CODES[typeName] === code.slice(0, 4)) ? 'Yes' : 'No';

  var sheet = getOrCreateSheet_();
  sheet.appendRow(
    [new Date(), firstName, lastName, email, period, typeName, typeCode,
     identityLetter, TYPE_CODES[typeName], typeMatches]
      .concat(readable)
      .concat(normalized)
  );

  return { ok: true, typeCode: typeCode, firstName: firstName, typeName: typeName };
}

// ---------------------------------------------------------------------------

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAME);

  // These two names are load-bearing for the draft app, which is why they are
  // not the more descriptive ones. It routes any column ending in "Match" to a
  // teacher-only column (src/shared/roster.js), so "Type Match" never reaches
  // the captain dashboard. Renaming it to "Name Matches Sliders" would turn the
  // cross-check into a badge captains can read.
  var headers = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Class', 'Type',
                 'Type Code', 'Identity Letter',
                 "Selected Type's Code", 'Type Match'];
  DIMENSIONS.forEach(function (d) { headers.push(d.axis + ' (as shown)'); });
  DIMENSIONS.forEach(function (d) {
    headers.push(d.axis + ' 0-100 (0=' + d.left + ', 100=' + d.right + ')');
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function cleanText_(value, label) {
  var s = String(value == null ? '' : value).trim();
  if (!s) throw new Error(label + ' is required.');
  if (s.length > 120) throw new Error(label + ' is too long.');
  return s;
}

/** Convenience: prints the live web app URL to the log after deploying. */
function showWebAppUrl() {
  Logger.log(ScriptApp.getService().getUrl());
}
