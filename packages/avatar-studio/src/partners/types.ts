/* The studio's side of the Creator Partnership Programme (docs/studio.md): the host
 * option that turns the Partners picker on, and the slice of the service's public catalog
 * (`GET /avatar/v1/partners/catalog`, `PartnerCatalog` in @arkplay/avatar-client) it reads.
 * The studio doesn't depend on the client package, so the few fields it needs are declared
 * here; the service's wire type is a superset.
 *
 * `partners` is added to `AvatarStudioProps` by declaration merging below (the prop lives with
 * the feature; `types.ts` may absorb it later without any host change). */

import type { ItemRef } from '@arkplay/avatar-engine'

export interface StudioPartnersOptions {
  /** The public catalog. Default `/avatar/v1/partners/catalog` (same origin). */
  catalogUrl?: string
  /** Base that the catalog's service-relative URLs (previews) hang off. Default: the catalog URL's origin. */
  baseUrl?: string
  /** "Make items for ArkPlay" link under the picker (the programme page), if any. */
  programmeUrl?: string
  /** A fetch to use instead of the global one (tests, custom hosts). */
  fetch?: typeof fetch
}

export type StudioPartnerTier = 'free' | 'paid' | 'limited'

/** One published partner item, as the picker uses it. */
export interface StudioPartnerItem {
  id: string
  partnerId: string
  brand: string
  name: string
  slot: string
  tier: StudioPartnerTier
  limited: { until: string | null; edition: number | null } | null
  /** Ready to wear: `{ id: 'custom', params, asset: { id, w, h, name, px, py } }`. */
  item: ItemRef
  /** Service-relative preview of the item on a sample avatar (SVG). */
  previewUrl: string
  artUrl: string
}

export interface StudioPartnerCatalog {
  revision: string
  partners: { id: string; name: string; slug: string; items: number }[]
  items: StudioPartnerItem[]
}

declare module '../types.ts' {
  interface AvatarStudioProps {
    /**
     * The Partners picker on the Accessories tab: branded items from ArkPlay creator partners,
     * worn as custom accessories. Off by default; the picker makes no request until a host
     * passes this (the website does once `features.creators` is on). Needs `customArt`.
     */
    partners?: StudioPartnersOptions | false
  }
}
