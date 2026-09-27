/* Typed access to taxonomy.json, the contract with the Python trainer: heads, class order,
 * crop spec and the list of measured quantities. Never reorder classes; add at the end. */

import taxonomyJson from '../taxonomy.json' with { type: 'json' }
import type { CropSpec } from './crop.ts'

export type HeadType = 'ordinal' | 'multiclass' | 'binary'

export interface HeadSpec {
  id: string
  type: HeadType
  classes: readonly string[]
  prompts?: readonly string[]
  /** Class renames under a horizontal flip (hair_part left ↔ right). */
  flip?: Readonly<Record<string, string>>
}

export interface Taxonomy {
  version: number
  crop: CropSpec
  heads: readonly HeadSpec[]
  measured: {
    colors: readonly string[]
    geometry: readonly string[]
    hair: readonly string[]
    expression: readonly string[]
  }
}

export const TAXONOMY = taxonomyJson as unknown as Taxonomy

export const CROP: CropSpec = {
  sizeD: TAXONOMY.crop.sizeD,
  centerD: TAXONOMY.crop.centerD,
  size: TAXONOMY.crop.size,
  pad: [TAXONOMY.crop.pad[0], TAXONOMY.crop.pad[1], TAXONOMY.crop.pad[2]],
}

const byId = new Map(TAXONOMY.heads.map((h) => [h.id, h]))

export function headSpec(id: string): HeadSpec {
  const h = byId.get(id)
  if (!h) throw new Error(`Unknown taxonomy head "${id}"`)
  return h
}

export const HEAD_IDS: readonly string[] = TAXONOMY.heads.map((h) => h.id)

/** Index of a class in its head (throws on unknown ids, so typos fail loudly in tests). */
export function classIndex(head: string, cls: string): number {
  const i = headSpec(head).classes.indexOf(cls)
  if (i < 0) throw new Error(`Unknown class "${cls}" for head "${head}"`)
  return i
}

/** Probabilities with a horizontal flip applied (swaps classes named in `flip`). */
export function flipProbs(head: string, probs: readonly number[]): number[] {
  const spec = headSpec(head)
  if (!spec.flip) return probs.slice()
  const out = probs.slice()
  for (const [from, to] of Object.entries(spec.flip)) {
    const i = spec.classes.indexOf(from)
    const j = spec.classes.indexOf(to)
    if (i >= 0 && j >= 0) out[j] = probs[i]
  }
  return out
}
