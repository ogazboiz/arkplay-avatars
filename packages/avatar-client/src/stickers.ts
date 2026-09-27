/* Stickers, comics and effects: wire types of `/avatar/v1/stickers*`, `/avatar/v1/comics*`,
 * `/avatar/v1/users/{sub}/{stickers,comics,effects}/*` and `/avatar/v1/effects/*`, URL
 * builders for the images (public, cacheable, safe for <img src>), and a small client for
 * the two catalogues. See docs/exports.md.
 *
 * Like types.ts, these are a public contract: add fields, never rename or remove them. */

import { AvatarApiError } from './client.ts'
import { AVATAR_API_PREFIX, type ApiErrorBody, type ImageDetail, type ImageFormat, type ImageOptions } from './types.ts'
import type { AvatarClientOptions } from './client.ts'

export type StickerCategoryId = 'greetings' | 'reactions' | 'love' | 'celebrations' | 'faith' | 'gaming' | 'school' | 'weather' | 'friends' | (string & {})
export type ComicCategoryId = 'bcu' | 'faith' | 'friends' | 'gaming' | 'school' | 'seasons' | (string & {})
export type EffectName = 'sparkles' | 'confetti' | 'hearts' | 'snow' | 'rain' | 'fire' | 'glow' | 'halo' | 'stars' | 'bubbles' | 'petals' | 'rays' | (string & {})
export type ComicLayoutName = 'landscape' | 'square' | 'vertical'

/** A seasonal window, 'MM-DD' inclusive (may wrap the new year). */
export interface SeasonWindow {
  from: string
  until: string
}

/** One sticker template (`GET /avatar/v1/stickers`). */
export interface StickerTemplateInfo {
  id: string
  label: string
  category: StickerCategoryId
  /** Avatars in it: 2 = friendmoji (the second is `?with=` / `cast=`, or a buddy). */
  cast: 1 | 2
  keywords: string[]
  /** The caption drawn on it (all caps in the art), or null. */
  caption: string | null
  /** The effect it carries by default, or null. */
  effect: EffectName | null
  season: SeasonWindow | null
}

export interface EffectInfoWire {
  id: EffectName
  label: string
  description: string
}

/** `GET /avatar/v1/stickers` */
export interface StickerCatalogue {
  engineVersion: string
  categories: { id: StickerCategoryId; label: string }[]
  templates: StickerTemplateInfo[]
  effects: EffectInfoWire[]
  sizes: { min: number; max: number; default: number }
}

/** One comic script (`GET /avatar/v1/comics`). */
export interface ComicScriptInfo {
  id: string
  title: string
  blurb: string
  category: ComicCategoryId
  cast: 1 | 2
  panels: number
  tags: string[]
  /** Bible Comic Universe tie-in: the story and the scripture reference. */
  bcu: { story: string; ref: string } | null
  season: SeasonWindow | null
}

/** `GET /avatar/v1/comics?date=` */
export interface ComicsCatalogue {
  engineVersion: string
  categories: { id: ComicCategoryId; label: string }[]
  scripts: ComicScriptInfo[]
  layouts: ComicLayoutName[]
  /** The daily comic's script for `date` (UTC today by default) and the default seed. */
  daily: { date: string; script: string }
}

export interface StickerImageOptions {
  format?: ImageFormat
  /** 64..1024 px (default 512). */
  size?: number
  /** Replace the template's effect; `none` removes it. */
  effect?: EffectName | 'none'
  /** CSS loops (default on for SVG; PNG is always a still). */
  motion?: boolean
  detail?: ImageDetail
}

export interface ComicImageOptions {
  format?: ImageFormat
  layout?: ComicLayoutName
  /** 320..2048 px (default: the layout's natural width). */
  width?: number
  motion?: boolean
  /** YYYY-MM-DD: which day's daily comic (`daily`), and its subtitle. */
  date?: string
}

export interface EffectImageOptions extends ImageOptions {
  motion?: boolean
}

export function stickerQuery(o: StickerImageOptions = {}, extra: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams()
  if (o.size !== undefined) q.set('size', String(Math.round(o.size)))
  if (o.effect) q.set('effect', o.effect)
  if (o.motion !== undefined) q.set('motion', o.motion ? '1' : '0')
  if (o.detail) q.set('detail', o.detail)
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function comicQuery(o: ComicImageOptions = {}, extra: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  if (o.layout) q.set('layout', o.layout)
  if (o.width !== undefined) q.set('width', String(Math.round(o.width)))
  if (o.motion !== undefined) q.set('motion', o.motion ? '1' : '0')
  if (o.date) q.set('date', o.date)
  const s = q.toString()
  return s ? `?${s}` : ''
}

function effectQuery(o: EffectImageOptions = {}): string {
  const q = new URLSearchParams()
  if (o.size !== undefined) q.set('size', String(Math.round(o.size)))
  if (o.crop) q.set('crop', o.crop)
  if (o.view) q.set('view', o.view)
  if (o.expression) q.set('expression', o.expression)
  if (o.pose) q.set('pose', o.pose)
  if (o.background !== undefined) q.set('bg', o.background ? '1' : '0')
  if (o.detail) q.set('detail', o.detail)
  if (o.motion !== undefined) q.set('motion', o.motion ? '1' : '0')
  const s = q.toString()
  return s ? `?${s}` : ''
}

const enc = encodeURIComponent

/** URL builders for sticker, comic and effect images, plus the two catalogues. */
export class StickerClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: AvatarClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '')
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args))
  }

  url(path: string): string {
    return `${this.baseUrl}${AVATAR_API_PREFIX}${path}`
  }

  /** A player's sticker; `withSub` is the friend in two-avatar templates. */
  userStickerUrl(sub: string, template: string, o: StickerImageOptions = {}, withSub?: string): string {
    return this.url(`/users/${enc(sub)}/stickers/${enc(template)}.${o.format ?? 'svg'}${stickerQuery(o, { with: withSub })}`)
  }

  /** A share code's sticker (signed-out pages); `withCode` is the friend. */
  codeStickerUrl(code: string, template: string, o: StickerImageOptions = {}, withCode?: string): string {
    return this.url(`/stickers/${enc(template)}/${enc(code)}.${o.format ?? 'svg'}${stickerQuery(o, { with: withCode })}`)
  }

  /** A sticker of one or two players by account id (friendmoji). */
  castStickerUrl(template: string, subs: string[], o: StickerImageOptions = {}): string {
    return this.url(`/stickers/${enc(template)}.${o.format ?? 'svg'}${stickerQuery(o, { cast: subs.join(',') })}`)
  }

  /** A comic starring a player (`script` may be `daily`); `withSub` is the friend. */
  userComicUrl(sub: string, script: string, o: ComicImageOptions = {}, withSub?: string): string {
    return this.url(`/users/${enc(sub)}/comics/${enc(script)}.${o.format ?? 'svg'}${comicQuery(o, { with: withSub })}`)
  }

  /** A comic of players by account id, or of share codes. */
  comicUrl(script: string, cast: { subs?: string[]; codes?: string[] }, o: ComicImageOptions = {}): string {
    const extra = cast.subs?.length ? { cast: cast.subs.join(',') } : { codes: (cast.codes ?? []).join(',') }
    return this.url(`/comics/${enc(script)}.${o.format ?? 'svg'}${comicQuery(o, extra)}`)
  }

  /** A player's avatar image with an effect (same options as `avatar.svg`, plus `motion`). */
  userEffectUrl(sub: string, effect: string, o: EffectImageOptions = {}): string {
    return this.url(`/users/${enc(sub)}/effects/${enc(effect)}.${o.format ?? 'svg'}${effectQuery(o)}`)
  }

  codeEffectUrl(code: string, effect: string, o: EffectImageOptions = {}): string {
    return this.url(`/effects/${enc(effect)}/${enc(code)}.${o.format ?? 'svg'}${effectQuery(o)}`)
  }

  async catalogue(): Promise<StickerCatalogue> {
    return this.json<StickerCatalogue>('/stickers')
  }

  /**
   * Comic scripts and the daily pick for `date` (YYYY-MM-DD; default: today in UTC). The
   * daily comic differs per player: pass `seed` = the star's account id (or, for a share
   * code, its first 64 characters) to get the script their daily comic shows.
   */
  async comics(date?: string, seed?: string): Promise<ComicsCatalogue> {
    const q = new URLSearchParams()
    if (date) q.set('date', date)
    if (seed) q.set('seed', seed.slice(0, 64))
    const s = q.toString()
    return this.json<ComicsCatalogue>(`/comics${s ? `?${s}` : ''}`)
  }

  private async json<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.url(path), { headers: { Accept: 'application/json' } })
    if (res.ok) return (await res.json()) as T
    let err: ApiErrorBody = { code: `http_${res.status}`, message: res.statusText || `Request failed (${res.status})` }
    try {
      const j = (await res.json()) as Partial<ApiErrorBody>
      if (typeof j.code === 'string' && typeof j.message === 'string') err = { code: j.code, message: j.message, details: j.details }
    } catch {
      // Not JSON (a proxy error page): keep the status-based error.
    }
    const ra = Number(res.headers.get('Retry-After'))
    throw new AvatarApiError(res.status, err, Number.isFinite(ra) && ra > 0 ? ra : undefined)
  }
}
