import { defaultsOf, normalizeParams, type AvatarKind, type Params } from './params.ts'
import { itemSpec, sectionsFor } from './schema/index.ts'
import { speciesPreset } from './species.ts'
import { DNA_VERSION, type AvatarDNA, type ItemRef } from './types.ts'

/** An item with its default params, optionally overridden. */
export function makeItem(id: string, params: Params = {}): ItemRef {
  const spec = itemSpec(id)
  if (!spec) throw new Error(`Unknown item "${id}"`)
  return { id, params: normalizeParams(spec.params, { ...defaultsOf(spec.params), ...params }) }
}

/** Applies a creature species preset on top of the current creature sections. */
export function applySpecies(dna: AvatarDNA, speciesId: string): AvatarDNA {
  const preset = speciesPreset(speciesId)
  if (!preset || dna.kind !== 'creature') return dna
  const sections: Record<string, Params> = {}
  for (const s of sectionsFor('creature')) {
    const base = s.id === 'expression' || s.id === 'scene' || s.id === 'style' ? dna.sections[s.id] : defaultsOf(s.params)
    sections[s.id] = normalizeParams(s.params, { ...base, ...(preset.sections[s.id] ?? {}) })
  }
  return { ...dna, sections, meta: { ...dna.meta, species: preset.id } }
}

export function defaultDNA(kind: AvatarKind = 'humanoid', seed = 1): AvatarDNA {
  const sections: Record<string, Params> = {}
  for (const s of sectionsFor(kind)) sections[s.id] = defaultsOf(s.params)
  const dna: AvatarDNA = {
    v: DNA_VERSION,
    kind,
    seed: seed >>> 0,
    name: '',
    sections,
    outfit: kind === 'humanoid' ? [makeItem('hoodie'), makeItem('jeans'), makeItem('sneakers')] : [],
    accessories: [],
  }
  return kind === 'creature' ? applySpecies(dna, 'fox') : dna
}
