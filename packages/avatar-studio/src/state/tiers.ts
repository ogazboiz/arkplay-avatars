/* Free, PRO, limited and NFT: what the studio labels, and how.
 *
 * Tiers, features and the launch promo all come from the engine (`itemTier`, `FEATURES`,
 * `PROMO`). This file only turns them into badge text: "PRO · Free until 7 Oct" on paid items
 * and features while the promo runs, "LIMITED · until 7 Oct" on limited editions, "NFT" on
 * NFT-only items. Pure functions of the time passed in, so they are easy to test. */

import { FEATURES, FEATURE_LIMITS, PROMO, itemSpec, itemTier, promoActive, type FeatureSpec, type ItemTier } from '@arkplay/avatar-engine'
import type { ExportFormat } from '../export/formats.ts'
import { fmt, type StudioStrings } from '../strings.ts'

export type BadgeTier = Exclude<ItemTier, 'free'>

export interface TierBadge {
  tier: BadgeTier
  /** On a thumbnail: "PRO", "LIMITED", "NFT". */
  short: string
  /** The small line under it: "Free until 7 Oct", "Until 7 Oct", or empty. */
  note: string
  /** Everywhere with room: "PRO · Free until 7 Oct". */
  full: string
}

/** "7 Oct": dates on badges are short and unambiguous, and always in UTC like the promo. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** The promo's end as a short date ("7 Oct"). */
export const promoDate = (): string => shortDate(PROMO.until)

/** A badge for a tier, or null for free. `until` is a limited item's own end (default: the promo's). */
export function tierBadge(tier: ItemTier, s: StudioStrings, now: number = Date.now(), until?: string): TierBadge | null {
  if (tier === 'free') return null
  const promo = promoActive(now)
  if (tier === 'paid') {
    const date = promoDate()
    return promo
      ? { tier, short: s.tierPro, note: fmt(s.tierFreeUntil, { date }), full: fmt(s.tierProFull, { date }) }
      : { tier, short: s.tierPro, note: '', full: s.tierPro }
  }
  if (tier === 'limited') {
    const end = until ?? PROMO.until
    const date = shortDate(end)
    return now <= Date.parse(end)
      ? { tier, short: s.tierLimited, note: fmt(s.tierUntil, { date }), full: fmt(s.tierLimitedFull, { date }) }
      : { tier, short: s.tierLimited, note: '', full: s.tierLimited }
  }
  return { tier, short: s.tierNft, note: '', full: s.tierNft }
}

/** The badge for a catalogue item (null when it is free). */
export function itemBadge(id: string, s: StudioStrings, now: number = Date.now()): TierBadge | null {
  return tierBadge(itemTier(id), s, now, itemSpec(id)?.limited?.until)
}

/** The hint read out with an item: why it has a badge. */
export function itemTierHint(id: string, label: string, s: StudioStrings, now: number = Date.now()): string {
  const tier = itemTier(id)
  if (tier === 'free') return ''
  if (tier === 'nft') return fmt(s.tierNftHint, { item: label })
  const badge = itemBadge(id, s, now)
  if (tier === 'limited') return badge?.note ? fmt(s.tierLimitedHint, { item: label, date: shortDate(itemSpec(id)?.limited?.until ?? PROMO.until) }) : fmt(s.tierLimitedEnded, { item: label })
  return promoActive(now) ? fmt(s.tierProHint, { item: label, date: promoDate() }) : fmt(s.tierProEnded, { item: label })
}

/** Paid features, which are free for everyone while the promo runs. */
export const paidFeatures = (): FeatureSpec[] => FEATURES.filter((f) => f.tier === 'paid')

/** Features that stay free after the promo. */
export const freeFeatures = (): FeatureSpec[] => FEATURES.filter((f) => f.tier === 'free')

/** The paid feature an export format belongs to, if it has one. */
export const EXPORT_FEATURE: Partial<Record<ExportFormat, string>> = {
  gif: 'animated-exports',
  webm: 'animated-exports',
  'animated-svg': 'animated-exports',
  spritesheet: 'sprite-exports',
  rig: 'sprite-exports',
  stickers: 'sticker-pack',
}

/** The badge for a paid feature (null when the feature is free or unknown). */
export function featureBadge(id: string | undefined, s: StudioStrings, now: number = Date.now()): TierBadge | null {
  const f = id ? FEATURES.find((x) => x.id === id) : undefined
  return f && f.tier === 'paid' ? tierBadge('paid', s, now) : null
}

/** Still images wider than the free limit are the `hires-exports` feature. */
export const hiresSize = (format: ExportFormat, size: number): boolean =>
  (format === 'png' || format === 'webp' || format === 'jpeg') && size > FEATURE_LIMITS.freeImageMaxSize
