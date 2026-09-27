/* Server rendering, phase 2: picker tiles from the avatar service. Jobs asked for together travel
 * in one request (highest priority first, at most 48), cancelled ones never go, uploaded art
 * travels by id, and a busy service is asked again after Retry-After. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDNA, type AvatarDNA } from '@arkplay/avatar-engine'
import { serverTilePool, tileItem, TILES_PER_REQUEST } from '../src/render/serverTiles.ts'
import { PremiumPreviewError, type PremiumService } from '../src/render/premium.ts'

const dna = (seed: number): AvatarDNA => defaultDNA('humanoid', seed)

function fakeService(answer: (items: Record<string, unknown>[], call: number) => Promise<(string | null)[]>): { service: PremiumService; calls: Record<string, unknown>[][] } {
  const calls: Record<string, unknown>[][] = []
  const service = {
    tiles: (items: Record<string, unknown>[]) => {
      calls.push(items)
      return answer(items, calls.length)
    },
  } as unknown as PremiumService
  return { service, calls }
}

const svgOf = (items: Record<string, unknown>[]) => Promise.resolve(items.map((it) => `<svg data-crop="${String(it.crop)}"/>`))

test('tileItem: defaults left out, uploaded art by id, inline art kept when it is all there is', () => {
  const d = dna(1)
  const withArt: AvatarDNA = {
    ...d,
    accessories: [
      { id: 'custom', asset: { id: 'as_1', src: 'data:image/png;base64,AAAA', w: 10, h: 10 } },
      { id: 'custom', asset: { src: 'data:image/png;base64,BBBB', w: 10, h: 10 } },
    ] as AvatarDNA['accessories'],
  }
  const it = tileItem({ dna: withArt, crop: 'head', idPrefix: 'x' })
  assert.deepEqual(Object.keys(it).sort(), ['crop', 'dna', 'size'])
  const acc = (it.dna as AvatarDNA).accessories
  assert.equal(acc[0].asset?.src, undefined)
  assert.equal(acc[0].asset?.id, 'as_1')
  assert.equal(acc[1].asset?.src, 'data:image/png;base64,BBBB')
  assert.deepEqual(tileItem({ dna: d, crop: 'tall', idPrefix: 'x', view: 'side', scene: true, size: 128, quality: 'high' }), { dna: d, crop: 'tall', size: 128, view: 'side', scene: true, quality: 'high' })
})

test('jobs asked for together go in one request, highest priority first, 48 at most', async () => {
  const f = fakeService(svgOf)
  const pool = serverTilePool(f.service)
  const low = pool.run({ dna: dna(1), crop: 'feet', idPrefix: 'a' }, { priority: 0 })
  const high = pool.run({ dna: dna(2), crop: 'head', idPrefix: 'b' }, { priority: 5 })
  assert.equal(await high, '<svg data-crop="head"/>')
  assert.equal(await low, '<svg data-crop="feet"/>')
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].map((i) => i.crop), ['head', 'feet'])
  const many = Array.from({ length: TILES_PER_REQUEST + 5 }, (_, i) => pool.run({ dna: dna(10 + i), crop: 'face', idPrefix: `m${i}` }))
  await Promise.all(many)
  assert.deepEqual(f.calls.slice(1).map((c) => c.length).sort((a, b) => b - a), [TILES_PER_REQUEST, 5])
  pool.dispose()
})

test('a job cancelled before its batch leaves is never sent', async () => {
  const f = fakeService(svgOf)
  const pool = serverTilePool(f.service)
  const ctrl = new AbortController()
  const gone = pool.run({ dna: dna(1), crop: 'head', idPrefix: 'a' }, { signal: ctrl.signal })
  const kept = pool.run({ dna: dna(2), crop: 'bust', idPrefix: 'b' })
  ctrl.abort()
  await assert.rejects(gone, (e: unknown) => (e as { name?: string }).name === 'AbortError')
  assert.equal(await kept, '<svg data-crop="bust"/>')
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].map((i) => i.crop), ['bust'])
  pool.dispose()
})

test('a busy service is asked again after Retry-After; other failures reject', async () => {
  const f = fakeService((items, call) => (call === 1 ? Promise.reject(new PremiumPreviewError('busy', 'busy', 1)) : svgOf(items)))
  const pool = serverTilePool(f.service)
  const t0 = Date.now()
  assert.equal(await pool.run({ dna: dna(1), crop: 'head', idPrefix: 'a' }), '<svg data-crop="head"/>')
  assert.ok(Date.now() - t0 >= 900, 'waited for Retry-After')
  assert.equal(f.calls.length, 2)
  const g = fakeService(() => Promise.reject(new PremiumPreviewError('offline', 'offline')))
  const failing = serverTilePool(g.service)
  await assert.rejects(failing.run({ dna: dna(1), crop: 'head', idPrefix: 'a' }), (e: unknown) => e instanceof PremiumPreviewError && e.kind === 'offline')
  const nulls = serverTilePool(fakeService((items) => Promise.resolve(items.map(() => null))).service)
  await assert.rejects(nulls.run({ dna: dna(1), crop: 'head', idPrefix: 'a' }), PremiumPreviewError)
  pool.dispose()
  failing.dispose()
  nulls.dispose()
})
