/* Avatars for the share-code tests: a large generated corpus and hand-made edge cases. */

import {
  ACCESSORIES,
  ALL_ITEMS,
  GARMENTS,
  SPECIES,
  THEMES,
  addItem,
  applySpecies,
  coerce,
  createRng,
  crossover,
  defaultDNA,
  interpolate,
  itemTier,
  mutate,
  normalizeDNA,
  randomDNA,
  randomParam,
  sectionsFor,
  setParam,
  variations,
  type AvatarDNA,
  type AvatarKind,
  type ParamSpec,
  type ParamValue,
  type Params,
} from '../src/index.ts'

/** A value for `spec` that differs from its default; `n` picks among several (deterministic). */
export function nonDefault(spec: ParamSpec, n: number): ParamValue {
  const pick = (cands: ParamValue[]): ParamValue => {
    for (let i = 0; i < cands.length; i++) {
      const v = cands[(n + i) % cands.length]
      if (coerce(spec, v) !== spec.default) return v
    }
    return spec.default
  }
  switch (spec.type) {
    case 'range': {
      const span = spec.max - spec.min
      // Off the slider grid, both bounds, on the grid, and the finest step.
      return pick([spec.min + span * 0.123456, spec.max, spec.min, spec.min + spec.step * 3, spec.min + 0.0001])
    }
    case 'color':
      return pick(['#abc', '#1d2e3f', '#e53935', '#0f0', '#f5f2eb', '#7cb342'])
    case 'choice': {
      const ids = spec.options.map((o) => o.id)
      return pick([ids[ids.length - 1], ids[1] ?? ids[0], ids[0]])
    }
    case 'toggle':
      return !spec.default
    case 'text':
      return pick(['HI 42!', 'A', 'ZZ-9+#&'])
  }
}

/** Every param of an item set to something other than its default. */
export function itemParamsOff(params: readonly ParamSpec[], n: number): Params {
  const out: Params = {}
  params.forEach((p, i) => (out[p.key] = nonDefault(p, n + i)))
  return out
}

const kindFor = (kinds: readonly AvatarKind[]): AvatarKind => (kinds.includes('humanoid') ? 'humanoid' : 'creature')

/** A custom accessory with an uploaded asset (odd floats on purpose). */
const customAsset = (i: number) => ({
  id: `as_${'0123456789abcdefghijklmnopqrstuvwxyz'.slice(i % 20, (i % 20) + 8 + (i % 13))}`,
  w: [1, 7, 333, 4096, 512][i % 5],
  h: [4096, 256, 1, 999, 64][i % 5],
  px: [1 / 3, 0.1 + 0.2, 5e-324, 0, 1, 0.5, 0.12345678][i % 7],
  py: [undefined, 0.9999, 2 / 3, 1e-9, 0.25][i % 5],
})

/** Hand-made avatars that stress every corner of the format. */
export function edgeCases(): { label: string; dna: AvatarDNA }[] {
  const cases: { label: string; dna: AvatarDNA }[] = []
  const add = (label: string, dna: AvatarDNA) => cases.push({ label, dna: normalizeDNA(dna) })
  const h = defaultDNA('humanoid', 0xfeedbeef)

  add('default humanoid', defaultDNA('humanoid'))
  add('default creature', defaultDNA('creature'))
  add('seed 0, no outfit', { ...defaultDNA('humanoid', 0), outfit: [] })
  add('seed 0xffffffff', defaultDNA('creature', 0xffffffff))

  let c = h
  for (let i = 0; i < 6; i++) c = addItem(c, 'custom', { x: 0.3 + i * 0.01, rotation: -0.25, flip: i % 2 === 0, tint: i % 2 ? '#abc' : '' }, customAsset(i))
  add('custom art: asset ids, odd pivots and sizes', c)
  add('custom art on a creature', addItem(defaultDNA('creature', 3), 'custom', { anchor: 'hand' }, { id: 'as_zz9900aa11bb22cc33dd44ee55ff66gg77hh', w: 256, h: 128, px: 0.1234 }))
  add('custom art without an asset id is dropped', addItem(h, 'custom', {}, { src: 'data:image/png;base64,iVBORw0KGgo=', w: 4, h: 4 }))

  let t = setParam(h, 'hair', 'color', '#abc')
  t = setParam(t, 'skin', 'tone', '#FA0')
  t = setParam(t, 'eyes', 'iris', '#0f0')
  t = addItem(t, 'tshirt', { color: '#123', color2: '#abc', graphic: 'text', text: 'hi 42!' })
  add('three-digit colours and printed text', t)

  add('emoji name at max length', { ...h, name: '😀'.repeat(20) })
  add('name cut inside an emoji (lone surrogate)', { ...h, name: 'x' + '🦊'.repeat(30) })
  add('accents, CJK and RTL name', { ...h, name: 'Zoë 李小龍 مرحبا Ñandú' })
  add('long ASCII name', { ...h, name: 'The Quick Brown Fox Jumps Over The Lazy Dog' })

  let r = setParam(h, 'body', 'height', 0.12345)
  r = setParam(r, 'body', 'build', 1)
  r = setParam(r, 'body', 'muscle', 0)
  r = setParam(r, 'body', 'belly', 0.0001)
  r = setParam(r, 'head', 'size', 0.9999)
  add('off-grid and boundary ranges', r)
  const cr = defaultDNA('creature', 11)
  add('creature: fractional tail count', setParam(setParam(cr, 'tail', 'count', 3.1415), 'tail', 'style', 'fan'))
  add('pet with a big seed', addItem(h, 'pet', { seed: 997.5 }))

  add('unknown species id (literal)', { ...defaultDNA('creature', 5), meta: { species: 'yeti-from-the-future' } })
  add('humanoid with a species label', { ...h, meta: { species: 'elf', theme: 'fantasy', source: 'test' } })

  // Richly dressed: one item in every slot, every param off its default.
  for (const kind of ['humanoid', 'creature'] as const) {
    let d = defaultDNA(kind, 77)
    let n = 0
    for (const spec of [...GARMENTS, ...ACCESSORIES]) {
      if (!spec.kinds.includes(kind) || spec.slot === 'custom') continue
      d = addItem(d, spec.id, itemParamsOff(spec.params, n++))
    }
    add(`${kind} wearing every slot, all params off default`, d)
  }

  // Every section param off its default.
  for (const kind of ['humanoid', 'creature'] as const) {
    let d = defaultDNA(kind, 91)
    let n = 0
    for (const s of sectionsFor(kind)) for (const p of s.params) d = setParam(d, s.id, p.key, nonDefault(p, n++))
    add(`${kind} with every section param off default`, d)
  }
  return cases
}

/** One avatar per item id, wearing it with every param off its default (n picks the values). */
export function everyItem(n = 0): { label: string; dna: AvatarDNA }[] {
  return ALL_ITEMS.map((spec, i) => {
    const kind = kindFor(spec.kinds)
    const base = defaultDNA(kind, 1000 + i)
    const asset = spec.slot === 'custom' ? customAsset(i + n) : undefined
    return { label: `item ${spec.id}`, dna: normalizeDNA(addItem({ ...base, outfit: [], accessories: [] }, spec.id, itemParamsOff(spec.params, n + i), asset)) }
  })
}

/** At least 2000 generated avatars: seeds, kinds, species, themes, freeOnly, breeding. */
export function corpus(): AvatarDNA[] {
  const out: AvatarDNA[] = []
  for (let s = 1; s <= 450; s++) out.push(randomDNA({ seed: s * 2654435761, kind: 'humanoid' }))
  for (let s = 1; s <= 350; s++) out.push(randomDNA({ seed: `creature-${s}`, kind: 'creature' }))
  for (let s = 1; s <= 100; s++) out.push(randomDNA({ seed: 90000 + s, kind: 'any' }))
  for (const sp of SPECIES) for (let s = 1; s <= 5; s++) out.push(randomDNA({ seed: `${sp.id}-${s}`, kind: 'creature', species: sp.id }))
  for (const sp of SPECIES) out.push(applySpecies(defaultDNA('creature', 5), sp.id))
  for (const th of THEMES) for (const kind of ['humanoid', 'creature'] as const) for (let s = 1; s <= 5; s++) out.push(randomDNA({ seed: `${th.id}-${kind}-${s}`, kind, theme: th.id }))
  for (let s = 1; s <= 100; s++) out.push(randomDNA({ seed: 5000 + s, kind: s % 3 ? 'humanoid' : 'creature', freeOnly: true }))
  // Re-rolls with locks and `only`, as the studio does.
  for (let s = 1; s <= 60; s++) {
    const base = out[s]
    out.push(randomDNA({ seed: 7000 + s, base, locks: ['hair', 'outfit', 'skin.tone'] }), randomDNA({ seed: 7100 + s, base, only: ['accessories', 'scene'] }))
  }
  // Breeding and morphing.
  for (let s = 0; s < 120; s++) {
    const a = out[s]
    const b = out[s + 450]
    out.push(mutate(a, (s % 10) / 10, s), crossover(a, b, s), interpolate(a, out[s + 1], (s % 7) / 7))
  }
  for (let s = 0; s < 20; s++) out.push(...variations(out[500 + s], 3, 0.5, s))
  // Prebuilt-style: themed, then paid, limited and NFT items forced on (as seed-prebuilts does).
  const nonFree = ALL_ITEMS.filter((i) => itemTier(i.id) !== 'free' && i.slot !== 'custom')
  const rng = createRng('prebuilts')
  for (let s = 0; s < 120; s++) {
    const kind: AvatarKind = s % 4 === 0 ? 'creature' : 'humanoid'
    let d = randomDNA({ seed: `prebuilt-${s}`, kind, theme: THEMES[s % THEMES.length].id, ...(kind === 'creature' ? { species: SPECIES[s % SPECIES.length].id } : {}) })
    for (let k = 0; k < 4; k++) {
      const spec = rng.pick(nonFree)
      const params: Params = {}
      for (const p of spec.params) params[p.key] = randomParam(p, rng.fork(`${s}.${k}.${p.key}`))
      d = addItem(d, spec.id, params)
    }
    out.push(normalizeDNA(d))
  }
  return out
}
