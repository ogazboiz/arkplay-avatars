/* Avatar rarity: Common → Legendary.
 *
 * Owner rule: rarity comes ONLY from paid, limited and NFT items. Free choices (every
 * slider, colour, species and free item, however unusual) score nothing, so nobody can
 * make themselves Legendary by picking rare free options. The score is a plain sum of
 * item points, so adding an item never lowers it (monotonic), and the result is a pure
 * function of the DNA's item list plus the `nft` flag (deterministic).
 *
 * Bump RARITY_VERSION when the points or thresholds change, so stored or cached tiers can
 * be recomputed. */

import { itemSpec, itemTier } from './dna/schema/index.ts'
import type { ItemTier } from './dna/schema/types.ts'
import type { AvatarDNA } from './dna/types.ts'

export const RARITY_VERSION = 1

export const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type RarityTier = (typeof RARITY_TIERS)[number]

/** The lowest score of each tier: common < 10, uncommon 10–29, rare 30–59, epic 60–99, legendary ≥ 100. */
export const RARITY_THRESHOLDS: Readonly<Record<RarityTier, number>> = { common: 0, uncommon: 10, rare: 30, epic: 60, legendary: 100 }

/** Points per item by tier. Limited editions with a small `edition` weigh more (see `itemPoints`). */
export const RARITY_POINTS: Readonly<Record<ItemTier, number>> = { free: 0, paid: 10, limited: 30, nft: 100 }

/** Limited editions of at most `edition` copies score `points` instead of the base 30. */
export const LIMITED_EDITION_POINTS: readonly { edition: number; points: number }[] = [
  { edition: 100, points: 60 },
  { edition: 1000, points: 45 },
]

export interface RarityContribution {
  itemId: string
  tier: ItemTier
  points: number
}

export interface Rarity {
  tier: RarityTier
  score: number
  /** The items that scored, in DNA order (outfit, then accessories), each id once. */
  contributions: RarityContribution[]
}

export interface RarityOptions {
  /** The avatar IS an NFT prebuilt (the service knows; the DNA doesn't say). */
  nft?: boolean
}

/** Points one item adds to an avatar's rarity (0 for free and unknown items). */
export function itemPoints(itemId: string): number {
  const tier = itemTier(itemId)
  if (tier !== 'limited') return RARITY_POINTS[tier]
  const edition = itemSpec(itemId)?.limited?.edition
  if (edition !== undefined && edition > 0) for (const e of LIMITED_EDITION_POINTS) if (edition <= e.edition) return e.points
  return RARITY_POINTS.limited
}

export function rarityTierFor(score: number): RarityTier {
  let tier: RarityTier = 'common'
  for (const t of RARITY_TIERS) if (score >= RARITY_THRESHOLDS[t]) tier = t
  return tier
}

/** The distinct paid, limited and NFT items an avatar wears (what entitlements cover). */
export function nonFreeItems(dna: Pick<AvatarDNA, 'outfit' | 'accessories'>): { itemId: string; tier: ItemTier }[] {
  const seen = new Set<string>()
  const out: { itemId: string; tier: ItemTier }[] = []
  for (const ref of [...dna.outfit, ...dna.accessories]) {
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    const tier = itemTier(ref.id)
    if (tier !== 'free') out.push({ itemId: ref.id, tier })
  }
  return out
}

/**
 * The rarity of an avatar. Pass normalized DNA (what the service stores and the studio
 * edits); unknown items score nothing. An NFT prebuilt is at least Epic, and Legendary
 * when it also wears limited or NFT items.
 */
export function avatarRarity(dna: Pick<AvatarDNA, 'outfit' | 'accessories'>, opts: RarityOptions = {}): Rarity {
  const contributions: RarityContribution[] = nonFreeItems(dna).map((i) => ({ itemId: i.itemId, tier: i.tier, points: itemPoints(i.itemId) }))
  let score = contributions.reduce((s, c) => s + c.points, 0)
  if (opts.nft) {
    const special = contributions.some((c) => c.tier === 'limited' || c.tier === 'nft')
    score = Math.max(score, special ? RARITY_THRESHOLDS.legendary : RARITY_THRESHOLDS.epic)
  }
  return { tier: rarityTierFor(score), score, contributions }
}
