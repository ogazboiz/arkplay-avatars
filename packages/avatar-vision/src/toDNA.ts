/* Layer 4, mapping: measurements + attribute probabilities → avatar DNA and alternative
 * candidates. PURE (no DOM, no randomness): the same analysis always gives the same DNA,
 * and every result goes through `normalizeDNA`, so it validates and round-trips.
 *
 * - Colours go straight into params with a light stylization (calibration.ts STYLIZE).
 * - Geometry maps through calibrated percentile curves (calibration.ts GEOMETRY).
 * - Hair: every HAIR_STYLES option is scored against the predicted hair heads with the
 *   signature table below; the winner's length, volume, curl, bangs, part, hairline and
 *   highlights are then tuned to the prediction.
 * - Facial hair, eyewear, headwear, earrings, headphones, necklace, freckles, eye makeup
 *   and the top garment map to the schema's item ids.
 * - Body params, age and everything not seen in the photo stay at their defaults. There is
 *   no inference of gender, ethnicity, age, body size, health or identity.
 *
 * Sides: taxonomy `hair_part` classes and DNA `hair.part` both name the SUBJECT's side.
 * The measured `partX` is in image space (+ = image right = the subject's left). A
 * mirrored photo swaps both. */

import {
  HAIR_STYLES,
  addItem,
  defaultDNA,
  hashString,
  normalizeDNA,
  removeItemById,
  setItemParam,
  setParam,
  type AvatarDNA,
} from '@arkplay/avatar-engine'
import { GEOMETRY, ITEM_THRESHOLD, STYLIZE, type Curve } from './calibration.ts'
import { deltaE, labToHex, stylize, type Lab } from './color.ts'
import { headSpec } from './taxonomy.ts'
import type { AvatarInput, MeasuredColor } from './types.ts'

export interface Candidate {
  dna: AvatarDNA
  label: string
  /** 0..1, relative plausibility of this candidate's uncertain choices. */
  confidence: number
}

export interface PhotoAvatars {
  best: AvatarDNA
  candidates: Candidate[]
  notes: string[]
}

export interface PhotoToAvatarsOptions {
  /** DNA seed (procedural detail). Default: derived from the measurements. */
  seed?: number
  /** Number of candidates including the best (default 4). */
  count?: number
}

/* ---- Numeric helpers --------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const r3 = (v: number): number => Math.round(v * 1000) / 1000

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/** Population percentile (0..1) of a raw measurement through its calibration curve. */
export function percentile(value: number, c: Curve): number {
  if (!Number.isFinite(value)) return 0.5
  const z = value >= c.p50 ? (1.645 * (value - c.p50)) / Math.max(1e-9, c.p95 - c.p50) : (1.645 * (value - c.p50)) / Math.max(1e-9, c.p50 - c.p05)
  return phi(z)
}

const argmax = (p: readonly number[]): number => p.reduce((bi, v, i) => (v > p[bi] ? i : bi), 0)

function probsOf(input: AvatarInput, head: string): number[] {
  const spec = headSpec(head)
  const p = input.attributes.heads[head]
  if (!p || p.length !== spec.classes.length || p.some((v) => !Number.isFinite(v))) return spec.classes.map(() => 1 / spec.classes.length)
  const s = p.reduce((a, b) => a + Math.max(0, b), 0)
  return s > 0 ? p.map((v) => Math.max(0, v) / s) : spec.classes.map(() => 1 / spec.classes.length)
}

const probOf = (input: AvatarInput, head: string, cls: string): number => probsOf(input, head)[headSpec(head).classes.indexOf(cls)] ?? 0
const confOf = (input: AvatarInput, head: string): number => clamp(input.attributes.confidence[head] ?? 0.3, 0, 1)

/** Probabilities with the subject's left/right swapped when the photo is mirrored. */
function sided(input: AvatarInput, head: string): number[] {
  const p = probsOf(input, head)
  if (!input.mirrored) return p
  const cls = headSpec(head).classes
  const l = cls.indexOf('left')
  const r = cls.indexOf('right')
  if (l < 0 || r < 0) return p
  const out = p.slice()
  out[l] = p[r]
  out[r] = p[l]
  return out
}

/* ---- Colour ------------------------------------------------------------------------------ */

type StyleKey = keyof typeof STYLIZE.minConfidence

function styled(c: MeasuredColor | undefined, key: StyleKey): string | null {
  if (!c || c.confidence < STYLIZE.minConfidence[key]) return null
  const s = STYLIZE[key]
  // Near-grey colours (grey hair, black clothes) keep their neutrality.
  const k = Math.hypot(c.lab[1], c.lab[2]) < 0.02 ? 1 : s.chroma
  return labToHex(stylize(c.lab, k, 0, s.minL, s.maxL))
}

const trimOf = (hex: string, lab: Lab): string => labToHex([clamp(lab[0] + (lab[0] > 0.5 ? -0.12 : 0.12), 0.1, 0.95), lab[1] * 0.9, lab[2] * 0.9]) || hex

/* ---- Hairstyle signatures ------------------------------------------------------------------- */

// hair_length class indices: bald 0, buzz 1, short 2, ear 3, chin 4, shoulder 5, chest 6, waist 7
type Tex = readonly [number, number, number, number] // straight, wavy, curly, coily
const STRAIGHT: Tex = [1, 0.55, 0.2, 0.08]
const WAVY: Tex = [0.45, 1, 0.6, 0.2]
const CURLY: Tex = [0.12, 0.5, 1, 0.8]
const COILY: Tex = [0.05, 0.2, 0.8, 1]
const SHORT_ANY: Tex = [1, 0.9, 0.65, 0.5]
const ANY: Tex = [1, 1, 1, 1]

interface Signature {
  /** Compatible hair_length indices [lo, hi] and the length the style draws at length 0.5. */
  len: readonly [number, number]
  nominal: number
  tex: Tex
  /** hair_arrangement class this style shows. */
  arr: string
  sides: 'natural' | 'undercut' | 'mohawk'
  /** Preferred hair_top classes (first = best). */
  top?: readonly string[]
  /** The recipe's own bangs, as a taxonomy `bangs` class. */
  bangs: 'none' | 'straight' | 'side' | 'curtain' | 'wispy'
  /** The recipe's own part (subject's side). */
  part: 'none' | 'left' | 'center' | 'right'
  /** The recipe's base curl, and whether it is slicked (the engine subtracts 0.2 curl). */
  curl: number
  slick?: boolean
  /** How common the look is in everyday photos (the style prior; 1 = common). */
  prior: number
}

const S = (len: [number, number], nominal: number, tex: Tex, bangs: Signature['bangs'], part: Signature['part'], curl: number, extra: Partial<Signature> = {}): Signature => ({
  len,
  nominal,
  tex,
  arr: 'down',
  sides: 'natural',
  bangs,
  part,
  curl,
  prior: 0.5,
  ...extra,
})

/** One row per HAIR_STYLES option (a test checks the table covers them all). Bangs, part
 *  and curl mirror the engine's hair recipes (parts/humanoid/hair.ts RECIPES). */
export const HAIR_SIGNATURES: Record<string, Signature> = {
  bald: S([0, 0], 0, ANY, 'none', 'none', 0, { prior: 0.3 }),
  buzz: S([1, 1], 1, ANY, 'none', 'none', 0, { prior: 0.6 }),
  crew: S([2, 2], 2, SHORT_ANY, 'none', 'none', 0, { prior: 1.0 }),
  'short-messy': S([2, 3], 2, SHORT_ANY, 'wispy', 'none', 0, { top: ['messy', 'natural'], prior: 0.8 }),
  spiky: S([2, 3], 2, STRAIGHT, 'wispy', 'none', 0, { top: ['spiky', 'messy'], prior: 0.2 }),
  'side-part': S([2, 3], 2, STRAIGHT, 'side', 'left', 0, { top: ['side-swept', 'natural'], prior: 0.9 }),
  quiff: S([2, 2], 2, SHORT_ANY, 'none', 'none', 0, { top: ['quiff'], prior: 0.5 }),
  pompadour: S([2, 3], 2, STRAIGHT, 'none', 'none', 0, { top: ['quiff', 'slicked-back'], prior: 0.2 }),
  slick: S([2, 3], 2, STRAIGHT, 'none', 'none', 0, { top: ['slicked-back'], prior: 0.35 }),
  mohawk: S([1, 3], 2, ANY, 'none', 'none', 0, { sides: 'mohawk', top: ['spiky', 'natural'], prior: 0.06 }),
  undercut: S([2, 3], 2, STRAIGHT, 'side', 'left', 0, { sides: 'undercut', top: ['side-swept', 'natural'], prior: 0.3 }),
  bowl: S([2, 3], 3, STRAIGHT, 'straight', 'none', 0, { prior: 0.1 }),
  'curly-top': S([2, 2], 2, CURLY, 'wispy', 'none', 0.75, { top: ['natural', 'messy'], prior: 0.5 }),
  afro: S([2, 5], 3, COILY, 'none', 'none', 1, { arr: 'afro', prior: 0.4 }),
  'afro-puffs': S([2, 6], 4, COILY, 'none', 'center', 0.9, { arr: 'afro-puffs', slick: true, prior: 0.15 }),
  twists: S([2, 6], 4, COILY, 'none', 'none', 0.4, { arr: 'twists', prior: 0.2 }),
  cornrows: S([2, 7], 3, ANY, 'none', 'none', 0, { arr: 'cornrows', slick: true, prior: 0.15 }),
  locs: S([4, 7], 5, ANY, 'none', 'none', 0, { arr: 'locs', prior: 0.25 }),
  'box-braids': S([4, 7], 6, ANY, 'none', 'center', 0, { arr: 'box-braids', prior: 0.25 }),
  pixie: S([2, 3], 2, WAVY, 'side', 'right', 0, { prior: 0.4 }),
  bob: S([3, 4], 4, STRAIGHT, 'straight', 'none', 0, { prior: 0.7 }),
  'wavy-bob': S([3, 4], 4, WAVY, 'side', 'none', 0.45, { prior: 0.5 }),
  lob: S([4, 5], 5, STRAIGHT, 'curtain', 'center', 0, { prior: 0.7 }),
  shag: S([4, 5], 4, WAVY, 'curtain', 'none', 0.3, { top: ['messy', 'natural'], prior: 0.3 }),
  wolf: S([4, 5], 4, WAVY, 'wispy', 'none', 0, { top: ['messy', 'spiky'], prior: 0.2 }),
  mullet: S([3, 5], 4, SHORT_ANY, 'wispy', 'none', 0, { top: ['natural', 'messy'], prior: 0.08 }),
  curtains: S([3, 5], 4, STRAIGHT, 'curtain', 'center', 0, { prior: 0.5 }),
  emo: S([3, 4], 4, STRAIGHT, 'side', 'right', 0, { top: ['side-swept'], prior: 0.12 }),
  long: S([5, 7], 6, STRAIGHT, 'none', 'center', 0, { prior: 1.0 }),
  'long-wavy': S([5, 7], 6, WAVY, 'curtain', 'center', 0.5, { prior: 0.9 }),
  'long-curly': S([5, 7], 6, CURLY, 'none', 'center', 0.85, { prior: 0.6 }),
  hime: S([6, 7], 7, STRAIGHT, 'straight', 'none', 0, { prior: 0.1 }),
  ringlets: S([5, 6], 6, CURLY, 'side', 'none', 0.6, { prior: 0.15 }),
  ponytail: S([3, 7], 5, ANY, 'side', 'left', 0, { arr: 'ponytail', slick: true, prior: 0.6 }),
  'high-pony': S([3, 7], 5, ANY, 'wispy', 'none', 0, { arr: 'high-ponytail', slick: true, prior: 0.3 }),
  twintails: S([3, 7], 5, ANY, 'wispy', 'center', 0, { arr: 'two-ponytails', prior: 0.06 }),
  bun: S([3, 7], 5, ANY, 'none', 'none', 0, { arr: 'bun', slick: true, prior: 0.4 }),
  'space-buns': S([3, 7], 5, ANY, 'straight', 'center', 0, { arr: 'two-buns', prior: 0.05 }),
  'man-bun': S([3, 6], 4, ANY, 'none', 'none', 0, { arr: 'top-knot', slick: true, prior: 0.15 }),
  braid: S([4, 7], 6, ANY, 'side', 'right', 0, { arr: 'braid', prior: 0.2 }),
  'twin-braids': S([4, 7], 6, ANY, 'curtain', 'center', 0, { arr: 'two-braids', prior: 0.12 }),
}

/** How much each hair head counts when scoring styles (× 0.3 + 0.7·confidence). Bangs and part
 *  count little: hairParams overrides a recipe's own bangs and part when the prediction is clear. */
export const HAIR_HEAD_WEIGHTS = { hair_length: 2, hair_arrangement: 1.5, hair_texture: 1.3, hair_top: 0.9, hair_sides: 0.6, bangs: 0.4, hair_part: 0.25 } as const
const STYLE_PRIOR_WEIGHT = 0.6
/** Weight of the measured silhouette (hair hanging beside the face or not) in style scoring. */
const SILHOUETTE_WEIGHT = 1.0

/** Headwear that holds all the hair inside. */
const FULL_COVER = new Set(['hijab', 'turban', 'headwrap', 'durag', 'hood'])

/** Arrangements that pull the hair up or back: nothing hangs beside the face. */
const UPDOS = new Set(['ponytail', 'high-ponytail', 'bun', 'top-knot', 'two-buns', 'afro-puffs', 'cornrows'])
/** Whether a style shows hair beside the face below the ears: 1 yes, 0 no, 0.5 either. */
const hangsOf = (sig: Signature): number => (UPDOS.has(sig.arr) || sig.len[1] <= 3 ? 0 : sig.arr === 'down' || sig.arr === 'afro' || sig.arr === 'locs' || sig.arr === 'twists' || sig.arr === 'box-braids' ? 1 : 0.5)

/** The measured silhouette: how clearly hair hangs beside the face below the ears (0..1), and
 *  how much that reading counts (0 when little hair is visible). */
function hangEvidence(input: AvatarInput): { hang: number; weight: number } {
  const h = input.measured.hair
  const area = Number.isFinite(h.hairArea) ? h.hairArea : 0
  const weight = clamp((area - 0.2) / 0.4, 0, 1)
  const hang = Number.isFinite(h.hairBottom) ? 1 / (1 + Math.exp(-(h.hairBottom + 0.2) / 0.08)) : 0
  return { hang, weight }
}

function compatVector(head: string, sig: Signature): number[] {
  const cls = headSpec(head).classes
  switch (head) {
    case 'hair_length':
      return cls.map((_, i) => (i >= sig.len[0] && i <= sig.len[1] ? 1 : Math.max(0.02, Math.pow(0.3, i < sig.len[0] ? sig.len[0] - i : i - sig.len[1]))))
    case 'hair_texture':
      return [...sig.tex]
    case 'hair_arrangement':
      return cls.map((c) => (c === sig.arr ? 1 : sig.arr === 'down' && (c === 'afro' || c === 'afro-puffs') ? 0.04 : 0.03))
    case 'hair_sides':
      // Shaved sides need evidence: natural hair is a poor match for undercuts and mohawks.
      return cls.map((c) => (c === sig.sides ? 1 : sig.sides === 'natural' ? (c === 'undercut' ? 0.35 : 0.05) : c === 'natural' ? (sig.sides === 'mohawk' ? 0.08 : 0.25) : 0.4))
    case 'hair_top': {
      const pref = sig.top ?? ['natural']
      return cls.map((c) => (c === pref[0] ? 1 : pref.includes(c) ? 0.8 : c === 'natural' ? 0.7 : 0.45))
    }
    case 'bangs':
      return cls.map((c) => (c === sig.bangs ? 1 : 0.45))
    case 'hair_part':
      return cls.map((c) => (c === sig.part ? 1 : 0.6))
    default:
      return cls.map(() => 1)
  }
}

export interface StyleScore {
  id: string
  label: string
  score: number
  /** Softmax share among all styles. */
  p: number
}

/** Scores every HAIR_STYLES option against the predicted hair heads, best first. */
export function rankHairStyles(input: AvatarInput): StyleScore[] {
  const heads = Object.keys(HAIR_HEAD_WEIGHTS) as (keyof typeof HAIR_HEAD_WEIGHTS)[]
  const probs = Object.fromEntries(heads.map((h) => [h, h === 'hair_part' ? sided(input, h) : probsOf(input, h)]))
  // Headwear hides the hair: what the mask saw says little about its length, so blend the
  // length toward a broad prior (short … chest) instead of reading "bald". The model sees the
  // hair below a hat (it was trained on hats with visible hair), so its length is kept more.
  // Hoods, wraps, turbans, hijabs and durags hold all the hair inside (when little hair shows):
  // then a short cut, so no hair pokes out of the cover.
  const hw = present(input, 'headwear')
  const covered = hw.p
  const hidden = covered >= 0.5 && FULL_COVER.has(hw.cls) && !((input.measured.hair.hairArea ?? 0) >= 0.3)
  if (covered >= 0.35) {
    const prior = hidden ? [0, 0.05, 0.6, 0.25, 0.1, 0, 0, 0] : [0, 0, 0.25, 0.2, 0.2, 0.2, 0.15, 0]
    const fromModel = (input.attributes.headSource?.hair_length ?? 'heuristic') !== 'heuristic'
    const w = covered * (fromModel && !hidden ? 0.3 : 1)
    probs.hair_length = probs.hair_length.map((p: number, i: number) => p * (1 - w) + prior[i] * w)
  }
  const sil = hidden ? { hang: 0, weight: 0 } : hangEvidence(input)
  const scored = HAIR_STYLES.map((opt) => {
    const sig = HAIR_SIGNATURES[opt.id]
    let score = sig ? STYLE_PRIOR_WEIGHT * Math.log(sig.prior) : 0
    if (sig) {
      for (const h of heads) {
        const comp = compatVector(h, sig)
        const m = probs[h].reduce((a, p, i) => a + p * comp[i], 0)
        score += HAIR_HEAD_WEIGHTS[h] * (0.3 + 0.7 * confOf(input, h)) * Math.log(0.02 + m)
      }
      // Silhouette: hanging hair vs a style that hangs (updos and short cuts don't).
      const hs = hangsOf(sig)
      const m = sil.hang * (hs * 1 + (1 - hs) * 0.25) + (1 - sil.hang) * (hs * 0.35 + (1 - hs) * 1)
      score += SILHOUETTE_WEIGHT * sil.weight * Math.log(0.02 + m)
    } else score -= 100
    return { id: opt.id, label: opt.label, score }
  })
  const max = Math.max(...scored.map((s) => s.score))
  const z = scored.reduce((a, s) => a + Math.exp(s.score - max), 0)
  return scored
    .map((s) => ({ ...s, score: r3(s.score), p: r3(Math.exp(s.score - max) / z) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

/* ---- Face features ---------------------------------------------------------------------------- */

interface Ranked {
  id: string
  score: number
}
const rank = (scores: Record<string, number>): Ranked[] =>
  Object.entries(scores)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

function pctOf(input: AvatarInput, key: string): number {
  const cal = GEOMETRY[key]
  const g = input.measured.geometry as unknown as Record<string, number>
  const v = key in g ? g[key] : (input.measured.cues as unknown as Record<string, number>)[key]
  return cal ? percentile(v, cal) : 0.5
}

export function rankEyeStyles(input: AvatarInput): Ranked[] {
  const e = input.measured.expression
  const open = Number.isFinite(e.eyeOpen) ? e.eyeOpen : 1
  const smile = Number.isFinite(e.smile) ? e.smile : 0
  // Squinting (smiles, blinks) makes eyes look narrower than their shape; 1 for a relaxed
  // face (eyes ~0.9 open, a slight smile), the state the eyeAspect curve is calibrated on.
  const openK = clamp(1 + 0.5 * (open - 0.9) - 0.12 * (smile - 0.2), 0.6, 1.15)
  const aspect = percentile(input.measured.cues.eyeAspect / openK, GEOMETRY.eyeAspect) - 0.5
  const tilt = pctOf(input, 'eyeTilt') - 0.5
  const size = pctOf(input, 'eyeSize') - 0.5
  return rank({
    almond: 0.25 - Math.abs(aspect) * 0.5 - Math.abs(tilt) * 0.5,
    round: aspect * 1.2 - 0.1,
    narrow: -aspect * 1.2 - 0.1,
    upturned: tilt * 1.3 - 0.15,
    downturned: -tilt * 1.3 - 0.15,
    big: size * 1.0 + aspect * 0.5 - 0.3,
  })
}

function browStyle(input: AvatarInput): string {
  const arch = pctOf(input, 'browArch')
  const thick = pctOf(input, 'browThickness')
  return rank({
    natural: 0.3 - Math.abs(arch - 0.5) * 0.4 - Math.abs(thick - 0.5) * 0.3,
    soft: (arch - 0.5) * 0.8 + 0.05,
    arched: (arch - 0.5) * 1.4 - 0.2,
    straight: (0.5 - arch) * 1.4 - 0.15,
    thick: (thick - 0.5) * 1.2 - 0.25,
    thin: (0.5 - thick) * 1.2 - 0.25,
    bushy: (thick - 0.5) * 1.4 - 0.4,
  })[0].id
}

function noseStyle(input: AvatarInput): string {
  const w = pctOf(input, 'noseWidth')
  const l = pctOf(input, 'noseLength')
  return rank({ button: 0.25, wide: (w - 0.5) * 1.4 - 0.2, straight: (l - 0.5) * 1.0 + (0.5 - w) * 0.5 - 0.1, round: (w - 0.5) * 0.6 + (0.5 - l) * 0.6 - 0.1 })[0].id
}

function mouthStyle(input: AvatarInput): string {
  const lips = pctOf(input, 'lipFullness')
  const w = pctOf(input, 'mouthWidth')
  return rank({ default: 0.25, full: (lips - 0.5) * 1.4 - 0.2, thin: (0.5 - lips) * 1.4 - 0.2, wide: (w - 0.5) * 1.4 - 0.25, small: (0.5 - w) * 1.4 - 0.25 })[0].id
}

function faceShape(input: AvatarInput): string {
  const W = pctOf(input, 'faceWidthRatio') - 0.5
  const J = pctOf(input, 'jawRatio') - 0.5
  const C = pctOf(input, 'chinRatio') - 0.5
  const T = pctOf(input, 'templeRatio') - 0.5
  const K = pctOf(input, 'cheekFullness') - 0.5
  return rank({
    oval: 0.3 - 0.3 * (Math.abs(W) + Math.abs(J) + Math.abs(C)),
    round: W * 1.0 + K * 0.6 - C * 0.6 - J * 0.2 - 0.2,
    square: W * 0.8 + J * 1.2 - 0.25,
    long: -W * 1.2 + C * 0.6 - 0.2,
    heart: T * 0.8 - J * 1.0 - 0.25,
    diamond: -T * 0.8 - J * 0.6 + W * 0.4 - 0.3,
    pear: J * 1.0 - T * 0.8 - 0.3,
    soft: W * 0.4 + J * 0.5 - 0.1,
  })[0].id
}

/* ---- Accessories -------------------------------------------------------------------------------- */

interface Accessory {
  head: string
  cls: string
  /** 1 − p(none). */
  p: number
  label: string
  apply(dna: AvatarDNA): AvatarDNA
}

const EYEWEAR_ITEMS: Record<string, string> = {
  'round-glasses': 'round-glasses',
  'rect-glasses': 'square-glasses',
  'cateye-glasses': 'cateye-glasses',
  'half-rims': 'half-rims',
  sunglasses: 'shades',
  aviators: 'aviators',
}
const HEADWEAR_ITEMS: Record<string, string> = {
  cap: 'cap',
  beanie: 'beanie',
  bucket: 'bucket',
  fedora: 'fedora',
  'cowboy-hat': 'cowboy-hat',
  beret: 'beret',
  hijab: 'hijab',
  turban: 'turban',
  headwrap: 'headwrap',
  durag: 'durag',
  headband: 'headband',
  bandana: 'bandana',
  hood: 'hood',
  kippah: 'kippah',
  visor: 'visor',
}
const EARRING_ITEMS: Record<string, string> = { studs: 'studs', hoops: 'hoops', drops: 'drops' }
const NECKLACE_ITEMS: Record<string, string> = { chain: 'chain', pendant: 'pendant', pearls: 'pearls', choker: 'choker' }
const BEARDS: Record<string, string> = { stubble: 'stubble', goatee: 'goatee', chinstrap: 'chinstrap', short: 'short', full: 'full', long: 'long' }
const MUSTACHES: Record<string, string> = { thin: 'pencil', full: 'chevron', handlebar: 'handlebar' }

/** The most likely non-"none" class of a head and its total non-none probability. */
function present(input: AvatarInput, head: string, none = 'none'): { cls: string; p: number } {
  const p = probsOf(input, head)
  const cls = headSpec(head).classes
  const ni = cls.indexOf(none)
  let bi = -1
  for (let i = 0; i < p.length; i++) if (i !== ni && (bi < 0 || p[i] > p[bi])) bi = i
  // Unrounded: item thresholds must agree with mergeAttributes' presence test.
  return { cls: cls[bi], p: 1 - (ni >= 0 ? p[ni] : 0) }
}

function accessories(input: AvatarInput): Accessory[] {
  const out: Accessory[] = []
  const hw = input.measured.colors.headwear
  const ew = present(input, 'eyewear')
  // Frames: the measured colour, else a dark frame (most glasses; the engine's cat-eye and
  // half-rim defaults are red and brown). Aviators keep their metal.
  const fc = input.measured.colors.eyewear
  const frame: Record<string, string> = ew.cls === 'aviators' ? {} : { color: fc && fc.confidence >= 0.2 ? labToHex(stylize(fc.lab, 1.05, 0, 0.1, 0.9)) : '#26252c' }
  if (EYEWEAR_ITEMS[ew.cls]) out.push({ head: 'eyewear', cls: ew.cls, p: ew.p, label: 'glasses', apply: (d) => addItem(d, EYEWEAR_ITEMS[ew.cls], frame) })
  const hd = present(input, 'headwear')
  if (HEADWEAR_ITEMS[hd.cls])
    out.push({
      head: 'headwear',
      cls: hd.cls,
      p: hd.p,
      label: 'headwear',
      apply: (d) => {
        const colorParams: Record<string, string> = hw && hw.confidence > 0.2 ? { color: labToHex(stylize(hw.lab, 1.08, 0, 0.12, 0.96)) } : {}
        // A hood with a hoodie on means the hoodie's own hood is up.
        const hoodie = d.outfit.findIndex((i) => i.id === 'hoodie')
        if (hd.cls === 'hood' && hoodie >= 0) return setItemParam(d, 'outfit', hoodie, 'hoodUp', true)
        return addItem(d, HEADWEAR_ITEMS[hd.cls], colorParams)
      },
    })
  const hp = probOf(input, 'headphones', 'yes')
  // Headphones cover the ears (and read as ear accessories to the segmenter).
  const er = present(input, 'earrings')
  if (EARRING_ITEMS[er.cls]) out.push({ head: 'earrings', cls: er.cls, p: r3(er.p * (1 - hp)), label: 'earrings', apply: (d) => addItem(d, EARRING_ITEMS[er.cls]) })
  const hc = input.measured.colors.headphones
  const hpParams: Record<string, string> = hc && hc.confidence >= 0.2 ? { color: labToHex(stylize(hc.lab, 1.1, 0, 0.1, 0.95)), color2: labToHex(stylize(hc.lab, 1.1, hc.lab[0] > 0.5 ? -0.25 : 0.2, 0.1, 0.95)) } : {}
  out.push({ head: 'headphones', cls: 'yes', p: r3(hp), label: 'headphones', apply: (d) => addItem(d, 'headphones', hpParams) })
  const nk = present(input, 'necklace')
  if (NECKLACE_ITEMS[nk.cls]) out.push({ head: 'necklace', cls: nk.cls, p: nk.p, label: 'necklace', apply: (d) => addItem(d, NECKLACE_ITEMS[nk.cls]) })
  return out
}

/* ---- Building one avatar ------------------------------------------------------------------------ */

interface Choice {
  hair: StyleScore
  eyes: string
  /** Accessory heads to force off (true) or on (false→ignored); see `toggled`. */
  toggled: Set<string>
  noAccessories?: boolean
  /** Flip the facial-hair decision (uncertain beards). */
  flipBeard?: boolean
}

function hairParams(input: AvatarInput, style: string): Record<string, string | number> {
  const sig = HAIR_SIGNATURES[style]
  const out: Record<string, string | number> = {}
  const m = input.measured
  if (!sig || style === 'bald') return out
  // Length within the style: expected length class vs the style's nominal length.
  const lp = probsOf(input, 'hair_length')
  const lo = Math.max(2, sig.len[0] - 1)
  let wsum = 0
  let esum = 0
  lp.forEach((p, i) => {
    if (i >= lo) {
      wsum += p
      esum += p * i
    }
  })
  if (style !== 'buzz' && wsum > 0) out.length = r3(clamp(0.5 + (esum / wsum - sig.nominal) * 0.22 * (0.4 + 0.6 * confOf(input, 'hair_length')), 0.15, 0.9))
  // Volume from the silhouette (wider / taller than typical for the length).
  const w = m.hair.hairWidth
  const t = m.hair.hairTopHeight
  if (Number.isFinite(w) && Number.isFinite(t) && w > 0) out.volume = r3(clamp(0.5 + (w - 1.3) * 0.8 + (t - 0.8) * 0.9, 0.15, 0.9))
  // Curl: aim the recipe's curl at the predicted texture.
  const tp = probsOf(input, 'hair_texture')
  const target = tp[0] * 0.05 + tp[1] * 0.4 + tp[2] * 0.7 + tp[3] * 0.95
  const base = sig.curl
  const slick = sig.slick ? 0.2 : 0
  const curl = base >= 0.99 ? 0.2 : (target - base + slick) / ((1 - base) * 0.9)
  out.curl = r3(clamp(curl * (0.4 + 0.6 * confOf(input, 'hair_texture')) + 0.2 * (1 - (0.4 + 0.6 * confOf(input, 'hair_texture'))), 0, 1))
  // Bangs: override the recipe only on a clear prediction.
  const bp = probsOf(input, 'bangs')
  const bi = argmax(bp)
  const bcls = headSpec('bangs').classes[bi]
  if (bp[bi] >= 0.45 && bcls !== sig.bangs) out.bangs = bcls
  // Part (subject's side; mirrored photos are swapped in `sided`).
  const pp = sided(input, 'hair_part')
  const pi = argmax(pp)
  const pcls = headSpec('hair_part').classes[pi]
  if (pcls !== 'none' && pp[pi] >= 0.45 && pcls !== sig.part) out.part = pcls
  // Hairline and messiness.
  const hl = probsOf(input, 'hairline')
  const hc = confOf(input, 'hairline')
  out.hairline = r3(clamp(0.5 + ((hl[2] - hl[0]) * 0.35) * (0.4 + 0.6 * hc), 0.15, 0.85))
  const messy = probOf(input, 'hair_top', 'messy')
  if (messy > 0.3) out.messy = r3(clamp(0.25 + messy * 0.4, 0, 0.7))
  return out
}

function build(input: AvatarInput, seed: number, choice: Choice, accs: Accessory[]): AvatarDNA {
  const m = input.measured
  let dna = defaultDNA('humanoid', seed)
  const set = (section: string, key: string, value: unknown) => {
    dna = setParam(dna, section, key, value)
  }

  // Colours.
  const skin = styled(m.colors.skin, 'skin')
  if (skin) set('skin', 'tone', skin)
  // Hidden hair (hood, wrap): the beard is the best evidence of its colour.
  const hair = styled(m.colors.hair, 'hair') ?? (m.colors.beard && m.colors.beard.confidence >= 0.3 ? styled(m.colors.beard, 'hair') : null)
  if (hair) set('hair', 'color', hair)
  const iris = styled(m.colors.iris, 'iris')
  if (iris) set('eyes', 'iris', iris)
  const lips = styled(m.colors.lips, 'lips')
  if (lips && m.colors.skin && m.colors.lips && deltaE(m.colors.lips.lab, m.colors.skin.lab) >= STYLIZE.lipSkinMinDelta) set('mouth', 'lipColor', lips)
  const brows = styled(m.colors.brows, 'brows')
  if (brows && (!m.colors.hair || !m.colors.brows || deltaE(m.colors.brows.lab, m.colors.hair.lab) > 0.08)) set('brows', 'color', brows)

  // Geometry sliders.
  for (const [key, cal] of Object.entries(GEOMETRY)) {
    if (!cal.section || !cal.key) continue
    let p = pctOf(input, key)
    if (key === 'foreheadRatio' && m.hair.foreheadCoverage > 0.45) p = 0.5
    if (cal.invert) p = 1 - p
    set(cal.section, cal.key, r3(clamp(0.5 + (p - 0.5) * cal.spread, cal.lo, cal.hi)))
  }
  set('head', 'shape', faceShape(input))
  set('eyes', 'style', choice.eyes)
  set('brows', 'style', browStyle(input))
  set('nose', 'style', noseStyle(input))
  set('mouth', 'style', mouthStyle(input))

  // Hair.
  set('hair', 'style', choice.hair.id)
  for (const [k, v] of Object.entries(hairParams(input, choice.hair.id))) set('hair', k, v)
  const cs = probsOf(input, 'hair_color_style')
  const csi = argmax(cs)
  const csCls = headSpec('hair_color_style').classes[csi]
  const second = m.colors.hairSecondary
  if (csCls !== 'solid' && cs[csi] >= 0.4 && choice.hair.id !== 'bald') {
    const hlHex = second ? labToHex(stylize(second.lab, STYLIZE.hair.chroma, 0, STYLIZE.hair.minL, STYLIZE.hair.maxL)) : hair ? labToHex(stylize(m.colors.hair!.lab, 1.1, 0.2, 0.3, 0.95)) : null
    if (hlHex) {
      if (csCls === 'ombre') set('hair', 'tips', hlHex)
      else {
        set('hair', 'highlight', hlHex)
        set('hair', 'streaks', csCls === 'two-tone' ? 0.8 : 0.5)
      }
    }
  }

  // Facial hair.
  const beard = present(input, 'beard')
  const beardOn = (beard.p >= ITEM_THRESHOLD) !== !!choice.flipBeard
  if (beardOn && BEARDS[beard.cls]) {
    set('facialHair', 'beard', BEARDS[beard.cls])
    set('facialHair', 'density', r3(clamp(0.5 + m.cues.beardCoverage * 0.45, 0.4, 0.95)))
    if (beard.cls === 'long') set('facialHair', 'length', 0.75)
    else if (beard.cls === 'full') set('facialHair', 'length', 0.55)
  }
  const must = present(input, 'mustache')
  if ((must.p >= ITEM_THRESHOLD) !== !!choice.flipBeard && MUSTACHES[must.cls]) set('facialHair', 'mustache', MUSTACHES[must.cls])
  const bc = m.colors.beard
  if (bc && (!m.colors.hair || deltaE(bc.lab, m.colors.hair.lab) > 0.12)) {
    const bh = labToHex(stylize(bc.lab, STYLIZE.hair.chroma, 0, STYLIZE.hair.minL, STYLIZE.hair.maxL))
    set('facialHair', 'color', bh)
  }

  // Skin details and eye makeup.
  const fr = probsOf(input, 'freckles')
  const frE = fr[1] * 0.35 + fr[2] * 0.75
  if (fr[0] < 0.5) set('skin', 'freckles', r3(frE))
  const mk = present(input, 'eye_makeup')
  if (mk.p >= ITEM_THRESHOLD) {
    if (mk.cls === 'liner' || mk.cls === 'both') set('eyes', 'liner', 0.5)
    if (mk.cls === 'shadow' || mk.cls === 'both') {
      set('eyes', 'shadow', 0.45)
      const lid = m.colors.lidShadow
      if (lid) set('eyes', 'shadowColor', labToHex(stylize(lid.lab, 1.3, 0, 0.3, 0.85)))
    }
  }

  // Expression: keep the friendly default unless the photo smiles broadly.
  const smile = m.expression.smile
  const open = m.expression.mouthOpen
  if (Number.isFinite(smile)) {
    if (smile > 0.55 && open > 0.2) set('expression', 'preset', 'grin')
    else if (smile > 0.3) set('expression', 'intensity', r3(clamp(0.6 + smile * 0.4, 0.6, 1)))
    else set('expression', 'intensity', 0.55)
  }

  // Top garment and its colours.
  dna = dressTop(dna, input)

  // Accessories.
  for (const a of accs) {
    const on = choice.noAccessories && a.head !== 'headwear' ? false : a.p >= ITEM_THRESHOLD
    if (on !== choice.toggled.has(a.head)) dna = a.apply(dna)
  }

  return normalizeDNA({ ...dna, meta: { source: 'photo' } })
}

const TOPS: Record<string, { item: string; outer?: string }> = {
  tshirt: { item: 'tshirt' },
  longsleeve: { item: 'longsleeve' },
  tank: { item: 'tank' },
  hoodie: { item: 'hoodie' },
  sweater: { item: 'sweater' },
  turtleneck: { item: 'turtleneck' },
  shirt: { item: 'shirt' },
  polo: { item: 'polo' },
  blouse: { item: 'blouse' },
  jersey: { item: 'jersey' },
  dress: { item: 'dress' },
  jacket: { item: 'tshirt', outer: 'jacket' },
  'denim-jacket': { item: 'tshirt', outer: 'denim' },
  'leather-jacket': { item: 'tshirt', outer: 'leather' },
  blazer: { item: 'shirt', outer: 'blazer' },
  puffer: { item: 'tshirt', outer: 'puffer' },
  cardigan: { item: 'tshirt', outer: 'cardigan' },
}

function dressTop(dna: AvatarDNA, input: AvatarInput): AvatarDNA {
  const m = input.measured
  const tp = probsOf(input, 'top')
  const cls = headSpec('top').classes[argmax(tp)]
  const t = TOPS[cls] ?? TOPS.tshirt
  const main = m.colors.top && m.colors.top.confidence >= STYLIZE.minConfidence.top ? labToHex(stylize(m.colors.top.lab, STYLIZE.top.chroma, 0, STYLIZE.top.minL, STYLIZE.top.maxL)) : null
  const sec = m.colors.topSecondary ? labToHex(stylize(m.colors.topSecondary.lab, STYLIZE.top.chroma, 0, STYLIZE.top.minL, STYLIZE.top.maxL)) : null
  let out = removeItemById(dna, 'hoodie')
  if (t.outer) {
    out = addItem(out, t.item, sec ? { color: sec } : { color: '#f5f2eb' })
    out = addItem(out, t.outer, main ? { color: main, color2: trimOf(main, m.colors.top!.lab) } : {})
  } else {
    const params: Record<string, string> = {}
    if (main) {
      params.color = main
      params.color2 = sec ?? trimOf(main, m.colors.top!.lab)
    }
    out = addItem(out, t.item, params)
  }
  return out
}

/* ---- Public API --------------------------------------------------------------------------------- */

const EYE_LABELS: Record<string, string> = { almond: 'Almond', round: 'Round', narrow: 'Narrow', upturned: 'Upturned', downturned: 'Downturned', big: 'Big & bright' }

function seedOf(input: AvatarInput): number {
  const c = input.measured.colors
  const g = input.measured.geometry
  const key = JSON.stringify([c.skin?.hex, c.hair?.hex, c.iris?.hex, c.top?.hex, Object.values(g).map((v) => (Number.isFinite(v) ? Math.round(v * 1000) : null))])
  return hashString(key) >>> 0
}

const same = (a: AvatarDNA, b: AvatarDNA): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Turns an analysis (or a hand-written fixture with `measured` + `attributes`) into
 * avatar DNA: the best match plus alternatives that vary the uncertain choices.
 */
export function photoToAvatars(input: AvatarInput, opts: PhotoToAvatarsOptions = {}): PhotoAvatars {
  const count = Math.max(1, Math.min(8, Math.floor(opts.count ?? 4)))
  const seed = (opts.seed ?? seedOf(input)) >>> 0
  const styles = rankHairStyles(input)
  const eyes = rankEyeStyles(input)
  const accs = accessories(input)
  const conf = (hair: StyleScore, eyeIdx: number) => r3(clamp(hair.p * (eyeIdx === 0 ? 1 : 0.7), 0, 1))

  const candidates: Candidate[] = []
  const push = (label: string, choice: Choice, confidence: number) => {
    if (candidates.length >= count) return
    const dna = build(input, seed, choice, accs)
    if (candidates.some((c) => same(c.dna, dna))) return
    candidates.push({ dna, label, confidence })
  }

  const base: Choice = { hair: styles[0], eyes: eyes[0].id, toggled: new Set() }
  push('Best match', base, conf(styles[0], 0))
  push(`Hair: ${styles[1].label}`, { ...base, hair: styles[1] }, conf(styles[1], 0))

  // The single most uncertain on/off decision (accessories, then facial hair).
  const uncertain = accs
    .filter((a) => a.p >= 0.2 && a.p <= 0.8)
    .sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5) || a.head.localeCompare(b.head))[0]
  const beard = present(input, 'beard')
  const eyeAlt = { ...base, eyes: eyes[1].id }
  if (uncertain) {
    const on = uncertain.p >= ITEM_THRESHOLD
    push(`Eyes: ${EYE_LABELS[eyes[1].id] ?? eyes[1].id}, ${on ? 'without' : 'with'} ${uncertain.label}`, { ...eyeAlt, toggled: new Set([uncertain.head]) }, r3(conf(styles[0], 1) * (1 - Math.abs(uncertain.p - 0.5))))
  } else if (beard.p >= 0.25 && beard.p <= 0.75) {
    push(`Eyes: ${EYE_LABELS[eyes[1].id] ?? eyes[1].id}, ${beard.p >= ITEM_THRESHOLD ? 'clean-shaven' : 'with facial hair'}`, { ...eyeAlt, flipBeard: true }, r3(conf(styles[0], 1) * 0.5))
  } else {
    push(`Eyes: ${EYE_LABELS[eyes[1].id] ?? eyes[1].id}`, eyeAlt, conf(styles[0], 1))
  }

  const worn = accs.filter((a) => a.p >= ITEM_THRESHOLD && a.head !== 'headwear')
  if (worn.length) push('Without accessories', { ...base, noAccessories: true }, r3(conf(styles[0], 0) * 0.6))
  for (let i = 2; candidates.length < count && i < styles.length; i++) push(`Hair: ${styles[i].label}`, { ...base, hair: styles[i] }, conf(styles[i], 0))

  return { best: candidates[0].dna, candidates, notes: notesFor(input, styles[0]) }
}

function notesFor(input: AvatarInput, hair: StyleScore): string[] {
  const m = input.measured
  const notes: string[] = []
  const got = (['skin', 'hair', 'iris', 'lips'] as const).filter((k) => m.colors[k])
  if (got.length) notes.push(`Colours measured from the photo: ${got.map((k) => (k === 'iris' ? 'eyes' : k)).join(', ')}.`)
  if (m.lighting && m.lighting.confidence > 0.3 && m.lighting.sources.length) notes.push('The lighting had a colour cast or was dim, so colours were balanced before matching.')
  if (!m.colors.iris) notes.push("Eye colour couldn't be read (closed eyes, glasses glare or a small face), so the default is kept.")
  if (!m.colors.top) notes.push("The top isn't visible, so its colour is a default.")
  const src = input.attributes.source
  notes.push(src === 'model' ? `Hairstyle "${hair.label}" chosen by the attribute model.` : `Hairstyle "${hair.label}" guessed from the hair outline (no attribute model yet), so check the alternatives.`)
  if (input.mirrored) notes.push('The photo is mirrored, so left and right were swapped.')
  notes.push('Everything is editable in the studio. Body shape is left at the default.')
  return notes
}
