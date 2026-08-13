import { test } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { HttpObservationEventServer } from '../../src/main/services/observation/event-server.ts'

function post(port: number, path: string, body: string, authorization?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(authorization ? { authorization } : {}) }
    }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
    })
    req.on('error', reject)
    req.end(body)
  })
}

const TOKEN = 'b'.repeat(32)
const BODY = JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'session-1', cwd: 'C:\\project' })

test('server accepts the recovered token and rejects missing or wrong tokens', async () => {
  const server = new HttpObservationEventServer()
  const events: unknown[] = []
  server.onEvent((event) => events.push(event))
  const info = await server.start({ port: 0, token: TOKEN })
  try {
    assert.equal(await post(info.port, '/state', BODY), 401)
    assert.equal(await post(info.port, '/state', BODY, `Bearer ${'c'.repeat(32)}`), 401)
    assert.equal(await post(info.port, '/state', BODY, `Bearer ${TOKEN}`), 200)
    assert.equal(await post(info.port, `/state?token=${TOKEN}`, BODY), 200)
    assert.equal(events.length, 2)
  } finally {
    await server.stop()
  }
})

test('server rejects bodies larger than 4 KB', async () => {
  const server = new HttpObservationEventServer()
  const info = await server.start({ port: 0, token: TOKEN })
  try {
    assert.equal(await post(info.port, '/state', JSON.stringify({ value: 'x'.repeat(5000) }), `Bearer ${TOKEN}`), 413)
  } finally {
    await server.stop()
  }
})

test('occupied preferred port falls back to a different port', async () => {
  const blocker = createNetServer()
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(0, '127.0.0.1', () => resolve())
  })
  const address = blocker.address()
  assert.ok(address && typeof address === 'object')
  const occupiedPort = address.port
  const server = new HttpObservationEventServer()
  try {
    const info = await server.start({ port: occupiedPort, token: TOKEN })
    assert.notEqual(info.port, occupiedPort)
    assert.equal(server.isRunning(), true)
  } finally {
    await server.stop()
    await new Promise<void>((resolve) => blocker.close(() => resolve()))
  }
})
