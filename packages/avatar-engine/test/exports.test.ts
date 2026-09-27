import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'
import {
  SPECIES,
  animatedSVG,
  applySpecies,
  clipsFor,
  defaultDNA,
  describeDNA,
  randomDNA,
  renderSVG,
  rigBundle,
  spriteSheet,
  stickerSet,
} from '../src/index.ts'
import { CROPS, VIEWS } from './helpers.ts'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47]
// No system fonts: the service's rasterizer loads none (avatars carry no text), and loading
// them costs ~150 ms per render.
const raster = (svg: string, width = 128) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng()

test('sprite sheet: grid, frames and the arkplay meta agree', () => {
  const dna = randomDNA({ seed: 12 })
  const anims = ['idle', 'walk', 'jump']
  const s = spriteSheet(dna, { anims, cell: 64 })
  const { meta } = s
  assert.deepEqual(Object.keys(meta.animations).sort(), [...anims].sort())
  const frameNames = Object.values(meta.animations).flat()
  assert.equal(new Set(frameNames).size, frameNames.length, 'frame names are unique')
  for (const n of frameNames) assert.ok(meta.frames[n], `frame ${n} exists`)
  assert.deepEqual(meta.meta.size, { w: s.width, h: s.height })
  assert.deepEqual(meta.arkplay.cell, { w: 64, h: 64 })
  for (const f of Object.values(meta.frames)) {
    assert.ok(f.frame.x + f.frame.w <= s.width && f.frame.y + f.frame.h <= s.height, 'frame inside sheet')
  }
  assert.ok(meta.arkplay.pivot.x >= 0 && meta.arkplay.pivot.x <= 1 && meta.arkplay.pivot.y >= 0 && meta.arkplay.pivot.y <= 1)
  assert.ok(meta.arkplay.unityPPU > 0)
  assert.deepEqual(meta.arkplay.animations.map((a) => a.name).sort(), [...anims].sort())
  JSON.parse(JSON.stringify(meta))
  assert.deepEqual([...raster(s.svg, s.width).subarray(0, 4)], PNG_SIG)
})

test('still renders loop their effects with scoped CSS; animation frames and opt-outs do not', () => {
  // Free content only: a city scene whose particles loop in a still.
  const withAura = randomDNA({ seed: 1, freeOnly: true })
  const still = renderSVG(withAura, { idPrefix: 'mq' })
  const kf = [...still.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1])
  assert.ok(kf.length > 0, 'a scene animates in a still')
  for (const k of kf) assert.ok(k.startsWith('mq'), `keyframes ${k} are scoped to the document`)
  assert.match(still, /prefers-reduced-motion/)
  assert.doesNotMatch(renderSVG(withAura, { motion: false }), /@keyframes/)
  assert.doesNotMatch(renderSVG(withAura, { anim: 'idle', time: 0.2 }), /@keyframes/)
  assert.doesNotMatch(renderSVG(withAura, { quality: 'standard' }), /@keyframes/)
  assert.deepEqual([...raster(still, 96).subarray(0, 4)], PNG_SIG, 'resvg draws the base frame')
})

test('rig bundle: slots reference real bones and regions; atlas rasterizes', () => {
  for (const dna of [randomDNA({ seed: 13 }), applySpecies(defaultDNA('creature'), 'dragon')]) {
    const { bundle, atlasSvg } = rigBundle(dna, { clips: ['idle', 'walk'] })
    assert.equal(bundle.format, 'arkplay-rig')
    const bones = new Set(bundle.bones.map((b) => b.name))
    assert.ok(bones.size > 3)
    for (const b of bundle.bones) if (b.parent) assert.ok(bones.has(b.parent), `parent ${b.parent}`)
    for (const s of bundle.slots) {
      assert.ok(bones.has(s.bone), `slot ${s.name} bone ${s.bone}`)
      for (const r of [s.region, ...Object.values(s.faceVariants ?? {}), ...Object.values(s.handVariants ?? {})])
        assert.ok(bundle.regions[r], `slot ${s.name} region ${r}`)
    }
    assert.ok(bundle.atlas.width > 0 && bundle.atlas.height > 0)
    assert.deepEqual(bundle.clips.map((c) => c.name).sort(), ['idle', 'walk'])
    JSON.parse(JSON.stringify(bundle))
    assert.deepEqual([...raster(atlasSvg, 256).subarray(0, 4)], PNG_SIG)
  }
})

test('animated SVG is self-contained and respects reduced motion', () => {
  for (const kind of ['humanoid', 'creature'] as const) {
    const dna = randomDNA({ seed: 14, kind })
    const clip = clipsFor(kind)[0].name
    const svg = animatedSVG(dna, { anim: clip, fps: 8, maxFrames: 12 })
    assert.match(svg, /@keyframes/)
    assert.match(svg, /prefers-reduced-motion/)
    assert.doesNotMatch(svg, /<script/i)
    assert.doesNotMatch(svg, /href="(https?:|\/\/)/)
  }
})

test('sticker sets: 16 humanoid, 12 creature, all valid', () => {
  const h = stickerSet(randomDNA({ seed: 15 }))
  const c = stickerSet(applySpecies(defaultDNA('creature'), 'fox'))
  assert.equal(h.length, 16)
  assert.equal(c.length, 12)
  for (const s of [...h, ...c]) {
    assert.ok(s.name && s.label)
    assert.match(s.svg, /^<svg[\s>]/)
  }
  assert.equal(new Set(h.map((s) => s.name)).size, 16)
})

test('alt text describes every kind of avatar', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const d = randomDNA({ seed, kind: seed % 2 ? 'humanoid' : 'creature' })
    const alt = describeDNA(d)
    assert.ok(alt.length > 10 && alt.length < 600, alt)
    assert.doesNotMatch(alt, /undefined|NaN|\[object/)
    assert.doesNotMatch(alt, /looking (grin|laugh|smirk|wink|cheeky|crying|pout)\b/, 'expressions read as English')
  }
})

// resvg-js 2.6 panics (killing the process) on some off-canvas layers; the renderer culls
// and avoids group opacity to stay safe. This rasterizes the risky cases.
test('resvg-safe: every crop and view of varied avatars rasterizes', () => {
  const dnas = [
    randomDNA({ seed: 16 }),
    randomDNA({ seed: 17, theme: 'fantasy' }),
    ...['dragon', 'octopus', 'snake', 'butterfly', 'drone'].filter((id) => SPECIES.some((s) => s.id === id)).map((id) => applySpecies(defaultDNA('creature'), id)),
  ]
  for (const d of dnas)
    for (const view of VIEWS)
      for (const crop of CROPS) {
        const png = raster(renderSVG(d, { view, crop, size: 96 }), 96)
        assert.deepEqual([...png.subarray(0, 4)], PNG_SIG)
      }
})

// Layers partly off-canvas with a clip, mask or filter crashed resvg even inside visible
// parts (found by the 1.1 lighting sweep); compose strips them. Probe windows that cut
// through the avatar at odd offsets, flipped and not.
test('resvg-safe: viewBoxes that cut through the avatar rasterize', () => {
  const dnas = [randomDNA({ seed: 23 }), randomDNA({ seed: 24, theme: 'fantasy' }), applySpecies(defaultDNA('creature'), 'dragon')]
  for (const d of dnas)
    for (const [x, y, w, h] of [[-400, -900, 300, 300], [100, -700, 260, 180], [-200, -300, 900, 120], [-60, -1200, 120, 900]])
      for (const flip of [false, true]) {
        const png = raster(renderSVG(d, { viewBox: { x, y, w, h }, flip, size: 64 }), 64)
        assert.deepEqual([...png.subarray(0, 4)], PNG_SIG)
      }
})

test('resvg-safe: a viewBox far off the avatar rasterizes', () => {
  const svg = renderSVG(randomDNA({ seed: 18 }), { viewBox: { x: 5000, y: 5000, w: 200, h: 200 } })
  assert.deepEqual([...raster(svg, 64).subarray(0, 4)], PNG_SIG)
})
