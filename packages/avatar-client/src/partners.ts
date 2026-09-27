/* The ArkPlay Creator Partnership Programme: brands and creators bring their own branded
 * avatar accessories. Wire types of `/avatar/v1/partners/*` (public catalog),
 * `/avatar/v1/me/partners/*` (applicants and partners) and `/avatar/v1/admin/partners/*`
 * (review, platform key), the programme constants every side shares (slots, categories,
 * terms version), and a small typed client. docs/studio.md has the programme.
 *
 * A published partner item is a platform-owned uploaded asset (`as_…`) worn through the
 * engine's ordinary `custom` accessory: the catalog hands out `item`, a ready `ItemRef`
 * (`{ id: 'custom', params, asset }`), so no DNA schema or share-code change is involved.
 *
 * Like types.ts, this is a public contract: add fields, never rename or remove them. */

import type { CustomAsset, ItemRef } from '@arkplay/avatar-engine'
import { AvatarApiError, type AvatarClientOptions, type TokenGetter } from './client.ts'
import { AVATAR_API_PREFIX, type ApiErrorBody, type PromoState } from './types.ts'

/**
 * The programme terms an application accepts. The service refuses applications made against
 * any other version (409 `terms_outdated`), so change this together with the published
 * terms (docs/studio.md, "Legal and IP").
 */
export const PARTNER_TERMS_VERSION = '2026-09-draft-1'

export const PARTNER_CATEGORIES = ['fashion', 'streetwear', 'sports', 'music', 'gaming', 'faith', 'art', 'education', 'charity', 'other'] as const
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number]

export const PARTNER_CATEGORY_LABELS: Record<PartnerCategory, string> = {
  fashion: 'Fashion and accessories',
  streetwear: 'Streetwear',
  sports: 'Sports and teams',
  music: 'Music and artists',
  gaming: 'Games and esports',
  faith: 'Church and ministry',
  art: 'Illustration and design',
  education: 'Education',
  charity: 'Charity and non-profit',
  other: 'Something else',
}

/** Rough size of the applicant's audience (followers, customers or members). */
export const AUDIENCE_BANDS = ['under_1k', '1k_10k', '10k_100k', '100k_1m', 'over_1m'] as const
export type AudienceBand = (typeof AUDIENCE_BANDS)[number]

export const AUDIENCE_BAND_LABELS: Record<AudienceBand, string> = {
  under_1k: 'Under 1,000',
  '1k_10k': '1,000 to 10,000',
  '10k_100k': '10,000 to 100,000',
  '100k_1m': '100,000 to 1 million',
  over_1m: 'Over 1 million',
}

export type PartnerTier = 'free' | 'paid' | 'limited'
export const PARTNER_TIERS: readonly PartnerTier[] = ['free', 'paid', 'limited']

/** `front` = over the body, `behind` = behind it (back items), `top` = above everything. */
export type PartnerLayer = 'front' | 'behind' | 'top'
export const PARTNER_LAYERS: readonly PartnerLayer[] = ['front', 'behind', 'top']

export type PartnerSlot = 'hat' | 'glasses' | 'face' | 'earrings' | 'necklace' | 'badge' | 'back' | 'belt' | 'held' | 'float'

/**
 * Where an item sits on the avatar. The same 0..1 values as the engine's `custom` item
 * params: `x`/`y` nudge it around the anchor (0.5 = on it), `scale` sizes it against the
 * anchor (0.25..3 × the anchor's size), `rotation` 0.5 = upright (0..1 = -180..180°).
 * `px`/`py` is the art's own pivot (0..1 of its width and height) that lands on the anchor.
 */
export interface PartnerPlacement {
  layer: PartnerLayer
  x: number
  y: number
  scale: number
  rotation: number
  px: number
  py: number
}

export interface PartnerSlotInfo {
  id: PartnerSlot
  label: string
  /** The engine's custom-accessory anchor (`CUSTOM_ANCHORS`) the art attaches to. */
  anchor: 'head' | 'face' | 'eyes' | 'neck' | 'chest' | 'back' | 'waist' | 'handR' | 'float'
  /** Default placement for new items in this slot. */
  placement: PartnerPlacement
  /** Recommended canvas (px, width × height). */
  canvas: [number, number]
  /** Where the pivot belongs, for the art guidelines. */
  pivot: string
  /** Examples for the guidelines. */
  examples: string
  /** Best framing for a preview of this slot. */
  crop: 'portrait' | 'bust' | 'full'
}

const P = (layer: PartnerLayer, scale: number, px: number, py: number, x = 0.5, y = 0.5): PartnerPlacement => ({ layer, x, y, scale, rotation: 0.5, px, py })

/** Accessory slots partners can make items for, in display order. Garments are not in the
 *  programme: custom art attaches to one anchor and doesn't bend with the body. */
export const PARTNER_SLOTS: readonly PartnerSlotInfo[] = [
  { id: 'hat', label: 'Hat or headwear', anchor: 'head', placement: P('front', 0.3, 0.5, 0.78), canvas: [512, 384], pivot: 'Bottom centre of the brim, where it sits on the head.', examples: 'Caps, beanies, bucket hats, headbands, crowns.', crop: 'portrait' },
  { id: 'glasses', label: 'Glasses', anchor: 'eyes', placement: P('front', 0.42, 0.5, 0.45), canvas: [512, 192], pivot: 'The bridge between the lenses, level with the eyes.', examples: 'Sunglasses, frames, goggles.', crop: 'portrait' },
  { id: 'face', label: 'Face accessory', anchor: 'face', placement: P('front', 0.3, 0.5, 0.5), canvas: [384, 384], pivot: 'The centre of the face.', examples: 'Face paint, masks, stickers, freckle stamps.', crop: 'portrait' },
  { id: 'earrings', label: 'Earrings', anchor: 'face', placement: P('front', 0.4, 0.5, 0.35, 0.5, 0.56), canvas: [512, 256], pivot: 'Midway between the ears. Draw both earrings on one canvas with empty space between (in side view the pair shifts with the face).', examples: 'Studs, hoops, drops.', crop: 'portrait' },
  { id: 'necklace', label: 'Necklace or chain', anchor: 'neck', placement: P('front', 0.35, 0.5, 0.22), canvas: [384, 384], pivot: 'The middle of the top edge, at the base of the neck.', examples: 'Chains, pendants, lanyards, scarves.', crop: 'bust' },
  { id: 'badge', label: 'Badge or pin', anchor: 'chest', placement: P('front', 0.06, 0.5, 0.5, 0.56, 0.5), canvas: [256, 256], pivot: 'The centre of the badge.', examples: 'Logo pins, patches, team crests, ribbons.', crop: 'bust' },
  { id: 'back', label: 'Back item', anchor: 'back', placement: P('behind', 0.32, 0.5, 0.35), canvas: [512, 512], pivot: 'Between the shoulder blades.', examples: 'Backpacks, capes, guitar cases, wings.', crop: 'full' },
  { id: 'belt', label: 'Belt or waist item', anchor: 'waist', placement: P('front', 0.3, 0.5, 0.5), canvas: [512, 192], pivot: 'The buckle, at the middle of the waist.', examples: 'Belts, bum bags, sashes, holsters.', crop: 'full' },
  { id: 'held', label: 'Held item', anchor: 'handR', placement: P('front', 0.3, 0.5, 0.62), canvas: [256, 384], pivot: 'Where the hand grips it.', examples: 'Phones, balls, bags, flags, microphones, bibles.', crop: 'full' },
  { id: 'float', label: 'Floating item', anchor: 'float', placement: P('front', 0.35, 0.5, 0.5), canvas: [384, 384], pivot: 'The centre of the item.', examples: 'Logo orbs, balloons, drones, companions.', crop: 'full' },
]

export const partnerSlot = (id: string): PartnerSlotInfo | undefined => PARTNER_SLOTS.find((s) => s.id === id)

/** What partner art may be: the same limits as every uploaded asset. */
export const PARTNER_ART = {
  types: ['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'],
  /** Bytes per file (after SVG cleaning). */
  maxBytes: 1024 * 1024,
  /** Longest side in px (bigger SVGs are scaled down; raster files are refused). */
  maxPixels: 1024,
  /** Shortest useful side for raster art. */
  minPixels: 64,
} as const

// ---- Applications ------------------------------------------------------------------------

export type PartnerApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/** `POST /avatar/v1/me/partners/application`. */
export interface PartnerApplicationInput {
  /** Brand or creator name as players will see it (2..60 characters). */
  brandName: string
  /**
   * Where we reach you about the application and the partnership: your own address. Only
   * the programme team sees it; it's never public, never logged and never used for marketing.
   */
  contactEmail: string
  /** https link to your site or shop. */
  website?: string
  /** Up to 5 links to your profiles (https). */
  socials?: string[]
  category: PartnerCategory
  audience: AudienceBand
  /** What you make, and what you'd bring to ArkPlay avatars (30..1500 characters). */
  description: string
  /** Up to 5 links to sample art or products (https). */
  sampleLinks?: string[]
  /** "I own, or am licensed to use, the brand, logos and art I'll submit." Must be true. */
  ipAttested: boolean
  /** The `PARTNER_TERMS_VERSION` the applicant accepted. */
  termsVersion: string
}

export interface PartnerApplication {
  id: string
  status: PartnerApplicationStatus
  brandName: string
  contactEmail: string
  website: string | null
  socials: string[]
  category: PartnerCategory
  audience: AudienceBand
  description: string
  sampleLinks: string[]
  termsVersion: string
  ipAttestedAt: string
  /** The reviewer's reason (a rejection) or note (an approval). */
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

/** An approved brand or creator. */
export interface PartnerInfo {
  id: string
  /** The public brand name (items show as "Brand · Item"). */
  name: string
  slug: string
  since: string
}

/** `GET /avatar/v1/me/partners/application`: where the caller stands in the programme. */
export interface PartnerStatus {
  /** The latest application (any status), or null. */
  application: PartnerApplication | null
  partner: PartnerInfo | null
  /** POST /me/partners/application would be accepted now. */
  canApply: boolean
  /** After a rejection: when the account may apply again (ISO 8601), else null. */
  reapplyAfter: string | null
  termsVersion: string
  /** This server takes partner art now (false in lite mode: drafts only). */
  artUploads: boolean
}

// ---- Items -------------------------------------------------------------------------------

/**
 * draft → (submit) in_review → approved → (publish) live. A reviewer can send an item back
 * as `changes_requested` (with a reason); the partner edits it and submits again. `retired`:
 * unpublished, gone from the catalog, but players who wear it keep it. `removed`: taken down,
 * never drawn anywhere again.
 */
export type PartnerItemStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'live' | 'retired' | 'removed'

/** `POST /avatar/v1/me/partners/items` (and a partial one for `PUT …/items/{id}`). */
export interface PartnerItemInput {
  /** 2..40 characters; players see "Brand · Name". */
  name: string
  slot: PartnerSlot
  /** Requested tier (default `free`). Paid and limited items need the owner's approval. */
  tier?: PartnerTier
  /** Notes on colourways (each colourway is its own item and file); up to 300 characters. */
  colourways?: string
  /** Up to 500 characters, for the reviewers. */
  description?: string
  /** Overrides of the slot's default placement. */
  placement?: Partial<PartnerPlacement>
}

export interface PartnerArtInfo {
  mime: string
  w: number
  h: number
  bytes: number
  sha256: string
  uploadedAt: string
}

export interface PartnerItem {
  id: string
  partnerId: string
  name: string
  slot: PartnerSlot
  /** The tier asked for, or the one the reviewer set when approving. */
  tier: PartnerTier
  /** Limited editions: last day on offer and edition size (null = open). */
  limited: { until: string | null; edition: number | null } | null
  colourways: string
  description: string
  placement: PartnerPlacement
  art: PartnerArtInfo | null
  status: PartnerItemStatus
  /** Why changes were requested, or the reviewer's note. */
  reviewNote: string | null
  /** The published asset (`as_…`), once live; kept after unpublishing. */
  assetId: string | null
  submittedAt: string | null
  reviewedAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnerLimits {
  maxItems: number
  maxInReview: number
  artBytes: number
  artPixels: number
  artTypes: string[]
}

/** `GET /avatar/v1/me/partners/items`. */
export interface PartnerItemsResponse {
  items: PartnerItem[]
  limits: PartnerLimits
  /** False in lite mode: items can be drafted, art arrives after the server upgrade. */
  artUploads: boolean
}

/** Options of the item previews (`…/preview.svg`). */
export interface PartnerPreviewOptions {
  /** `humanoid` (default) or `creature`. */
  kind?: 'humanoid' | 'creature'
  view?: 'front' | 'side' | 'back'
  crop?: 'portrait' | 'bust' | 'full'
  size?: number
  /** Unsaved placement to try (partner previews only). */
  placement?: Partial<PartnerPlacement>
}

// ---- Public catalog ----------------------------------------------------------------------

/** A published item. `item` drops straight into `dna.accessories`. */
export interface PartnerCatalogItem {
  id: string
  partnerId: string
  brand: string
  name: string
  slot: PartnerSlot
  tier: PartnerTier
  limited: { until: string | null; edition: number | null } | null
  /** `{ id: 'custom', params: { anchor, layer, x, y, scale, rotation }, asset: { id, w, h, name, px, py } }`. */
  item: ItemRef & { id: 'custom'; asset: CustomAsset & { id: string } }
  /** Service-relative: the item on a sample avatar (SVG). */
  previewUrl: string
  /** Service-relative: the art itself (`/avatar/v1/assets/{assetId}`). */
  artUrl: string
  publishedAt: string
}

/** `GET /avatar/v1/partners/catalog` (public, CORS `*`, ETag). */
export interface PartnerCatalog {
  /** Changes whenever the catalog does. */
  revision: string
  promo: PromoState
  partners: { id: string; name: string; slug: string; items: number }[]
  items: PartnerCatalogItem[]
}

// ---- Admin (X-ArkPlay-Platform-Key) ------------------------------------------------------

export interface PartnerApplicationAdmin extends PartnerApplication {
  sub: string
  partnerId: string | null
}

export interface PartnerAdminInfo extends PartnerInfo {
  sub: string
  /** Items per status. */
  items: Partial<Record<PartnerItemStatus, number>>
}

export interface PartnerItemAdmin extends PartnerItem {
  partner: { id: string; name: string; sub: string }
}

export interface PartnerAuditEntry {
  id: number
  at: string
  /** `admin` (the platform key, plus `by` when given) or the partner's account id. */
  actor: string
  action: string
  kind: 'application' | 'item'
  target: string
  note: string | null
}

/** Body of the admin reject / unpublish routes: `reason` is 3..500 characters. */
export interface PartnerReasonRequest {
  reason: string
  /** Who reviewed (a name for the audit log), optional. */
  by?: string
}

export interface PartnerApproveApplicationRequest {
  note?: string
  /** Public brand name, if it should differ from the application's. */
  name?: string
  by?: string
}

export interface PartnerApproveItemRequest {
  note?: string
  /** Final tier; default: the requested one. `paid`/`limited` need `approvePaid: true`. */
  tier?: PartnerTier
  /** The owner's explicit approval of a paid or limited item. */
  approvePaid?: boolean
  /** Limited editions: last day on offer (ISO date) and edition size. */
  limited?: { until?: string | null; edition?: number | null }
  by?: string
}

export interface PartnerUnpublishRequest extends PartnerReasonRequest {
  /** Take it down everywhere (IP claims, policy): the art is never drawn again. Default: retire it (players keep it). */
  takedown?: boolean
}

// ---- Client ------------------------------------------------------------------------------

function previewQuery(o: PartnerPreviewOptions = {}): string {
  const q = new URLSearchParams()
  if (o.kind) q.set('kind', o.kind)
  if (o.view) q.set('view', o.view)
  if (o.crop) q.set('crop', o.crop)
  if (o.size !== undefined) q.set('size', String(Math.round(o.size)))
  const p = o.placement ?? {}
  for (const k of ['x', 'y', 'scale', 'rotation', 'px', 'py'] as const) if (typeof p[k] === 'number' && Number.isFinite(p[k])) q.set(k, String(Math.round((p[k] as number) * 1000) / 1000))
  if (p.layer) q.set('layer', p.layer)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Typed client for the programme's public and signed-in routes. Same options as `AvatarClient`. */
export class PartnersClient {
  readonly baseUrl: string
  private readonly getToken?: TokenGetter
  private readonly fetchImpl: typeof fetch

  constructor(opts: AvatarClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '')
    this.getToken = opts.getToken
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args))
  }

  url(path: string): string {
    return `${this.baseUrl}${AVATAR_API_PREFIX}${path}`
  }

  /** A catalog URL (`previewUrl`, `artUrl`) made absolute against this client's base. */
  resolve(servicePath: string): string {
    return servicePath.startsWith('/') ? `${this.baseUrl}${servicePath}` : servicePath
  }

  /** Public preview of a published item on a sample avatar. */
  previewUrl(itemId: string, o: PartnerPreviewOptions = {}): string {
    return this.url(`/partners/items/${encodeURIComponent(itemId)}/preview.svg${previewQuery({ ...o, placement: undefined })}`)
  }

  async catalog(): Promise<PartnerCatalog> {
    return (await this.request('GET', '/partners/catalog', undefined, false)).json() as Promise<PartnerCatalog>
  }

  async status(): Promise<PartnerStatus> {
    return (await this.request('GET', '/me/partners/application')).json() as Promise<PartnerStatus>
  }

  async apply(input: PartnerApplicationInput): Promise<PartnerApplication> {
    return (await this.request('POST', '/me/partners/application', input)).json() as Promise<PartnerApplication>
  }

  /** Withdraws a pending application. */
  async withdraw(): Promise<void> {
    await this.request('DELETE', '/me/partners/application')
  }

  async items(): Promise<PartnerItemsResponse> {
    return (await this.request('GET', '/me/partners/items')).json() as Promise<PartnerItemsResponse>
  }

  async item(id: string): Promise<PartnerItem> {
    return (await this.request('GET', `/me/partners/items/${encodeURIComponent(id)}`)).json() as Promise<PartnerItem>
  }

  async createItem(input: PartnerItemInput): Promise<PartnerItem> {
    return (await this.request('POST', '/me/partners/items', input)).json() as Promise<PartnerItem>
  }

  async updateItem(id: string, patch: Partial<PartnerItemInput>): Promise<PartnerItem> {
    return (await this.request('PUT', `/me/partners/items/${encodeURIComponent(id)}`, patch)).json() as Promise<PartnerItem>
  }

  /** Uploads (or replaces) the item's art: the raw file, checked like every upload. */
  async uploadArt(id: string, file: Blob): Promise<PartnerItem> {
    return (await this.request('PUT', `/me/partners/items/${encodeURIComponent(id)}/art`, file)).json() as Promise<PartnerItem>
  }

  async submit(id: string): Promise<PartnerItem> {
    return (await this.request('POST', `/me/partners/items/${encodeURIComponent(id)}/submit`, {})).json() as Promise<PartnerItem>
  }

  async deleteItem(id: string): Promise<void> {
    await this.request('DELETE', `/me/partners/items/${encodeURIComponent(id)}`)
  }

  /** The item's cleaned art (signed in, so fetched rather than linked). */
  async art(id: string): Promise<Blob> {
    return (await this.request('GET', `/me/partners/items/${encodeURIComponent(id)}/art`)).blob()
  }

  /** The item on a sample avatar as an SVG blob, optionally with unsaved placement. */
  async preview(id: string, o: PartnerPreviewOptions = {}): Promise<Blob> {
    return (await this.request('GET', `/me/partners/items/${encodeURIComponent(id)}/preview.svg${previewQuery(o)}`)).blob()
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (auth) {
      const token = await this.getToken?.()
      if (!token) throw new AvatarApiError(401, { code: 'unauthorized', message: 'Sign in to use the Creator Programme.' })
      headers.Authorization = `Bearer ${token}`
    }
    let payload: BodyInit | undefined
    if (body instanceof Blob) {
      payload = body
      headers['Content-Type'] = body.type || 'application/octet-stream'
    } else if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }
    const res = await this.fetchImpl(this.url(path), { method, headers, body: payload })
    if (res.ok) return res
    const ra = Number(res.headers.get('Retry-After'))
    let err: ApiErrorBody = { code: `http_${res.status}`, message: res.statusText || `Request failed (${res.status})` }
    try {
      const j = (await res.json()) as Partial<ApiErrorBody>
      if (typeof j.code === 'string' && typeof j.message === 'string') err = { code: j.code, message: j.message, details: j.details }
    } catch {
      // Not JSON (a proxy error page): keep the status-based error.
    }
    throw new AvatarApiError(res.status, err, Number.isFinite(ra) && ra > 0 ? ra : undefined)
  }
}
