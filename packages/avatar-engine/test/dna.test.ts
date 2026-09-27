import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_ITEMS,
  LIMITS,
  ShareCodeError,
  addItem,
  compactDNA,
  crossover,
  decodeShareCode,
  interpolate,
  mutate,
  variations,
  defaultDNA,
  dnaEquals,
  dnaHash,
  encodeShareCode,
  normalizeDNA,
  randomDNA,
  renderSVG,
  sectionsFor,
  validateDNA,
  type AvatarDNA,
} from '../src/index.ts'
import { TINY_PNG } from './helpers.ts'

test('normalizeDNA never throws on garbage and always yields a renderable document', () => {
  const junk: unknown[] = [
    null,
    undefined,
    0,
    'avatar',
    [],
    {},
    { v: 99 },
    { kind: 'dragon' },
    { kind: 'humanoid', sections: 'x', outfit: {}, accessories: 7 },
    { kind: 'humanoid', sections: { body: { height: 'tall', build: NaN, nope: 1 } } },
    { kind: 'creature', seed: -5, name: 42, outfit: [{ id: 'hoodie' }] },
    { kind: 'humanoid', accessories: [{ id: 'no-such-item', params: null }, { id: 5 }, null] },
  ]
  for (const j of junk) {
    const d = normalizeDNA(j)
    assert.ok(d.kind === 'humanoid' || d.kind === 'creature')
    assert.ok(Number.isInteger(d.seed) && d.seed >= 0)
    assert.match(renderSVG(d, { size: 64 }), /^<svg[\s>]/)
  }
})

test('normalizeDNA is idempotent', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const d = randomDNA({ seed, kind: seed % 2 ? 'humanoid' : 'creature' })
    const n = normalizeDNA(d)
    assert.deepEqual(normalizeDNA(n), n)
  }
})

test('validateDNA reports problems and accepts real avatars', () => {
  assert.deepEqual(validateDNA(defaultDNA()), [])
  assert.deepEqual(validateDNA(randomDNA({ seed: 3, kind: 'creature' })), [])
  assert.ok(validateDNA(null).length > 0)
  assert.ok(validateDNA({ kind: 'dragon' }).length > 0)
})

test('LIMITS: names are truncated and item lists are capped', () => {
  const d = normalizeDNA({ ...defaultDNA(), name: 'x'.repeat(500) })
  assert.equal(d.name.length, LIMITS.nameLength)

  const many = ALL_ITEMS.filter((i) => i.kinds.includes('humanoid')).map((i) => ({ id: i.id, params: {} }))
  const big = normalizeDNA({ ...defaultDNA(), outfit: many, accessories: [...many, ...many] })
  assert.ok(big.outfit.length <= LIMITS.outfitItems)
  assert.ok(big.accessories.length <= LIMITS.accessories)
})

test('LIMITS: oversized inline custom art is dropped', () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(LIMITS.inlineAssetChars + 10)
  const d = normalizeDNA(addItem(defaultDNA(), 'custom', {}, { src: huge, w: 64, h: 64 }))
  for (const a of d.accessories) assert.ok((a.asset?.src?.length ?? 0) <= LIMITS.inlineAssetChars)
})

test('share codes round-trip exactly', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const d = randomDNA({ seed, kind: seed % 3 === 0 ? 'creature' : 'humanoid' })
    // A2 is the default; A1 is still written on request and read forever.
    for (const [code, re] of [
      [encodeShareCode(d), /^A2[A-Za-z0-9_-]+$/],
      [encodeShareCode(d, { format: 'A1' }), /^A1[A-Za-z0-9_-]+$/],
    ] as const) {
      assert.match(code, re)
      const back = decodeShareCode(code)
      assert.ok(dnaEquals(back, d), `seed ${seed} round-trips`)
      assert.equal(dnaHash(back), dnaHash(d))
      assert.equal(renderSVG(back, { idPrefix: 'rt' }), renderSVG(d, { idPrefix: 'rt' }))
    }
  }
})

test('share codes store only differences from the schema defaults', () => {
  const compact = JSON.stringify(compactDNA(defaultDNA()))
  for (const s of sectionsFor('humanoid')) assert.ok(!compact.includes(`"${s.id}"`), `default ${s.id} is not stored`)
  assert.ok(encodeShareCode(defaultDNA()).length < 120)
})

test('generators emit normalized DNA (it survives saving unchanged)', () => {
  const a = randomDNA({ seed: 21 })
  const b = randomDNA({ seed: 22 })
  const c = randomDNA({ seed: 23, kind: 'creature' })
  const made = [a, b, c, randomDNA({ seed: 24, theme: 'fantasy' }), mutate(a, 0.6, 1), crossover(a, b, 2), interpolate(a, b, 0.37), ...variations(c, 3, 0.5, 4)]
  for (const d of made) assert.deepEqual(normalizeDNA(d), d)
})

test('share codes strip inline custom art', () => {
  const d = addItem(defaultDNA(), 'custom', {}, { src: TINY_PNG, w: 4, h: 4 })
  const back = decodeShareCode(encodeShareCode(d))
  for (const a of back.accessories) assert.equal(a.asset?.src, undefined)
})

test('damaged share codes throw ShareCodeError, never anything else', () => {
  const good = encodeShareCode(randomDNA({ seed: 9 }))
  const bad = ['', 'hello', 'A1', 'A1!!!', 'B1' + good.slice(2), good.slice(0, good.length - 6), 'A1' + 'x'.repeat(9000)]
  for (const b of bad) assert.throws(() => decodeShareCode(b), ShareCodeError, JSON.stringify(b.slice(0, 20)))
})

test('dnaHash separates different avatars', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 50; seed++) seen.add(dnaHash(randomDNA({ seed })))
  assert.equal(seen.size, 50)
  const a: AvatarDNA = defaultDNA()
  assert.equal(dnaHash(a), dnaHash(structuredClone(a)))
})
