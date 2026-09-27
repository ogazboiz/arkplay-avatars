import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AvatarApiError, ShopClient } from '../src/index.ts'

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

test('public shop reads need no token; image URLs carry options', async () => {
  const { fetch, calls } = fakeFetch((c) => (c.url.endsWith('/shop') ? json({ status: 'disabled', enabled: false }) : json({ prebuilts: [] })))
  const s = new ShopClient({ baseUrl: 'https://x.test/', fetch })
  assert.equal((await s.info()).status, 'disabled')
  assert.deepEqual(await s.prebuilts(), [])
  assert.equal(calls[0].url, 'https://x.test/avatar/v1/shop')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined)
  assert.equal(s.prebuiltImageUrl('pb_x', { size: 256, crop: 'portrait' }), 'https://x.test/avatar/v1/shop/prebuilts/pb_x/image.png?size=256&crop=portrait')
})

test('orders are authenticated; confirm reports 202 as pending with Retry-After', async () => {
  const { fetch, calls } = fakeFetch((c) =>
    c.url.endsWith('/confirm') ? json({ id: 'or_1', status: 'pending' }, 202, { 'Retry-After': '4' }) : json({ id: 'or_1', status: 'pending' }, 201),
  )
  const s = new ShopClient({ getToken: () => 'tok', fetch })
  await s.createOrder('pb_x')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.body, JSON.stringify({ prebuiltId: 'pb_x' }))
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
  const r = await s.confirmOrder('or_1', `0x${'a'.repeat(64)}`)
  assert.equal(r.pending, true)
  assert.equal(r.retryAfter, 4)
  assert.equal(calls[1].url, '/avatar/v1/me/shop/orders/or_1/confirm')
})

test('errors become AvatarApiError; signed out fails without a request', async () => {
  const { fetch, calls } = fakeFetch(() => json({ code: 'wallet_not_linked', message: 'Link a wallet first.' }, 409))
  await assert.rejects(new ShopClient({ getToken: () => 't', fetch }).createOrder('pb_x'), (e: unknown) => e instanceof AvatarApiError && e.code === 'wallet_not_linked' && e.status === 409)
  await assert.rejects(new ShopClient({ fetch }).orders(), (e: unknown) => e instanceof AvatarApiError && e.status === 401)
  assert.equal(calls.length, 1)
})
