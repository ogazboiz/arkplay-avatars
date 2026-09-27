/* Randomizing from the studio: the whole avatar, one section, or a new avatar of the other
 * kind. Humanoids go straight to the engine's randomDNA. Creatures are rolled from a fresh
 * random creature and merged here, because randomDNA with a `base` keeps a creature's
 * anatomy as it was (see the engine request in the studio README / report). */

import { randomDNA, resolveItems, sectionsFor, type AvatarDNA, type AvatarKind, type Params } from '@arkplay/avatar-engine'

/** Sections every avatar has; they are carried across a kind switch. */
export const SHARED_SECTIONS = ['expression', 'scene', 'style'] as const

export interface RollOptions {
  seed: number
  theme?: string
  /** Section ids, `section.key` params, 'outfit', 'accessories' or 'seed'. */
  locks?: readonly string[]
  /** Re-roll only these sections (or 'outfit' / 'accessories'). */
  only?: readonly string[]
}

export function rollAvatar(dna: AvatarDNA, o: RollOptions): AvatarDNA {
  const next =
    dna.kind === 'creature'
      ? rollCreature(dna, o)
      : randomDNA({ seed: o.seed, kind: 'humanoid', theme: o.theme, base: dna, locks: o.locks ? [...o.locks] : undefined, only: o.only ? [...o.only] : undefined })
  return keepCustomArt(dna, next)
}

function rollCreature(base: AvatarDNA, o: RollOptions): AvatarDNA {
  const locks = new Set(o.locks ?? [])
  const only = o.only ? new Set(o.only) : null
  const specs = sectionsFor('creature')
  // A species preset decides the whole anatomy, so rolling "species" rolls all of it.
  if (only?.has('species')) for (const s of specs) if (!(SHARED_SECTIONS as readonly string[]).includes(s.id)) only.add(s.id)
  const wants = (id: string) => (only ? only.has(id) : true) && !locks.has(id)
  const donor = randomDNA({ seed: o.seed, kind: 'creature', theme: o.theme })

  const sections: Record<string, Params> = {}
  for (const s of specs) {
    const cur = base.sections[s.id] ?? {}
    // Art style is never randomized (its params are all `keep`).
    if (!wants(s.id) || s.id === 'style') {
      sections[s.id] = { ...cur }
      continue
    }
    const out: Params = { ...donor.sections[s.id] }
    for (const p of s.params) if (locks.has(`${s.id}.${p.key}`) && p.key in cur) out[p.key] = cur[p.key]
    sections[s.id] = out
  }

  const speciesRolled = wants('species')
  const rollAcc = only ? only.has('accessories') : !locks.has('accessories')
  const meta: NonNullable<AvatarDNA['meta']> = { ...base.meta }
  if (speciesRolled) {
    if (donor.meta?.species) meta.species = donor.meta.species
    else delete meta.species
  }
  if (donor.meta?.theme) meta.theme = donor.meta.theme
  const out: AvatarDNA = {
    ...base,
    seed: only || locks.has('seed') ? base.seed : donor.seed,
    sections,
    outfit: [],
    accessories: rollAcc ? donor.accessories : structuredClone(base.accessories),
  }
  if (Object.keys(meta).length) out.meta = meta
  else delete out.meta
  return out
}

/** Uploaded art is the user's own work: a re-roll never throws it away. */
export function keepCustomArt(prev: AvatarDNA, next: AvatarDNA): AvatarDNA {
  if (prev.kind !== next.kind) return next
  const had = prev.accessories.filter((a) => a.id === 'custom')
  if (!had.length) return next
  const missing = had.filter((a) => !next.accessories.includes(a) && !next.accessories.some((b) => b.id === 'custom' && b.asset?.src === a.asset?.src && b.asset?.id === a.asset?.id))
  if (!missing.length) return next
  return { ...next, accessories: resolveItems([...next.accessories, ...structuredClone(missing)], next.kind) }
}

/** A new avatar of `kind` that keeps the name, expression, scene and art style of `from`. */
export function makeKind(kind: AvatarKind, from: AvatarDNA, seed: number): AvatarDNA {
  const fresh = randomDNA({ seed, kind })
  const sections = { ...fresh.sections }
  for (const id of SHARED_SECTIONS) if (from.sections[id] && sections[id]) sections[id] = { ...from.sections[id] }
  return { ...fresh, name: from.name, sections }
}
