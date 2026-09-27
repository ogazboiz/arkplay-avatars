/* Evolution tools: mutate (variations of an avatar), crossover (breed two avatars),
 * interpolate (morph between two). These power the studio's "Variations" grid, the
 * "Mix two avatars" tool and morph animations. */

import { fromLch, mix, toLch } from '../core/color.ts'
import { clamp, lerp } from '../core/math.ts'
import { createRng, hash32 } from '../core/rng.ts'
import { resolveItems } from '../dna/normalize.ts'
import { coerce, type Params } from '../dna/params.ts'
import { GARMENTS, ACCESSORIES, itemSpec, sectionSpec, sectionsFor } from '../dna/schema/index.ts'
import type { AvatarDNA, ItemRef } from '../dna/types.ts'
import { makeItem } from '../dna/defaults.ts'
import { randomParam } from './random.ts'

const FIXED = new Set(['style', 'scene'])

/** A variation of `dna`. strength 0..1: 0.2 is "a sibling", 1 is "a distant cousin". */
export function mutate(dna: AvatarDNA, strength: number, seed: number): AvatarDNA {
  const rng = createRng(hash32(seed, dna.seed, 'mutate'))
  const k = clamp(strength, 0, 1)
  const out: AvatarDNA = structuredClone(dna)
  for (const s of sectionsFor(dna.kind)) {
    if (FIXED.has(s.id)) continue
    for (const p of s.params) {
      if (p.random?.mode === 'keep') continue
      const cur = out.sections[s.id][p.key]
      if (p.type === 'range') {
        const span = p.max - p.min
        out.sections[s.id][p.key] = coerce(p, clamp(Number(cur) + rng.gauss() * span * 0.12 * k, p.min, p.max))
      } else if (p.type === 'color' && typeof cur === 'string' && cur) {
        if (rng.chance(0.4 * k)) {
          const c = toLch(cur)
          out.sections[s.id][p.key] = fromLch({ l: clamp(c.l + rng.gauss() * 0.06 * k, 0.05, 0.98), c: c.c * (1 + rng.gauss() * 0.2 * k), h: c.h + rng.gauss() * 30 * k })
        }
      } else if (p.type === 'choice' && !(s.id === 'species' && p.key === 'plan')) {
        if (rng.chance(0.1 * k)) out.sections[s.id][p.key] = randomParam(p, rng)
      } else if (p.type === 'toggle' && rng.chance(0.05 * k)) {
        out.sections[s.id][p.key] = !cur
      }
    }
  }
  // Occasionally swap a garment or accessory for another in the same slot.
  const swap = (list: ItemRef[], pool: typeof GARMENTS) =>
    list.map((it) => {
      if (it.id === 'custom' || !rng.chance(0.15 * k)) return it
      const spec = itemSpec(it.id)
      const same = pool.filter((p) => p.slot === spec?.slot && p.kinds.includes(dna.kind) && (p.weight ?? 1) > 0)
      if (!same.length) return it
      const next = rng.pick(same)
      return makeItem(next.id, { ...it.params })
    })
  out.outfit = resolveItems(swap(out.outfit, GARMENTS), dna.kind)
  out.accessories = resolveItems(swap(out.accessories, ACCESSORIES), dna.kind)
  if (rng.chance(0.3 * k)) out.seed = rng.int(0, 0xffffffff) >>> 0
  return out
}

export function variations(dna: AvatarDNA, count: number, strength: number, seed: number): AvatarDNA[] {
  return Array.from({ length: count }, (_, i) => mutate(dna, strength, hash32(seed, i)))
}

/** A child of two avatars: each trait comes from one parent or blends both. */
export function crossover(a: AvatarDNA, b: AvatarDNA, seed: number): AvatarDNA {
  const rng = createRng(hash32(seed, a.seed, b.seed))
  const lead = a.kind === b.kind || rng.chance(0.5) ? a : b
  const other = lead === a ? b : a
  const out: AvatarDNA = structuredClone(lead)
  out.seed = hash32(a.seed, b.seed, seed)
  if (lead.kind !== other.kind) {
    // Across kinds, the child borrows the other parent's palette and accessories.
    const src = other.kind === 'creature' ? other.sections.coat : other.sections.hair
    if (lead.kind === 'creature' && src?.color) out.sections.coat.primary = src.color
    if (lead.kind === 'humanoid' && other.sections.coat?.primary) out.sections.hair.color = other.sections.coat.primary as string
    out.accessories = resolveItems([...lead.accessories, ...other.accessories.filter(() => rng.chance(0.5))], lead.kind)
    return out
  }
  for (const s of sectionsFor(lead.kind)) {
    const pa = a.sections[s.id] ?? {}
    const pb = b.sections[s.id] ?? {}
    const res: Params = {}
    for (const p of s.params) {
      const va = pa[p.key]
      const vb = pb[p.key]
      if (p.type === 'range' && typeof va === 'number' && typeof vb === 'number') res[p.key] = coerce(p, rng.chance(0.5) ? lerp(va, vb, rng.next()) : rng.chance(0.5) ? va : vb)
      else if (p.type === 'color' && typeof va === 'string' && typeof vb === 'string' && va && vb) res[p.key] = rng.chance(0.4) ? mix(va, vb, rng.range(0.3, 0.7)) : rng.chance(0.5) ? va : vb
      else res[p.key] = (rng.chance(0.5) ? va : vb) ?? p.default
    }
    out.sections[s.id] = res
  }
  const pickItems = (la: ItemRef[], lb: ItemRef[]) => {
    const slots = new Set([...la, ...lb].map((i) => itemSpec(i.id)?.slot))
    const res: ItemRef[] = []
    for (const slot of slots) {
      const fromA = la.filter((i) => itemSpec(i.id)?.slot === slot)
      const fromB = lb.filter((i) => itemSpec(i.id)?.slot === slot)
      res.push(...(rng.chance(0.5) ? fromA : fromB))
    }
    return resolveItems(structuredClone(res), lead.kind)
  }
  out.outfit = lead.kind === 'humanoid' ? pickItems(a.outfit, b.outfit) : []
  out.accessories = pickItems(a.accessories, b.accessories)
  out.name = ''
  return out
}

/** Morph from a to b (t = 0 → a, 1 → b). Discrete traits switch at the midpoint. */
export function interpolate(a: AvatarDNA, b: AvatarDNA, t: number): AvatarDNA {
  if (a.kind !== b.kind) return t < 0.5 ? a : b
  const out: AvatarDNA = structuredClone(t < 0.5 ? a : b)
  for (const s of sectionsFor(a.kind)) {
    const spec = sectionSpec(s.id)
    for (const p of spec?.params ?? []) {
      const va = a.sections[s.id]?.[p.key]
      const vb = b.sections[s.id]?.[p.key]
      if (p.type === 'range' && typeof va === 'number' && typeof vb === 'number') out.sections[s.id][p.key] = coerce(p, lerp(va, vb, t))
      else if (p.type === 'color' && typeof va === 'string' && typeof vb === 'string' && va && vb) out.sections[s.id][p.key] = mix(va, vb, t)
    }
  }
  return out
}
