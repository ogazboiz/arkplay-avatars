/* Immutable edits. Every studio action and API patch goes through these so the rules
 * (slot capacity, conflicts, coercion) live in one place. Each returns a new document. */

import { coerce, type ParamValue, type Params } from './params.ts'
import { itemSpec, sectionSpec } from './schema/index.ts'
import { makeItem } from './defaults.ts'
import { resolveItems } from './normalize.ts'
import type { AvatarDNA, CustomAsset, ItemRef } from './types.ts'

export function setParam(dna: AvatarDNA, section: string, key: string, value: unknown): AvatarDNA {
  const spec = sectionSpec(section)?.params.find((p) => p.key === key)
  if (!spec || !dna.sections[section]) return dna
  const v = coerce(spec, value)
  if (dna.sections[section][key] === v) return dna
  return { ...dna, sections: { ...dna.sections, [section]: { ...dna.sections[section], [key]: v } } }
}

export function setSection(dna: AvatarDNA, section: string, values: Params): AvatarDNA {
  let out = dna
  for (const [k, v] of Object.entries(values)) out = setParam(out, section, k, v)
  return out
}

const listOf = (id: string): 'outfit' | 'accessories' | null => {
  const spec = itemSpec(id)
  if (!spec) return null
  return ['top', 'bottom', 'full', 'outer', 'shoes', 'socks'].includes(spec.slot) ? 'outfit' : 'accessories'
}

/** Adds (or replaces, per slot rules) an item. */
export function addItem(dna: AvatarDNA, id: string, params: Params = {}, asset?: CustomAsset): AvatarDNA {
  const list = listOf(id)
  const spec = itemSpec(id)
  if (!list || !spec || !spec.kinds.includes(dna.kind)) return dna
  const item = makeItem(id, params)
  if (asset) item.asset = asset
  return { ...dna, [list]: resolveItems([...dna[list], item], dna.kind) }
}

export function removeItem(dna: AvatarDNA, index: number, list: 'outfit' | 'accessories'): AvatarDNA {
  return { ...dna, [list]: dna[list].filter((_, i) => i !== index) }
}

export function removeItemById(dna: AvatarDNA, id: string): AvatarDNA {
  return { ...dna, outfit: dna.outfit.filter((i) => i.id !== id), accessories: dna.accessories.filter((i) => i.id !== id) }
}

export function setItemParam(dna: AvatarDNA, list: 'outfit' | 'accessories', index: number, key: string, value: ParamValue): AvatarDNA {
  const item = dna[list][index]
  if (!item) return dna
  const spec = itemSpec(item.id)?.params.find((p) => p.key === key)
  if (!spec) return dna
  const next: ItemRef = { ...item, params: { ...item.params, [key]: coerce(spec, value) } }
  const arr = dna[list].slice()
  arr[index] = next
  return { ...dna, [list]: arr }
}

/** Moves an item up/down its list (draw order among same-slot items). */
export function moveItem(dna: AvatarDNA, list: 'outfit' | 'accessories', index: number, delta: number): AvatarDNA {
  const arr = dna[list].slice()
  const to = Math.max(0, Math.min(arr.length - 1, index + delta))
  if (to === index) return dna
  const [it] = arr.splice(index, 1)
  arr.splice(to, 0, it)
  return { ...dna, [list]: arr }
}

export const hasItem = (dna: AvatarDNA, id: string): boolean => dna.outfit.some((i) => i.id === id) || dna.accessories.some((i) => i.id === id)

export const withName = (dna: AvatarDNA, name: string): AvatarDNA => ({ ...dna, name: name.slice(0, 40) })
export const withSeed = (dna: AvatarDNA, seed: number): AvatarDNA => ({ ...dna, seed: seed >>> 0 })

/** An outfit ("look") saved separately from the body, so it can be put on other avatars. */
export interface Outfit {
  name: string
  outfit: ItemRef[]
  accessories: ItemRef[]
}

export function extractOutfit(dna: AvatarDNA, name = 'Outfit'): Outfit {
  return {
    name,
    outfit: structuredClone(dna.outfit),
    accessories: structuredClone(dna.accessories.filter((a) => a.id !== 'custom' || a.asset?.id)),
  }
}

export function applyOutfit(dna: AvatarDNA, o: Outfit): AvatarDNA {
  const outfit = dna.kind === 'humanoid' ? resolveItems(structuredClone(o.outfit), dna.kind) : []
  const accessories = resolveItems(structuredClone(o.accessories), dna.kind)
  return { ...dna, outfit, accessories }
}
