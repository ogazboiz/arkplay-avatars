/* Attribute guesses from the measurements alone, used when the trained attribute model is
 * absent or fails. Same output shape as the model (per-head probabilities in taxonomy
 * class order) with honest, low confidence. Every rule reads plain numbers from
 * `Measured`, so it is pure and unit-tested with hand-written fixtures.
 *
 * There are no heads for (and no rules about) gender, ethnicity, age, body size, health
 * or identity. Beards, hats and makeup are guessed only from what is visible. */

import type { HeadTrust } from './attributes.ts'
import { HAIR_LENGTH, HAIR_TEXTURE } from './calibration.ts'
import { TAXONOMY, headSpec } from './taxonomy.ts'
import type { AttributeSet, HeadSource, Measured } from './types.ts'

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const sig = (x: number): number => 1 / (1 + Math.exp(-x))
const fin = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

/** Normalizes non-negative weights to probabilities (uniform when all are zero). */
export function normalize(w: number[]): number[] {
  const s = w.reduce((a, b) => a + Math.max(0, b), 0)
  return s > 0 ? w.map((v) => Math.max(0, v) / s) : w.map(() => 1 / w.length)
}

/** Probabilities from named weights, in the head's class order (unnamed classes get `rest`). */
function dist(head: string, weights: Record<string, number>, rest = 0.01): number[] {
  const spec = headSpec(head)
  for (const k of Object.keys(weights)) if (!spec.classes.includes(k)) throw new Error(`heuristics: ${head} has no class ${k}`)
  return normalize(spec.classes.map((c) => weights[c] ?? rest))
}

/** Gaussian likelihood over ordered centres. */
function ordinal(value: number, centres: number[], sigma: number): number[] {
  return normalize(centres.map((c) => Math.exp(-((value - c) ** 2) / (2 * sigma * sigma))))
}

const mixP = (p: number[], q: number[], w: number): number[] => normalize(p.map((v, i) => v * (1 - w) + q[i] * w))

export function heuristicAttributes(m: Measured): AttributeSet {
  const hs = m.hair
  const c = m.cues
  const heads: Record<string, number[]> = {}
  const confidence: Record<string, number> = {}
  const set = (id: string, p: number[], conf: number) => {
    heads[id] = p
    confidence[id] = Math.round(clamp01(conf) * 100) / 100
  }

  const area = fin(hs.hairArea, 0)
  const top = fin(hs.hairTopHeight, 0)
  const width = fin(hs.hairWidth, 0)
  const bottom = hs.hairBottom

  // --- hair_length ---
  {
    const L = HAIR_LENGTH
    const baldness = clamp01(1 - area / L.baldArea)
    const buzzness = clamp01((L.buzzArea - area) / (L.buzzArea - L.baldArea)) * clamp01((L.buzzTop + 0.08 - top) / 0.12) * (1 - baldness)
    const cs = L.centres
    // Hair that runs out of the photo is at least as long as what we see.
    const b = Number.isFinite(bottom) ? bottom + (c.hairClipped > 0.5 ? 0.35 : 0) : cs.short
    const lengthP = ordinal(b, [cs.short, cs.ear, cs.chin, cs.shoulder, cs.chest, cs.waist], L.sigma)
    const rest = 1 - baldness - buzzness
    const p = [baldness, buzzness, ...lengthP.map((v) => v * rest)]
    set('hair_length', normalize(p), 0.5 * clamp01(area * 3 + baldness))
  }

  // --- hair_texture ---
  const afroShape = sig((width - 1.45) / 0.1) * sig((top - 0.78) / 0.08) * (Number.isFinite(bottom) ? sig((0.25 - bottom) / 0.1) : 1)
  {
    const T = HAIR_TEXTURE
    const coh = fin(c.hairCoherence, (T.straightCoherence + T.coilyCoherence) / 2)
    const fromCoh = clamp01((T.straightCoherence - coh) / (T.straightCoherence - T.coilyCoherence))
    const curl = clamp01(0.85 * fromCoh + 0.1 * fin(c.hairRoughness, 0.3) + 0.3 * afroShape)
    const p = area < 0.15 ? [0.4, 0.25, 0.2, 0.15] : ordinal(curl, T.centres, T.sigma)
    set('hair_texture', p, Number.isFinite(c.hairCoherence) && area >= 0.15 ? 0.4 : 0.1)
  }

  // --- hair_arrangement ---
  {
    const curly = heads.hair_texture[2] + heads.hair_texture[3]
    const afro = afroShape * (0.4 + 0.6 * curly)
    // Hair hanging beside the face below the ears rules out updos (buns, puffs, ponytails).
    const hang = Number.isFinite(bottom) && area > 0.3 ? sig((bottom + 0.2) / 0.08) * (1 - afro) : 0
    const bun = sig((0.5 - fin(c.hairTopWidth, 1)) / 0.07) * sig((top - 0.82) / 0.06) * (1 - 0.8 * hang)
    // Hair tight to the head with nothing hanging beside the face: short, or pulled back.
    const tight = sig((1.2 - width) / 0.06) * (Number.isFinite(bottom) ? sig((-0.35 - bottom) / 0.08) : 1) * clamp01(area * 2)
    // Hanging hair can't tell loose hair from locs, twists or braids: share the mass.
    const hangTex = hang * (0.06 + 0.3 * curly)
    set(
      'hair_arrangement',
      dist('hair_arrangement', {
        down: (1 - 0.8 * Math.max(afro, bun) - 0.2 * tight) * (1 + hang),
        afro: afro * 0.9,
        bun: bun * 0.55,
        'top-knot': bun * 0.35,
        ponytail: tight * 0.12 * (1 - hang),
        'high-ponytail': tight * 0.04 * (1 - hang),
        locs: hangTex,
        twists: hangTex,
        'box-braids': hangTex * 0.8,
        braid: hang * 0.04,
        'two-braids': hang * 0.04,
      }),
      0.25,
    )
  }

  // --- hair_sides ---
  {
    const sideR = fin(c.hairSideRatio, 1)
    const shaved = area > 0.15 ? sig((0.25 - sideR) / 0.06) : 0
    const narrowTop = sig((0.42 - fin(c.hairTopWidth, 1)) / 0.06)
    set('hair_sides', dist('hair_sides', { natural: 1 - shaved * 0.8, undercut: shaved * (1 - narrowTop) * 0.8, mohawk: shaved * narrowTop * 0.8 }), 0.2)
  }

  // --- bangs ---
  const cover = fin(hs.foreheadCoverage, 0)
  const asym = fin(c.bangsAsymmetry, 0)
  {
    const centre = fin(c.bangsCentre, cover)
    const heavy = sig((cover - 0.5) / 0.08)
    const partial = sig((cover - 0.2) / 0.06) * (1 - heavy)
    const sideSwept = sig((Math.abs(asym) - 0.3) / 0.08)
    const curtain = sig((cover - centre - 0.25) / 0.08)
    set(
      'bangs',
      dist('bangs', {
        none: 1 - sig((cover - 0.2) / 0.06),
        straight: heavy * (1 - sideSwept) * (1 - curtain),
        side: (heavy + partial * 0.6) * sideSwept,
        curtain: (heavy + partial) * curtain,
        wispy: partial * (1 - sideSwept) * (1 - curtain),
      }),
      Number.isFinite(hs.foreheadCoverage) ? 0.45 : 0.1,
    )
  }

  // --- hair_part --- (classes are the SUBJECT's side; +partX is the image right = the subject's left)
  {
    const strength = fin(c.partStrength, 0)
    let p: number[]
    if (Number.isFinite(hs.partX) && strength > 0.25) {
      const x = hs.partX
      const centre = sig((0.18 - Math.abs(x)) / 0.05)
      p = dist('hair_part', { none: 0.2 * (1 - strength), center: centre, left: x > 0 ? 1 - centre : 0.02, right: x < 0 ? 1 - centre : 0.02 })
    } else if (Math.abs(asym) > 0.3 && cover > 0.2) {
      // Hair swept toward the covered side: the part is on the other side.
      p = dist('hair_part', { none: 0.3, center: 0.1, left: asym < 0 ? 0.6 : 0.05, right: asym > 0 ? 0.6 : 0.05 })
    } else {
      p = dist('hair_part', { none: 0.5, center: 0.2, left: 0.15, right: 0.15 })
    }
    set('hair_part', p, 0.2 + 0.3 * strength)
  }

  // --- hair_color_style ---
  {
    const lift = fin(c.hairTipLift, 0)
    const share = fin(c.hairSecondShare, 0)
    const delta = fin(c.hairSecondDelta, 0)
    // Shading alone splits hair into two clusters up to ΔE ≈ 0.35 (QA set); dyed highlights
    // and two-tone hair differ by more.
    const ombre = sig((lift - 0.12) / 0.03)
    const hi = sig((delta - 0.38) / 0.03) * sig((share - 0.1) / 0.03) * sig((0.36 - share) / 0.03)
    const two = sig((delta - 0.4) / 0.03) * sig((share - 0.36) / 0.03)
    set('hair_color_style', dist('hair_color_style', { solid: 1.2 - Math.max(ombre, hi, two), highlights: hi * 0.8, ombre: ombre * 0.8, 'two-tone': two * 0.7 }), 0.2)
  }

  // --- hairline --- (only readable when the forehead isn't covered)
  {
    const hl = fin(c.hairlineHeight, NaN)
    const p =
      Number.isFinite(hl) && cover < 0.4 && area > 0.15
        ? dist('hairline', { receding: sig((hl - 0.42) / 0.04), normal: 1, low: sig((0.2 - hl) / 0.03) })
        : dist('hairline', { receding: 0.15, normal: 0.7, low: 0.15 })
    set('hairline', p, 0.25)
  }

  // --- beard / mustache --- (visible facial hair only)
  {
    const cov = fin(c.beardCoverage, 0)
    const chin = fin(c.beardChin, 0)
    const sides = fin(c.beardSides, 0)
    const below = fin(c.beardBelowChin, 0)
    // Darkening of the lower face relative to the skin's lightness: full beards 0.5–0.6 on the
    // QA set, stubble and goatees 0.15–0.41 (whatever the skin tone).
    const skinL = m.colors.skin?.lab[0] ?? 0.7
    const relDark = fin(c.beardDarkening, 0) / Math.max(0.2, skinL)
    const any = Math.max(sig((cov - 0.16) / 0.04), sig((relDark - 0.35) / 0.05))
    // Dense: much darker than the skin, or covering most of the lower face (QA stubble ≤ 0.45).
    const dense = Math.max(sig((relDark - 0.47) / 0.04) * sig((cov - 0.2) / 0.05), sig((cov - 0.55) / 0.06))
    const long = sig((below - 0.18) / 0.04)
    const goatee = sig((chin - 0.45) / 0.06) * sig((0.2 - sides) / 0.05)
    // The cues say whether there is facial hair much better than which style: half of the
    // style split is a prior, so a disagreeing model keeps the style (mergeAttributes).
    const cue = normalize([(1 - dense) * (1 - goatee), goatee, 0.03, dense * 0.4 * (1 - long), dense * 0.6 * (1 - long), long])
    const prior = [0.35, 0.15, 0.03, 0.2, 0.25, 0.02]
    const split = cue.map((v, i) => 0.55 * v + 0.45 * prior[i])
    set(
      'beard',
      dist('beard', { none: 1 - any, stubble: any * split[0], goatee: any * split[1], chinstrap: any * split[2], short: any * split[3], full: any * split[4], long: any * split[5] }),
      0.35,
    )
    const mc = fin(c.mustacheCoverage, 0)
    const some = sig((mc - 0.22) / 0.05)
    const full = sig((mc - 0.5) / 0.06)
    set('mustache', dist('mustache', { none: 1 - some, thin: some * (1 - full), full: some * full, handlebar: some * 0.03 }), 0.3)
  }

  // --- eyewear ---
  {
    const g = clamp01((fin(c.glassesEdges, 0) - 0.25) / 0.45)
    const sun = clamp01(fin(c.darkLenses, 0))
    const glasses = g * (1 - sun)
    set(
      'eyewear',
      dist('eyewear', {
        none: 1 - Math.max(glasses, sun),
        'rect-glasses': glasses * 0.5,
        'round-glasses': glasses * 0.3,
        'half-rims': glasses * 0.1,
        'cateye-glasses': glasses * 0.1,
        sunglasses: sun * 0.75,
        aviators: sun * 0.25,
      }),
      0.2 + 0.3 * Math.max(g, sun),
    )
  }

  // --- headwear ---
  {
    const hc = fin(c.headCover, 0)
    const sc = fin(c.sideCover, 0)
    const covered = sig((hc - 0.35) / 0.07)
    const wrapped = sig((sc - 0.35) / 0.07) * sig((0.25 - area) / 0.08)
    set(
      'headwear',
      dist('headwear', {
        none: 1 - covered,
        hijab: covered * wrapped * 0.5,
        hood: covered * wrapped * 0.3,
        headwrap: covered * (wrapped * 0.12 + (1 - wrapped) * 0.08),
        cap: covered * (1 - wrapped) * 0.35,
        beanie: covered * (1 - wrapped) * 0.3,
        bucket: covered * (1 - wrapped) * 0.08,
        beret: covered * (1 - wrapped) * 0.06,
        turban: covered * (1 - wrapped) * 0.05,
        fedora: covered * (1 - wrapped) * 0.04,
        durag: covered * (1 - wrapped) * 0.04,
      }),
      // Nothing covering the head and hair visible on top is clear evidence of no hat.
      hc < 0.05 && top > 0.5 && area > 0.3 ? 0.45 : 0.3,
    )
  }

  // --- small accessories (weak cues) ---
  {
    // Accessory-class pixels at the lobes: a few are noise or a stud, a sizeable blob is a
    // hoop (QA set: hoops read 0.45–1.0; bare ears ≤ 0.2). Headphones over the ears also
    // read as accessories; toDNA drops earrings when headphones are worn.
    const ea = fin(c.earAccessory, 0)
    const e = clamp01((ea - 0.28) / 0.3)
    const big = sig((ea - 0.5) / 0.1)
    set('earrings', dist('earrings', { none: 1 - e, studs: e * (1 - big) * 0.7, hoops: e * (0.2 + 0.8 * big), drops: e * 0.1 }), 0.25)
    const hp = clamp01((fin(c.headphoneBand, 0) - 0.3) / 0.5)
    set('headphones', dist('headphones', { no: 1 - hp, yes: hp }), 0.2)
    const n = clamp01((fin(c.neckAccessory, 0) - 0.2) / 0.5)
    set('necklace', dist('necklace', { none: 1 - n, chain: n * 0.45, pendant: n * 0.35, pearls: n * 0.1, choker: n * 0.1 }), 0.15)
  }

  // --- freckles / eye makeup ---
  // Both cues are weak on real photos (skin texture, pores, wrinkles, lashes and lid shadow
  // look alike at portrait resolution), so they only move the prior ("none" for most people)
  // when they are far outside what plain skin and lashes produce on the QA set.
  {
    const sd = c.spotDensity
    const light = Number.isFinite(sd) ? sig((sd - 0.6) / 0.06) * (1 - sig((sd - 0.85) / 0.05)) : 0
    const heavy = Number.isFinite(sd) ? sig((sd - 0.85) / 0.05) : 0
    set('freckles', dist('freckles', { none: 0.85 * (1 - Math.max(light, heavy)), light: 0.12 + light, heavy: 0.03 + heavy }), Number.isFinite(sd) ? 0.2 : 0.05)
    // Frames and dark lenses darken the outer eye corner and tint the lids.
    const eyewear = clamp01(Math.max(fin(c.glassesEdges, 0), fin(c.darkLenses, 0)) * 1.4)
    const liner = clamp01(fin(c.linerScore, 0)) * (1 - eyewear)
    const shadow = clamp01(fin(c.lidShadowScore, 0)) * (1 - eyewear)
    set('eye_makeup', dist('eye_makeup', { none: 0.3 + (1 - liner) * (1 - shadow), liner: liner * (1 - shadow), shadow: shadow * (1 - liner), both: liner * shadow }), 0.15)
  }

  // --- top --- (neckline and colour cues; mostly a prior)
  {
    const sk = fin(c.shoulderSkin, 0)
    const neck = fin(c.neckCover, 0)
    const twoTone = m.colors.topSecondary ? 1 : 0
    const tank = sig((sk - 0.4) / 0.08)
    const high = sig((neck - 0.7) / 0.08) * (1 - tank)
    const open = twoTone * (1 - tank) * (1 - high)
    const base = 1 - tank - high * 0.8 - open * 0.6
    let p = dist('top', {
      tshirt: 0.4 * base,
      longsleeve: 0.1 * base,
      hoodie: 0.12 * base + high * 0.25,
      sweater: 0.1 * base + high * 0.25,
      shirt: 0.1 * base + open * 0.2,
      polo: 0.04 * base,
      blouse: 0.04 * base,
      jersey: 0.02 * base,
      tank: tank * 0.6,
      dress: tank * 0.25,
      turtleneck: high * 0.4,
      jacket: open * 0.25,
      blazer: open * 0.15,
      cardigan: open * 0.12,
      'denim-jacket': open * 0.08,
      'leather-jacket': open * 0.06,
      puffer: 0.01,
    })
    if (fin(c.clothesShare, 0) < 0.03) p = mixP(p, dist('top', { tshirt: 0.5, hoodie: 0.15, sweater: 0.1, shirt: 0.1, longsleeve: 0.1 }), 0.7)
    set('top', p, 0.15)
  }

  // Heads without a rule get the taxonomy's uniform prior (none today; guards additions).
  for (const h of TAXONOMY.heads)
    if (!heads[h.id]) {
      heads[h.id] = h.classes.map(() => 1 / h.classes.length)
      confidence[h.id] = 0
    }
  const headSource: Record<string, 'heuristic'> = {}
  for (const k of Object.keys(heads)) headSource[k] = 'heuristic'
  return { source: 'heuristic', heads, confidence, headSource }
}

/** At most this share of a trusted head may come from a disagreeing heuristic. */
export const BLEND_MAX = 0.5

const argmaxOf = (p: readonly number[]): number => p.reduce((bi, v, i) => (v > p[bi] ? i : bi), 0)

/**
 * A trusted head's model probabilities, pulled toward the heuristic when it strongly
 * disagrees and is confident. For heads with a "none" class (`noneIndex`) the question is
 * presence (the item is worn when 1 − p(none) ≥ 0.5): they disagree on it and the heuristic is
 * decisive. Otherwise: the heuristic's top class is not the model's, is decisive (> 0.45) and
 * gets much more mass than the model gives it. Never a hard switch; the pull
 * shrinks as the model's reliability (its margin over the baseline) grows.
 * Returns the blend weight `alpha` (0 = pure model).
 */
export function blendTrusted(pm: readonly number[], ph: readonly number[], heuristicConfidence: number, reliability: number, noneIndex = -1): { p: number[]; alpha: number } {
  if (pm.length !== ph.length) return { p: pm.slice(), alpha: 0 }
  let strength: number
  if (noneIndex >= 0) {
    // Heads with a "none" class become items on presence (1 − p(none) ≥ 0.5): compare that.
    const pn = pm[noneIndex]
    const hn = ph[noneIndex]
    // Present exactly when toDNA would add the item (p = 1 − p(none) ≥ ITEM_THRESHOLD = 0.5).
    if (pn <= 0.5 === hn <= 0.5) return { p: pm.slice(), alpha: 0 }
    strength = clamp01((Math.abs(hn - pn) - 0.2) / 0.4) * clamp01((Math.max(hn, 1 - hn) - 0.6) / 0.3)
  } else {
    const hi = argmaxOf(ph)
    if (hi === argmaxOf(pm)) return { p: pm.slice(), alpha: 0 }
    strength = clamp01((ph[hi] - pm[hi] - 0.25) / 0.4) * clamp01((ph[hi] - 0.45) / 0.3)
  }
  strength *= clamp01(heuristicConfidence / 0.4)
  const alpha = BLEND_MAX * strength * (1 - 0.35 * clamp01(reliability))
  if (alpha < 0.02) return { p: pm.slice(), alpha: 0 }
  return { p: normalize(pm.map((v, i) => (1 - alpha) * v + alpha * ph[i])), alpha: Math.round(alpha * 1000) / 1000 }
}

/** Presence-only use of a head with a "none" class: the model's p(none), the heuristic's split
 *  of the rest (hair_part: the measured partX decides centre/left/right). */
export function presenceOnly(head: string, pm: readonly number[], ph: readonly number[]): number[] {
  const cls = headSpec(head).classes
  const ni = cls.indexOf('none')
  if (ni < 0) return ph.slice()
  const pNone = clamp01(pm[ni] ?? 0)
  const rest = normalize(ph.map((v, i) => (i === ni ? 0 : v)).filter((_, i) => i !== ni))
  let k = 0
  return cls.map((_, i) => (i === ni ? pNone : (1 - pNone) * rest[k++]))
}

/**
 * Merges the model's prediction with the heuristics head by head, following the per-head
 * trust table (attributes.ts `headTrust`, computed from attributes.json metrics):
 *   use 'model'      model probabilities, blended toward a strongly disagreeing heuristic
 *   use 'presence'   the model's p(none) with the heuristic's split of the rest
 *   use 'heuristic'  the heuristic (the model doesn't beat its baseline on this head)
 * Without a trust table every model head counts as trusted (reliability 0.5).
 * `headSource` records what was actually used: 'model', 'heuristic' or 'blend'.
 */
export function mergeAttributes(model: AttributeSet | null, fallback: AttributeSet, trust?: Readonly<Record<string, Pick<HeadTrust, 'use' | 'reliability'>>> | null): AttributeSet {
  if (!model) return fallback
  const heads: Record<string, number[]> = { ...fallback.heads }
  const confidence: Record<string, number> = { ...fallback.confidence }
  const headSource: Record<string, HeadSource> = {}
  for (const k of Object.keys(heads)) headSource[k] = fallback.headSource?.[k] ?? 'heuristic'
  let used = false
  for (const [k, pm] of Object.entries(model.heads)) {
    const t = trust ? trust[k] : { use: 'model' as const, reliability: 0.5 }
    const ph = fallback.heads[k]
    const cm = model.confidence[k] ?? 0.5
    const ch = fallback.confidence[k] ?? 0
    if (!t || t.use === 'heuristic') continue
    used = true
    if (!ph || ph.length !== pm.length) {
      heads[k] = pm.slice()
      confidence[k] = cm
      headSource[k] = 'model'
    } else if (t.use === 'presence') {
      heads[k] = presenceOnly(k, pm, ph)
      confidence[k] = Math.round(((cm + ch) / 2) * 100) / 100
      headSource[k] = 'blend'
    } else {
      const cls = headSpec(k).classes
      const ni = cls.indexOf('none') >= 0 ? cls.indexOf('none') : cls.indexOf('no')
      const { p, alpha } = blendTrusted(pm, ph, ch, t.reliability, ni)
      heads[k] = p
      confidence[k] = Math.round(((1 - alpha) * cm + alpha * ch) * 100) / 100
      headSource[k] = alpha > 0 ? 'blend' : 'model'
    }
  }
  return { source: used ? 'model' : fallback.source, heads, confidence, headSource }
}
