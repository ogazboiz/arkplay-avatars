import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AvatarClient, MAX_PROFILE_BATCH, animatedQuery, rigQuery, spriteSheetQuery, type PlayerProfile } from '../src/index.ts'

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const profileOf = (sub: string) => ({ sub }) as PlayerProfile

test('animated, GIF, sprite-sheet and rig URLs for users and codes', () => {
  const c = new AvatarClient({ baseUrl: 'https://example.test' })
  assert.equal(c.userAnimatedUrl('ap_1'), 'https://example.test/avatar/v1/users/ap_1/avatar.anim.svg')
  assert.equal(c.userAnimatedUrl('ap_1', { anim: 'walk', view: 'side', crop: 'full', size: 128, background: false, fps: 12 }), 'https://example.test/avatar/v1/users/ap_1/avatar.anim.svg?anim=walk&view=side&crop=full&size=128&bg=0&fps=12')
  assert.equal(c.userGifUrl('ap 1', { anim: 'idle', size: 256 }), 'https://example.test/avatar/v1/users/ap%201/avatar.gif?anim=idle&size=256')
  assert.equal(c.userSpriteSheetUrl('ap_1', { anims: ['idle', 'walk'], view: 'side', cell: 128 }), 'https://example.test/avatar/v1/users/ap_1/spritesheet.zip?anims=idle%2Cwalk&view=side&cell=128')
  assert.equal(c.userRigUrl('ap_1', { clips: ['idle'], scale: 0.5 }), 'https://example.test/avatar/v1/users/ap_1/rig.zip?clips=idle&scale=0.5')
  assert.equal(c.renderAnimatedUrl('A1abc', { anim: 'idle' }), 'https://example.test/avatar/v1/render/A1abc.anim.svg?anim=idle')
  assert.equal(c.renderGifUrl('A1abc'), 'https://example.test/avatar/v1/render/A1abc.gif')
  assert.equal(c.renderSpriteSheetUrl('A1abc', { anims: ['run'] }), 'https://example.test/avatar/v1/render/A1abc/spritesheet.zip?anims=run')
  assert.equal(c.renderRigUrl('A1abc'), 'https://example.test/avatar/v1/render/A1abc/rig.zip')
  assert.equal(animatedQuery(), '')
  assert.equal(spriteSheetQuery({}), '')
  assert.equal(rigQuery({ view: 'front' }), '?view=front')
})

test('profiles: public, batched by 64, in order and without duplicates', async () => {
  const { fetch, calls } = fakeFetch((c) => {
    if (c.init.method === 'POST') {
      const subs = (JSON.parse(String(c.init.body)) as { subs: string[] }).subs
      return json({ profiles: subs.map(profileOf) })
    }
    return json(profileOf(decodeURIComponent(c.url.split('/users/')[1].split('/')[0])))
  })
  const c = new AvatarClient({ fetch })
  assert.equal((await c.profile('ap_x')).sub, 'ap_x')
  assert.equal(calls[0].url, '/avatar/v1/users/ap_x/profile')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined, 'profiles need no token')

  const subs = Array.from({ length: 130 }, (_, i) => `ap_${i}`)
  const got = await c.profiles([...subs, 'ap_0', 'ap_5'])
  assert.deepEqual(got.map((p) => p.sub), subs)
  const posts = calls.filter((x) => x.init.method === 'POST')
  assert.equal(posts.length, 3)
  assert.ok(posts.every((p) => p.url === '/avatar/v1/users/profiles'))
  assert.ok(posts.every((p) => (JSON.parse(String(p.init.body)) as { subs: string[] }).subs.length <= MAX_PROFILE_BATCH))
  assert.deepEqual(await c.profiles([]), [])
})

test('features are public; my profile and entitlements need the token', async () => {
  const { fetch, calls } = fakeFetch((c) => json(c.url.endsWith('/features') ? { promo: { active: true }, features: [], now: '' } : c.url.endsWith('/me/entitlements') ? { entitlements: [], promo: {} } : profileOf('ap_me')))
  const c = new AvatarClient({ fetch, getToken: () => 'tok' })
  assert.equal((await c.features()).promo.active, true)
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined)
  assert.deepEqual((await c.entitlements()).entitlements, [])
  assert.equal(calls[1].url, '/avatar/v1/me/entitlements')
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer tok')
  assert.equal((await c.myProfile()).sub, 'ap_me')
  assert.equal(calls[2].url, '/avatar/v1/me/profile')
  const signedOut = new AvatarClient({ fetch, getToken: () => null })
  await assert.rejects(signedOut.myProfile(), (e: unknown) => (e as { status?: number }).status === 401)
})
