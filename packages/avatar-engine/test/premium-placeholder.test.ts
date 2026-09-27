/* Premium items without their art: the drawings of paid, limited and NFT items are not part of
 * this package, so every premium item must draw a deterministic, resvg-safe placeholder, and
 * every free item must keep its own art. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'
import {
  ALL_ITEMS,
  LOCAL_ART,
  PREMIUM_ART,
  PREMIUM_ART_ITEMS,
  addItem,
  applySpecies,
  baseItemId,
  defaultDNA,
  isPremiumArt,
  itemTier,
  needsPremiumArt,
  premiumArtRegistered,
  premiumItems,
  renderSVG,
  type AvatarDNA,
  type AvatarKind,
} from '../src/index.ts'

const svgOk = (s: string) => /^<svg[\s>]/.test(s) && s.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(s)
const bare = (kind: AvatarKind): AvatarDNA => {
  const d = kind === 'creature' ? applySpecies(defaultDNA('creature', 7), 'cat') : defaultDNA('humanoid', 7)
  return { ...d, outfit: [], accessories: [] }
}

test('every non-free item draws premium art, or is a documented local exception', () => {
  for (const it of ALL_ITEMS) {
    const art = baseItemId(it.id)
    if (itemTier(it.id) === 'free') assert.ok(!isPremiumArt(art), `free item ${it.id} would draw a placeholder in browsers`)
    else assert.ok(isPremiumArt(art) || art in LOCAL_ART, `${it.id} is ${itemTier(it.id)} but its art "${art}" still ships to browsers: move its art to the premium art module (docs/studio.md)`)
  }
  const used = new Set(ALL_ITEMS.map((i) => baseItemId(i.id)))
  for (const id of Object.values(PREMIUM_ART).flat()) assert.ok(used.has(id), `premium art "${id}" belongs to no item`)
  assert.ok(PREMIUM_ART_ITEMS.includes('sword-l') && PREMIUM_ART_ITEMS.includes('founder-crown') && !PREMIUM_ART_ITEMS.includes('founder-cape'))
})

test('premiumItems and needsPremiumArt see premium items as worn', () => {
  const plain = bare('humanoid')
  assert.equal(needsPremiumArt(plain), false)
  const crowned = addItem(addItem(plain, 'founder-crown'), 'sword-l')
  assert.deepEqual(premiumItems(crowned).sort(), ['founder-crown', 'sword-l'])
  assert.equal(needsPremiumArt(crowned), true)
  assert.equal(needsPremiumArt(addItem(plain, 'founder-cape')), false, 'the founder cape wears free art')
})

test('without premium art, every premium item draws a deterministic placeholder', () => {
  assert.equal(premiumArtRegistered(), false, 'nothing registered the premium art in this process')
  const missing: string[] = []
  for (const id of PREMIUM_ART_ITEMS) {
    const spec = ALL_ITEMS.find((i) => i.id === id)
    for (const kind of spec?.kinds ?? []) {
      const base = bare(kind)
      const worn = addItem(base, id)
      let changed = false
      for (const view of ['front', 'side', 'back'] as const) {
        const a = renderSVG(worn, { view, idPrefix: 'ph' })
        assert.ok(svgOk(a), `${id} ${kind} ${view}`)
        assert.equal(renderSVG(worn, { view, idPrefix: 'ph' }), a, `${id} ${kind} ${view} is deterministic`)
        if (a !== renderSVG(base, { view, idPrefix: 'ph' })) changed = true
      }
      if (!changed) missing.push(`${id} (${kind})`)
    }
  }
  assert.deepEqual(missing, [], 'premium items that draw no placeholder')
})

test('placeholders rasterize with resvg in every view and crop (resvg safety)', () => {
  const raster = (svg: string) => new Resvg(svg, { fitTo: { mode: 'width', value: 64 }, font: { loadSystemFonts: false } }).render().asPng()
  for (const kind of ['humanoid', 'creature'] as const) {
    let d = bare(kind)
    for (const id of PREMIUM_ART_ITEMS) if (ALL_ITEMS.find((i) => i.id === id)?.kinds.includes(kind)) d = addItem(d, id)
    for (const view of ['front', 'side', 'back'] as const)
      for (const crop of ['full', 'fit', 'bust', 'head', 'portrait'] as const)
        for (const quality of ['high', 'standard'] as const) assert.ok(raster(renderSVG(d, { view, crop, quality })).length > 100, `${kind} ${view} ${crop} ${quality}`)
  }
})
