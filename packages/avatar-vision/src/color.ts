/* Fast numeric colour maths for pixel statistics: sRGB bytes ↔ linear RGB ↔ OKLab, robust
 * (trimmed) colour estimates, a tiny deterministic k-means, and the white-balance /
 * exposure correction. Pure: no DOM, unit-tested in Node. The engine's `colors` helpers
 * work on hex strings and are used for final DNA colours. */

export type Lab = [number, number, number]
export type RGB = [number, number, number]

const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const v = i / 255
  LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** sRGB byte → linear 0..1 (table lookup). */
export const toLinear = (byte: number): number => LIN[byte & 255]

export function fromLinear(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
}

/** Linear RGB → OKLab. */
export function linToLab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b))
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b))
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b))
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLab → linear RGB (may be out of 0..1). */
export function labToLin(L: number, a: number, b: number): RGB {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const hx = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')

/** OKLab → #rrggbb; out-of-gamut colours keep L and hue and lose chroma. */
export function labToHex(lab: Lab): string {
  let [L, a, b] = lab
  L = Math.min(1, Math.max(0, L))
  let lin = labToLin(L, a, b)
  const ok = (v: RGB) => v.every((c) => c >= -1e-4 && c <= 1.0001)
  if (!ok(lin)) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const k = (lo + hi) / 2
      if (ok(labToLin(L, a * k, b * k))) lo = k
      else hi = k
    }
    lin = labToLin(L, a * lo, b * lo)
  }
  return `#${hx(fromLinear(lin[0]))}${hx(fromLinear(lin[1]))}${hx(fromLinear(lin[2]))}`
}

export function hexToLab(hex: string): Lab {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x808080
  return linToLab(toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255))
}

export const chroma = (lab: Lab): number => Math.hypot(lab[1], lab[2])
export const hueDeg = (lab: Lab): number => ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360
export const deltaE = (p: Lab, q: Lab): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/** Scales chroma (saturation) and shifts lightness in OKLab. */
export function stylize(lab: Lab, chromaK: number, dL = 0, minL = 0, maxL = 1): Lab {
  return [Math.min(maxL, Math.max(minL, lab[0] + dL)), lab[1] * chromaK, lab[2] * chromaK]
}

/* ---- White balance and exposure ------------------------------------------------------ */

/** Per-channel gains in linear light (white balance × exposure). */
export interface Correction {
  gain: RGB
  /** The exposure part alone (already folded into `gain`). */
  exposure: number
  /** 0..1: how much evidence the estimate had (0 = identity). */
  confidence: number
  /** Where the estimate came from, for notes. */
  sources: string[]
}

export const IDENTITY: Correction = { gain: [1, 1, 1], exposure: 1, confidence: 0, sources: [] }

/** Largest per-channel white-balance gain relative to green, and the exposure clamp: the
 *  correction can fix a warm/cool cast but can't invent colours. */
export const WB_LIMIT = 1.22
/** Casts smaller than this (per channel, relative to green) are not corrected. */
export const WB_DEAD_ZONE = 0.03
export const EXPOSURE_LIMITS: [number, number] = [0.85, 1.25]
/** Eye-white lightness (OKLab L, bright part) treated as correctly exposed. Lids and lashes
 *  shade the sclera, so it rarely reads as pure white: only clear under/over-exposure outside
 *  this band is corrected, and only up to its edge. */
export const SCLERA_OK: [number, number] = [0.66, 0.97]

/**
 * Estimates the illuminant from near-neutral pixels. `neutral` holds linear RGB triples of
 * pixels believed achromatic (sclera, grey/white clothing or background): the gains make
 * their average grey. `scleraL` (OKLab L of the bright part of the eye whites, if seen)
 * sets exposure, but only outside the SCLERA_OK band. Skin never drives exposure, so a
 * darker or lighter skin tone is never "corrected" toward some average.
 */
export function estimateCorrection(neutral: Float32Array, count: number, scleraL: number | null, scleraCount: number): Correction {
  const sources: string[] = []
  let gain: RGB = [1, 1, 1]
  let confidence = 0
  if (count >= 40) {
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < count; i++) {
      r += neutral[i * 3]
      g += neutral[i * 3 + 1]
      b += neutral[i * 3 + 2]
    }
    r /= count
    g /= count
    b /= count
    if (r > 1e-3 && g > 1e-3 && b > 1e-3) {
      const clamp = (v: number) => Math.min(WB_LIMIT, Math.max(1 / WB_LIMIT, v))
      // Normalize to green so white balance doesn't change brightness much.
      const raw: RGB = [clamp(g / r), 1, clamp(g / b)]
      confidence = Math.min(1, count / 800)
      // Partial correction: neutral-looking pixels may really be faintly coloured. Casts
      // within WB_DEAD_ZONE are left alone (graded backgrounds and tinted clothes are poor
      // neutrals, and most photos need no correction); larger ones are corrected beyond it.
      const k = 0.8 * confidence
      const soft = (v: number) => 1 + Math.sign(v - 1) * Math.max(0, Math.abs(v - 1) - WB_DEAD_ZONE) * k
      gain = [soft(raw[0]), 1, soft(raw[2])]
      if (gain[0] !== 1 || gain[2] !== 1) sources.push('neutral')
    }
  }
  let exposure = 1
  if (scleraL !== null && scleraCount >= 12) {
    // OKLab L is ~ cube root of luminance: luminance ratio = (target/measured)^3.
    const [lo, hi] = SCLERA_OK
    const ratio = scleraL < lo ? Math.pow(lo / Math.max(0.3, scleraL), 3) : scleraL > hi ? Math.pow(hi / scleraL, 3) : 1
    const k = Math.min(1, scleraCount / 120) * 0.6
    exposure = Math.min(EXPOSURE_LIMITS[1], Math.max(EXPOSURE_LIMITS[0], 1 + (ratio - 1) * k))
    if (Math.abs(exposure - 1) > 0.02) sources.push('sclera')
    confidence = Math.max(confidence, k)
  }
  return { gain: [gain[0] * exposure, gain[1] * exposure, gain[2] * exposure], exposure, confidence, sources }
}

/* ---- Robust colour from a pixel sample ------------------------------------------------ */

export interface SampleOptions {
  /** Drop pixels below this lightness percentile (deep shadows, lashes, pupils). */
  lowPct?: number
  /** Drop pixels above this lightness percentile (specular highlights). */
  highPct?: number
  /** Lightness percentile to report (after trimming); chroma/hue come from the trimmed median. */
  lPct?: number
}

export interface RobustColor {
  lab: Lab
  /** Pixels that survived trimming. */
  n: number
  /** Spread of L among kept pixels (interquartile range). */
  spread: number
}

function quantile(sorted: Float32Array | number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = Math.min(sorted.length - 1, Math.max(0, q * (sorted.length - 1)))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function median(values: number[]): number {
  if (!values.length) return NaN
  const s = values.slice().sort((a, b) => a - b)
  return quantile(s, 0.5)
}

export { quantile }

/**
 * A representative colour for pixels given as OKLab triples: trims by lightness
 * percentiles (shadows and speculars), then takes the lightness at `lPct` and the
 * component-wise median of a and b among the kept pixels.
 */
export function robustColor(labs: Float32Array, count: number, o: SampleOptions = {}): RobustColor | null {
  if (count < 1) return null
  const low = o.lowPct ?? 0.15
  const high = o.highPct ?? 0.9
  const Ls = new Float32Array(count)
  for (let i = 0; i < count; i++) Ls[i] = labs[i * 3]
  Ls.sort()
  const lo = quantile(Ls, low)
  const hi = quantile(Ls, high)
  const keptL: number[] = []
  const as: number[] = []
  const bs: number[] = []
  for (let i = 0; i < count; i++) {
    const L = labs[i * 3]
    if (L < lo || L > hi) continue
    keptL.push(L)
    as.push(labs[i * 3 + 1])
    bs.push(labs[i * 3 + 2])
  }
  if (!keptL.length) return null
  keptL.sort((a, b) => a - b)
  const lab: Lab = [quantile(keptL, o.lPct ?? 0.5), median(as), median(bs)]
  return { lab, n: keptL.length, spread: quantile(keptL, 0.75) - quantile(keptL, 0.25) }
}

/* ---- k-means in OKLab (deterministic) -------------------------------------------------- */

export interface Cluster {
  lab: Lab
  share: number
  n: number
}

/**
 * k-means over OKLab triples with deterministic farthest-point initialisation (seeded by
 * the median pixel), a fixed iteration count and optional subsampling. Returns clusters
 * sorted by size, largest first.
 */
export function kmeans(labs: Float32Array, count: number, k: number, iterations = 12, maxPoints = 6000): Cluster[] {
  if (count === 0) return []
  const stride = Math.max(1, Math.floor(count / maxPoints))
  const idx: number[] = []
  for (let i = 0; i < count; i += stride) idx.push(i)
  const n = idx.length
  k = Math.max(1, Math.min(k, n))
  // Weight lightness less than chroma: shading changes L far more than it changes the dye.
  const W = [0.6, 1, 1]
  const dist2 = (i: number, c: Lab) => {
    const o = idx[i] * 3
    const dl = (labs[o] - c[0]) * W[0]
    const da = labs[o + 1] - c[1]
    const db = labs[o + 2] - c[2]
    return dl * dl + da * da + db * db
  }
  // Init: the component-wise median, then farthest points.
  const med: Lab = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) med[ch] = median(idx.map((i) => labs[i * 3 + ch]))
  const centres: Lab[] = [med]
  while (centres.length < k) {
    let best = -1
    let bestD = -1
    for (let i = 0; i < n; i++) {
      let dmin = Infinity
      for (const c of centres) dmin = Math.min(dmin, dist2(i, c))
      if (dmin > bestD) {
        bestD = dmin
        best = i
      }
    }
    const o = idx[best] * 3
    centres.push([labs[o], labs[o + 1], labs[o + 2]])
  }
  const assign = new Int32Array(n)
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let bi = 0
      let bd = Infinity
      for (let c = 0; c < centres.length; c++) {
        const d = dist2(i, centres[c])
        if (d < bd) {
          bd = d
          bi = c
        }
      }
      assign[i] = bi
    }
    const sums = centres.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const s = sums[assign[i]]
      const o = idx[i] * 3
      s[0] += labs[o]
      s[1] += labs[o + 1]
      s[2] += labs[o + 2]
      s[3]++
    }
    for (let c = 0; c < centres.length; c++) if (sums[c][3] > 0) centres[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]]
  }
  const counts = new Array(centres.length).fill(0)
  for (let i = 0; i < n; i++) counts[assign[i]]++
  return centres
    .map((lab, c) => ({ lab, n: counts[c] * stride, share: counts[c] / n }))
    .filter((c) => c.n > 0)
    .sort((p, q) => q.n - p.n)
}
