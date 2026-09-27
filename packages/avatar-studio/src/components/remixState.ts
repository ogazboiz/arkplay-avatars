/* Remix settings that outlive the Remix tab (the partner, seeds, morph start). */

import { freshSeed, sectionSpec, type AvatarDNA } from '@arkplay/avatar-engine'
import type { StudioStrings } from '../strings.ts'

export type Strength = 'subtle' | 'medium' | 'wild'
export const STRENGTH: Record<Strength, number> = { subtle: 0.22, medium: 0.5, wild: 0.9 }

export interface RemixState {
  strength: Strength
  varSeed: number
  partner: AvatarDNA | null
  breedSeed: number
  morphFrom: AvatarDNA | null
  morphT: number
}

export const initialRemix = (): RemixState => ({ strength: 'medium', varSeed: freshSeed(), partner: null, breedSeed: freshSeed(), morphFrom: null, morphT: 0 })

export function lockLabel(id: string, s: StudioStrings): string {
  if (id === 'outfit') return s.outfitSection
  if (id === 'accessories') return s.accessoriesSection
  const [sec, key] = id.split('.')
  const spec = sectionSpec(sec)
  if (!spec) return id
  return key ? `${spec.label}: ${spec.params.find((p) => p.key === key)?.label ?? key}` : spec.label
}

