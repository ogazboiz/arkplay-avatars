/* Clip choices shared by the export paths. Pure (engine metadata only). */

import { CLIPS, clipsFor, type AvatarDNA, type ClipInfo } from '@arkplay/avatar-engine'

/** The named clip if this kind has it, else idle, else the kind's first clip. */
export const clipInfo = (dna: AvatarDNA, name?: string): ClipInfo => {
  const own = clipsFor(dna.kind)
  return own.find((c) => c.name === name) ?? own.find((c) => c.name === 'idle') ?? own[0] ?? CLIPS[0]
}

/** The requested clips that exist for this kind (idle when none are left). */
export function pickClips(dna: AvatarDNA, names?: string[]): ClipInfo[] {
  const own = clipsFor(dna.kind)
  const picked = (names ?? []).map((n) => own.find((c) => c.name === n)).filter((c): c is ClipInfo => !!c)
  return picked.length ? picked : [clipInfo(dna, 'idle')]
}
