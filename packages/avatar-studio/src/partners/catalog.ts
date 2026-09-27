/* The Partners picker's logic, kept free of React so it is easy to test: loading the public
 * catalog (one request per catalog URL every few minutes, shared by every picker on the
 * page), grouping by brand, what the avatar already wears, and the tier badge. */

import type { AvatarDNA, ItemTier } from '@arkplay/avatar-engine'
import type { StudioStrings } from '../strings.ts'
import { tierBadge, type TierBadge } from '../state/tiers.ts'
import type { StudioPartnerCatalog, StudioPartnerItem, StudioPartnersOptions } from './types.ts'

export const DEFAULT_CATALOG_URL = '/avatar/v1/partners/catalog'
/** How long a loaded catalog is reused before it is fetched again. */
export const CATALOG_TTL_MS = 5 * 60_000

const cache = new Map<string, { at: number; promise: Promise<StudioPartnerCatalog> }>()

/** Forgets loaded catalogs (tests, or a host that knows the catalog changed). */
export const clearPartnerCatalogCache = (): void => cache.clear()

function isCatalog(v: unknown): v is StudioPartnerCatalog {
  const c = v as StudioPartnerCatalog | null
  return !!c && typeof c === 'object' && Array.isArray(c.items) && Array.isArray(c.partners)
}

/** Only well-formed custom items with an uploaded asset id are offered. */
function usable(i: StudioPartnerItem): boolean {
  return (
    !!i &&
    typeof i.id === 'string' &&
    typeof i.brand === 'string' &&
    typeof i.name === 'string' &&
    typeof i.previewUrl === 'string' &&
    i.item?.id === 'custom' &&
    typeof i.item.asset?.id === 'string' &&
    /^as_[a-z0-9]{8,40}$/.test(i.item.asset.id)
  )
}

/** The catalog for these options (cached for CATALOG_TTL_MS; a failure is not cached). */
export function loadPartnerCatalog(o: StudioPartnersOptions, now: number = Date.now()): Promise<StudioPartnerCatalog> {
  const url = o.catalogUrl ?? DEFAULT_CATALOG_URL
  const hit = cache.get(url)
  if (hit && now - hit.at < CATALOG_TTL_MS) return hit.promise
  const f = o.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const promise = f(url, { headers: { Accept: 'application/json' }, credentials: 'omit' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`catalog ${res.status}`)
      const body: unknown = await res.json()
      if (!isCatalog(body)) throw new Error('catalog: unexpected shape')
      return { ...body, items: body.items.filter(usable) }
    })
    .catch((e: unknown) => {
      cache.delete(url)
      throw e
    })
  cache.set(url, { at: now, promise })
  return promise
}

/** Where service-relative catalog URLs resolve: `baseUrl`, else the catalog URL's origin. */
export function serviceBase(o: StudioPartnersOptions): string {
  if (o.baseUrl !== undefined) return o.baseUrl.replace(/\/+$/, '')
  const url = o.catalogUrl ?? DEFAULT_CATALOG_URL
  try {
    return /^https?:\/\//i.test(url) ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

export const resolveUrl = (base: string, path: string): string => (path.startsWith('/') ? `${base}${path}` : path)

export interface BrandGroup {
  id: string
  name: string
  items: StudioPartnerItem[]
}

/** Items grouped by brand, in the catalog's brand order (brands without items are left out). */
export function groupByBrand(c: StudioPartnerCatalog): BrandGroup[] {
  const groups = new Map<string, BrandGroup>()
  for (const p of c.partners) groups.set(p.id, { id: p.id, name: p.name, items: [] })
  for (const i of c.items) {
    let g = groups.get(i.partnerId)
    if (!g) groups.set(i.partnerId, (g = { id: i.partnerId, name: i.brand, items: [] }))
    g.items.push(i)
  }
  return [...groups.values()].filter((g) => g.items.length > 0)
}

/** Index in `dna.accessories` of the custom item wearing this partner item's asset, or -1. */
export function wornIndex(dna: AvatarDNA, item: StudioPartnerItem): number {
  const assetId = item.item.asset?.id
  return dna.accessories.findIndex((a) => a.id === 'custom' && !!assetId && a.asset?.id === assetId)
}

/** The studio's PRO / LIMITED badge for a partner tier (null for free items). */
export function partnerBadge(item: StudioPartnerItem, s: StudioStrings, now: number = Date.now()): TierBadge | null {
  const tier: ItemTier = item.tier === 'paid' || item.tier === 'limited' ? item.tier : 'free'
  // A partner's limited edition runs on its own dates, not the launch promo's.
  if (tier === 'limited' && !item.limited?.until) return { tier, short: s.tierLimited, note: '', full: s.tierLimited }
  return tierBadge(tier, s, now, item.limited?.until ?? undefined)
}
