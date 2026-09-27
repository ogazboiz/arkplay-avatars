/* Thumbnail plumbing: the LRU cache, cache keys and the render job (engine-backed). */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addItem, defaultDNA, setParam } from '@arkplay/avatar-engine'
import { renderJob, type ThumbCrop } from '../src/render/job.ts'
import { dnaKey } from '../src/render/keys.ts'
import { createLru } from '../src/render/lru.ts'

test('LRU evicts the least recently used and reports it', () => {
  const evicted: string[] = []
  const lru = createLru<number>(3, (k) => evicted.push(k))
  lru.set('a', 1)
  lru.set('b', 2)
  lru.set('c', 3)
  lru.get('a')
  lru.set('d', 4)
  assert.deepEqual(evicted, ['b'])
  assert.deepEqual(lru.keys(), ['c', 'a', 'd'])
})

test('pinned entries survive eviction until released', () => {
  const evicted: string[] = []
  const lru = createLru<number>(2, (k) => evicted.push(k))
  lru.set('a', 1)
  lru.pin('a')
  lru.set('b', 2)
  lru.set('c', 3)
  assert.deepEqual(evicted, ['b'])
  assert.ok(lru.has('a'))
  lru.pin('c')
  lru.set('d', 4)
  assert.deepEqual(evicted, ['b'], 'over capacity while everything old is pinned')
  assert.equal(lru.size, 3)
  lru.unpin('a')
  assert.deepEqual(evicted, ['b', 'a'], 'released entries go once there is room to reclaim')
  assert.equal(lru.size, 2)
})

test('replacing a value reports the old one; delete and clear report too', () => {
  const evicted: [string, number][] = []
  const lru = createLru<number>(5, (k, v) => evicted.push([k, v]))
  lru.set('a', 1)
  lru.set('a', 2)
  lru.delete('a')
  lru.set('b', 3)
  lru.clear()
  assert.deepEqual(evicted, [
    ['a', 1],
    ['a', 2],
    ['b', 3],
  ])
})

test('cache keys change with the avatar, including art that share codes leave out', () => {
  const dna = defaultDNA('humanoid', 5)
  assert.equal(dnaKey(dna), dnaKey(structuredClone(dna)))
  assert.notEqual(dnaKey(dna), dnaKey(setParam(dna, 'hair', 'length', 0.9)))
  const art = (src: string) => addItem(dna, 'custom', {}, { src, w: 8, h: 8 })
  const a = art('data:image/png;base64,AAAA')
  const b = art('data:image/png;base64,BBBB')
  assert.notEqual(dnaKey(a), dnaKey(b))
  assert.notEqual(dnaKey(a), dnaKey(dna))
})

test('render jobs produce one SVG per framing, with the requested id prefix', () => {
  const dna = defaultDNA('humanoid', 5)
  const crops: ThumbCrop[] = ['head', 'face', 'eyes', 'bust', 'full', 'tall', 'portrait', 'legs', 'feet', 'fixed']
  const boxes = new Set<string>()
  for (const crop of crops) {
    const svg = renderJob({ dna, crop, idPrefix: `t${crop}` })
    assert.match(svg, /^<svg[^>]+viewBox="/)
    boxes.add(/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '')
  }
  assert.equal(boxes.size, crops.length, 'each framing is different')
  const creature = renderJob({ dna: defaultDNA('creature', 5), crop: 'head', idPrefix: 'tc', scene: true })
  assert.match(creature, /<svg/)
})
