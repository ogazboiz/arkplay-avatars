// Rig atlases: every region must hold its whole part (the Unity SDK and every other rig
// consumer draw each region as a sprite, so art past its edge is simply cut off).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'
import { applySpecies, defaultDNA, randomDNA, rigBundle } from '../src/index.ts'

// Each atlas region must hold its whole part: a region cut to the geometry alone chopped off
// outlines (half the stroke), hair drawn in a translated group, and skirts whose declared
// bounds left out a transform (then spilling into their neighbours' regions).
test('rig bundle: no atlas region cuts off its art', () => {
  const avatars = [
    randomDNA({ seed: 42, kind: 'humanoid' }), // long hair in a translated group
    randomDNA({ seed: 1000, kind: 'humanoid' }), // outlined hands and joggers
    randomDNA({ seed: 1444, kind: 'humanoid' }), // a gown with declared bounds
    randomDNA({ seed: 1555, kind: 'humanoid' }), // a dress skirt
    randomDNA({ seed: 1185, kind: 'creature' }), // a creature with a scarf
    applySpecies(defaultDNA('creature'), 'dragon'),
  ]
  for (const [i, dna] of avatars.entries()) {
    for (const view of ['side', 'front'] as const) {
      const { bundle, atlasSvg } = rigBundle(dna, { view, clips: ['idle'], scale: 0.5 })
      const img = new Resvg(atlasSvg, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } }).render()
      // `pixels` copies the whole buffer on every read: take it once.
      const px = img.pixels
      const alpha = (x: number, y: number) => px[(y * img.width + x) * 4 + 3]
      for (const [id, r] of Object.entries(bundle.regions)) {
        let edge = 0
        for (let x = r.x; x < r.x + r.w; x++) edge = Math.max(edge, alpha(x, r.y), alpha(x, r.y + r.h - 1))
        for (let y = r.y; y < r.y + r.h; y++) edge = Math.max(edge, alpha(r.x, y), alpha(r.x + r.w - 1, y))
        assert.ok(edge <= 16, `avatar ${i} ${view}: region ${id} has art on its edge (alpha ${edge})`)
      }
    }
  }
})
