import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AvatarApiError, DeveloperClient, normalizeVoucherCode } from '../src/index.ts'

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

const headersOf = (c: Call) => c.init.headers as Record<string, string>

test('the plan table is public; everything under /me/developer is authenticated and never sends an API key', async () => {
  const { fetch, calls } = fakeFetch((c) => (c.url.endsWith('/developer/plans') ? json({ plans: [], defaultPlan: 'free' }) : json({ keys: [] })))
  const d = new DeveloperClient({ baseUrl: 'https://x.test/', getToken: () => 'tok', fetch })
  assert.equal((await d.plans()).defaultPlan, 'free')
  assert.equal(calls[0].url, 'https://x.test/avatar/v1/developer/plans')
  assert.equal(headersOf(calls[0]).Authorization, undefined)
  assert.deepEqual(await d.keys(), [])
  assert.equal(calls[1].url, 'https://x.test/avatar/v1/me/developer/keys')
  assert.equal(headersOf(calls[1]).Authorization, 'Bearer tok')
  for (const c of calls) assert.equal(headersOf(c)['X-ArkPlay-Api-Key'], undefined)
  const signedOut = new DeveloperClient({ fetch })
  await assert.rejects(signedOut.account(), (e: unknown) => e instanceof AvatarApiError && e.status === 401)
})

test('writes: create, revoke, usage days clamped, orders, confirm (202 = pending), redeem', async () => {
  const { fetch, calls } = fakeFetch((c) => {
    if (c.url.endsWith('/confirm')) return json({ id: 'do_1', status: 'pending' }, 202, { 'Retry-After': '6' })
    if (c.url.includes('/usage')) return json({ keyId: 'k', days: [], requests: 0, renders: 0 })
    return json({ ok: true }, c.init.method === 'POST' ? 201 : 200)
  })
  const d = new DeveloperClient({ getToken: async () => 'tok', fetch })
  await d.createKey('Game server')
  assert.deepEqual([calls[0].init.method, calls[0].url, calls[0].init.body], ['POST', '/avatar/v1/me/developer/keys', JSON.stringify({ name: 'Game server' })])
  await d.revokeKey('abc/def')
  assert.equal(calls[1].url, '/avatar/v1/me/developer/keys/abc%2Fdef/revoke')
  await d.usage('k1', 500)
  assert.equal(calls[2].url, '/avatar/v1/me/developer/keys/k1/usage?days=90')
  await d.createOrder({ plan: 'indie', months: 3, method: 'manual' })
  assert.equal(calls[3].init.body, JSON.stringify({ plan: 'indie', months: 3, method: 'manual' }))
  const confirmed = await d.confirmOrder('do_1', '0xabc')
  assert.deepEqual([confirmed.pending, confirmed.retryAfter], [true, 6])
  await d.redeem('ARK-0000-0000-0000-0000')
  assert.equal(calls.at(-1)?.init.body, JSON.stringify({ code: 'ARK-0000-0000-0000-0000' }))
})

test('errors become AvatarApiError with the code, message and Retry-After', async () => {
  const { fetch } = fakeFetch(() => json({ code: 'quota_exceeded', message: 'Used up.' }, 429, { 'Retry-After': '120' }))
  const d = new DeveloperClient({ getToken: () => 'tok', fetch })
  await assert.rejects(d.account(), (e: unknown) => e instanceof AvatarApiError && e.code === 'quota_exceeded' && e.retryAfter === 120 && e.status === 429)
  const { fetch: html } = fakeFetch(() => new Response('<html>bad gateway</html>', { status: 502 }))
  await assert.rejects(new DeveloperClient({ getToken: () => 'tok', fetch: html }).keys(), (e: unknown) => e instanceof AvatarApiError && e.code === 'http_502')
})

test('voucher codes are normalized: case, spaces, dashes, the optional prefix and look-alike letters', () => {
  assert.equal(normalizeVoucherCode('ARK-ABCD-EFGH-JKMN-PQRS'), 'ARK-ABCD-EFGH-JKMN-PQRS')
  assert.equal(normalizeVoucherCode('ark abcd efgh jkmn pqrs'), 'ARK-ABCD-EFGH-JKMN-PQRS')
  assert.equal(normalizeVoucherCode('abcdefghjkmnpqrs'), 'ARK-ABCD-EFGH-JKMN-PQRS')
  assert.equal(normalizeVoucherCode('ARK-OOOO-IIII-LLLL-0000'), 'ARK-0000-1111-1111-0000')
  for (const bad of ['', 'ARK-ABCD', 'ARK-UUUU-0000-0000-0000', 'ARK-ABCD-EFGH-JKMN-PQR!', 'x'.repeat(80)]) assert.equal(normalizeVoucherCode(bad), null, bad)
})
