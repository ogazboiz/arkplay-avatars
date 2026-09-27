import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDNA } from '@arkplay/avatar-engine'
import { AvatarApiError, AvatarClient, envelope, imageQuery, readEnvelope } from '../src/index.ts'

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(respond: (c: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const c = { url: String(url), init }
    calls.push(c)
    return respond(c)
  }) as typeof fetch
  return { fetch: f, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

test('image URLs are public and carry options', () => {
  const c = new AvatarClient({ baseUrl: 'https://example.test/' })
  assert.equal(c.renderUrl('A1abc', { format: 'png', size: 256, crop: 'portrait', background: false }), 'https://example.test/avatar/v1/render/A1abc.png?size=256&crop=portrait&bg=0')
  assert.equal(c.userAvatarUrl('ap_1'), 'https://example.test/avatar/v1/users/ap_1/avatar.svg')
  assert.equal(c.assetUrl('x y'), 'https://example.test/avatar/v1/assets/x%20y')
  assert.equal(imageQuery({}), '')
})

test('detail goes into image and animated URLs', () => {
  const c = new AvatarClient({ baseUrl: 'https://example.test' })
  assert.equal(c.userAvatarUrl('ap_1', { crop: 'portrait', size: 68, detail: 'low' }), 'https://example.test/avatar/v1/users/ap_1/avatar.svg?size=68&crop=portrait&detail=low')
  assert.equal(c.renderUrl('A1abc', { format: 'svg', detail: 'medium' }), 'https://example.test/avatar/v1/render/A1abc.svg?detail=medium')
  assert.equal(c.userAnimatedUrl('ap_1', { anim: 'idle', detail: 'low' }), 'https://example.test/avatar/v1/users/ap_1/avatar.anim.svg?anim=idle&detail=low')
  assert.equal(imageQuery({ detail: 'high' }), '?detail=high')
})

test('capabilities is a public call', async () => {
  const { fetch, calls } = fakeFetch(() => json({ raster: false, uploads: false }))
  const c = new AvatarClient({ fetch })
  assert.deepEqual(await c.capabilities(), { raster: false, uploads: false })
  assert.equal(calls[0].url, '/avatar/v1/capabilities')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined)
})

test('authenticated calls send the bearer token from the hook', async () => {
  const { fetch, calls } = fakeFetch(() => json({ avatars: [] }))
  const c = new AvatarClient({ getToken: async () => 'tok', fetch })
  assert.deepEqual(await c.listAvatars(), [])
  assert.equal(calls[0].url, '/avatar/v1/me/avatars')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
})

test('signed out: authenticated calls fail fast with 401 and no request', async () => {
  const { fetch, calls } = fakeFetch(() => json({}))
  const c = new AvatarClient({ getToken: () => null, fetch })
  await assert.rejects(c.createAvatar({ dna: defaultDNA() }), (e: unknown) => e instanceof AvatarApiError && e.status === 401)
  assert.equal(calls.length, 0)
})

test('errors surface code, message and Retry-After', async () => {
  const { fetch } = fakeFetch(() => json({ code: 'rate_limited', message: 'Slow down' }, 429, { 'Retry-After': '7' }))
  const c = new AvatarClient({ getToken: () => 't', fetch })
  await assert.rejects(c.primary(), (e: unknown) => {
    assert.ok(e instanceof AvatarApiError)
    assert.equal(e.code, 'rate_limited')
    assert.equal(e.message, 'Slow down')
    assert.equal(e.retryAfter, 7)
    return true
  })
})

test('non-JSON error bodies still become AvatarApiError', async () => {
  const { fetch } = fakeFetch(() => new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }))
  const c = new AvatarClient({ fetch })
  await assert.rejects(c.catalog(), (e: unknown) => e instanceof AvatarApiError && e.status === 502 && e.code === 'http_502')
})

test('protocol envelopes round-trip and reject foreign messages', () => {
  const m = envelope({ type: 'resize' as const, height: 600 })
  assert.deepEqual(readEnvelope(m), m)
  assert.equal(readEnvelope({ type: 'resize', height: 1 }), null)
  assert.equal(readEnvelope({ ...m, v: 2 }), null)
  assert.equal(readEnvelope('hello'), null)
})
