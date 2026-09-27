/* Free and paid features, and the launch promo. Plain data plus pure helpers: the service
 * enforces what it can (saving premium items, custom uploads, extra saved avatars), the
 * studio labels everything, and both read the same table. Whether a feature is free
 * "right now" depends only on the time passed in, so this stays deterministic. */

import { itemSpec, itemTier } from './dna/schema/index.ts'

export type FeatureTier = 'free' | 'paid'

export interface FeatureSpec {
  id: string
  label: string
  tier: FeatureTier
  description: string
}

/** Numbers the feature table refers to. */
export const FEATURE_LIMITS = {
  /** Saved avatars on the free tier; `extra-saves` raises it to the service cap. */
  freeSavedAvatars: 3,
  paidSavedAvatars: 50,
  /** Largest static image (px wide) on the free tier; bigger is `hires-exports`. */
  freeImageMaxSize: 512,
} as const

export const FEATURES: readonly FeatureSpec[] = [
  { id: 'creator', label: 'Avatar creator', tier: 'free', description: 'Every free part, colour, species, expression, pose and scene in the creator.' },
  { id: 'photo-avatar', label: 'Avatar from a photo', tier: 'free', description: 'Start an avatar from a selfie; the photo is never stored.' },
  { id: 'share-codes', label: 'Share codes', tier: 'free', description: 'Share any avatar as a code or link.' },
  { id: 'default-creature', label: 'Default creature', tier: 'free', description: 'Every account starts with its own creature avatar.' },
  { id: 'profile', label: 'Player profile', tier: 'free', description: 'Your avatar is your profile picture in every ArkPlay game.' },
  { id: 'static-images', label: 'Images up to 512 px', tier: 'free', description: `Static PNG and SVG images up to ${FEATURE_LIMITS.freeImageMaxSize} px.` },
  { id: 'saved-avatars', label: `${FEATURE_LIMITS.freeSavedAvatars} saved avatars`, tier: 'free', description: `Keep up to ${FEATURE_LIMITS.freeSavedAvatars} avatars on your account.` },
  { id: 'premium-items', label: 'Premium items', tier: 'paid', description: 'Auras, pets, wings, royal and fantasy headwear, and magic held items.' },
  { id: 'custom-uploads', label: 'Custom uploads', tier: 'paid', description: 'Upload your own art and wear it as an accessory.' },
  { id: 'animated-exports', label: 'Animated exports', tier: 'paid', description: 'Download animations as GIF, WebM or animated SVG.' },
  { id: 'sprite-exports', label: 'Sprite sheets and rigs', tier: 'paid', description: 'Game-ready sprite sheets and skeletal rig bundles.' },
  { id: 'hires-exports', label: 'High-resolution images', tier: 'paid', description: `Static images larger than ${FEATURE_LIMITS.freeImageMaxSize} px.` },
  { id: 'sticker-pack', label: 'Sticker pack', tier: 'paid', description: 'A pack of expression stickers of your avatar.' },
  { id: 'extra-saves', label: 'More saved avatars', tier: 'paid', description: `Keep more than ${FEATURE_LIMITS.freeSavedAvatars} avatars (up to ${FEATURE_LIMITS.paidSavedAvatars}).` },
]

export interface Promo {
  /** Every paid feature (and paid or limited item) is free while the promo runs. */
  allFree: boolean
  /** Last instant of the promo (ISO 8601, UTC). */
  until: string
  label: string
}

/** Launch promo: everything is free for two weeks from 2026-09-23. */
export const PROMO: Promo = { allFree: true, until: '2026-10-07T23:59:59Z', label: 'Free until 7 Oct' }

export const featureSpec = (id: string): FeatureSpec | undefined => FEATURES.find((f) => f.id === id)

/** True while `promo` makes everything free (`now` in ms since the epoch). */
export function promoActive(now: number, promo: Promo = PROMO): boolean {
  return promo.allFree && now <= Date.parse(promo.until)
}

/** Free right now: a free feature, or a paid one during the promo. */
export function featureFreeNow(id: string, now: number, promo: Promo = PROMO): boolean {
  const f = featureSpec(id)
  return !!f && (f.tier === 'free' || promoActive(now, promo))
}

/** Paid features that are free only because of the promo (empty once it ends). */
export function temporarilyFreeFeatures(now: number, promo: Promo = PROMO): string[] {
  return promoActive(now, promo) ? FEATURES.filter((f) => f.tier === 'paid').map((f) => f.id) : []
}

/**
 * The feature that unlocks a paid item as a whole: `custom-uploads` for custom art,
 * `premium-items` for every other `paid` item. Limited and NFT-only items are owned one
 * by one, so they have none (and free items need none).
 */
export function itemFeature(itemId: string): string | undefined {
  if (itemTier(itemId) !== 'paid') return undefined
  return itemSpec(itemId)?.slot === 'custom' ? 'custom-uploads' : 'premium-items'
}
