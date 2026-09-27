import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addItem, canonicalJSON, defaultDNA, withName } from '@arkplay/avatar-engine'
import { keepCustomArt, makeKind, rollAvatar } from '../src/state/randomize.ts'

const same = (a: unknown, b: unknown) => canonicalJSON(a) === canonicalJSON(b)
const PNG = 'data:image/png;base64,iVBORw0KGgo='

test('rolling a creature changes its anatomy (not just the scene)', () => {
  const base = defaultDNA('creature', 1)
  let changed = 0
  for (let seed = 1; seed <= 6; seed++) if (!same(rollAvatar(base, { seed }).sections.coat, base.sections.coat)) changed++
  assert.ok(changed >= 5, `coat changed in ${changed}/6 rolls`)
})

test('creature locks keep sections and single params', () => {
  const base = withName(defaultDNA('creature', 1), 'Pip')
  const r = rollAvatar(base, { seed: 7, locks: ['coat', 'tail.length', 'accessories'] })
  assert.ok(same(r.sections.coat, base.sections.coat))
  assert.equal(r.sections.tail.length, base.sections.tail.length)
  assert.ok(same(r.accessories, base.accessories))
  assert.equal(r.name, 'Pip')
  assert.ok(same(r.sections.style, base.sections.style), 'art style is never randomized')
})

test('rolling one creature section leaves the rest alone', () => {
  const base = defaultDNA('creature', 1)
  const r = rollAvatar(base, { seed: 11, only: ['coat'] })
  assert.ok(same(r.sections.face, base.sections.face))
  assert.ok(same(r.sections.tail, base.sections.tail))
  assert.equal(r.seed, base.seed)
  assert.equal(r.meta?.species, base.meta?.species)
})

test('rolling "species" re-rolls the whole anatomy and names the new species', () => {
  const base = defaultDNA('creature', 1)
  const r = rollAvatar(base, { seed: 3, only: ['species'] })
  assert.ok(!same(r.sections.face, base.sections.face) || !same(r.sections.coat, base.sections.coat))
  assert.ok(same(r.sections.scene, base.sections.scene))
})

test('humanoid rolls go through the engine with locks and only', () => {
  const base = defaultDNA('humanoid', 2)
  const locked = rollAvatar(base, { seed: 5, locks: ['hair', 'outfit'] })
  assert.ok(same(locked.sections.hair, base.sections.hair))
  assert.ok(same(locked.outfit, base.outfit))
  const only = rollAvatar(base, { seed: 5, only: ['hair'] })
  assert.ok(same(only.sections.body, base.sections.body))
  assert.ok(!same(only.sections.hair, base.sections.hair))
})

test('uploaded art survives a roll', () => {
  for (const kind of ['humanoid', 'creature'] as const) {
    const base = addItem(defaultDNA(kind, 4), 'custom', { anchor: 'chest' }, { src: PNG, w: 8, h: 8 })
    const r = rollAvatar(base, { seed: 9 })
    const art = r.accessories.filter((a) => a.id === 'custom')
    assert.equal(art.length, 1, kind)
    assert.equal(art[0].asset?.src, PNG)
    assert.equal(art[0].params.anchor, 'chest')
  }
  const plain = defaultDNA('humanoid', 4)
  assert.equal(keepCustomArt(plain, plain), plain)
})

test('a new kind keeps the name, expression, scene and style', () => {
  const from = withName(defaultDNA('humanoid', 8), 'Kit')
  from.sections.scene = { ...from.sections.scene, background: 'solid', color1: '#123456' }
  const c = makeKind('creature', from, 77)
  assert.equal(c.kind, 'creature')
  assert.equal(c.name, 'Kit')
  assert.ok(same(c.sections.scene, from.sections.scene))
  assert.ok(same(c.sections.expression, from.sections.expression))
  assert.ok(same(c.sections.style, from.sections.style))
  assert.deepEqual(c.outfit, [])
})
