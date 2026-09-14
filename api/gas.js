// Vercel serverless route: the front end's only way to reach Apps Script.
//
// The browser posts { fn, args } here; this function adds the shared secret and
// forwards to the Apps Script /exec URL. Neither the URL nor the secret is ever
// sent to the page. Because this is server-to-server there is no CORS involved,
// which also sidesteps the fact that Apps Script cannot answer a preflight.

const ALLOWED = new Set(['getVersion', 'getState', 'checkPin', 'startDraft', 'act', 'submitPick'])

// Safe to send twice. Apps Script sometimes answers a POST with a 404 HTML page
// even though doPost already ran, so a retry can double-apply anything that
// writes. These three only read, so they can be retried; act, submitPick and
// startDraft append to the pick log and must not be.
const IDEMPOTENT = new Set(['getVersion', 'getState', 'checkPin'])

// Requests with no User-Agent get an intermittent 404 from Google — roughly one
// in five in testing, which at a 1.5s poll would be constant errors on the
// projector. Node's fetch sends no User-Agent by default; curl does, which is
// why this only showed up against the real deployment.
const USER_AGENT = 'team-draft-day-proxy'

// Calls that carry the admin PIN. A wrong PIN on one of these counts against the
// caller's budget below.
const PIN_CALLS = new Set(['checkPin', 'startDraft', 'act', 'getState'])

const MAX_FAILURES = 10
const WINDOW_MS = 10 * 60 * 1000

// Slows down PIN guessing. This lives in one lambda instance's memory, so it is a
// speed bump rather than a guarantee — Vercel may run several instances, and a
// cold start forgets everything. The 6-digit minimum on the PIN is what actually
// makes the search space uncomfortable; this just makes it slow and noisy.
const failures = new Map()

function tooManyFailures(ip) {
  const hits = (failures.get(ip) || []).filter((t) => Date.now() - t < WINDOW_MS)
  failures.set(ip, hits)
  return hits.length >= MAX_FAILURES
}

function recordFailure(ip) {
  const hits = failures.get(ip) || []
  hits.push(Date.now())
  failures.set(ip, hits)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callAppsScript(execUrl, body, attempts) {
  let last = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await wait(150 * attempt)
    let upstream
    try {
      upstream = await fetch(execUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify(body),
      })
    } catch (err) {
      last = { reason: 'Could not reach the Apps Script backend.', detail: err.message }
      continue
    }
    const text = await upstream.text()
    try {
      return { payload: JSON.parse(text) }
    } catch {
      // Apps Script answers auth and deployment problems with an HTML page.
      last = { reason: 'The Apps Script backend did not return JSON. Check the deployment.', status: upstream.status, detail: text.slice(0, 300) }
    }
  }
  return { failure: last }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' })

  const execUrl = (process.env.GAS_EXEC_URL || '').trim()
  const secret = (process.env.GAS_PROXY_SECRET || '').trim()

  // Naming the missing variable saves a round of guessing in the Vercel dashboard.
  // Only ever reports presence, never a value.
  const missing = [!execUrl && 'GAS_EXEC_URL', !secret && 'GAS_PROXY_SECRET'].filter(Boolean)
  if (missing.length) {
    console.error('Missing env:', missing.join(', '), '| env keys seen:', Object.keys(process.env).filter((k) => k.startsWith('GAS_')).join(',') || '(none)')
    return res.status(500).json({
      ok: false,
      error:
        `The server is missing ${missing.join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'} in ` +
        'Vercel under Settings > Environment Variables, then redeploy — environment variables only ' +
        'reach a deployment that is built after they are saved.',
    })
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(execUrl)) {
    return res.status(500).json({
      ok: false,
      error: 'GAS_EXEC_URL does not look like an Apps Script web app URL. It must end in /exec, not /dev.',
    })
  }

  const { fn, args = [] } = req.body || {}
  if (!ALLOWED.has(fn)) return res.status(400).json({ ok: false, error: 'Unknown function.' })
  if (!Array.isArray(args)) return res.status(400).json({ ok: false, error: 'Bad arguments.' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown'
  const guarded = PIN_CALLS.has(fn)
  if (guarded && tooManyFailures(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many wrong PINs. Wait a few minutes.' })
  }

  const { payload, failure } = await callAppsScript(execUrl, { secret, fn, args }, IDEMPOTENT.has(fn) ? 3 : 1)
  if (failure) {
    console.error('Apps Script call failed:', fn, failure.status || '', failure.detail || '')
    return res.status(502).json({ ok: false, error: failure.reason })
  }

  if (guarded && payload.ok === false && /PIN/i.test(payload.error || '')) recordFailure(ip)

  return res.status(200).json(payload)
}
