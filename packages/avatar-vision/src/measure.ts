/* Layer 2, measurement: colours, face geometry, hair silhouette, expression and the cues
 * the heuristics use, from MediaPipe landmarks and the multiclass segmentation. Pure
 * TypeScript over pixel arrays (no DOM), so it runs anywhere and parts are unit-tested.
 *
 * Spaces
 *   source  the analysed photo (≤ 1280 px), where landmarks live
 *   face    source rotated so the eyes are level, origin at the eye midpoint, unit = the
 *           inter-ocular distance (IOD); +x toward the image right, +y down the face
 *   seg     the aligned region the segmenter saw (SEG_ROI below), S×S pixels, axes
 *           parallel to the face frame; `toSeg` maps source → seg
 *   3D      MediaPipe's x, y, z (z in the same pixel scale): geometry ratios are taken in a
 *           head frame built from the eyes and mouth, so they don't change with roll and
 *           change little with yaw or pitch
 *
 * Colours are measured in linear light, white-balanced and exposure-corrected from
 * neutral cues (eye whites, grey clothes/background; never the skin), then summarized in
 * OKLab with trimmed percentiles so speculars and deep shadows don't bias them.
 *
 * Privacy: nothing here stores, uploads or logs pixels. There is no estimate of gender,
 * ethnicity, age, body size, health or identity, and none may be added. */

import { FRECKLES, MAKEUP } from './calibration.ts'
import { apply, invert, type Affine, type Pt } from './crop.ts'
import {
  IDENTITY,
  chroma,
  deltaE,
  estimateCorrection,
  kmeans,
  labToHex,
  linToLab,
  median,
  quantile,
  robustColor,
  toLinear,
  type Correction,
  type Lab,
  type SampleOptions,
} from './color.ts'
import {
  BLENDSHAPES,
  BROW_L,
  BROW_L_LOWER,
  BROW_L_UPPER,
  BROW_R,
  BROW_R_LOWER,
  BROW_R_UPPER,
  EYE_L,
  EYE_R,
  FACE_OVAL,
  IRIS_L_RING,
  IRIS_R_RING,
  LIPS_INNER,
  LIPS_OUTER,
  LM,
  SEG,
} from './landmarks.ts'
import type { ColorKey, Cues, ExpressionKey, ExtraColorKey, GeometryKey, HairKey, Measured, MeasuredColor, Point3 } from './types.ts'

/** The aligned region handed to the segmenter: like the crop spec, but a little larger
 *  and lower so big hair above and hair on the shoulders stay in view. */
export const SEG_ROI = { sizeD: 7.5, centerD: 1.2, size: 384 } as const

export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface MeasureInput {
  /** The analysed photo (source space). */
  image: PixelImage
  /** The aligned region the segmenter saw (seg space, S×S). */
  roi: PixelImage
  landmarks: readonly Point3[]
  blendshapes: Readonly<Record<string, number>>
  seg: { category: Uint8Array; confidence: readonly Float32Array[] }
  /** source → seg. */
  toSeg: Affine
}

export interface MeasureDebug {
  correction: Correction
  /** Pixel counts per sampled region. */
  counts: Record<string, number>
  /** Intermediate numbers (raw skin lightness, sclera lightness, …) for QA. */
  stats: Record<string, number>
  /** Region outlines in source pixels, for overlays. */
  regions: Record<string, Pt[]>
}

/* ---- Small geometry helpers ------------------------------------------------------------ */

const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y)
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export function inPolygon(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function polygonArea(poly: readonly Pt[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y)
  return Math.abs(s) / 2
}

/** Scales a polygon about its centroid (k < 1 shrinks). */
function scalePoly(poly: readonly Pt[], k: number): Pt[] {
  const c = { x: 0, y: 0 }
  for (const p of poly) {
    c.x += p.x / poly.length
    c.y += p.y / poly.length
  }
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }))
}

/** Horizontal extent of a closed polygon at height y (min and max x of edge crossings). */
function spanAt(poly: readonly Pt[], y: number): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y) {
      const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
    }
  }
  return lo <= hi ? [lo, hi] : null
}

/* ---- Growable pixel sample ------------------------------------------------------------ */

interface Sample {
  data: Float32Array
  n: number
  push(r: number, g: number, b: number): void
}

function sample(initial = 1024): Sample {
  const s: Sample = {
    data: new Float32Array(initial * 3),
    n: 0,
    push(r, g, b) {
      if ((s.n + 1) * 3 > s.data.length) {
        const next = new Float32Array(s.data.length * 2)
        next.set(s.data)
        s.data = next
      }
      const o = s.n * 3
      s.data[o] = r
      s.data[o + 1] = g
      s.data[o + 2] = b
      s.n++
    },
  }
  return s
}

/** Linear RGB sample → OKLab (with correction gains). */
function toLabs(s: Sample, gain: readonly number[]): Float32Array {
  const out = new Float32Array(s.n * 3)
  for (let i = 0; i < s.n; i++) {
    const lab = linToLab(s.data[i * 3] * gain[0], s.data[i * 3 + 1] * gain[1], s.data[i * 3 + 2] * gain[2])
    out[i * 3] = lab[0]
    out[i * 3 + 1] = lab[1]
    out[i * 3 + 2] = lab[2]
  }
  return out
}

function colorOf(labs: Float32Array, n: number, o: SampleOptions, fullN: number, quality = 1): MeasuredColor | undefined {
  const rc = robustColor(labs, n, o)
  if (!rc || rc.n < 12) return undefined
  const confidence = clamp01(Math.min(1, rc.n / fullN) * (1 - clamp01((rc.spread - 0.06) / 0.25)) * quality)
  return { hex: labToHex(rc.lab), lab: rc.lab, confidence: Math.round(confidence * 1000) / 1000, n: rc.n }
}

const avgBlend = (bs: Readonly<Record<string, number>>, keys: readonly string[]): number => {
  let s = 0
  let n = 0
  for (const k of keys) {
    if (typeof bs[k] === 'number') {
      s += bs[k]
      n++
    }
  }
  return n ? s / n : NaN
}

/* ---- The measurement ------------------------------------------------------------------ */

export function measure(input: MeasureInput): { measured: Measured; debug: MeasureDebug } {
  const { image, roi, landmarks: L3, blendshapes, seg } = input
  const W = image.width
  const H = image.height
  const D = image.data
  const S = roi.width
  const RD = roi.data
  const cat = seg.category
  const conf = seg.confidence
  const toSeg = input.toSeg
  const fromSeg = invert(toSeg)
  const counts: Record<string, number> = {}
  const stats: Record<string, number> = {}
  const regions: Record<string, Pt[]> = {}

  const P = (i: number): Pt => ({ x: L3[i].x, y: L3[i].y })
  const hasIris = L3.length >= 478

  // --- Face frame (2D) ---
  let eyeA = hasIris ? P(LM.irisR) : mid(P(LM.eyeROuter), P(LM.eyeRInner))
  let eyeB = hasIris ? P(LM.irisL) : mid(P(LM.eyeLOuter), P(LM.eyeLInner))
  if (eyeA.x > eyeB.x) [eyeA, eyeB] = [eyeB, eyeA]
  const iod = Math.max(1e-3, dist(eyeA, eyeB))
  const u = { x: (eyeB.x - eyeA.x) / iod, y: (eyeB.y - eyeA.y) / iod }
  const dn = { x: -u.y, y: u.x }
  const eyeMid = mid(eyeA, eyeB)
  const F = (p: Pt): Pt => {
    const dx = p.x - eyeMid.x
    const dy = p.y - eyeMid.y
    return { x: (dx * u.x + dy * u.y) / iod, y: (dx * dn.x + dy * dn.y) / iod }
  }
  const Finv = (fx: number, fy: number): Pt => ({ x: eyeMid.x + (fx * u.x + fy * dn.x) * iod, y: eyeMid.y + (fx * u.y + fy * dn.y) * iod })
  const f = (i: number): Pt => F(P(i))
  const fpoly = (idx: readonly number[]): Pt[] => idx.map(f)

  const ovalF = fpoly(FACE_OVAL)
  const eyeRF = fpoly(EYE_R)
  const eyeLF = fpoly(EYE_L)
  const lipsOutF = fpoly(LIPS_OUTER)
  const lipsInF = fpoly(LIPS_INNER)
  const browRF = fpoly(BROW_R)
  const browLF = fpoly(BROW_L)
  const eyeRBig = scalePoly(eyeRF, 1.35)
  const eyeLBig = scalePoly(eyeLF, 1.35)
  const browRBig = scalePoly(browRF, 1.4)
  const browLBig = scalePoly(browLF, 1.4)
  const lipsBig = scalePoly(lipsOutF, 1.25)

  // Face landmarks in face units.
  const chinF = f(LM.chin)
  const topF = f(LM.foreheadTop)
  const mouthY = (f(LM.mouthR).y + f(LM.mouthL).y) / 2
  const noseBottomY = f(LM.subnasale).y
  const browY = (f(105).y + f(334).y) / 2
  const faceWF = Math.abs(f(LM.cheekL).x - f(LM.cheekR).x)
  const faceHF = chinF.y - topF.y
  const cxF = (f(LM.cheekL).x + f(LM.cheekR).x) / 2

  // --- Seg helpers ---
  const segOf = (x: number, y: number): number => {
    const q = apply(toSeg, { x, y })
    const i = Math.floor(q.x)
    const j = Math.floor(q.y)
    return i < 0 || j < 0 || i >= S || j >= S ? -1 : j * S + i
  }
  const confOf = (cls: number, k: number): number => (conf.length > cls ? conf[cls][k] : cat[k] === cls ? 1 : 0)
  // Face coords of seg pixel centres are affine in (i, j).
  const segFace = (() => {
    const o = F(apply(fromSeg, { x: 0.5, y: 0.5 }))
    const ix = F(apply(fromSeg, { x: 1.5, y: 0.5 }))
    const jy = F(apply(fromSeg, { x: 0.5, y: 1.5 }))
    return { ox: o.x, oy: o.y, ax: ix.x - o.x, ay: ix.y - o.y, bx: jy.x - o.x, by: jy.y - o.y }
  })()
  const segFx = (i: number, j: number) => segFace.ox + segFace.ax * i + segFace.bx * j
  const segFy = (i: number, j: number) => segFace.oy + segFace.ay * i + segFace.by * j
  // Pixels whose source position lies inside the photo.
  const valid = new Uint8Array(S * S)
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const p = apply(fromSeg, { x: i + 0.5, y: j + 0.5 })
      valid[j * S + i] = p.x >= 0 && p.y >= 0 && p.x < W && p.y < H ? 1 : 0
    }

  /** Iterates source pixels whose face coords fall in [fx0,fx1]×[fy0,fy1]. */
  function forFace(fx0: number, fx1: number, fy0: number, fy1: number, fn: (x: number, y: number, fx: number, fy: number) => void): void {
    const cs = [Finv(fx0, fy0), Finv(fx1, fy0), Finv(fx0, fy1), Finv(fx1, fy1)]
    const x0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.x))))
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...cs.map((c) => c.x))))
    const y0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.y))))
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...cs.map((c) => c.y))))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const q = F({ x: x + 0.5, y: y + 0.5 })
        if (q.x < fx0 || q.x > fx1 || q.y < fy0 || q.y > fy1) continue
        fn(x, y, q.x, q.y)
      }
  }
  const pushSrc = (s: Sample, x: number, y: number) => {
    const o = (y * W + x) * 4
    s.push(toLinear(D[o]), toLinear(D[o + 1]), toLinear(D[o + 2]))
  }
  const pushRoi = (s: Sample, k: number) => {
    const o = k * 4
    s.push(toLinear(RD[o]), toLinear(RD[o + 1]), toLinear(RD[o + 2]))
  }
  const clipped = (x: number, y: number) => {
    const o = (y * W + x) * 4
    return D[o] >= 253 || D[o + 1] >= 253 || D[o + 2] >= 253
  }
  /** Very lenient: human skin under any sane light is some warm hue with a little chroma,
   *  from the palest to the darkest tone. Rejects grey, blue and green pixels (glasses
   *  glare, backgrounds, mislabelled clothes). */
  const plausibleSkin = (x: number, y: number) => {
    const o = (y * W + x) * 4
    const lab = linToLab(toLinear(D[o]), toLinear(D[o + 1]), toLinear(D[o + 2]))
    const c = Math.hypot(lab[1], lab[2])
    const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360
    return c >= 0.01 && (hue <= 125 || hue >= 350)
  }

  // ======================= 1. Gather samples (linear RGB) =======================

  // Skin: two cheek ellipses and a forehead ellipse ∩ face-skin, minus eyes/brows/lips.
  // `skinLoose` also takes pixels the segmenter left unlabelled or called "others"
  // (heavy makeup, odd light): used only when the strict face-skin sample is sparse.
  const skin = sample()
  const skinLoose = sample()
  const skinRegions = [
    { cx: -0.52, cy: 0.62, rx: 0.22, ry: 0.17 },
    { cx: 0.52, cy: 0.62, rx: 0.22, ry: 0.17 },
    { cx: 0, cy: -0.78, rx: 0.36, ry: 0.15 },
  ]
  for (const r of skinRegions) {
    forFace(r.cx - r.rx, r.cx + r.rx, r.cy - r.ry, r.cy + r.ry, (x, y, fx, fy) => {
      const ex = (fx - r.cx) / r.rx
      const ey = (fy - r.cy) / r.ry
      if (ex * ex + ey * ey > 1) return
      if (inPolygon(eyeRBig, fx, fy) || inPolygon(eyeLBig, fx, fy) || inPolygon(browRBig, fx, fy) || inPolygon(browLBig, fx, fy) || inPolygon(lipsBig, fx, fy)) return
      const k = segOf(x, y)
      if (k < 0 || clipped(x, y)) return
      const c = cat[k]
      if (c === SEG.hair || c === SEG.background || c === SEG.clothes) return
      if (!plausibleSkin(x, y)) return
      pushSrc(skinLoose, x, y)
      if (c === SEG.faceSkin && confOf(SEG.faceSkin, k) >= 0.6) pushSrc(skin, x, y)
    })
    regions[`skin${Object.keys(regions).length}`] = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      return Finv(r.cx + Math.cos(a) * r.rx, r.cy + Math.sin(a) * r.ry)
    })
  }
  const skinStrict = skin.n >= Math.max(60, skinLoose.n * 0.3)
  const skinUsed = skinStrict ? skin : skinLoose
  counts.skin = skin.n
  counts.skinLoose = skinLoose.n

  // Irises: an annulus inside the lid opening, away from the upper lid's shadow.
  const iris = sample()
  const sclera = sample()
  let irisVisible = 0
  if (hasIris) {
    for (const [c, ring, eyePoly] of [
      [LM.irisR, IRIS_R_RING, eyeRF],
      [LM.irisL, IRIS_L_RING, eyeLF],
    ] as const) {
      const C = f(c)
      const r = ring.reduce((s, i) => s + dist(f(i), C), 0) / ring.length
      if (!(r > 0.02)) continue
      const opening = scalePoly(eyePoly, 0.88)
      const lidTop = Math.min(...eyePoly.map((p) => p.y))
      const lidBottom = Math.max(...eyePoly.map((p) => p.y))
      if (lidBottom - lidTop < 0.06) continue // closed eye
      irisVisible++
      const eyeX0 = Math.min(...eyePoly.map((p) => p.x))
      const eyeX1 = Math.max(...eyePoly.map((p) => p.x))
      forFace(eyeX0, eyeX1, lidTop, lidBottom, (x, y, fx, fy) => {
        if (!inPolygon(opening, fx, fy)) return
        const dr = Math.hypot(fx - C.x, fy - C.y) / r
        if (dr >= 0.35 && dr <= 0.92 && fy > lidTop + (lidBottom - lidTop) * 0.22) pushSrc(iris, x, y)
        else if (dr > 1.15) pushSrc(sclera, x, y)
      })
      regions[`iris${irisVisible}`] = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return Finv(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r)
      })
    }
  }
  counts.iris = iris.n
  counts.sclera = sclera.n

  // Lips: between the outer and inner lip contours, not moustache.
  const lips = sample()
  const lipsInBig = scalePoly(lipsInF, 1.12)
  {
    const xs = lipsOutF.map((p) => p.x)
    const ys = lipsOutF.map((p) => p.y)
    forFace(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), (x, y, fx, fy) => {
      if (!inPolygon(lipsOutF, fx, fy) || inPolygon(lipsInBig, fx, fy)) return
      const k = segOf(x, y)
      if (k >= 0 && cat[k] === SEG.hair) return
      pushSrc(lips, x, y)
    })
  }
  counts.lips = lips.n

  // Brows: the brow polygons, grown a little (thin brows); skin is removed later in Lab.
  const brows = sample()
  for (const poly of [scalePoly(browRF, 1.15), scalePoly(browLF, 1.15)]) {
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    forFace(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), (x, y, fx, fy) => {
      if (!inPolygon(poly, fx, fy)) return
      pushSrc(brows, x, y)
    })
  }
  counts.brows = brows.n

  // Seg-space samples: hair, clothes, background, head cover.
  const hair = sample(4096)
  const hairRow: number[] = []
  const clothes = sample(4096)
  const background = sample(4096)
  const headCover = sample()
  const neutral = sample(4096)
  const segHairMask = new Uint8Array(S * S)
  let hairCount = 0
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = j * S + i
      if (!valid[k]) continue
      const c = cat[k]
      const fx = segFx(i, j)
      const fy = segFy(i, j)
      if (c === SEG.hair && confOf(SEG.hair, k) > 0.5) {
        segHairMask[k] = 1
        hairCount++
        // Head hair only: skip the beard zone (inside the lower face) and the brows.
        const inLowerFace = fy > noseBottomY && Math.abs(fx - cxF) < faceWF * 0.42 && fy < chinF.y + faceHF * 0.35
        if (!inLowerFace && confOf(SEG.hair, k) > 0.8 && !inPolygon(browRBig, fx, fy) && !inPolygon(browLBig, fx, fy)) {
          pushRoi(hair, k)
          hairRow.push(fy)
        }
      } else if (c === SEG.clothes && confOf(SEG.clothes, k) > 0.7) {
        if (fy > chinF.y) pushRoi(clothes, k)
        else if (fy < browY) pushRoi(headCover, k)
      } else if (c === SEG.others && fy < browY && confOf(SEG.others, k) > 0.6) {
        pushRoi(headCover, k)
      } else if (c === SEG.background && confOf(SEG.background, k) > 0.85) {
        pushRoi(background, k)
      }
    }
  counts.hair = hair.n
  counts.clothes = clothes.n
  counts.background = background.n

  // ======================= 2. White balance / exposure =======================

  /** Near-neutral pixels of one source (linear RGB). */
  const pickNeutral = (s: Sample, max: number): Sample => {
    const out = sample()
    const stride = Math.max(1, Math.floor(s.n / max))
    for (let i = 0; i < s.n; i += stride) {
      const r = s.data[i * 3]
      const g = s.data[i * 3 + 1]
      const b = s.data[i * 3 + 2]
      if (Math.max(r, g, b) > 0.96) continue
      const lab = linToLab(r, g, b)
      if (lab[0] < 0.45 || lab[0] > 0.97 || chroma(lab) > 0.06) continue
      out.push(r, g, b)
    }
    return out
  }
  const clothesN = pickNeutral(clothes, 3000)
  const backgroundN = pickNeutral(background, 3000)
  // Raw skin lightness (no correction): the eye whites must be brighter than the skin, which
  // keeps lids, lashes, shadows and sunglass lenses out of the exposure estimate.
  let skinRawL = NaN
  {
    const labs = toLabs(skinUsed, [1, 1, 1])
    const Ls: number[] = []
    for (let i = 0; i < skinUsed.n; i++) Ls.push(labs[i * 3])
    Ls.sort((a, b) => a - b)
    if (Ls.length) skinRawL = quantile(Ls, 0.5)
  }
  let scleraL: number | null = null
  let scleraCount = 0
  const whites = sample()
  if (sclera.n >= 12) {
    const labs = toLabs(sclera, [1, 1, 1])
    const Ls: number[] = []
    for (let i = 0; i < sclera.n; i++) {
      const lab: Lab = [labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]]
      if (chroma(lab) >= 0.06 || lab[0] > 0.985) continue
      if (Number.isFinite(skinRawL) && lab[0] < skinRawL + 0.03) continue
      Ls.push(lab[0])
      whites.push(sclera.data[i * 3], sclera.data[i * 3 + 1], sclera.data[i * 3 + 2])
    }
    if (Ls.length >= 20) {
      Ls.sort((a, b) => a - b)
      scleraL = quantile(Ls, 0.6)
      scleraCount = Ls.length
    }
  }
  // Which neutrals to believe: the eye whites (counted 3×), plus scene sources that agree with
  // them; without eye whites, clothes and background only when they agree with each other. A
  // single tinted garment or backdrop (teal-grey knit, foliage, graded studio paper) looks
  // exactly like a colour cast, so it never recolours the face on its own.
  {
    const ratios = (x: Sample): [number, number] => {
      let r = 0
      let g = 0
      let b = 0
      for (let i = 0; i < x.n; i++) {
        r += x.data[i * 3]
        g += x.data[i * 3 + 1]
        b += x.data[i * 3 + 2]
      }
      return [r / Math.max(1e-6, g), b / Math.max(1e-6, g)]
    }
    const agree = (a: [number, number], b: [number, number]) => Math.abs(a[0] / b[0] - 1) < 0.06 && Math.abs(a[1] / b[1] - 1) < 0.06
    const add = (x: Sample, times: number) => {
      for (let i = 0; i < x.n; i++) for (let t = 0; t < times; t++) neutral.push(x.data[i * 3], x.data[i * 3 + 1], x.data[i * 3 + 2])
    }
    const W = scleraCount >= 20 ? ratios(whites) : null
    const C = clothesN.n >= 150 ? ratios(clothesN) : null
    const B = backgroundN.n >= 150 ? ratios(backgroundN) : null
    let used = 0
    if (W) {
      add(whites, 3)
      used |= 1
      if (C && agree(C, W)) (add(clothesN, 1), (used |= 2))
      if (B && agree(B, W)) (add(backgroundN, 1), (used |= 4))
    } else if (C && B && agree(C, B)) {
      add(clothesN, 1)
      add(backgroundN, 1)
      used = 6
    }
    stats.wbSources = used
  }
  stats.skinRawL = skinRawL
  stats.scleraL = scleraL ?? NaN
  stats.scleraWhites = scleraCount
  const correction = neutral.n + scleraCount > 0 ? estimateCorrection(neutral.data, neutral.n, scleraL, scleraCount) : IDENTITY
  const gain = correction.gain

  // ======================= 3. Colours =======================

  const colors: Partial<Record<ColorKey | ExtraColorKey, MeasuredColor>> = {}
  const skinLabs = toLabs(skinUsed, gain)
  // The median of the trimmed middle: a brighter percentile lifted darker, more contrasty
  // skin more than light skin on the QA set (a skin-tone bias), so none is used.
  const skinC = colorOf(skinLabs, skinUsed.n, { lowPct: 0.2, highPct: 0.9, lPct: 0.5 }, 1500, skinStrict ? 1 : 0.6)
  if (skinC) colors.skin = skinC
  const skinLab: Lab = skinC?.lab ?? [0.7, 0.04, 0.05]

  const hairLabs = toLabs(hair, gain)
  const hairQuality = clamp01(hair.n / 600)
  const hairC = colorOf(hairLabs, hair.n, { lowPct: 0.1, highPct: 0.85, lPct: 0.55 }, 4000, hairQuality)
  if (hairC) colors.hair = hairC

  const irisLabs = toLabs(iris, gain)
  const irisC = colorOf(irisLabs, iris.n, { lowPct: 0.25, highPct: 0.85, lPct: 0.55 }, 300, clamp01(iod / 90))
  if (irisC) colors.iris = irisC

  const lipLabs = toLabs(lips, gain)
  const lipC = colorOf(lipLabs, lips.n, { lowPct: 0.15, highPct: 0.9, lPct: 0.55 }, 800)
  if (lipC) colors.lips = lipC

  // Brows minus skin: pixels clearly darker than, or differently coloured from, the skin.
  const browLabs = toLabs(brows, gain)
  let browDarkShare = 0
  {
    const keep = new Float32Array(brows.n * 3)
    let n = 0
    for (let i = 0; i < brows.n; i++) {
      const lab: Lab = [browLabs[i * 3], browLabs[i * 3 + 1], browLabs[i * 3 + 2]]
      if (lab[0] < skinLab[0] - 0.06 || deltaE(lab, skinLab) > 0.1) {
        keep.set(lab, n * 3)
        n++
      }
    }
    browDarkShare = brows.n ? n / brows.n : 0
    const c = colorOf(keep, n, { lowPct: 0.1, highPct: 0.8, lPct: 0.45 }, 400, clamp01(browDarkShare * 2.5))
    if (c) colors.brows = c
  }

  // Top: the two dominant clusters of the clothing.
  const clothLabs = toLabs(clothes, gain)
  const clusters = kmeans(clothLabs, clothes.n, 3)
  if (clusters.length && clothes.n >= 150) {
    const q = clamp01(clothes.n / 5000)
    const toColor = (lab: Lab, share: number, n: number): MeasuredColor => ({ hex: labToHex(lab), lab, confidence: Math.round(q * clamp01(share * 1.6) * 1000) / 1000, n })
    colors.top = toColor(clusters[0].lab, clusters[0].share, clusters[0].n)
    const second = clusters.slice(1).find((c) => c.share >= 0.15 && deltaE(c.lab, clusters[0].lab) >= 0.1)
    if (second) colors.topSecondary = toColor(second.lab, second.share, second.n)
  }

  const bgLabs = toLabs(background, gain)
  const bgC = colorOf(bgLabs, background.n, { lowPct: 0.1, highPct: 0.9, lPct: 0.5 }, 4000)
  if (bgC) colors.background = bgC

  const hwLabs = toLabs(headCover, gain)
  const hwClusters = kmeans(hwLabs, headCover.n, 2)
  if (hwClusters.length && headCover.n >= 200) {
    const lab = hwClusters[0].lab
    colors.headwear = { hex: labToHex(lab), lab, confidence: clamp01(headCover.n / 3000), n: headCover.n }
  }

  // ======================= 4. Geometry (3D head frame) =======================

  const Q = (i: number) => L3[i]
  const sub3 = (a: Point3, b: Point3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
  const dot3 = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z
  const norm3 = (a: Point3) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1
    return { x: a.x / l, y: a.y / l, z: a.z / l }
  }
  const mid3 = (a: Point3, b: Point3) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })
  let e3a = hasIris ? Q(LM.irisR) : mid3(Q(LM.eyeROuter), Q(LM.eyeRInner))
  let e3b = hasIris ? Q(LM.irisL) : mid3(Q(LM.eyeLOuter), Q(LM.eyeLInner))
  if (e3a.x > e3b.x) [e3a, e3b] = [e3b, e3a]
  const O3 = mid3(e3a, e3b)
  const X3 = norm3(sub3(e3b, e3a))
  const T3 = sub3(mid3(Q(LM.mouthR), Q(LM.mouthL)), O3)
  const tx = dot3(T3, X3)
  const Y3 = norm3({ x: T3.x - tx * X3.x, y: T3.y - tx * X3.y, z: T3.z - tx * X3.z })
  const h = (i: number): Pt => {
    const v = sub3(Q(i), O3)
    return { x: dot3(v, X3), y: dot3(v, Y3) }
  }
  const d3 = (i: number, j: number) => {
    const v = sub3(Q(i), Q(j))
    return Math.hypot(v.x, v.y, v.z)
  }
  const faceW = Math.abs(h(LM.cheekL).x - h(LM.cheekR).x)
  const faceH = h(LM.chin).y - h(LM.foreheadTop).y
  const ovalH = FACE_OVAL.map(h)
  const smile = avgBlend(blendshapes, BLENDSHAPES.smile)
  const smileK = Number.isFinite(smile) ? smile : 0

  const pose = {
    yaw: (Math.asin(clamp(X3.z, -1, 1)) * 180) / Math.PI,
    pitch: (Math.asin(clamp(Y3.z, -1, 1)) * 180) / Math.PI,
    roll: (Math.atan2(u.y, u.x) * 180) / Math.PI,
  }

  const eyeTiltOf = (outer: number, inner: number) => {
    const a = h(outer)
    const b = h(inner)
    return (Math.atan2(-(a.y - b.y), Math.abs(a.x - b.x)) * 180) / Math.PI
  }
  /** Brow arch: the highest point of the upper brow edge above its end-to-end chord, as a
   *  share of the chord length (y grows downward, so "above" means a smaller y). */
  const archOf = (upper: readonly number[]) => {
    const pts = upper.map(h)
    const A = pts[0]
    const B = pts[pts.length - 1]
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1
    if (Math.abs(B.x - A.x) < 1e-6) return 0
    let best = 0
    for (const p of pts.slice(1, -1)) {
      const chordY = A.y + ((B.y - A.y) * (p.x - A.x)) / (B.x - A.x)
      best = Math.max(best, chordY - p.y)
    }
    return best / len
  }
  const cheekSpan = spanAt(ovalH, (h(LM.mouthR).y + h(LM.mouthL).y) / 2)

  // ======================= 5. Seg-space silhouette =======================

  // Landmarks in seg pixels.
  const s = (i: number) => apply(toSeg, P(i))
  const faceWs = Math.abs(s(LM.cheekL).x - s(LM.cheekR).x)
  const faceHs = Math.max(1, s(LM.chin).y - s(LM.foreheadTop).y)
  const cxs = (s(LM.cheekL).x + s(LM.cheekR).x) / 2
  const browYs = (s(105).y + s(334).y) / 2
  const chinYs = s(LM.chin).y
  const eyeYs = (apply(toSeg, eyeA).y + apply(toSeg, eyeB).y) / 2
  const mouthYs = (s(LM.mouthR).y + s(LM.mouthL).y) / 2
  const noseYs = s(LM.subnasale).y
  const ovalS = FACE_OVAL.map(s)
  const faceAreaS = Math.max(1, polygonArea(ovalS))
  const isHair = (i: number, j: number) => i >= 0 && j >= 0 && i < S && j < S && segHairMask[j * S + i] === 1
  const clsAt = (i: number, j: number) => (i >= 0 && j >= 0 && i < S && j < S && valid[j * S + i] ? cat[j * S + i] : -1)

  // Region fraction helper: fraction of valid pixels in a seg rectangle matching `test`.
  function fraction(x0: number, x1: number, y0: number, y1: number, test: (c: number, k: number) => boolean, among?: (c: number) => boolean): number {
    let hit = 0
    let all = 0
    for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(S - 1, Math.ceil(y1)); j++)
      for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(S - 1, Math.ceil(x1)); i++) {
        const k = j * S + i
        if (!valid[k]) continue
        const c = cat[k]
        if (among && !among(c)) continue
        all++
        if (test(c, k)) hit++
      }
    return all ? hit / all : NaN
  }

  // Hair top: highest hair pixel over the central half of the face.
  let topY = Infinity
  for (let j = 0; j < S && topY === Infinity; j++)
    for (let i = Math.floor(cxs - faceWs * 0.5); i <= Math.ceil(cxs + faceWs * 0.5); i++)
      if (isHair(i, j)) {
        topY = j
        break
      }
  // Skull top (bald heads have skin up there): topmost skin/hair in the central band.
  let crownY = topY
  for (let j = 0; j < S; j++) {
    let hit = false
    for (let i = Math.floor(cxs - faceWs * 0.25); i <= Math.ceil(cxs + faceWs * 0.25); i++) {
      const c = clsAt(i, j)
      if (c === SEG.hair || c === SEG.faceSkin) {
        hit = true
        break
      }
    }
    if (hit) {
      crownY = Math.min(crownY, j)
      break
    }
  }

  // Width: robust max row width of hair between the top and the chin.
  const rowWidths: number[] = []
  let hairBottomY = -Infinity
  const lateralHairY: number[] = []
  let hairAtBottomEdge = 0
  for (let j = 0; j < S; j++) {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < S; i++) {
      if (!isHair(i, j)) continue
      lo = Math.min(lo, i)
      hi = Math.max(hi, i)
      // Beside the face (wider below the mouth, so a beard doesn't count as long hair).
      const off = Math.abs(i + 0.5 - cxs) / faceWs
      if (off > (j > mouthYs ? 0.5 : 0.3) && off < 1.4 && j > eyeYs) lateralHairY.push(j)
    }
    if (hi >= lo && j <= chinYs) rowWidths.push(hi - lo + 1)
  }
  rowWidths.sort((a, b) => a - b)
  if (lateralHairY.length > 20) {
    lateralHairY.sort((a, b) => a - b)
    hairBottomY = quantile(lateralHairY, 0.98)
  }
  // Does hair run off the bottom (or out of the photo) at the sides?
  {
    let edge = 0
    for (let i = 0; i < S; i++) {
      const off = Math.abs(i + 0.5 - cxs) / faceWs
      if (off < 0.3 || off > 1.4) continue
      for (let j = S - 1; j > S - 6; j--) {
        const k = j * S + i
        if (segHairMask[k]) edge++
        else if (!valid[k]) {
          // Photo ends here: is there hair just above the photo's edge?
          let jj = j
          while (jj > 0 && !valid[jj * S + i]) jj--
          if (jj > chinYs && segHairMask[jj * S + i]) edge++
          break
        }
      }
    }
    hairAtBottomEdge = clamp01(edge / 30)
  }

  // Forehead coverage (bangs): rows just above the brows, centre ± 0.3 face widths.
  const fhY0 = browYs - faceHs * 0.24
  const fhY1 = browYs - faceHs * 0.04
  const third = faceWs * 0.2
  const hairOrSkin = (c: number) => c === SEG.hair || c === SEG.faceSkin
  const coverOf = (x0: number, x1: number) => fraction(x0, x1, fhY0, fhY1, (c) => c === SEG.hair, hairOrSkin)
  const coverL = coverOf(cxs - 3 * third / 2, cxs - third / 2)
  const coverC = coverOf(cxs - third / 2, cxs + third / 2)
  const coverR = coverOf(cxs + third / 2, cxs + 3 * third / 2)
  const covers = [coverL, coverC, coverR].filter(Number.isFinite)
  const foreheadCoverage = covers.length ? covers.reduce((a, b) => a + b, 0) / covers.length : NaN

  // Hairline: from the brows up the centre, where face skin stops.
  let hairlineY = browYs
  {
    const x0 = Math.floor(cxs - faceWs * 0.15)
    const x1 = Math.ceil(cxs + faceWs * 0.15)
    for (let j = Math.floor(browYs - faceHs * 0.04); j >= 0; j--) {
      let skinN = 0
      let n = 0
      for (let i = x0; i <= x1; i++) {
        const c = clsAt(i, j)
        if (c < 0) continue
        n++
        if (c === SEG.faceSkin) skinN++
      }
      if (!n || skinN / n < 0.5) break
      hairlineY = j
    }
  }
  const hairlineHeight = (browYs - hairlineY) / faceHs

  // Part: a light seam in the hair near the crown (scalp showing), only when hair and
  // skin contrast enough to see it.
  let partX = NaN
  let partStrength = 0
  if (colors.hair && Number.isFinite(topY) && hairCount > 400 && skinLab[0] - (colors.hair.lab[0] ?? 0) > 0.12) {
    const hL = colors.hair.lab[0]
    const thr = hL + (skinLab[0] - hL) * 0.45
    const y0 = Math.floor(topY + faceHs * 0.03)
    const y1 = Math.min(Math.floor(hairlineY), Math.ceil(topY + faceHs * 0.3))
    const xs0 = Math.floor(cxs - faceWs * 0.45)
    const xs1 = Math.ceil(cxs + faceWs * 0.45)
    const score: number[] = []
    for (let i = xs0; i <= xs1; i++) {
      let light = 0
      let n = 0
      for (let j = y0; j <= y1; j++) {
        const k = j * S + i
        if (i < 0 || i >= S || j < 0 || j >= S || !valid[k]) continue
        if (confOf(SEG.hair, k) < 0.3) continue
        n++
        const o = k * 4
        const L = linToLab(toLinear(RD[o]), toLinear(RD[o + 1]), toLinear(RD[o + 2]))[0]
        if (L * Math.cbrt(gain[1]) > thr) light++
      }
      score.push(n >= 4 ? light / n : 0)
    }
    const sm = score.map((_, i) => (score[i - 1] ?? score[i]) * 0.25 + score[i] * 0.5 + (score[i + 1] ?? score[i]) * 0.25)
    let bi = -1
    let bv = -1
    sm.forEach((v, i) => {
      if (v > bv) {
        bv = v
        bi = i
      }
    })
    const base = median(sm)
    partStrength = clamp01((bv - base) / 0.35)
    if (bi >= 0 && partStrength > 0.25) partX = (xs0 + bi + 0.5 - cxs) / (faceWs / 2)
  }

  // Hair texture: structure-tensor coherence over hair pixels in the ROI.
  let hairCoherence = NaN
  let hairRoughness = NaN
  if (hairCount > 300) {
    const lum = new Float32Array(S * S)
    for (let k = 0; k < S * S; k++) {
      const o = k * 4
      lum[k] = 0.2126 * toLinear(RD[o]) + 0.7152 * toLinear(RD[o + 1]) + 0.0722 * toLinear(RD[o + 2])
    }
    let cohSum = 0
    let cohW = 0
    const R = 3
    for (let j = R + 1; j < S - R - 1; j += 2)
      for (let i = R + 1; i < S - R - 1; i += 2) {
        if (!segHairMask[j * S + i]) continue
        let jxx = 0
        let jyy = 0
        let jxy = 0
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const k = (j + dy) * S + (i + dx)
            const gx = lum[k + 1] - lum[k - 1]
            const gy = lum[k + S] - lum[k - S]
            jxx += gx * gx
            jyy += gy * gy
            jxy += gx * gy
          }
        const tr = jxx + jyy
        if (tr < 1e-5) continue
        const coh = Math.sqrt((jxx - jyy) * (jxx - jyy) + 4 * jxy * jxy) / tr
        cohSum += coh * tr
        cohW += tr
      }
    if (cohW > 0) hairCoherence = cohSum / cohW

    // Roughness: perimeter of the raw mask vs a smoothed mask.
    const perim = (m: Uint8Array) => {
      let p = 0
      for (let j = 1; j < S - 1; j++)
        for (let i = 1; i < S - 1; i++) {
          const k = j * S + i
          if (m[k] && (!m[k - 1] || !m[k + 1] || !m[k - S] || !m[k + S])) p++
        }
      return p
    }
    const smooth = new Uint8Array(S * S)
    const B = 4
    const integral = new Float32Array((S + 1) * (S + 1))
    for (let j = 0; j < S; j++) {
      let row = 0
      for (let i = 0; i < S; i++) {
        row += segHairMask[j * S + i]
        integral[(j + 1) * (S + 1) + i + 1] = integral[j * (S + 1) + i + 1] + row
      }
    }
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x0 = Math.max(0, i - B)
        const x1 = Math.min(S, i + B + 1)
        const y0 = Math.max(0, j - B)
        const y1 = Math.min(S, j + B + 1)
        const sum = integral[y1 * (S + 1) + x1] - integral[y0 * (S + 1) + x1] - integral[y1 * (S + 1) + x0] + integral[y0 * (S + 1) + x0]
        smooth[j * S + i] = sum / ((x1 - x0) * (y1 - y0)) > 0.5 ? 1 : 0
      }
    const pr = perim(segHairMask)
    const ps = perim(smooth)
    hairRoughness = ps > 0 ? clamp01((pr / ps - 1) / 0.6) : NaN
  }

  // Top width (buns) and side hair (undercuts).
  let hairTopWidth = NaN
  let hairSideRatio = NaN
  if (Number.isFinite(topY)) {
    const y1 = topY + faceHs * 0.1
    let maxW = 0
    for (let j = Math.floor(topY); j <= Math.ceil(y1); j++) {
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < S; i++)
        if (isHair(i, j)) {
          lo = Math.min(lo, i)
          hi = Math.max(hi, i)
        }
      if (hi >= lo) maxW = Math.max(maxW, hi - lo + 1)
    }
    hairTopWidth = maxW / faceWs
    const sideFrac =
      (fraction(cxs - faceWs * 0.85, cxs - faceWs * 0.45, eyeYs - faceHs * 0.12, noseYs, (c) => c === SEG.hair) +
        fraction(cxs + faceWs * 0.45, cxs + faceWs * 0.85, eyeYs - faceHs * 0.12, noseYs, (c) => c === SEG.hair)) /
      2
    const topFrac = fraction(cxs - faceWs * 0.35, cxs + faceWs * 0.35, crownY, crownY + faceHs * 0.15, (c) => c === SEG.hair)
    hairSideRatio = topFrac > 0.05 ? clamp(sideFrac / topFrac, 0, 2) : NaN
  }

  // Ombré (tip lift) and a second hair colour (highlights, two-tone).
  let hairTipLift = NaN
  let hairSecondShare = 0
  let hairSecondDelta = 0
  if (hair.n > 400) {
    const rows = hairRow.slice().sort((a, b) => a - b)
    const top = quantile(rows, 0.3)
    const bottom = quantile(rows, 0.75)
    const rootsL: number[] = []
    const tipsL: number[] = []
    for (let i = 0; i < hair.n; i++) {
      if (hairRow[i] <= top) rootsL.push(hairLabs[i * 3])
      else if (hairRow[i] >= bottom) tipsL.push(hairLabs[i * 3])
    }
    if (rootsL.length > 50 && tipsL.length > 50 && bottom - top > 0.6) hairTipLift = median(tipsL) - median(rootsL)
    const hc = kmeans(hairLabs, hair.n, 2)
    if (hc.length === 2) {
      hairSecondShare = hc[1].share
      hairSecondDelta = deltaE(hc[0].lab, hc[1].lab)
      if (hairSecondShare > 0.12 && hairSecondDelta > 0.12) colors.hairSecondary = { hex: labToHex(hc[1].lab), lab: hc[1].lab, confidence: clamp01(hairSecondShare * 2), n: hc[1].n }
    }
  }

  // Ears: skin beside the face oval at ear height, not covered by hair.
  let earSkin = 0
  {
    const y0 = eyeYs
    const y1 = noseYs + (chinYs - noseYs) * 0.3
    for (let j = Math.floor(y0); j <= Math.ceil(y1); j++) {
      const span = spanAt(ovalS, j + 0.5)
      if (!span) continue
      for (const [a, b] of [
        [span[0] - faceWs * 0.18, span[0] - 1],
        [span[1] + 1, span[1] + faceWs * 0.18],
      ]) {
        for (let i = Math.floor(a); i <= Math.ceil(b); i++) {
          const c = clsAt(i, j)
          if (c === SEG.faceSkin || c === SEG.bodySkin) earSkin++
        }
      }
    }
  }
  const earVisibility = clamp01((earSkin / faceAreaS) * 12)

  // ======================= 6. Cues =======================

  // Beard and moustache: hair-class or clearly darker-than-skin pixels in the lower face.
  const skinL = skinLab[0]
  const skinCh = chroma(skinLab)
  let beardHit = 0
  let beardN = 0
  let chinHit = 0
  let chinN = 0
  let sideHit = 0
  let sideN = 0
  const beardLs: number[] = []
  const beardSample = sample()
  // Hair-like: clearly darker than the skin AND less chromatic than the same skin would be
  // in shadow (shading scales OKLab chroma with lightness), so jaw shadows don't count.
  const hairLike = (lab: Lab) => lab[0] < skinL - 0.09 && chroma(lab) < skinCh * (lab[0] / Math.max(0.05, skinL)) * 0.8
  const lowerY0 = noseBottomY + (mouthY - noseBottomY) * 0.2
  forFace(-faceWF * 0.55, faceWF * 0.55, lowerY0, chinF.y + 0.05, (x, y, fx, fy) => {
    if (!inPolygon(ovalF, fx, fy) || inPolygon(lipsBig, fx, fy)) return
    const onSide = Math.abs(fx - cxF) > 0.42
    const onChin = !onSide && fy > f(LM.lowerLipBottom).y + 0.04
    // The zone between nose and mouth belongs to the moustache.
    if (!onSide && fy < mouthY) return
    const o = (y * W + x) * 4
    const lab = linToLab(toLinear(D[o]) * gain[0], toLinear(D[o + 1]) * gain[1], toLinear(D[o + 2]) * gain[2])
    const k = segOf(x, y)
    const segHair = k >= 0 && cat[k] === SEG.hair ? 1 : 0
    const dark = hairLike(lab) ? 0.7 : 0
    const hit = Math.max(segHair, dark)
    beardHit += hit
    beardN++
    beardLs.push(lab[0])
    if (hit > 0.5) beardSample.push(toLinear(D[o]), toLinear(D[o + 1]), toLinear(D[o + 2]))
    if (onChin) {
      chinHit += hit
      chinN++
    } else if (onSide) {
      sideHit += hit
      sideN++
    }
  })
  const beardCoverage = beardN ? beardHit / beardN : 0
  const beardDarkening = beardLs.length ? Math.max(0, skinL - median(beardLs)) : 0
  if (beardSample.n > 80 && beardCoverage > 0.25) {
    const c = colorOf(toLabs(beardSample, gain), beardSample.n, { lowPct: 0.1, highPct: 0.85, lPct: 0.5 }, 1500)
    if (c) colors.beard = c
  }
  let beardBelowChin = 0
  {
    for (let j = Math.ceil(chinYs); j < S; j++) {
      const fr = fraction(cxs - faceWs * 0.22, cxs + faceWs * 0.22, j, j, (c) => c === SEG.hair)
      if (!(fr > 0.4)) break
      beardBelowChin = (j - chinYs) / faceHs
    }
  }
  let mustHit = 0
  let mustN = 0
  {
    const x0 = f(LM.mouthR).x - 0.05
    const x1 = f(LM.mouthL).x + 0.05
    const y0 = noseBottomY + 0.03
    const y1 = f(LM.upperLipTop).y - 0.01
    if (y1 > y0)
      forFace(x0, x1, y0, y1, (x, y) => {
        const o = (y * W + x) * 4
        const lab = linToLab(toLinear(D[o]) * gain[0], toLinear(D[o + 1]) * gain[1], toLinear(D[o + 2]) * gain[2])
        const k = segOf(x, y)
        mustHit += k >= 0 && cat[k] === SEG.hair ? 1 : hairLike(lab) ? 0.7 : 0
        mustN++
      })
  }
  const mustacheCoverage = mustN ? mustHit / mustN : 0

  // Glasses: accessory-class pixels around the eyes, frame lines below the eyes and across
  // the bridge, and dark lenses.
  let othersEye = 0
  let othersN = 0
  const lensLs: number[] = []
  const frame = sample()
  for (const cx of [f(LM.irisR).x, f(LM.irisL).x]) {
    forFace(cx - 0.42, cx + 0.42, -0.35, 0.38, (x, y, fx, fy) => {
      const k = segOf(x, y)
      othersN++
      if (k >= 0 && cat[k] === SEG.others) {
        othersEye++
        pushSrc(frame, x, y)
      }
      if (Math.hypot(fx - cx, fy * 1.3) < 0.28) {
        const o = (y * W + x) * 4
        lensLs.push(linToLab(toLinear(D[o]) * gain[0], toLinear(D[o + 1]) * gain[1], toLinear(D[o + 2]) * gain[2])[0])
      }
    })
  }
  const lineScore = (fx0: number, fx1: number, fy0: number, fy1: number): number => {
    // For each column (in face units), the darkest row; a frame makes the dips line up.
    const cols = 16
    const rows = 14
    const dips: number[] = []
    const ys: number[] = []
    for (let ci = 0; ci < cols; ci++) {
      const fx = fx0 + ((ci + 0.5) / cols) * (fx1 - fx0)
      const Ls: number[] = []
      for (let ri = 0; ri < rows; ri++) {
        const p = Finv(fx, fy0 + ((ri + 0.5) / rows) * (fy1 - fy0))
        const x = Math.floor(p.x)
        const y = Math.floor(p.y)
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const o = (y * W + x) * 4
        Ls.push(linToLab(toLinear(D[o]), toLinear(D[o + 1]), toLinear(D[o + 2]))[0])
      }
      if (Ls.length < rows * 0.7) continue
      const m = median(Ls)
      let lo = Infinity
      let at = 0
      Ls.forEach((v, i) => {
        if (v < lo) {
          lo = v
          at = i
        }
      })
      dips.push(m - lo)
      ys.push(at)
    }
    if (dips.length < cols * 0.6) return 0
    const strong = dips.filter((d) => d > 0.07).length / dips.length
    const ym = median(ys)
    const consistent = ys.filter((y) => Math.abs(y - ym) <= 1.5).length / ys.length
    return clamp01(strong * consistent * 1.4)
  }
  const eyeBottom = Math.max(...eyeRF.map((p) => p.y), ...eyeLF.map((p) => p.y))
  const rimBelow = (lineScore(f(LM.irisR).x - 0.3, f(LM.irisR).x + 0.3, eyeBottom + 0.1, eyeBottom + 0.42) + lineScore(f(LM.irisL).x - 0.3, f(LM.irisL).x + 0.3, eyeBottom + 0.1, eyeBottom + 0.42)) / 2
  const bridgeTop = f(LM.eyeRTop).y - 0.12
  const bridge = lineScore(-0.1, 0.1, bridgeTop, f(LM.irisR).y + 0.08)
  const glassesEdges = clamp01(Math.max((othersN ? othersEye / othersN : 0) * 3, rimBelow * 0.7 + bridge * 0.5))
  const lensL = lensLs.length ? median(lensLs) : skinL
  const darkLenses = clamp01((skinL - lensL - 0.18) / 0.22) * (irisVisible === 0 || !irisC || irisC.confidence < 0.3 ? 1 : 0.6)
  // Frame colour: the darker part of the accessory-class pixels around the eyes (the lenses
  // show skin and glare).
  if (frame.n >= 40 && othersN && othersEye / othersN > 0.06) {
    const c = colorOf(toLabs(frame, gain), frame.n, { lowPct: 0.03, highPct: 0.5, lPct: 0.35 }, 400)
    if (c) colors.eyewear = c
  }
  counts.frame = frame.n

  // Head cover (hats, wraps, hoods) and side cover (hijab, hood).
  const coverClass = (c: number) => c === SEG.clothes || c === SEG.others
  const nonBg = (c: number) => c !== SEG.background
  const headCoverFrac = fraction(cxs - faceWs * 0.6, cxs + faceWs * 0.6, Math.min(browYs - faceHs * 0.1, (Number.isFinite(crownY) ? crownY : browYs - faceHs * 0.6) - faceHs * 0.05), browYs - faceHs * 0.12, coverClass, nonBg)
  const sideCoverFrac =
    (fraction(cxs - faceWs * 0.85, cxs - faceWs * 0.5, eyeYs, chinYs + faceHs * 0.1, coverClass, nonBg) +
      fraction(cxs + faceWs * 0.5, cxs + faceWs * 0.85, eyeYs, chinYs + faceHs * 0.1, coverClass, nonBg)) /
    2

  // Small accessory-class blobs at the ear lobes, the ear band (headphones) and the neck.
  const others = (c: number) => c === SEG.others
  const lobeY0 = noseYs
  const lobeY1 = noseYs + (chinYs - noseYs) * 0.8
  const earAcc =
    (fraction(cxs - faceWs * 0.72, cxs - faceWs * 0.42, lobeY0, lobeY1, others) + fraction(cxs + faceWs * 0.42, cxs + faceWs * 0.72, lobeY0, lobeY1, others)) / 2
  stats.earAcc = earAcc
  const earBand =
    (fraction(cxs - faceWs * 0.8, cxs - faceWs * 0.45, eyeYs - faceHs * 0.15, noseYs, others) + fraction(cxs + faceWs * 0.45, cxs + faceWs * 0.8, eyeYs - faceHs * 0.15, noseYs, others)) / 2
  const topBand = fraction(cxs - faceWs * 0.5, cxs + faceWs * 0.5, (Number.isFinite(topY) ? topY : crownY) - 4, (Number.isFinite(topY) ? topY : crownY) + faceHs * 0.12, others)
  // Headphone colour: accessory pixels over the ears.
  {
    const cups = sample()
    for (const [x0, x1] of [
      [cxs - faceWs * 0.85, cxs - faceWs * 0.45],
      [cxs + faceWs * 0.45, cxs + faceWs * 0.85],
    ])
      for (let j = Math.max(0, Math.floor(eyeYs - faceHs * 0.15)); j <= Math.min(S - 1, Math.ceil(noseYs)); j++)
        for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(S - 1, Math.ceil(x1)); i++) {
          const k = j * S + i
          if (valid[k] && cat[k] === SEG.others) pushRoi(cups, k)
        }
    counts.headphones = cups.n
    if (cups.n >= 150) {
      const cl = kmeans(toLabs(cups, gain), cups.n, 2)
      if (cl.length) colors.headphones = { hex: labToHex(cl[0].lab), lab: cl[0].lab, confidence: clamp01(cups.n / 1500), n: cl[0].n }
    }
  }
  const neckAcc = fraction(cxs - faceWs * 0.35, cxs + faceWs * 0.35, chinYs + faceHs * 0.08, chinYs + faceHs * 0.55, others)

  // Freckles: small, round dark spots on the cheeks (needs enough resolution). A spot must be
  // a local minimum darker than all but one of its ring neighbours at freckle scale, so
  // wrinkles and pores (dark along a line, or tiny) don't count. Density = spots per IOD² of
  // sampled cheek.
  let spotDensity = NaN
  if (iod >= 70) {
    const rr = Math.max(2, Math.round(iod * FRECKLES.ringIod))
    const rd = Math.max(1, Math.round(rr * 0.7))
    const ring = [
      [rr, 0],
      [-rr, 0],
      [0, rr],
      [0, -rr],
      [rd, rd],
      [-rd, -rd],
      [rd, -rd],
      [-rd, rd],
    ]
    const lum = (xx: number, yy: number) => {
      const o = (yy * W + xx) * 4
      return 0.2126 * toLinear(D[o]) + 0.7152 * toLinear(D[o + 1]) + 0.0722 * toLinear(D[o + 2])
    }
    let spots = 0
    let n = 0
    const v = new Float64Array(8)
    for (const r of skinRegions.slice(0, 2)) {
      forFace(r.cx - r.rx, r.cx + r.rx, r.cy - r.ry, r.cy + r.ry, (x, y, fx, fy) => {
        const ex = (fx - r.cx) / r.rx
        const ey = (fy - r.cy) / r.ry
        if (ex * ex + ey * ey > 0.8 || x < rr + 1 || y < rr + 1 || x >= W - rr - 1 || y >= H - rr - 1) return
        const k = segOf(x, y)
        if (k < 0 || cat[k] !== SEG.faceSkin) return
        n++
        const c = lum(x, y)
        for (let q = 0; q < 8; q++) v[q] = lum(x + ring[q][0], y + ring[q][1])
        v.sort()
        if (!(c < v[1] * (1 - FRECKLES.contrast))) return
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && lum(x + dx, y + dy) < c) return
        spots++
      })
    }
    const perIod2 = n > 200 ? spots / (n / (iod * iod)) : NaN
    stats.freckleSpots = spots
    stats.frecklePerIod2 = perIod2
    spotDensity = Number.isFinite(perIod2) ? clamp01(perIod2 / FRECKLES.fullDensity) : NaN
  }

  // Eye makeup: darkening at the lash line past the outer corner (liner) and a lid colour
  // shift between the eye and the brow (shadow).
  let linerScore = 0
  let lidShadowScore = 0
  {
    const wingLs: number[] = []
    const lid = sample()
    for (const [outer, inner, poly, lower] of [
      [LM.eyeROuter, LM.eyeRInner, eyeRF, BROW_R_LOWER],
      [LM.eyeLOuter, LM.eyeLInner, eyeLF, BROW_L_LOWER],
    ] as const) {
      const o = f(outer)
      const i = f(inner)
      const dir = Math.sign(o.x - i.x) || 1
      forFace(Math.min(o.x, o.x + dir * 0.14), Math.max(o.x, o.x + dir * 0.14), o.y - 0.08, o.y + 0.01, (x, y) => {
        const q = (y * W + x) * 4
        wingLs.push(linToLab(toLinear(D[q]) * gain[0], toLinear(D[q + 1]) * gain[1], toLinear(D[q + 2]) * gain[2])[0])
      })
      const top = Math.min(...poly.map((p) => p.y))
      const browLow = Math.max(...lower.map((k) => f(k).y))
      const x0 = Math.min(o.x, i.x)
      const x1 = Math.max(o.x, i.x)
      if (browLow < top - 0.08)
        forFace(x0, x1, browLow + 0.05, top - 0.03, (x, y) => {
          const k = segOf(x, y)
          if (k >= 0 && cat[k] !== SEG.faceSkin) return
          pushSrc(lid, x, y)
        })
    }
    if (wingLs.length > 10) {
      stats.linerDrop = skinL - median(wingLs)
      linerScore = clamp01((stats.linerDrop - MAKEUP.linerDrop) / 0.15)
    }
    const lidC = colorOf(toLabs(lid, gain), lid.n, { lowPct: 0.2, highPct: 0.85, lPct: 0.5 }, 300)
    if (lidC) {
      const dC = Math.hypot(lidC.lab[1] - skinLab[1], lidC.lab[2] - skinLab[2])
      stats.lidChromaShift = dC
      lidShadowScore = clamp01((dC - MAKEUP.lidShift) / 0.05)
      if (lidShadowScore > 0.3) colors.lidShadow = lidC
    }
  }

  // Clothing around the neck and shoulders.
  const shoulderSkin =
    (fraction(cxs - faceWs * 1.5, cxs - faceWs * 0.55, chinYs + faceHs * 0.35, chinYs + faceHs * 0.8, (c) => c === SEG.bodySkin, (c) => c === SEG.bodySkin || c === SEG.clothes) +
      fraction(cxs + faceWs * 0.55, cxs + faceWs * 1.5, chinYs + faceHs * 0.35, chinYs + faceHs * 0.8, (c) => c === SEG.bodySkin, (c) => c === SEG.bodySkin || c === SEG.clothes)) /
    2
  const neckCover = fraction(cxs - faceWs * 0.25, cxs + faceWs * 0.25, chinYs + faceHs * 0.05, chinYs + faceHs * 0.3, (c) => c === SEG.clothes, (c) => c === SEG.clothes || c === SEG.bodySkin)
  const clothesShare = fraction(0, S - 1, chinYs + faceHs * 0.2, S - 1, (c) => c === SEG.clothes)

  // ======================= 7. Assemble =======================

  const eyeW = (d3(LM.eyeROuter, LM.eyeRInner) + d3(LM.eyeLOuter, LM.eyeLInner)) / 2
  const mouthW = d3(LM.mouthR, LM.mouthL)
  // Brow thickness from pixels: brow-dark rows per column, as a share of face height.
  let browThickness = NaN
  if (brows.n > 40 && browDarkShare > 0.1) {
    const area = polygonArea(browRF) + polygonArea(browLF)
    const len = dist(f(BROW_R_UPPER[0]), f(BROW_R_UPPER[4])) + dist(f(BROW_L_UPPER[0]), f(BROW_L_UPPER[4]))
    // Mean polygon height × the dark share ≈ visible brow thickness.
    browThickness = ((area / Math.max(1e-3, len)) * clamp01(browDarkShare * 1.15)) / Math.max(1e-3, faceHF)
  } else {
    const t = (BROW_R_UPPER.reduce((acc, k, i) => acc + dist(f(k), f(BROW_R_LOWER[i])), 0) + BROW_L_UPPER.reduce((acc, k, i) => acc + dist(f(k), f(BROW_L_LOWER[i])), 0)) / 10
    browThickness = (t * 0.6) / Math.max(1e-3, faceHF)
  }

  const geometry: Record<GeometryKey, number> = {
    faceWidthRatio: faceW / faceH,
    jawRatio: Math.abs(h(LM.jawL).x - h(LM.jawR).x) / faceW,
    chinRatio: (h(LM.chin).y - h(LM.lowerLipBottom).y) / faceH,
    // The skin forehead (brows → hairline) when no bangs hide it; else the mesh's forehead.
    foreheadRatio: foreheadCoverage < 0.45 && hairlineHeight > 0.05 ? hairlineHeight : ((h(105).y + h(334).y) / 2 - h(LM.foreheadTop).y) / faceH,
    cheekFullness: cheekSpan ? (cheekSpan[1] - cheekSpan[0]) / faceW : NaN,
    eyeSize: eyeW / faceW,
    eyeSpacing: Math.abs(h(LM.eyeLInner).x - h(LM.eyeRInner).x) / faceW,
    eyeTilt: (eyeTiltOf(LM.eyeROuter, LM.eyeRInner) + eyeTiltOf(LM.eyeLOuter, LM.eyeLInner)) / 2,
    browThickness,
    browArch: (archOf(BROW_R_UPPER) + archOf(BROW_L_UPPER)) / 2,
    noseWidth: Math.abs(h(LM.alaL).x - h(LM.alaR).x) / faceW,
    noseLength: (h(LM.subnasale).y - h(LM.nasion).y) / faceH,
    mouthWidth: mouthW / faceW / (1 + 0.12 * smileK),
    lipFullness: (Math.max(0, h(LM.upperLipBottom).y - h(LM.upperLipTop).y) + Math.max(0, h(LM.lowerLipBottom).y - h(LM.lowerLipTop).y)) / Math.max(1e-3, mouthW),
    earVisibility,
  }

  const hairOut: Record<HairKey, number> = {
    hairArea: hairCount / faceAreaS,
    hairTopHeight: Number.isFinite(topY) ? (browYs - topY) / faceHs : 0,
    hairWidth: rowWidths.length ? quantile(rowWidths, 0.95) / faceWs : 0,
    hairBottom: Number.isFinite(hairBottomY) ? (hairBottomY - chinYs) / faceHs : NaN,
    foreheadCoverage: Number.isFinite(foreheadCoverage) ? foreheadCoverage : NaN,
    partX,
  }

  const blink = avgBlend(blendshapes, BLENDSHAPES.blink)
  const wide = avgBlend(blendshapes, BLENDSHAPES.wide)
  const expression: Record<ExpressionKey, number> = {
    smile: Number.isFinite(smile) ? clamp01(smile) : NaN,
    mouthOpen: clamp01(avgBlend(blendshapes, BLENDSHAPES.mouthOpen)),
    browRaise: clamp01(avgBlend(blendshapes, BLENDSHAPES.browRaise)),
    eyeOpen: Number.isFinite(blink) ? clamp01(1 - blink + (Number.isFinite(wide) ? wide * 0.5 : 0)) : NaN,
  }

  const cues: Cues = {
    beardCoverage,
    beardDarkening,
    beardChin: chinN ? chinHit / chinN : 0,
    beardSides: sideN ? sideHit / sideN : 0,
    beardBelowChin,
    mustacheCoverage,
    glassesEdges,
    darkLenses,
    headCover: Number.isFinite(headCoverFrac) ? headCoverFrac : 0,
    sideCover: Number.isFinite(sideCoverFrac) ? sideCoverFrac : 0,
    earAccessory: Number.isFinite(earAcc) ? clamp01(earAcc * 8) : 0,
    headphoneBand: Number.isFinite(earBand) && Number.isFinite(topBand) ? clamp01(Math.min(earBand, topBand + earBand * 0.5) * 4) : 0,
    neckAccessory: Number.isFinite(neckAcc) ? clamp01(neckAcc * 6) : 0,
    spotDensity,
    linerScore,
    lidShadowScore,
    hairCoherence,
    hairRoughness,
    hairTopWidth,
    hairSideRatio,
    bangsAsymmetry: Number.isFinite(coverL) && Number.isFinite(coverR) ? coverR - coverL : 0,
    bangsCentre: Number.isFinite(coverC) ? coverC : NaN,
    partStrength,
    hairlineHeight,
    hairTipLift,
    hairSecondShare,
    hairSecondDelta,
    hairClipped: hairAtBottomEdge,
    shoulderSkin: Number.isFinite(shoulderSkin) ? shoulderSkin : NaN,
    neckCover: Number.isFinite(neckCover) ? neckCover : NaN,
    clothesShare: Number.isFinite(clothesShare) ? clothesShare : 0,
    templeRatio: Math.abs(h(LM.templeL).x - h(LM.templeR).x) / faceW,
    eyeAspect: (d3(LM.eyeRTop, LM.eyeRBottom) / Math.max(1e-3, d3(LM.eyeROuter, LM.eyeRInner)) + d3(LM.eyeLTop, LM.eyeLBottom) / Math.max(1e-3, d3(LM.eyeLOuter, LM.eyeLInner))) / 2,
  }

  // Brightness of the analysed image (sRGB mean luminance).
  let lumSum = 0
  let lumN = 0
  for (let k = 0; k < W * H; k += 7) {
    const o = k * 4
    lumSum += (0.2126 * D[o] + 0.7152 * D[o + 1] + 0.0722 * D[o + 2]) / 255
    lumN++
  }

  regions.lips = lipsOutF.map((p) => Finv(p.x, p.y))

  const measured: Measured = {
    colors: colors as Measured['colors'],
    geometry,
    hair: hairOut,
    expression,
    cues,
    lighting: { gain: [gain[0], gain[1], gain[2]], exposure: correction.exposure, confidence: correction.confidence, sources: correction.sources, brightness: lumN ? lumSum / lumN : 0 },
    pose,
  }
  stats.skinL = colors.skin?.lab[0] ?? NaN
  stats.spots = spotDensity
  stats.liner = linerScore
  stats.lidShadow = lidShadowScore
  return { measured, debug: { correction, counts, stats, regions } }
}

/** Mean sRGB luminance (0..1) of an image, subsampled. */
export function meanBrightness(img: PixelImage): number {
  let s = 0
  let n = 0
  for (let k = 0; k < img.width * img.height; k += 11) {
    const o = k * 4
    s += (0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]) / 255
    n++
  }
  return n ? s / n : 0
}
