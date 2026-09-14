// Talks to the backend. Inside Apps Script this goes through google.script.run;
// under `npm run dev` it uses the mock backend with fake students.

const gas = typeof google !== 'undefined' && google.script && google.script.run ? google.script : null

export const isMock = !gas

export function call(fn, ...args) {
  if (gas) {
    return new Promise((resolve, reject) => {
      gas.run
        .withSuccessHandler(resolve)
        .withFailureHandler((err) => reject(new Error(cleanMessage(err))))
        [fn](...args)
    })
  }
  if (import.meta.env.DEV) {
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
  return Promise.reject(new Error('Open this app from its Apps Script web app link.'))
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
