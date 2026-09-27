/* measure() on a synthetic scene: real MediaPipe landmarks (of an engine-rendered avatar,
 * test/data) with flat colours painted into the face regions and a matching segmentation.
 * The measured colours must come back, and white balance must undo a colour cast. */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alignFromPoints, apply, type Pt } from '../src/crop.ts'
import { deltaE, fromLinear, hexToLab, toLinear } from '../src/color.ts'
import { BROW_L, BROW_R, EYE_L, EYE_R, FACE_OVAL, LIPS_INNER, LIPS_OUTER, LM, SEG } from '../src/landmarks.ts'
import { SEG_ROI, inPolygon, measure } from '../src/measure.ts'
import { heuristicAttributes } from '../src/heuristics.ts'
import { photoToAvatars } from '../src/toDNA.ts'
import type { Point3 } from '../src/types.ts'
import { validateDNA } from '@arkplay/avatar-engine'

const data = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'landmarks-synthetic.json'), 'utf8')) as {
  width: number
  height: number
  landmarks: [number, number, number][]
  blendshapes: Record<string, number>
}
const L: Point3[] = data.landmarks.map(([x, y, z]) => ({ x, y, z }))
const W = data.width
const H = data.height

const TRUE = { skin: '#c98d68', hair: '#3a2418', iris: '#3b6fa8', lips: '#b55a5a', brows: '#2a1a12', top: '#2e7d32', background: '#8c8c8c', sclera: '#f0efec' }

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Paints the scene: colours and a category per source pixel. `cast` multiplies linear RGB. */
function scene(cast: [number, number, number] = [1, 1, 1]) {
  const img = new Uint8ClampedArray(W * H * 4)
  const cls = new Uint8Array(W * H)
  const put = (x: number, y: number, hex: string, c: number) => {
    const [r, g, b] = rgb(hex)
    const o = (y * W + x) * 4
    img[o] = fromLinear(toLinear(r) * cast[0])
    img[o + 1] = fromLinear(toLinear(g) * cast[1])
    img[o + 2] = fromLinear(toLinear(b) * cast[2])
    img[o + 3] = 255
    cls[y * W + x] = c
  }
  const poly = (idx: readonly number[]) => idx.map((i) => ({ x: L[i].x, y: L[i].y }))
  const fill = (p: Pt[], hex: string, c: number, test: (x: number, y: number) => boolean = () => true) => {
    const xs = p.map((q) => q.x)
    const ys = p.map((q) => q.y)
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++)
        if (inPolygon(p, x + 0.5, y + 0.5) && test(x, y)) put(x, y, hex, c)
  }
  const disc = (c: Point3, r: number, hex: string, k: number) => {
    for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++) for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= r) put(x, y, hex, k)
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, TRUE.background, SEG.background)
  const oval = poly(FACE_OVAL)
  const top = L[LM.foreheadTop]
  const chin = L[LM.chin]
  const halfW = (L[LM.cheekL].x - L[LM.cheekR].x) / 2
  const cx = (L[LM.cheekL].x + L[LM.cheekR].x) / 2
  // Shirt from below the neck, neck skin, hair (a cap over the head down to the chin at the sides).
  for (let y = Math.round(chin.y + halfW * 0.5); y < H; y++) for (let x = 0; x < W; x++) put(x, y, TRUE.top, SEG.clothes)
  for (let y = Math.round(chin.y - 20); y < Math.round(chin.y + halfW * 0.5); y++) for (let x = Math.round(cx - halfW * 0.45); x < cx + halfW * 0.45; x++) put(x, y, TRUE.skin, SEG.bodySkin)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inCap = ((x - cx) / (halfW * 1.25)) ** 2 + ((y - top.y - halfW * 0.25) / (halfW * 1.2)) ** 2 <= 1 && y < top.y + halfW * 0.3
      const inSides = Math.abs(x - cx) < halfW * 1.25 && y >= top.y && y < chin.y
      if (inCap || inSides) put(x, y, TRUE.hair, SEG.hair)
    }
  // Forehead skin above the mesh top (landmark 10 sits below a real hairline): up to about
  // a third of the face height above the brows.
  const browY = (L[105].y + L[334].y) / 2
  const hairlineY = browY - 0.34 * (chin.y - top.y)
  for (let y = Math.floor(hairlineY); y <= top.y; y++)
    for (let x = 0; x < W; x++) if (((x - cx) / (halfW * 0.85)) ** 2 + ((y - top.y) / (top.y - hairlineY)) ** 2 <= 1) put(x, y, TRUE.skin, SEG.faceSkin)
  fill(oval, TRUE.skin, SEG.faceSkin)
  fill(poly(BROW_R), TRUE.brows, SEG.faceSkin)
  fill(poly(BROW_L), TRUE.brows, SEG.faceSkin)
  fill(poly(EYE_R), TRUE.sclera, SEG.faceSkin)
  fill(poly(EYE_L), TRUE.sclera, SEG.faceSkin)
  for (const [c, r0] of [
    [LM.irisR, 469],
    [LM.irisL, 474],
  ]) {
    const r = Math.hypot(L[r0].x - L[c].x, L[r0].y - L[c].y)
    const inEye = (x: number, y: number) => inPolygon(poly(c === LM.irisR ? EYE_R : EYE_L), x + 0.5, y + 0.5)
    fill(
      Array.from({ length: 24 }, (_, i) => ({ x: L[c].x + Math.cos((i / 24) * Math.PI * 2) * r, y: L[c].y + Math.sin((i / 24) * Math.PI * 2) * r })),
      TRUE.iris,
      SEG.faceSkin,
      inEye,
    )
    disc(L[c], r * 0.3, '#050505', SEG.faceSkin)
  }
  fill(poly(LIPS_OUTER), TRUE.lips, SEG.faceSkin)
  fill(poly(LIPS_INNER), '#2a0e0e', SEG.faceSkin)
  return { img, cls }
}

/** The segmenter's view: the aligned ROI resampled from the scene (nearest), one-hot masks. */
function segView(img: Uint8ClampedArray, cls: Uint8Array) {
  const eyeL = { x: L[LM.irisR].x, y: L[LM.irisR].y }
  const eyeR = { x: L[LM.irisL].x, y: L[LM.irisL].y }
  const mL = { x: L[LM.mouthR].x, y: L[LM.mouthR].y }
  const mR = { x: L[LM.mouthL].x, y: L[LM.mouthL].y }
  const al = alignFromPoints(eyeL, eyeR, mL, mR, SEG_ROI)
  const S = SEG_ROI.size
  const roi = new Uint8ClampedArray(S * S * 4)
  const category = new Uint8Array(S * S)
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const p = apply(al.fromCrop, { x: i + 0.5, y: j + 0.5 })
      const x = Math.floor(p.x)
      const y = Math.floor(p.y)
      const k = j * S + i
      if (x < 0 || y < 0 || x >= W || y >= H) {
        roi.set([128, 128, 128, 255], k * 4)
        continue
      }
      roi.set(img.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), k * 4)
      category[k] = cls[y * W + x]
    }
  return { roi: { width: S, height: S, data: roi }, seg: { category, confidence: [] as Float32Array[] }, toSeg: al.toCrop }
}

function run(cast?: [number, number, number]) {
  const { img, cls } = scene(cast)
  const v = segView(img, cls)
  return measure({ image: { width: W, height: H, data: img }, roi: v.roi, landmarks: L, blendshapes: data.blendshapes, seg: v.seg, toSeg: v.toSeg })
}

const dE = (hex: string | undefined, truth: string) => (hex ? deltaE(hexToLab(hex), hexToLab(truth)) : Infinity)

describe('measure (synthetic scene)', () => {
  const { measured: m, debug } = run()

  it('recovers the painted colours', () => {
    assert.ok(dE(m.colors.skin?.hex, TRUE.skin) < 0.02, `skin ${m.colors.skin?.hex}`)
    assert.ok(dE(m.colors.hair?.hex, TRUE.hair) < 0.03, `hair ${m.colors.hair?.hex}`)
    assert.ok(dE(m.colors.iris?.hex, TRUE.iris) < 0.05, `iris ${m.colors.iris?.hex}`)
    assert.ok(dE(m.colors.lips?.hex, TRUE.lips) < 0.04, `lips ${m.colors.lips?.hex}`)
    assert.ok(dE(m.colors.brows?.hex, TRUE.brows) < 0.05, `brows ${m.colors.brows?.hex}`)
    assert.ok(dE(m.colors.top?.hex, TRUE.top) < 0.02, `top ${m.colors.top?.hex}`)
    assert.ok(dE(m.colors.background?.hex, TRUE.background) < 0.02, `background ${m.colors.background?.hex}`)
    assert.ok(debug.counts.skin > 200 && debug.counts.iris > 20, JSON.stringify(debug.counts))
  })

  it('neutral light needs no correction; geometry, hair and cues are finite', () => {
    assert.ok(m.lighting && m.lighting.gain.every((g) => Math.abs(g - 1) < 0.03), JSON.stringify(m.lighting))
    for (const [k, v] of Object.entries(m.geometry)) assert.ok(Number.isFinite(v), `geometry.${k} = ${v}`)
    assert.ok(m.hair.hairArea > 0.3, `hairArea ${m.hair.hairArea}`)
    assert.ok(m.hair.foreheadCoverage < 0.2, `foreheadCoverage ${m.hair.foreheadCoverage}`)
    // Hair painted down to the chin at the sides.
    assert.ok(Math.abs(m.hair.hairBottom) < 0.2, `hairBottom ${m.hair.hairBottom}`)
    assert.ok(m.cues.beardCoverage < 0.1, `beard ${m.cues.beardCoverage}`)
    assert.ok(m.cues.headCover < 0.1, `headCover ${m.cues.headCover}`)
    assert.ok(m.pose && Math.abs(m.pose.roll) < 10)
  })

  it('white balance pulls a warm cast back toward the true colours', () => {
    const cast: [number, number, number] = [1.18, 1, 0.8]
    const { measured: w } = run(cast)
    // What the skin would read without correction.
    const [r, g, b] = rgb(TRUE.skin)
    const raw = `#${[fromLinear(toLinear(r) * cast[0]), fromLinear(toLinear(g) * cast[1]), fromLinear(toLinear(b) * cast[2])].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
    assert.ok(w.lighting!.gain[0] < 1 && w.lighting!.gain[2] > 1, JSON.stringify(w.lighting))
    assert.ok(dE(w.colors.skin?.hex, TRUE.skin) < dE(raw, TRUE.skin) * 0.6, `corrected ${w.colors.skin?.hex} vs raw ${raw}`)
  })

  it('the measurement maps to valid DNA with the measured colours', () => {
    const { best } = photoToAvatars({ measured: m, attributes: heuristicAttributes(m) })
    assert.deepEqual(validateDNA(best), [])
    assert.ok(dE(best.sections.skin.tone as string, TRUE.skin) < 0.03)
    assert.notEqual(best.sections.hair.style, 'bald')
  })
})
