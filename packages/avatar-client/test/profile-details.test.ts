import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Crop } from '@arkplay/avatar-engine'
import {
  AvatarApiError,
  AvatarClient,
  DEFAULT_PROFILE_AVATAR_CROP,
  PROFILE_AVATAR_CROPS,
  PROFILE_BANNERS,
  PROFILE_LIMITS,
  PROFILE_PRONOUN_LABELS,
  PROFILE_PRONOUNS,
  type PlayerProfile,
  type ProfileAvatarCrop,
  type ProfilePatch,
} from '../src/index.ts'

test('updateMyProfile: PATCH /me/profile with the token, JSON body, answers the own profile', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    if (JSON.parse(String(init.body)).bio === 'bad') {
      return new Response(JSON.stringify({ code: 'invalid_request', message: 'The profile has problems.', details: ['bio: At most 160 characters.'] }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ sub: 'ap_1', details: { bio: 'Hi', pronouns: '', banner: 'sky', featuredGame: null, showcase: [], visibility: 'public', updatedAt: 'x' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  const c = new AvatarClient({ baseUrl: 'https://example.test', fetch, getToken: () => 'tok' })
  const p: PlayerProfile = await c.updateMyProfile({ bio: 'Hi', banner: 'sky' })
  assert.equal(p.details?.banner, 'sky')
  assert.equal(calls[0].url, 'https://example.test/avatar/v1/me/profile')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json')
  await assert.rejects(c.updateMyProfile({ bio: 'bad' }), (e: unknown) => e instanceof AvatarApiError && e.status === 400 && e.details?.[0] === 'bio: At most 160 characters.')
  await assert.rejects(new AvatarClient({ fetch }).updateMyProfile({ bio: 'x' }), (e: unknown) => e instanceof AvatarApiError && e.status === 401)
})

test('profile constants', () => {
  assert.ok(PROFILE_BANNERS.includes('sky') && PROFILE_BANNERS.includes('candy'))
  assert.deepEqual(PROFILE_LIMITS, { bio: 160, pronouns: 24, showcase: 6 })
  assert.deepEqual(PROFILE_AVATAR_CROPS, ['portrait', 'bust', 'fit', 'full'])
  assert.equal(DEFAULT_PROFILE_AVATAR_CROP, 'portrait')
  // Every framing is an engine crop, so it goes straight into `crop=` of the image URLs.
  const asCrop: Crop[] = [...PROFILE_AVATAR_CROPS]
  const url = new AvatarClient({ baseUrl: 'https://example.test' }).userAvatarUrl('ap_1', { crop: asCrop[1], format: 'svg' })
  assert.match(url, /[?&]crop=bust(&|$)/)
  assert.deepEqual(PROFILE_PRONOUNS, ['he', 'she'])
  assert.deepEqual(PROFILE_PRONOUN_LABELS, { he: 'He/him', she: 'She/her' })
})

test('updateMyProfile sends the framing and pronouns as given (null resets them)', async () => {
  const bodies: unknown[] = []
  const fetch = (async (_url: string | URL | Request, init: RequestInit = {}) => {
    bodies.push(JSON.parse(String(init.body)))
    const details = { bio: '', pronouns: 'she', banner: null, avatarCrop: 'full', featuredGame: null, showcase: [], visibility: 'public', updatedAt: 'x' }
    return new Response(JSON.stringify({ sub: 'ap_1', details }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  const c = new AvatarClient({ baseUrl: 'https://example.test', fetch, getToken: () => 'tok' })
  const crop: ProfileAvatarCrop = 'full'
  const patches: ProfilePatch[] = [{ avatarCrop: crop, pronouns: 'she' }, { avatarCrop: null, pronouns: null }, { pronouns: '' }]
  const p = await c.updateMyProfile(patches[0])
  assert.equal(p.details?.avatarCrop, 'full')
  assert.equal(p.details?.pronouns, 'she')
  await c.updateMyProfile(patches[1])
  await c.updateMyProfile(patches[2])
  assert.deepEqual(bodies, [{ avatarCrop: 'full', pronouns: 'she' }, { avatarCrop: null, pronouns: null }, { pronouns: '' }])
})
