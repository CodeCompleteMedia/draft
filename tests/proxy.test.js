import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/gas.js'

// The Vercel route is the only thing between the page and Apps Script, so these
// check the parts that can't be checked by opening the app: that the secret is
// added server-side, that only the allowlisted calls get through, and that a
// wrong PIN can't be guessed at speed.

process.env.GAS_EXEC_URL = 'https://script.google.com/macros/s/TEST/exec'
process.env.GAS_PROXY_SECRET = 'test-secret'

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  return res
}

function mockReq(body, { method = 'POST', ip = '10.0.0.1' } = {}) {
  return { method, body, headers: { 'x-forwarded-for': ip } }
}

// Captures what the route sent upstream and replies with whatever the test wants.
function stubFetch(reply) {
  const calls = []
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return reply
  }
  return calls
}

const jsonReply = (payload) => ({ status: 200, text: async () => JSON.stringify(payload) })

test('forwards an allowed call with the secret attached', async () => {
  const calls = stubFetch(jsonReply({ ok: true, result: 'P1-2026:7' }))
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, process.env.GAS_EXEC_URL)
  assert.deepEqual(calls[0].body, { secret: 'test-secret', fn: 'getVersion', args: [] })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true, result: 'P1-2026:7' })
})

test('the browser never has to know the secret or the exec URL', async () => {
  stubFetch(jsonReply({ ok: true, result: null }))
  const res = mockRes()
  await handler(mockReq({ fn: 'getState', args: ['class'] }), res)
  assert.equal(JSON.stringify(res.body).includes('test-secret'), false)
  assert.equal(JSON.stringify(res.body).includes('script.google.com'), false)
})

test('only the allowlisted functions get through', async () => {
  const calls = stubFetch(jsonReply({ ok: true, result: 'nope' }))
  for (const fn of ['getAppUrl', 'menuSetPin', 'readRoster_', 'eval', undefined]) {
    const res = mockRes()
    await handler(mockReq({ fn, args: [] }), res)
    assert.equal(res.statusCode, 400, `${fn} should be refused`)
  }
  assert.equal(calls.length, 0)
})

test('rejects anything but POST', async () => {
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion' }, { method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
})

test('rejects arguments that are not a list', async () => {
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: { 0: 'sneaky' } }), res)
  assert.equal(res.statusCode, 400)
})

test('an Apps Script HTML error page becomes a clear 502, not a crash', async () => {
  stubFetch({ status: 401, text: async () => '<!DOCTYPE html><html>Sign in</html>' })
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.equal(res.statusCode, 502)
  assert.match(res.body.error, /did not return JSON/)
})

test('a network failure becomes a 502', async () => {
  global.fetch = async () => {
    throw new Error('ECONNREFUSED')
  }
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.equal(res.statusCode, 502)
})

test('wrong PINs are cut off after ten tries from one address', async () => {
  stubFetch(jsonReply({ ok: false, error: 'Wrong PIN.' }))
  const ip = '10.0.0.99'
  for (let i = 0; i < 10; i++) {
    const res = mockRes()
    await handler(mockReq({ fn: 'checkPin', args: ['000000'] }, { ip }), res)
    assert.equal(res.statusCode, 200)
  }
  const res = mockRes()
  await handler(mockReq({ fn: 'checkPin', args: ['000000'] }, { ip }), res)
  assert.equal(res.statusCode, 429)
})

test('one address guessing PINs does not lock out the projector', async () => {
  stubFetch(jsonReply({ ok: false, error: 'Wrong PIN.' }))
  const guesser = '10.0.0.50'
  for (let i = 0; i < 12; i++) {
    await handler(mockReq({ fn: 'checkPin', args: ['000000'] }, { ip: guesser }), mockRes())
  }
  stubFetch(jsonReply({ ok: true, result: 'P1-2026:3' }))
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }, { ip: '10.0.0.51' }), res)
  assert.equal(res.statusCode, 200)
})

test('a misconfigured server says so instead of calling out', async () => {
  const saved = process.env.GAS_PROXY_SECRET
  delete process.env.GAS_PROXY_SECRET
  const calls = stubFetch(jsonReply({ ok: true }))
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.equal(res.statusCode, 500)
  assert.equal(calls.length, 0)
  process.env.GAS_PROXY_SECRET = saved
})

test('the error names which variable is missing', async () => {
  const saved = { ...process.env }
  delete process.env.GAS_PROXY_SECRET
  let res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.match(res.body.error, /GAS_PROXY_SECRET/)
  assert.doesNotMatch(res.body.error, /GAS_EXEC_URL/)

  delete process.env.GAS_EXEC_URL
  res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.match(res.body.error, /GAS_EXEC_URL and GAS_PROXY_SECRET/)

  Object.assign(process.env, saved)
})

test('a /dev URL or a stray quote is caught before any call goes out', async () => {
  const saved = process.env.GAS_EXEC_URL
  const calls = stubFetch(jsonReply({ ok: true }))
  for (const bad of [
    'https://script.google.com/macros/s/TEST/dev',
    '"https://script.google.com/macros/s/TEST/exec"',
    'https://script.google.com/macros/s/TEST/exec?view=admin',
    'script.google.com/macros/s/TEST/exec',
  ]) {
    process.env.GAS_EXEC_URL = bad
    const res = mockRes()
    await handler(mockReq({ fn: 'getVersion', args: [] }), res)
    assert.equal(res.statusCode, 500, `${bad} should be refused`)
    assert.match(res.body.error, /does not look like/)
  }
  assert.equal(calls.length, 0)
  process.env.GAS_EXEC_URL = saved
})

test('surrounding whitespace from a copy-paste is tolerated', async () => {
  const saved = process.env.GAS_EXEC_URL
  process.env.GAS_EXEC_URL = '  https://script.google.com/macros/s/TEST/exec\n'
  const calls = stubFetch(jsonReply({ ok: true, result: 'none' }))
  const res = mockRes()
  await handler(mockReq({ fn: 'getVersion', args: [] }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(calls[0].url, 'https://script.google.com/macros/s/TEST/exec')
  process.env.GAS_EXEC_URL = saved
})
