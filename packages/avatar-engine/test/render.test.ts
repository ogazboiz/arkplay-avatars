import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_ITEMS,
  EXPRESSIONS,
  POSES,
  SPECIES,
  THEMES,
  addItem,
  applySpecies,
  clipsFor,
  defaultDNA,
  randomDNA,
  renderSVG,
  crossover,
  interpolate,
  mutate,
  variations,
} from '../src/index.ts'
import { pathBounds } from '../src/render/painter.ts'
import { CROPS, TINY_PNG, VIEWS, bare } from './helpers.ts'

const svgOk = (s: string) => /^<svg[\s>]/.test(s) && s.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(s)

// Without an idPrefix every render gets a fresh one (av0, av1…) so avatars can share a
// page; with the same prefix, the same DNA must give byte-identical SVG.
test('rendering is deterministic', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const kind = seed % 2 ? 'humanoid' : 'creature'
    const a = randomDNA({ seed, kind })
    const b = randomDNA({ seed, kind })
    assert.deepEqual(a, b, `randomDNA(${seed})`)
    for (const view of VIEWS) assert.equal(renderSVG(a, { view, idPrefix: 'd' }), renderSVG(b, { view, idPrefix: 'd' }), `seed ${seed} ${view}`)
  }
  const d = randomDNA({ seed: 99 })
  assert.notEqual(renderSVG(d), renderSVG(d), 'auto prefixes differ')
})

test('rendering does not mutate its input', () => {
  const d = randomDNA({ seed: 11 })
  const before = structuredClone(d)
  renderSVG(d, { view: 'side', anim: 'walk', time: 0.3 })
  assert.deepEqual(d, before)
})

test('every species renders in every view and crop', () => {
  for (const s of SPECIES) {
    const d = applySpecies(defaultDNA('creature', 3), s.id)
    for (const view of VIEWS)
      for (const crop of CROPS) {
        const svg = renderSVG(d, { view, crop, size: 96 })
        assert.ok(svgOk(svg), `${s.id} ${view} ${crop}`)
      }
  }
})

test('every expression renders for both kinds and every view', () => {
  for (const kind of ['humanoid', 'creature'] as const)
    for (const e of EXPRESSIONS)
      for (const view of VIEWS) assert.ok(svgOk(renderSVG(bare(kind), { expression: e.id, view, crop: 'head' })), `${kind} ${e.id} ${view}`)
})

test('every pose renders in every view', () => {
  for (const p of POSES) for (const view of VIEWS) assert.ok(svgOk(renderSVG(defaultDNA(), { pose: p.id, view })), `${p.id} ${view}`)
})

test('every clip samples cleanly across its duration', () => {
  for (const kind of ['humanoid', 'creature'] as const) {
    const dna = kind === 'creature' ? applySpecies(defaultDNA('creature'), 'dragon') : randomDNA({ seed: 5, kind })
    for (const c of clipsFor(kind))
      for (let i = 0; i <= 4; i++) {
        const time = (c.duration * i) / 4
        assert.ok(svgOk(renderSVG(dna, { anim: c.name, time, view: 'side' })), `${kind} ${c.name} t=${time}`)
      }
  }
})

test('every theme produces valid avatars', () => {
  for (const t of THEMES)
    for (let seed = 1; seed <= 4; seed++)
      for (const kind of ['humanoid', 'creature'] as const) assert.ok(svgOk(renderSVG(randomDNA({ seed, kind, theme: t.id }))), `${t.id} ${seed} ${kind}`)
})

test('every item has art: adding it changes the render and never throws', () => {
  const missing: string[] = []
  for (const item of ALL_ITEMS)
    for (const kind of item.kinds) {
      const base = bare(kind)
      const asset = item.id === 'custom' ? { src: TINY_PNG, w: 4, h: 4 } : undefined
      const withItem = addItem(base, item.id, {}, asset)
      assert.notEqual(withItem, base, `${item.id} could not be added to a ${kind}`)
      const changed = VIEWS.some((view) => {
        const a = renderSVG(base, { view })
        const b = renderSVG(withItem, { view })
        assert.ok(svgOk(b), `${item.id} ${kind} ${view}`)
        return a !== b
      })
      if (!changed) missing.push(`${item.id} (${kind})`)
    }
  assert.deepEqual(missing, [], 'items that draw nothing')
})

test('evolve helpers return valid, deterministic DNA', () => {
  const a = randomDNA({ seed: 21 })
  const b = randomDNA({ seed: 22 })
  assert.deepEqual(mutate(a, 0.5, 1), mutate(a, 0.5, 1))
  assert.equal(variations(a, 6, 0.4, 2).length, 6)
  assert.ok(svgOk(renderSVG(crossover(a, b, 3))))
  for (const t of [0, 0.25, 0.5, 1]) assert.ok(svgOk(renderSVG(interpolate(a, b, t))))
})

test('random locks keep locked sections untouched', () => {
  const base = randomDNA({ seed: 30 })
  const next = randomDNA({ seed: 31, base, locks: ['hair', 'skin'] })
  assert.deepEqual(next.sections.hair, base.sections.hair)
  assert.deepEqual(next.sections.skin, base.sections.skin)
})

test('creature re-rolls: one part, everything, and locks', () => {
  const cat = randomDNA({ seed: 5, kind: 'creature', species: 'cat' })
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const ears = randomDNA({ seed: 6, base: cat, only: ['ears'] })
  assert.ok(!same(ears.sections.ears, cat.sections.ears), 'only: ears changes the ears')
  assert.ok(same(ears.sections.form, cat.sections.form) && same(ears.sections.coat, cat.sections.coat), '…and nothing else')
  const all = randomDNA({ seed: 7, base: cat })
  assert.ok(!same(all.sections.form, cat.sections.form), 'a full re-roll changes the anatomy')
  const locked = randomDNA({ seed: 8, base: cat, locks: ['coat'] })
  assert.deepEqual(locked.sections.coat, cat.sections.coat)
})

test('pathBounds reads relative commands and closepath', () => {
  assert.deepEqual(pathBounds('M10 10 l10 20'), { x: 10, y: 10, w: 10, h: 20 })
  assert.deepEqual(pathBounds('m10 10 20 0 0 20'), { x: 10, y: 10, w: 20, h: 20 })
  assert.deepEqual(pathBounds('M10 10 h5 v5 h-5 z'), { x: 10, y: 10, w: 5, h: 5 })
  assert.deepEqual(pathBounds('M0 0 c10 0 10 10 0 10'), { x: 0, y: 0, w: 10, h: 10 })
  assert.deepEqual(pathBounds('M0 0 H10 V10 Z m5 5 l1 1'), { x: 0, y: 0, w: 10, h: 10 })
})

test('SVG ids are prefixed so several avatars can share a page', () => {
  const svg = renderSVG(randomDNA({ seed: 4 }), { idPrefix: 'zz9' })
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  assert.ok(ids.length > 0)
  for (const id of ids) assert.ok(id.startsWith('zz9'), id)
})
