/* Typed HTTP client for the avatar service. Works in browsers and in Node (global fetch).
 *
 * Auth is a hook, not a stored secret: the host passes `getToken`, which is called before
 * every authenticated request, so token refresh stays the host's business. Public image
 * URLs (renderUrl, userAvatarUrl, assetUrl) need no token and are safe for <img src>. */

import type { AvatarDNA, Outfit } from '@arkplay/avatar-engine'
import {
  AVATAR_API_PREFIX,
  MAX_PROFILE_BATCH,
  type AnimatedImageOptions,
  type ApiErrorBody,
  type Capabilities,
  type Catalog,
  type EntitlementsResponse,
  type FeaturesResponse,
  type Health,
  type ImageFormat,
  type ImageOptions,
  type PlayerProfile,
  type ProfilePatch,
  type ProfilesResponse,
  type RenderRequest,
  type RigQuery,
  type RigRequest,
  type SavedAvatar,
  type SavedOutfit,
  type SpriteSheetQuery,
  type SpriteSheetRequest,
  type UploadedAsset,
} from './types.ts'

export type TokenGetter = () => string | null | undefined | Promise<string | null | undefined>

export interface AvatarClientOptions {
  /** Origin (and optional path) the `/avatar/v1` routes hang off. Default '' = same origin. */
  baseUrl?: string
  /** Returns the ArkPlay access token, or nothing when signed out. */
  getToken?: TokenGetter
  fetch?: typeof fetch
}

export class AvatarApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: string[]
  /** Seconds to wait, from `Retry-After` on 429/503. */
  readonly retryAfter?: number

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(body.message)
    this.name = 'AvatarApiError'
    this.status = status
    this.code = body.code
    this.details = body.details
    this.retryAfter = retryAfter
  }
}

/** Serializes image options the way every image route reads them. */
export function imageQuery(o: ImageOptions = {}): string {
  const q = new URLSearchParams()
  if (o.size !== undefined) q.set('size', String(Math.round(o.size)))
  if (o.crop) q.set('crop', o.crop)
  if (o.view) q.set('view', o.view)
  if (o.expression) q.set('expression', o.expression)
  if (o.pose) q.set('pose', o.pose)
  if (o.background !== undefined) q.set('bg', o.background ? '1' : '0')
  if (o.anim) q.set('anim', o.anim)
  if (o.time !== undefined) q.set('t', String(o.time))
  if (o.detail) q.set('detail', o.detail)
  const s = q.toString()
  return s ? `?${s}` : ''
}

const qs = (q: URLSearchParams): string => {
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Serializes the animated image options (`avatar.anim.svg`, `avatar.gif`). */
export function animatedQuery(o: AnimatedImageOptions = {}): string {
  const q = new URLSearchParams()
  if (o.anim) q.set('anim', o.anim)
  if (o.view) q.set('view', o.view)
  if (o.crop) q.set('crop', o.crop)
  if (o.size !== undefined) q.set('size', String(Math.round(o.size)))
  if (o.background !== undefined) q.set('bg', o.background ? '1' : '0')
  if (o.fps !== undefined) q.set('fps', String(Math.round(o.fps)))
  if (o.detail) q.set('detail', o.detail)
  return qs(q)
}

/** Serializes sprite-sheet options for `GET …/spritesheet.zip`. */
export function spriteSheetQuery(o: SpriteSheetQuery = {}): string {
  const q = new URLSearchParams()
  if (o.anims?.length) q.set('anims', o.anims.join(','))
  if (o.view) q.set('view', o.view)
  if (o.cell !== undefined) q.set('cell', String(Math.round(o.cell)))
  if (o.columns !== undefined) q.set('columns', String(Math.round(o.columns)))
  if (o.fps !== undefined) q.set('fps', String(Math.round(o.fps)))
  return qs(q)
}

/** Serializes rig options for `GET …/rig.zip`. */
export function rigQuery(o: RigQuery = {}): string {
  const q = new URLSearchParams()
  if (o.clips?.length) q.set('clips', o.clips.join(','))
  if (o.view) q.set('view', o.view)
  if (o.scale !== undefined) q.set('scale', String(o.scale))
  return qs(q)
}

export class AvatarClient {
  readonly baseUrl: string
  private readonly getToken?: TokenGetter
  private readonly fetchImpl: typeof fetch

  constructor(opts: AvatarClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '')
    this.getToken = opts.getToken
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args))
  }

  /** Absolute (or origin-relative) URL of an API path such as `/me/avatars`. */
  url(path: string): string {
    return `${this.baseUrl}${AVATAR_API_PREFIX}${path}`
  }

  // ---- Public, cacheable image URLs ----------------------------------------------------

  renderUrl(code: string, o: ImageOptions = {}): string {
    return this.url(`/render/${encodeURIComponent(code)}.${o.format ?? 'svg'}${imageQuery(o)}`)
  }

  /** The user's primary avatar, or their default creature when they have none. */
  userAvatarUrl(sub: string, o: ImageOptions = {}): string {
    return this.url(`/users/${encodeURIComponent(sub)}/avatar.${o.format ?? 'svg'}${imageQuery(o)}`)
  }

  assetUrl(id: string): string {
    return this.url(`/assets/${encodeURIComponent(id)}`)
  }

  /** The user's avatar as a self-contained animated SVG (CSS keyframes; default clip `idle`). */
  userAnimatedUrl(sub: string, o: AnimatedImageOptions = {}): string {
    return this.url(`/users/${encodeURIComponent(sub)}/avatar.anim.svg${animatedQuery(o)}`)
  }

  /** The user's avatar as an animated GIF (size ≤ 512, fps ≤ 15). */
  userGifUrl(sub: string, o: AnimatedImageOptions = {}): string {
    return this.url(`/users/${encodeURIComponent(sub)}/avatar.gif${animatedQuery(o)}`)
  }

  /** Zip with sheet.png, sheet.json and sheet.svg of the user's avatar. */
  userSpriteSheetUrl(sub: string, o: SpriteSheetQuery = {}): string {
    return this.url(`/users/${encodeURIComponent(sub)}/spritesheet.zip${spriteSheetQuery(o)}`)
  }

  /** Zip with atlas.png and rig.json of the user's avatar. */
  userRigUrl(sub: string, o: RigQuery = {}): string {
    return this.url(`/users/${encodeURIComponent(sub)}/rig.zip${rigQuery(o)}`)
  }

  renderAnimatedUrl(code: string, o: AnimatedImageOptions = {}): string {
    return this.url(`/render/${encodeURIComponent(code)}.anim.svg${animatedQuery(o)}`)
  }

  renderGifUrl(code: string, o: AnimatedImageOptions = {}): string {
    return this.url(`/render/${encodeURIComponent(code)}.gif${animatedQuery(o)}`)
  }

  renderSpriteSheetUrl(code: string, o: SpriteSheetQuery = {}): string {
    return this.url(`/render/${encodeURIComponent(code)}/spritesheet.zip${spriteSheetQuery(o)}`)
  }

  renderRigUrl(code: string, o: RigQuery = {}): string {
    return this.url(`/render/${encodeURIComponent(code)}/rig.zip${rigQuery(o)}`)
  }

  // ---- Player profiles (public) --------------------------------------------------------

  /** Any player's public profile: avatar, rarity, image and export URLs. */
  profile(sub: string): Promise<PlayerProfile> {
    return this.json('GET', this.url(`/users/${encodeURIComponent(sub)}/profile`), undefined, false)
  }

  /** Profiles for a lobby, in order, duplicates removed. Batches of 64 per request. */
  async profiles(subs: string[]): Promise<PlayerProfile[]> {
    const unique = [...new Set(subs)]
    const out: PlayerProfile[] = []
    for (let i = 0; i < unique.length; i += MAX_PROFILE_BATCH) {
      const res = await this.json<ProfilesResponse>('POST', this.url('/users/profiles'), { subs: unique.slice(i, i + MAX_PROFILE_BATCH) }, false)
      out.push(...res.profiles)
    }
    return out
  }

  /** The signed-in player's own profile. */
  myProfile(): Promise<PlayerProfile> {
    return this.json('GET', this.url('/me/profile'))
  }

  /** Changes the signed-in player's profile details (bio, pronouns, banner, featured game,
   *  showcase, visibility, avatar framing): only the fields sent change. Answers the updated own
   *  profile. */
  updateMyProfile(patch: ProfilePatch): Promise<PlayerProfile> {
    return this.json('PATCH', this.url('/me/profile'), patch)
  }

  /** Free and paid features, and whether the launch promo is running. */
  features(): Promise<FeaturesResponse> {
    return this.json('GET', this.url('/features'), undefined, false)
  }

  /** What the signed-in player owns (items, features, NFTs). */
  entitlements(): Promise<EntitlementsResponse> {
    return this.json('GET', this.url('/me/entitlements'))
  }

  // ---- Service info --------------------------------------------------------------------

  health(): Promise<Health> {
    return this.json('GET', `${this.baseUrl}/avatar/healthz`, undefined, false)
  }

  catalog(): Promise<Catalog> {
    return this.json('GET', this.url('/catalog'), undefined, false)
  }

  /** What the server can do now: a lite deployment has no PNG/GIF/zip exports or uploads. */
  capabilities(): Promise<Capabilities> {
    return this.json('GET', this.url('/capabilities'), undefined, false)
  }

  // ---- My avatars ----------------------------------------------------------------------

  async listAvatars(): Promise<SavedAvatar[]> {
    return (await this.json<{ avatars: SavedAvatar[] }>('GET', this.url('/me/avatars'))).avatars
  }

  getAvatar(id: string): Promise<SavedAvatar> {
    return this.json('GET', this.url(`/me/avatars/${encodeURIComponent(id)}`))
  }

  createAvatar(body: { dna: AvatarDNA; name?: string; primary?: boolean }): Promise<SavedAvatar> {
    return this.json('POST', this.url('/me/avatars'), body)
  }

  updateAvatar(id: string, body: { dna?: AvatarDNA; name?: string }): Promise<SavedAvatar> {
    return this.json('PUT', this.url(`/me/avatars/${encodeURIComponent(id)}`), body)
  }

  async deleteAvatar(id: string): Promise<void> {
    await this.send('DELETE', this.url(`/me/avatars/${encodeURIComponent(id)}`))
  }

  setPrimary(id: string): Promise<SavedAvatar> {
    return this.json('POST', this.url(`/me/avatars/${encodeURIComponent(id)}/primary`))
  }

  async primary(): Promise<SavedAvatar | null> {
    return (await this.json<{ avatar: SavedAvatar | null }>('GET', this.url('/me/primary'))).avatar
  }

  // ---- Outfits -------------------------------------------------------------------------

  async listOutfits(): Promise<SavedOutfit[]> {
    return (await this.json<{ outfits: SavedOutfit[] }>('GET', this.url('/me/outfits'))).outfits
  }

  saveOutfit(o: Outfit): Promise<SavedOutfit> {
    return this.json('POST', this.url('/me/outfits'), o)
  }

  async deleteOutfit(id: string): Promise<void> {
    await this.send('DELETE', this.url(`/me/outfits/${encodeURIComponent(id)}`))
  }

  /** Adapter for the studio's `outfitStore` prop. */
  outfitStore(): { list(): Promise<SavedOutfit[]>; save(o: Outfit): Promise<SavedOutfit>; remove(id: string): Promise<void> } {
    return { list: () => this.listOutfits(), save: (o) => this.saveOutfit(o), remove: (id) => this.deleteOutfit(id) }
  }

  // ---- Custom assets -------------------------------------------------------------------

  async uploadAsset(file: Blob, name?: string): Promise<UploadedAsset> {
    const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' }
    if (name) headers['X-Asset-Name'] = encodeURIComponent(name.slice(0, 80))
    const res = await this.send('POST', this.url('/me/assets'), file, true, headers)
    return (await res.json()) as UploadedAsset
  }

  async listAssets(): Promise<UploadedAsset[]> {
    return (await this.json<{ assets: UploadedAsset[] }>('GET', this.url('/me/assets'))).assets
  }

  /** Frees a slot under the per-user asset cap. Avatars that use it lose that accessory. */
  async deleteAsset(id: string): Promise<void> {
    await this.send('DELETE', this.url(`/me/assets/${encodeURIComponent(id)}`))
  }

  // ---- Server-side renders and exports ---------------------------------------------------

  async render(req: RenderRequest & { format?: ImageFormat }): Promise<Blob> {
    return (await this.send('POST', this.url('/render'), req, false)).blob()
  }

  /** Zip with sheet.png, sheet.json and sheet.svg. */
  async exportSpriteSheet(req: SpriteSheetRequest): Promise<Blob> {
    return (await this.send('POST', this.url('/export/spritesheet'), req, false)).blob()
  }

  /** Zip with atlas.png and rig.json. */
  async exportRig(req: RigRequest): Promise<Blob> {
    return (await this.send('POST', this.url('/export/rig'), req, false)).blob()
  }

  // ---- Plumbing ------------------------------------------------------------------------

  private async json<T>(method: string, url: string, body?: unknown, auth = true): Promise<T> {
    const res = await this.send(method, url, body, auth)
    return (await res.json()) as T
  }

  private async send(method: string, url: string, body?: unknown, auth = true, extra: Record<string, string> = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extra }
    if (auth) {
      const token = await this.getToken?.()
      if (!token) throw new AvatarApiError(401, { code: 'unauthorized', message: 'Sign in to use your avatars.' })
      headers.Authorization = `Bearer ${token}`
    }
    let payload: BodyInit | undefined
    if (body instanceof Blob) payload = body
    else if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] ??= 'application/json'
    }
    const res = await this.fetchImpl(url, { method, headers, body: payload })
    if (res.ok) return res
    let err: ApiErrorBody = { code: `http_${res.status}`, message: res.statusText || `Request failed (${res.status})` }
    try {
      const j = (await res.json()) as Partial<ApiErrorBody>
      if (typeof j.code === 'string' && typeof j.message === 'string') err = { code: j.code, message: j.message, details: j.details }
    } catch {
      // Not JSON (a proxy error page, say): keep the status-based error.
    }
    const ra = Number(res.headers.get('Retry-After'))
    throw new AvatarApiError(res.status, err, Number.isFinite(ra) && ra > 0 ? ra : undefined)
  }
}
