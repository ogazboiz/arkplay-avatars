# @arkplay/avatar-client

Three things in one small package:

- A typed HTTP client for an ArkPlay avatar service (`AvatarClient`).
- The service's wire types: the HTTP contract (`src/types.ts`).
- The host side of the studio iframe embed (`mountStudio`) and its postMessage protocol.

Source-first TypeScript like the engine: explicit `.ts` imports and no build step. It uses only `import type` from the engine, so it adds no engine code to a bundle.

Guides: [The service client](../../docs/client.md), [Embedding the studio](../../docs/embedding.md).

```bash
npx tsc -p tsconfig.json && npm test     # from this folder
```

## Files

- `src/types.ts`: **the HTTP contract** (`SavedAvatar`, `UploadedAsset`, `ImageOptions`, `Catalog`, `ApiErrorBody`, `AVATAR_API_PREFIX = '/avatar/v1'`). Add fields; never rename or remove them.
- `src/client.ts`: `AvatarClient`.
  - Constructor options: `{ baseUrl, getToken, fetch }`. `getToken` is called before every authenticated call, so the host owns refresh.
  - `renderUrl`, `userAvatarUrl` and `assetUrl` build public, cacheable image URLs that need no token; so do `userAnimatedUrl`/`userGifUrl`/`userSpriteSheetUrl`/`userRigUrl` and their `render*` twins for share codes.
  - Player profiles: `profile(sub)` and `profiles(subs)` (public; batches of 64), `myProfile()`; `features()` (public) and `entitlements()` (signed in).
  - `capabilities()` (public): `{ raster, uploads, thumbnails?, maxPngSize? }`. A lite service serves SVG only and answers PNG, GIF, zips and uploads with `503 feature_unavailable`, so `ImageUrls.png`, `animated.gif` and `exports.*` are optional.
  - `ImageOptions.detail` (`low`, `medium` or `high`) goes into the URL as `detail=`. Use `low` for small SVGs.
  - Errors throw `AvatarApiError`, which carries `status`, `code`, `details` and `retryAfter`.
- `src/protocol.ts`: the **frozen v1** postMessage protocol. Every message is an envelope `{ source: 'arkplay-avatar', v: 1, type, … }`.
  - Host → studio: `load`, `config`, `theme`, `requestSave`.
  - Studio → host: `ready`, `change`, `save`, `cancel`, `resize`, `error`.
- `src/embed.ts`: `mountStudio(el, opts)` creates the iframe (`<studioUrl>?embed=1&origin=…`), queues messages until `ready` and resizes the iframe.
- `src/shop.ts`, `src/evm.ts`: wire types and `ShopClient` for prebuilt avatars sold as NFTs, and dependency-free EVM helpers (keccak-256, EIP-55, static ABI encoding, bigint unit formatting). Money is always bigint base units.
- `src/partners.ts`, `src/developer.ts`, `src/stickers.ts`: clients and wire types for creator partners, developer API keys, and sticker/comic catalogues. Same additive-only rule.

## Security invariants (embed)

- Accept a message only when `event.origin` is the studio origin **and** `event.source` is the iframe's `contentWindow`.
- Post only to the studio origin, never `'*'`.
- The studio side (`apps/avatar-studio`) mirrors this with the `?origin=` it was given.
- Partner API keys (for server-to-server thumbnails) are never shipped to a browser or game client; `AvatarClient` has no method for them on purpose.
