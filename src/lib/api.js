// Talks to the backend, three ways:
//   - served by Apps Script (clasp deploy)  -> google.script.run
//   - `npm run dev`                         -> the mock backend with fake students
//   - served by Vercel                      -> POST /api/gas, which forwards to
//                                              Apps Script with the shared secret
// All three end up in the same createService() on the same Sheet.

const gas = typeof google !== 'undefined' && google.script && google.script.run ? google.script : null

export const isMock = !gas && import.meta.env.DEV

export function call(fn, ...args) {
  if (gas) {
    return new Promise((resolve, reject) => {
      gas.run
        .withSuccessHandler(resolve)
        .withFailureHandler((err) => reject(new Error(cleanMessage(err))))
        [fn](...args)
    })
  }
  // The DEV check comes first so the production build can drop this branch, and
  // the fake roster with it, instead of shipping it to the classroom.
  if (import.meta.env.DEV && isMock) {
    return import('./mockBackend.js').then(
      ({ mockService }) =>
        new Promise((resolve, reject) => {
          // A little delay so the UI behaves like it will over the network.
          setTimeout(() => {
            try {
              resolve(mockService[fn](...args))
            } catch (err) {
              reject(err)
            }
          }, 120)
        }),
    )
  }
  // Outside Apps Script the page already knows its own address, and the proxy
  // refuses getAppUrl anyway so the /exec URL can't leak into the page.
  if (fn === 'getAppUrl') return Promise.resolve(location.origin + location.pathname)
  return proxyCall(fn, args)
}

async function proxyCall(fn, args) {
  let response
  try {
    response = await fetch('/api/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn, args }),
    })
  } catch {
    throw new Error('No connection to the server.')
  }
  const payload = await response.json().catch(() => null)
  if (!payload) throw new Error('The server sent back something unreadable.')
  if (!payload.ok) throw new Error(cleanMessage(payload.error))
  return payload.result
}

function cleanMessage(err) {
  const message = err && err.message ? err.message : String(err)
  return message.replace(/^(Exception|Error):\s*/, '')
}

// Apps Script runs the page inside an iframe, so query parameters come from
// google.script.url rather than window.location.
export function getParams() {
  if (gas) return new Promise((resolve) => gas.url.getLocation((loc) => resolve(loc.parameter || {})))
  return Promise.resolve(Object.fromEntries(new URLSearchParams(location.search)))
}

// Each screen checks a cheap version string every ~1.5 s and only downloads the
// full state when something changed.
export function watchState(view, { getPin = () => undefined, onState, onError = () => {}, interval = 1500 }) {
  let version = null
  let generation = 0
  let stopped = false
  let timer

  async function tick() {
    const gen = generation
    try {
      const next = await call('getVersion')
      if (next !== version) {
        const state = await call('getState', view, getPin())
        // Skip results that an action's fresh state has already replaced.
        if (gen === generation && !stopped) {
          version = state.version
          onState(state)
        }
      }
      onError(null)
    } catch (err) {
      onError(err)
    }
    if (!stopped) timer = setTimeout(tick, interval)
  }

  tick()

  return {
    accept(state) {
      generation += 1
      version = state.version
      onState(state)
    },
    refresh() {
      version = null
    },
    stop() {
      stopped = true
      clearTimeout(timer)
    },
  }
}
