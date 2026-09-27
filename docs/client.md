# The service client

`@arkplay/avatar-client` is the typed browser client for an ArkPlay avatar service, the service's wire types (the HTTP contract), and the iframe embed (`mountStudio`, see [Embedding the studio](embedding.md)). The service itself is not part of this repository; this package is what web pages and apps use to talk to it.

It imports only types from the engine, so it adds no engine code to a bundle.

```ts
import { AvatarClient, AvatarApiError } from '@arkplay/avatar-client'

const avatars = new AvatarClient({
  baseUrl: '',                                // origin the /avatar/v1 routes hang off ('' = same origin)
  getToken: async () => session.accessToken,  // called before every authenticated call; the host owns refresh
})
```

## Image URLs

These build public, cacheable URLs and need no token, so they fit straight into `<img src>`:

```ts
avatars.renderUrl(code, { format: 'png', crop: 'portrait', size: 96 })          // any avatar, by share code (immutable)
avatars.userAvatarUrl(accountId, { format: 'png', crop: 'portrait', size: 96 }) // a player's main avatar (or their default creature)
avatars.userAnimatedUrl(accountId, { anim: 'idle' })                           // animated SVG
avatars.userGifUrl(accountId, { anim: 'wave', size: 128 })
avatars.userSpriteSheetUrl(accountId, { anims: ['idle', 'walk'] })
avatars.userRigUrl(accountId, { clips: ['idle', 'walk'] })
avatars.assetUrl(assetId)                                                       // uploaded custom art
```

`renderAnimatedUrl`, `renderGifUrl`, `renderSpriteSheetUrl` and `renderRigUrl` are the share-code twins. Image options: `format` (`svg`, `png`…), `size` (16–2048), `crop`, `view`, `expression`, `pose`, `background`, `anim` + `time`, and `detail` (`low`, `medium`, `high`; use `low` for small SVGs). After a player saves, add a cache-busting parameter of your own to their URL.

## Saving avatars

```ts
const saved = await avatars.createAvatar({ dna, name: 'Main', primary: true })
await avatars.updateAvatar(saved.id, { dna: edited })
await avatars.setPrimary(saved.id)
const all = await avatars.listAvatars()
const main = await avatars.primary()          // or null
await avatars.deleteAvatar(saved.id)
```

Wire it to the studio:

```tsx
<AvatarStudio
  onSave={async ({ dna, name }) => { await avatars.createAvatar({ dna, name, primary: true }) }}
  uploadAsset={(file) => avatars.uploadAsset(file)}               // an UploadedAsset is a CustomAsset
  assetUrl={(id) => avatars.assetUrl(id)}
  outfitStore={avatars.outfitStore()}
/>
```

Uploads: `uploadAsset(blob, name?)`, `listAssets()`, `deleteAsset(id)`. Outfits: `listOutfits()`, `saveOutfit(o)`, `deleteOutfit(id)`, or `outfitStore()` for the studio.

## Profiles

- `profile(accountId)` and `profiles(ids)` (public; batched by 64): handle, rarity, and every image and export URL of a player.
- `myProfile()` and `updateMyProfile(patch)` (signed in).
- `features()` (public) and `entitlements()` (signed in): which features are free, paid or part of a promotion, and what this player owns.

## Service information

- `capabilities()`: `{ raster, uploads, thumbnails?, maxPngSize? }`. A lite service serves SVG only and answers PNG, GIF, zips and uploads with `503 feature_unavailable`, so treat PNG, GIF and export URLs as optional.
- `catalog()`: the schema (sections, params, items, species) as JSON.
- `health()`.

## Server-made files

`render(req)`, `exportSpriteSheet(req)` and `exportRig(req)` return Blobs made by the service. The engine can make the same files in the browser (see [Exports and animation](exports.md)).

## Errors

Every non-2xx response throws `AvatarApiError` with `status`, `code`, `message`, `details` and `retryAfter` (seconds, from `Retry-After` on 429 and 503). Errors are JSON `{ code, message, details? }`. Show players your own friendly message for a code rather than the raw server text.

```ts
try {
  await avatars.createAvatar({ dna })
} catch (e) {
  if (e instanceof AvatarApiError && e.status === 429) retryIn(e.retryAfter ?? 5)
  else throw e
}
```

## Other clients

The package also carries typed clients and wire types for optional service features: `ShopClient` (prebuilt avatars sold as NFTs, with dependency-free EVM helpers in `evm.ts`), `PartnersClient` (the creator partners programme), `DeveloperClient` (API keys for partner backends) and `StickerClient` (sticker and comic catalogues). Each is additive-only, like the core types.

## The contract

`src/types.ts` is the HTTP contract (`SavedAvatar`, `UploadedAsset`, `ImageOptions`, `Catalog`, `ApiErrorBody`, `AVATAR_API_PREFIX = '/avatar/v1'`). A service implements exactly this. Add fields; never rename or remove them.
