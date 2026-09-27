/* Premium looks from the avatar service (premium core, docs/studio.md).
 *
 * The browser engine has no art for premium items (paid, limited and NFT): it draws a neutral
 * placeholder in their place (`needsPremiumArt(dna)` tells). When the host gives the studio the
 * avatar API base (`previewBase`), the studio shows the service's drawing of such an avatar:
 *  - the stage: POST {base}/studio/preview, an SVG drawn with a fixed id prefix that is renamed
 *    here before the SVG is inlined (inline SVGs share one page's ids and styles);
 *  - the item pickers: GET {base}/catalog/items/{id}.svg (public, long-cached);
 *  - exports: the preview for stills, and the public render routes by share code for
 *    animations, GIFs, sprite sheets and rigs; with server exports on (the host's
 *    `serverExports`), every download is made by POST {base}/studio/export instead.
 * Previews are kept in a small LRU by DNA key + options: undo, redo and view flips are instant,
 * and each look is fetched once. Nothing here holds premium art: only what the service drew. */

import { ENGINE_VERSION, encodeShareCode, type AvatarDNA, type AvatarKind, type Crop, type View } from '@arkplay/avatar-engine'
import type { PhotoAvatarResponse } from '@arkplay/avatar-client'
import { PhotoServerError } from '../photo/serverPhoto.ts'
import { dnaKey } from './keys.ts'
import { createLru } from './lru.ts'

/** `fetch` for the service calls: a host adds its auth here (signed-in players get their own
 *  preview bucket). */
export type PreviewFetch = (url: string, init: RequestInit) => Promise<Response>

/** One look for the stage or a still export (the options of `POST /studio/preview`). */
export interface PremiumPreviewRequest {
  dna: AvatarDNA
  view?: View
  crop?: Crop
  /** Width in px (default 720, the stage). */
  size?: number
  expression?: string
  pose?: string
  detail?: 'low' | 'medium' | 'high'
  /** Scene background and frame (default true). */
  background?: boolean
  /** Looping aura/effect CSS (default on). */
  motion?: boolean
  /** A clip: with `loop`, the whole clip as a looping animated SVG; else its frame at `time`. */
  anim?: string
  time?: number
  loop?: boolean
}

/** Why the service couldn't draw a look: unreachable, busy (429/503), not deployed (404), the
 *  request too big (413, inline art), a paid feature the player hasn't unlocked (403
 *  `entitlement_required`, exports), or anything else. */
export type PremiumErrorKind = 'offline' | 'busy' | 'unavailable' | 'too-large' | 'locked' | 'failed'

export class PremiumPreviewError extends Error {
  readonly kind: PremiumErrorKind
  /** Seconds, from Retry-After. */
  readonly retryAfter?: number
  /** For `locked`: what would unlock it, e.g. `feature:animated-exports`. */
  readonly needs?: string[]
  constructor(kind: PremiumErrorKind, message: string, retryAfter?: number, needs?: string[]) {
    super(message)
    this.name = 'PremiumPreviewError'
    this.kind = kind
    this.retryAfter = retryAfter
    this.needs = needs
  }
}

/** Thrown by exports that can't include premium items here: no service (`reason: 'service'`), or
 *  a format the service can't make right now (`'format'`). The export dialog explains it. */
export class PremiumExportError extends Error {
  readonly reason: 'service' | 'format'
  constructor(reason: 'service' | 'format', message: string) {
    super(message)
    this.name = 'PremiumExportError'
    this.reason = reason
  }
}

/** The fixed id prefix of service previews (the service also names it in `X-Avatar-Id-Prefix`). */
export const SERVICE_ID_PREFIX = 'ap_sv'

type Query = Record<string, string | number | boolean | undefined>

export interface PremiumService {
  /** The avatar API base, e.g. `/avatar/v1`. */
  readonly base: string
  /** The service's SVG of a look, its ids renamed to `idPrefix` (cached; abortable). */
  preview(req: PremiumPreviewRequest, idPrefix: string, signal?: AbortSignal): Promise<string>
  /** A cached preview (renamed to `idPrefix`), or undefined without a request. */
  peek(req: PremiumPreviewRequest, idPrefix: string): string | undefined
  /** Picker thumbnail of an item on a stock avatar (versioned by the engine, so long-cached). */
  itemThumbUrl(id: string, kind: AvatarKind, size?: number): string
  /** A public render route by share code: `svg`, `anim.svg`, `gif`, `spritesheet.zip`, `rig.zip`. */
  codeUrl(dna: AvatarDNA, route: 'svg' | 'anim.svg' | 'gif' | 'spritesheet.zip' | 'rig.zip', query?: Query): string
  /** GET a URL through the host's fetch, as bytes (throws PremiumPreviewError). */
  download(url: string, signal?: AbortSignal): Promise<Blob>
  /** Picker tiles drawn by the service, in order (null where one failed): `POST {base}/studio/tiles`. */
  tiles(items: Record<string, unknown>[], signal?: AbortSignal): Promise<(string | null)[]>
  /** Avatars from a photo, made by the service: `POST {base}/vision/avatar` (throws PhotoServerError). */
  photoAvatar(jpeg: Blob, q: { seed?: number; count?: number }, signal?: AbortSignal): Promise<PhotoAvatarResponse>
  /** A studio download made by the service: `POST {base}/studio/export` (throws PremiumPreviewError). */
  exportFile(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ blob: Blob; filename: string | null }>
}

/** Markup that could run script if inlined; engine SVG never contains any of it. */
export const UNSAFE_SVG = /<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:/i

/** Renames every id (and the CSS names built from them) from `from` to `to`. */
export const renameIds = (svg: string, from: string, to: string): string => (from === to ? svg : svg.split(from).join(to))

const trimBase = (base: string) => base.replace(/\/+$/, '')

const query = (q: Query = {}): string => {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'boolean' ? (v ? '1' : '0') : String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** The cache key of a look: everything that changes the service's SVG. */
export function previewKey(r: PremiumPreviewRequest): string {
  const clip = r.anim ? `|${r.anim}|${r.loop ? 'loop' : (r.time ?? 0).toFixed(2)}` : ''
  return [dnaKey(r.dna), r.view ?? 'front', r.crop ?? 'fit', r.size ?? 720, r.expression ?? '', r.pose ?? '', r.detail ?? '', r.background === false ? 0 : 1, r.motion === false ? 0 : 1].join('|') + clip
}

/** The JSON body of `POST /studio/preview` (defaults left out). */
export function previewBody(r: PremiumPreviewRequest): Record<string, unknown> {
  const b: Record<string, unknown> = { dna: r.dna, size: r.size ?? 720 }
  if (r.view && r.view !== 'front') b.view = r.view
  if (r.crop && r.crop !== 'fit') b.crop = r.crop
  if (r.expression) b.expression = r.expression
  if (r.pose) b.pose = r.pose
  if (r.detail) b.detail = r.detail
  if (r.background === false) b.background = false
  if (r.motion === false) b.motion = false
  if (r.anim) {
    b.anim = r.anim
    if (r.loop) b.loop = true
    else b.time = Math.round((r.time ?? 0) * 100) / 100
  }
  return b
}

function failure(res: Response): PremiumPreviewError {
  const retry = Number(res.headers.get('retry-after')) || undefined
  if (res.status === 429 || res.status === 503) {
    // 503 feature_unavailable (lite mode) has no Retry-After: retrying won't help.
    return new PremiumPreviewError(res.status === 503 && !retry ? 'unavailable' : 'busy', `The avatar service is busy (HTTP ${res.status}).`, retry)
  }
  if (res.status === 404 || res.status === 405) return new PremiumPreviewError('unavailable', 'This avatar service has no premium previews yet.')
  if (res.status === 413) return new PremiumPreviewError('too-large', 'The avatar is too large to preview (custom art).')
  return new PremiumPreviewError('failed', `The avatar service could not draw this look (HTTP ${res.status}).`)
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError'

export function premiumService(base: string, fetchImpl?: PreviewFetch, cacheSize = 16): PremiumService {
  const root = trimBase(base)
  const doFetch: PreviewFetch = fetchImpl ?? ((url, init) => fetch(url, { credentials: 'same-origin', ...init }))
  const cache = createLru<{ svg: string; prefix: string }>(cacheSize)
  const inflight = new Map<string, Promise<{ svg: string; prefix: string }>>()
  // A service without the preview route (404/405) won't grow one mid-session: stop asking.
  let missing = false

  const call = async (url: string, init: RequestInit): Promise<Response> => {
    try {
      return await doFetch(url, init)
    } catch (e) {
      if (isAbort(e)) throw e
      throw new PremiumPreviewError('offline', 'The avatar service can’t be reached.')
    }
  }

  const fetchPreview = (req: PremiumPreviewRequest, key: string): Promise<{ svg: string; prefix: string }> => {
    let p = inflight.get(key)
    if (!p) {
      p = (async () => {
        if (missing) throw new PremiumPreviewError('unavailable', 'This avatar service has no premium previews yet.')
        const res = await call(`${root}/studio/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'image/svg+xml' }, body: JSON.stringify(previewBody(req)) })
        if (res.status === 404 || res.status === 405) missing = true
        if (!res.ok) throw failure(res)
        const svg = await res.text()
        if (!svg.startsWith('<svg')) throw new PremiumPreviewError('failed', 'The avatar service answered with something other than an SVG.')
        // It is inlined into the page: never anything that could run (the engine emits none of it).
        if (UNSAFE_SVG.test(svg)) throw new PremiumPreviewError('failed', 'The avatar service answered with an SVG the studio won’t show.')
        const hit = { svg, prefix: res.headers.get('x-avatar-id-prefix') || SERVICE_ID_PREFIX }
        cache.set(key, hit)
        return hit
      })().finally(() => inflight.delete(key))
      inflight.set(key, p)
    }
    return p
  }

  return {
    base: root,
    peek(req, idPrefix) {
      const hit = cache.get(previewKey(req))
      return hit ? renameIds(hit.svg, hit.prefix, idPrefix) : undefined
    },
    async preview(req, idPrefix, signal) {
      if (signal?.aborted) throw new DOMException('The preview is no longer needed.', 'AbortError')
      const key = previewKey(req)
      const hit = cache.get(key)
      if (hit) return renameIds(hit.svg, hit.prefix, idPrefix)
      // Several callers may wait for one request; each can give up without cancelling it.
      const shared = fetchPreview(req, key)
      const got = await new Promise<{ svg: string; prefix: string }>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('The preview is no longer needed.', 'AbortError'))
        signal?.addEventListener('abort', onAbort, { once: true })
        shared.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort))
      })
      return renameIds(got.svg, got.prefix, idPrefix)
    },
    itemThumbUrl(id, kind, size = 160) {
      return `${root}/catalog/items/${encodeURIComponent(id)}.svg${query({ kind, size, v: ENGINE_VERSION })}`
    },
    codeUrl(dna, route, q) {
      const code = encodeShareCode(dna)
      return route === 'spritesheet.zip' || route === 'rig.zip' ? `${root}/render/${code}/${route}${query(q)}` : `${root}/render/${code}.${route}${query(q)}`
    },
    async download(url, signal) {
      const res = await call(url, { method: 'GET', signal })
      if (!res.ok) throw failure(res)
      return res.blob()
    },
    async tiles(items, signal) {
      const res = await call(`${root}/studio/tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }), signal })
      if (!res.ok) throw failure(res)
      const body = (await res.json().catch(() => null)) as { svgs?: unknown } | null
      if (!body || !Array.isArray(body.svgs) || body.svgs.length !== items.length) throw new PremiumPreviewError('failed', 'The avatar service answered tiles in an unexpected shape.')
      // Tiles are shown as images, never inlined; still, refuse anything but a plain SVG.
      return body.svgs.map((s) => (typeof s === 'string' && s.startsWith('<svg') && !UNSAFE_SVG.test(s) ? s : null))
    },
    async photoAvatar(jpeg, q, signal) {
      let res: Response
      try {
        res = await doFetch(`${root}/vision/avatar${query({ seed: q.seed, count: q.count })}`, { method: 'POST', headers: { 'Content-Type': jpeg.type || 'image/jpeg' }, body: jpeg, signal })
      } catch (e) {
        if (isAbort(e)) throw e
        throw new PhotoServerError('offline', 'The avatar service can’t be reached.')
      }
      if (res.ok) return (await res.json()) as PhotoAvatarResponse
      const err = (await res.json().catch(() => null)) as { code?: string; details?: unknown } | null
      const detail = Array.isArray(err?.details) ? String(err.details[0]) : ''
      if (res.status === 422 && (detail === 'no_face' || detail === 'too_small' || detail === 'too_dark')) throw new PhotoServerError(detail, 'The photo can’t be used.')
      if (res.status === 413) throw new PhotoServerError('too_large', 'The photo is too large.')
      const retry = Number(res.headers.get('retry-after')) || undefined
      if (res.status === 429 || (res.status === 503 && retry)) throw new PhotoServerError('busy', 'The avatar service is busy.', retry)
      if (res.status === 404 || res.status === 405 || res.status === 503) throw new PhotoServerError('unavailable', 'Avatars from photos are not available here yet.')
      throw new PhotoServerError('failed', `The avatar service could not use this photo (HTTP ${res.status}).`)
    },
    async exportFile(body, signal) {
      const res = await call(`${root}/studio/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
      if (res.status === 403) {
        const err = (await res.json().catch(() => null)) as { code?: string; details?: unknown } | null
        if (err?.code === 'entitlement_required') throw new PremiumPreviewError('locked', 'This download is a paid feature.', undefined, Array.isArray(err.details) ? err.details.filter((d): d is string => typeof d === 'string') : [])
      }
      if (!res.ok) throw failure(res)
      const cd = res.headers.get('content-disposition') ?? ''
      return { blob: await res.blob(), filename: /filename="([^"]+)"/.exec(cd)?.[1] ?? null }
    },
  }
}
