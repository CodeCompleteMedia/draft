// Vercel serverless route: the front end's only way to reach Apps Script.
//
// The browser posts { fn, args } here; this function adds the shared secret and
// forwards to the Apps Script /exec URL. Neither the URL nor the secret is ever
// sent to the page. Because this is server-to-server there is no CORS involved,
// which also sidesteps the fact that Apps Script cannot answer a preflight.

const ALLOWED = new Set(['getVersion', 'getState', 'checkPin', 'startDraft', 'act', 'submitPick'])

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' })

  const execUrl = process.env.GAS_EXEC_URL
  const secret = process.env.GAS_PROXY_SECRET
  if (!execUrl || !secret) {
    return res.status(500).json({ ok: false, error: 'The server is missing GAS_EXEC_URL or GAS_PROXY_SECRET.' })
  }

  const { fn, args = [] } = req.body || {}
  if (!ALLOWED.has(fn)) return res.status(400).json({ ok: false, error: 'Unknown function.' })
  if (!Array.isArray(args)) return res.status(400).json({ ok: false, error: 'Bad arguments.' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown'
  const guarded = PIN_CALLS.has(fn)
  if (guarded && tooManyFailures(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many wrong PINs. Wait a few minutes.' })
  }

  let payload
  try {
    const upstream = await fetch(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, fn, args }),
    })
    const text = await upstream.text()
    try {
      payload = JSON.parse(text)
    } catch {
      // Apps Script answers auth and deployment problems with an HTML page.
      console.error('Non-JSON from Apps Script:', upstream.status, text.slice(0, 300))
      return res.status(502).json({ ok: false, error: 'The Apps Script backend did not return JSON. Check the deployment.' })
    }
  } catch (err) {
    console.error('Apps Script request failed:', err)
    return res.status(502).json({ ok: false, error: 'Could not reach the Apps Script backend.' })
  }

  if (guarded && payload.ok === false && /PIN/i.test(payload.error || '')) recordFailure(ip)

  return res.status(200).json(payload)
}
