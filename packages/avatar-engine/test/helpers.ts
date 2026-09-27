/* Shared fixtures for the engine tests. */

import { applySpecies, defaultDNA, type AvatarDNA, type AvatarKind } from '../src/index.ts'

/** A bare avatar (no garments or accessories), so any item added to it must show up. */
export function bare(kind: AvatarKind, species = 'cat'): AvatarDNA {
  const d = kind === 'creature' ? applySpecies(defaultDNA('creature', 7), species) : defaultDNA('humanoid', 7)
  return { ...d, outfit: [], accessories: [] }
}

/** 4×4 opaque PNG, small enough to inline as custom art. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8Dwn4EIwESMolGFMAUAvBQDB6pEUe4AAAAASUVORK5CYII='

export const VIEWS = ['front', 'side', 'back'] as const
export const CROPS = ['full', 'fit', 'bust', 'head', 'portrait'] as const
