/* Wire types of the avatar service. The service and every client import
 * these, so a change here is a change to the public HTTP contract: add fields, never
 * rename or remove them. See docs/client.md. */

import type { AvatarDNA, CustomAsset, ItemRef, View, Crop } from '@arkplay/avatar-engine'

/** Every route lives under this prefix so it never collides with the game server's `/v1`. */
export const AVATAR_API_PREFIX = '/avatar/v1'

/** Error body of every non-2xx response. 429s also carry a `Retry-After` header. */
export interface ApiErrorBody {
  code: string
  message: string
  /** Validation problems, when `code` is `invalid_dna` or `invalid_request`. */
  details?: string[]
}

export interface SavedAvatar {
  id: string
  name: string
  dna: AvatarDNA
  /** Share code of `dna` ("A2…"; codes saved before A2 start "A1…", and both decode). */
  code: string
  primary: boolean
  createdAt: string
  updatedAt: string
  /** Rarity from the paid, limited and NFT items it wears (the engine's `avatarRarity`). */
  rarity: AvatarRarity
}

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** Owner rule: only paid, limited and NFT items raise rarity; free choices stay Common. */
export interface AvatarRarity {
  tier: RarityTier
  score: number
}

/** The launch promo as the server sees it right now. */
export interface PromoState {
  /** Every paid feature and item is free while the promo runs. */
  allFree: boolean
  /** Last instant of the promo (ISO 8601, UTC). */
  until: string
  /** UI label, e.g. "Free until 7 Oct". */
  label: string
  /** The promo is running (server clock). */
  active: boolean
}

export interface FeatureInfo {
  id: string
  label: string
  tier: 'free' | 'paid'
  description: string
  /** Usable without paying right now: a free feature, or a paid one covered by the promo. */
  freeNow: boolean
  /** Paid, and free only until `promo.until`. Show it as "Free until …". */
  temporarilyFree: boolean
}

/**
 * What this avatar service can do right now (`GET /avatar/v1/capabilities`, and in the
 * catalog and `/features`). A lite deployment (`AVATAR_RASTER=off`) serves SVG only: PNG,
 * GIF, sprite-sheet and rig zips and uploads then answer `503 feature_unavailable`. The
 * `thumbs` profile (`AVATAR_RASTER=thumbs`) renders PNGs up to `maxPngSize` (256) px only.
 */
export interface Capabilities {
  /** Full rasterizing: PNG at any size, GIF images, and the sprite-sheet and rig zips. */
  raster: boolean
  /** `POST /me/assets` (every upload is test-rendered by the rasterizer). */
  uploads: boolean
  /** The API-key thumbnail routes (`/avatar/v1/thumbnails/*`) can render. Absent from older
   *  services (which had no thumbnail API). */
  thumbnails?: boolean
  /** Widest `.png` this server renders: 2048 with full raster, 256 in the `thumbs` profile,
   *  0 in lite mode. Absent from older services: 2048 when `raster`, else 0. */
  maxPngSize?: number
}

/** Thumbnail sizes: a requested `size` is snapped UP to the next one (256 is the largest). */
export const THUMBNAIL_SIZES = [32, 48, 64, 96, 128, 192, 256] as const

/**
 * `POST /avatar/v1/thumbnails` (API key with the `thumbnails` scope; backends only). Exactly
 * one of `email`, `emailSha256` or `handle`. The plain email is only hashed in memory.
 */
export interface ThumbnailRequest {
  email?: string
  /** Hex SHA-256 of `lowercase(trim(email))`. */
  emailSha256?: string
  handle?: string
  /** 1..256, snapped up to THUMBNAIL_SIZES. Default 128. */
  size?: number
  /** Default `portrait`. */
  crop?: 'portrait' | 'head'
  /** Scene background and frame (default true). */
  bg?: boolean | 0 | 1
}

export type ApiKeyScope = 'thumbnails'

/** Per-key rate limits (omitted fields use the service defaults). */
export interface ApiKeyRate {
  /** Request bucket: burst, and refill per minute. */
  burst?: number
  perMinute?: number
  /** Render bucket (real renders only; cache hits are free). */
  renderBurst?: number
  rendersPerMinute?: number
}

/** An API key as the admin routes list it. The secret is never shown again after creation. */
export interface ApiKeyInfo {
  id: string
  name: string
  scopes: ApiKeyScope[]
  rate: ApiKeyRate | null
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
}

/** `POST /avatar/v1/admin/api-keys` → 201. `key` (`apk_<id>_<secret>`) is shown this once. */
export interface ApiKeyCreated {
  key: string
  apiKey: ApiKeyInfo
}

/** `GET /avatar/v1/features` */
export interface FeaturesResponse {
  promo: PromoState
  features: FeatureInfo[]
  /** Server time of the answer (ISO 8601). */
  now: string
  /** Absent from older services, which had every capability. */
  capabilities?: Capabilities
}

export interface ImageUrls {
  svg: string
  /** Omitted when the service can't rasterize (`capabilities.raster` false). */
  png?: string
}

/**
 * A player's public profile: the same across every ArkPlay game. Every URL is a public,
 * CORS-enabled path on the avatar service (prefix it with the service origin); each one
 * carries `v=` (the avatar's hash), so it changes whenever the avatar does.
 */
export interface PlayerProfile {
  sub: string
  /** From ArkPlay Accounts; null when the account has never used the avatar service. */
  handle: string | null
  displayName: string | null
  avatar: {
    /** Share code of the avatar shown ("A2…", or "A1…" from before A2; both decode). */
    code: string
    kind: 'humanoid' | 'creature'
    name: string
    /** When the saved avatar last changed; null for the default creature. */
    updatedAt: string | null
    /** True when the account has saved no avatar and shows its default creature. */
    isDefault: boolean
  }
  rarity: AvatarRarity
  images: {
    portrait: ImageUrls
    bust: ImageUrls
    full: ImageUrls
    /** `avatar.anim.svg?anim=idle` and an `avatar.gif` of the same clip (the GIF is
     *  omitted when the service can't rasterize). */
    animated: { svg: string; gif?: string }
  }
  /** Both omitted when the service can't rasterize (`capabilities.raster` false). */
  exports: {
    /** Zip: sheet.png + sheet.json + sheet.svg (`GET …/spritesheet.zip`). */
    spriteSheet?: string
    /** Zip: atlas.png + rig.json (`GET …/rig.zip`). */
    rig?: string
  }
  features: {
    promo: PromoState
    /** Paid features that are free right now only because of the promo. */
    temporarilyFree: string[]
  }
  /** Player profile: what the player wrote about themselves (`ProfileDetails`, docs/client.md).
   *  Absent from services older than 2026-09-25. */
  details?: ProfileDetails
  /** What the account's subscription adds to its profile. Absent from older services: treat as none. */
  perks?: ProfilePerks
}

/**
 * The feature entitlement (`kind: 'feature'`) of an Ark Pass subscription. It is not in the
 * engine's `FEATURES` (the launch promo never makes it free); the billing side grants it with
 * `POST /admin/entitlements` when a subscription starts and removes it with `DELETE` when it ends.
 */
export const ARK_PASS_FEATURE = 'ark-pass'

/** `PlayerProfile.perks`: what Ark Pass members get on their profile. */
export interface ProfilePerks {
  /** Ark Pass: the profile's banner and stage move (everyone else sees a still frame of the same art). */
  animatedProfile: boolean
}

/** `POST /avatar/v1/users/profiles` takes at most this many subs. */
export const MAX_PROFILE_BATCH = 64

export interface ProfilesRequest {
  subs: string[]
}

export interface ProfilesResponse {
  /** In request order, duplicates removed. Unknown accounts get their default creature. */
  profiles: PlayerProfile[]
}

export type EntitlementKind = 'item' | 'feature' | 'nft'
export type EntitlementSource = 'promo' | 'purchase' | 'grant' | 'nft'

/**
 * Something an account owns.
 * - `item`: `ref` is an item id (a left-hand twin such as `sword-l` is owned with `sword`).
 * - `feature`: `ref` is a feature id from `FEATURES` (`premium-items` unlocks every paid
 *   item, `custom-uploads` unlocks uploads and the `custom` item, `extra-saves` more saves).
 * - `nft`: `ref` is an NFT-only item id, or `avatar:<dnaHash>` for an NFT prebuilt avatar.
 * `promo` entitlements are recorded when an avatar is saved during the launch promo, so
 * what players made during the launch stays theirs.
 */
export interface Entitlement {
  kind: EntitlementKind
  ref: string
  source: EntitlementSource
  createdAt: string
}

/** `GET /avatar/v1/me/entitlements` */
export interface EntitlementsResponse {
  entitlements: Entitlement[]
  promo: PromoState
}

/** `POST /avatar/v1/admin/entitlements` (platform key only). */
export interface GrantRequest {
  sub: string
  kind: EntitlementKind
  ref: string
  /** Default `grant`. `promo` is recorded by the service itself. */
  source?: Exclude<EntitlementSource, 'promo'>
}

/** Query options of the animated image routes (`avatar.anim.svg`, `avatar.gif`). */
export interface AnimatedImageOptions {
  /** Clip name valid for the avatar's kind (default `idle`). */
  anim?: string
  view?: View
  crop?: Crop
  /** Output width in px: 16..2048 for animated SVG, 16..512 for GIF. */
  size?: number
  /** Include the scene background and frame (default true). */
  background?: boolean
  /** Frames per second: 1..30 for animated SVG, 1..15 for GIF. */
  fps?: number
  /** Art detail level (default: the avatar's own). */
  detail?: ImageDetail
}

/** Query options of `GET …/spritesheet.zip` (same meaning as `SpriteSheetRequest`). */
export interface SpriteSheetQuery {
  anims?: string[]
  view?: View
  cell?: number
  columns?: number
  fps?: number
}

/** Query options of `GET …/rig.zip` (same meaning as `RigRequest`). */
export interface RigQuery {
  clips?: string[]
  view?: View
  scale?: number
}

export interface SavedOutfit {
  id: string
  name: string
  outfit: ItemRef[]
  accessories: ItemRef[]
  createdAt: string
}

export type AssetStatus = 'pending' | 'approved' | 'rejected'

/** An uploaded custom accessory. `id`/`w`/`h`/`name` drop straight into a DNA `CustomAsset`. */
export interface UploadedAsset extends CustomAsset {
  id: string
  status: AssetStatus
  /** Absolute path of the sanitized image (`/avatar/v1/assets/{id}`). */
  url: string
  mime: string
  bytes: number
  createdAt: string
}

export type ImageFormat = 'svg' | 'png'

/**
 * The engine's art detail level (`RenderOptions.detail`). `low` drops shading and fine
 * lines, which makes small SVGs (nav chips, lists) several times smaller.
 */
export type ImageDetail = 'low' | 'medium' | 'high'

/** Query/body options shared by every image route. */
export interface ImageOptions {
  format?: ImageFormat
  /** Output width in px (16..2048). */
  size?: number
  /** Art detail level (default: the avatar's own, normally `high`). */
  detail?: ImageDetail
  crop?: Crop
  view?: View
  /** Expression preset id (overrides the DNA). */
  expression?: string
  /** Pose preset id (overrides the DNA). */
  pose?: string
  /** Include the scene background and frame (default true). */
  background?: boolean
  /** Sample an animation clip at `time` seconds. */
  anim?: string
  time?: number
}

export interface RenderRequest extends ImageOptions {
  dna?: AvatarDNA
  code?: string
}

export interface SpriteSheetRequest {
  dna?: AvatarDNA
  code?: string
  anims?: string[]
  view?: View
  cell?: number
  columns?: number
  fps?: number
}

export interface RigRequest {
  dna?: AvatarDNA
  code?: string
  view?: View
  clips?: string[]
  scale?: number
}

/** `GET /avatar/v1/catalog`: everything a UI or an AI integration needs to know about the schema. */
export interface Catalog {
  engineVersion: string
  dnaVersion: number
  sections: unknown[]
  slots: unknown[]
  items: unknown[]
  species: unknown[]
  themes: unknown[]
  clips: unknown[]
  expressions: string[]
  poses: string[]
  limits: Record<string, number>
  /** Free and paid features (the engine's `FEATURES`). Items carry their own `tier`. */
  features: { id: string; label: string; tier: 'free' | 'paid'; description: string }[]
  /** The launch promo (static; `GET /features` says whether it is running now). */
  promo: { allFree: boolean; until: string; label: string }
  /** How rarity is scored: points per item tier, tier thresholds (lowest score of each). */
  rarity: { version: number; tiers: RarityTier[]; thresholds: Record<RarityTier, number>; points: Record<string, number> }
  /** What this server can do (absent from older services, which had every capability). */
  capabilities?: Capabilities
}

export interface Health {
  ok: boolean
  service: 'avatar'
  version: string
  engineVersion: string
}

/* ---- Player profile (docs/client.md) ------------------------------------------
 * What a player writes about themselves, shown with their avatar on the website and in every
 * game: `PlayerProfile.details`. Set with `PATCH /avatar/v1/me/profile` (`ProfilePatch`). */

/** Profile banner themes: the backdrop of a player's profile, named after the engine's scene presets. */
export const PROFILE_BANNERS = ['sky', 'sunset', 'night', 'forest', 'meadow', 'beach', 'city', 'snow', 'space', 'underwater', 'dungeon', 'stage', 'volcano', 'candy'] as const

export type ProfileBanner = (typeof PROFILE_BANNERS)[number]

/** `public`: everyone sees the details. `private`: only the player does (the avatar and names stay public: games need them). */
export type ProfileVisibility = 'public' | 'private'

/** Length limits in characters (Unicode code points) and the showcase size. `pronouns` has been
 *  unused since pronouns became a fixed choice (`PROFILE_PRONOUNS`, 2026-09-25); it stays for
 *  older clients. */
export const PROFILE_LIMITS = { bio: 160, pronouns: 24, showcase: 6 } as const

/** A saved outfit the player shows on their profile, worn by their current avatar. */
export interface ShowcaseOutfit {
  /** The saved outfit's id (`of_…`). */
  id: string
  name: string
  /** Share code of the player's current avatar wearing this outfit (`/avatar/v1/render/{code}.svg`). */
  code: string
}

export interface ProfileDetails {
  /** Plain text, one line, at most 160 characters, no links. Empty when unset. */
  bio: string
  /** `"he"` or `"she"` (show them with `PROFILE_PRONOUN_LABELS`: He/him, She/her); empty when
   *  unset. Services before 2026-09-25 sent free text: show nothing for any other value. */
  pronouns: ProfilePronouns | ''
  banner: ProfileBanner | null
  /** A game id from the ArkPlay catalogue (e.g. "noah"). */
  featuredGame: string | null
  /** Public outfits, in the player's order (none by default). */
  showcase: ShowcaseOutfit[]
  /** A private profile answers everyone but its owner with empty details and `visibility: 'private'`. */
  visibility: ProfileVisibility
  /** Last change made by the player; null if they never edited their profile. */
  updatedAt: string | null
  /** How the player's avatar is framed on their profile: an engine crop from
   *  `PROFILE_AVATAR_CROPS`, `portrait` when they never chose one (and for others looking at a
   *  private profile). Absent from services older than 2026-09-25: read it as `portrait`. */
  avatarCrop?: ProfileAvatarCrop
}

/** `PATCH /avatar/v1/me/profile`: only the fields sent change; `null` resets a field. */
export interface ProfilePatch {
  bio?: string | null
  /** `"he"` or `"she"`; `""` or `null` shows none. */
  pronouns?: ProfilePronouns | '' | null
  banner?: ProfileBanner | null
  featuredGame?: string | null
  /** Saved outfit ids (`of_…`) to show publicly, in order; `[]` or `null` shows none. */
  showcase?: string[] | null
  visibility?: ProfileVisibility
  /** One of `PROFILE_AVATAR_CROPS`; `null` goes back to the default (`portrait`). */
  avatarCrop?: ProfileAvatarCrop | null
}

/** `POST /avatar/v1/admin/profiles/{sub}/clear` (platform key): moderation. */
export interface ProfileClearRequest {
  /** 3–500 characters, kept in the moderation log. */
  reason: string
  /** Default `["bio"]`. `avatarCrop` puts the framing back to its default (`portrait`). */
  fields?: ('bio' | 'pronouns' | 'avatarCrop')[]
}

export interface ProfileClearResponse {
  sub: string
  cleared: ('bio' | 'pronouns' | 'avatarCrop')[]
  /** Id of the moderation log entry. */
  auditId: number
  details: ProfileDetails
}

/** Pronouns a profile can show (`ProfileDetails.pronouns`): a fixed choice since 2026-09-25. */
export const PROFILE_PRONOUNS = ['he', 'she'] as const

export type ProfilePronouns = (typeof PROFILE_PRONOUNS)[number]

/** How clients show `ProfileDetails.pronouns`. */
export const PROFILE_PRONOUN_LABELS: Readonly<Record<ProfilePronouns, string>> = { he: 'He/him', she: 'She/her' }

/** The framings a player can choose for their profile picture (`ProfileDetails.avatarCrop`): the
 *  engine's crops `portrait` (the default), `bust`, `fit` and `full`. Use it as `crop=`. */
export const PROFILE_AVATAR_CROPS = ['portrait', 'bust', 'fit', 'full'] as const

export type ProfileAvatarCrop = (typeof PROFILE_AVATAR_CROPS)[number]

/** The framing of a player who never chose one. */
export const DEFAULT_PROFILE_AVATAR_CROP: ProfileAvatarCrop = 'portrait'

/* ---- Avatar from a photo, on the server (docs/studio.md, phase 3) ---- */

/** `POST /avatar/v1/vision/avatar`: the largest photo accepted, and the longest side the studio sends. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const PHOTO_MAX_SIDE = 1280

/** One suggested avatar. */
export interface PhotoAvatarCandidate {
  dna: AvatarDNA
  label: string
  /** 0..1, relative plausibility of this candidate's uncertain choices. */
  confidence: number
}

/**
 * The answer of `POST /avatar/v1/vision/avatar` (body: the photo as `image/jpeg`, `image/png` or
 * `image/webp`; query `count` 1..6, `seed`). Nothing about the photo is kept: ask again with the
 * same photo and another `seed` for other suggestions. A photo it can't use answers
 * `422 photo_unusable` with `details: [code]`, code one of `no_face`, `too_small`, `too_dark`.
 */
export interface PhotoAvatarResponse {
  best: AvatarDNA
  candidates: PhotoAvatarCandidate[]
  notes: string[]
  /** e.g. `multiple_faces`, `dim_light`, `turned_head`, with a message for the player. */
  warnings: { code: string; message: string }[]
}

