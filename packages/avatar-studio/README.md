# @arkplay/avatar-studio

The React 19 creator UI for ArkPlay avatars. It's source-first TSX and the engine does all the art: this package is the UI, its state, the render scheduling and the browser-side exports.

```tsx
import { AvatarStudio, AvatarImage } from '@arkplay/avatar-studio'
import '@arkplay/avatar-studio/styles.css'

<AvatarStudio initial={code} onSave={async ({ dna, code, name }) => save(code)} />
<AvatarImage code={code} size={64} />
```

Guide: [The React studio](../../docs/studio.md).

```bash
npm run typecheck -w @arkplay/avatar-studio
npm test -w @arkplay/avatar-studio          # node --test: pure logic (history, studio reducer, schema→UI, randomize, share, formats)
npm run dev                                 # the studio app at http://localhost:5181/avatar/studio/  (?embed=1&origin=… for embed mode)
```

## Public API (`src/index.ts`; props are only ever added, never renamed)

- `AvatarStudio`, with an `AvatarStudioHandle` ref (`getDNA`, `load`, `save`, `undo`, `redo`, `randomize`).
- `AvatarImage`: an inline, memoized render. Props: `dna` or `code`, `crop`, `view`, `size`, `expression`, `background`, `quality`, `motion`, `alt`, and `serviceBase`/`server` for service-drawn images.
- `exportAvatar` and `EXPORT_FORMATS`: SVG, PNG, WebP, JPEG, GIF, WebM, sprite-sheet zip, rig zip, animated SVG, sticker zip and pixel art, all built in the browser.
- `STRINGS` and `fmt`: every UI string, translation-ready.
- `localOutfitStore()`: the default outfit store.
- `premiumService`: premium looks from a service.
- `createTelemetryTracker`, `STUDIO_EVENTS`: anonymous, opt-in feature-use telemetry.
- CSS: `@arkplay/avatar-studio/styles.css`. Every class starts with `aps-`, and the theme variables live on `.aps-root`.

## Rules

- **The schema drives everything.** Tabs, controls, `visibleIf`, advanced folds, thumbnails and randomizer locks all come from the engine's ParamSpecs and slots (`src/state/tabs.ts`, `params.ts`). Never hard-code UI for a single param; add to the engine schema instead.
- **Render cost:**
  - Thumbnails, drag previews and animation playback render at `quality: 'standard'`, which is also motion-free.
  - The idle still preview renders at `'high'`, whose effects loop through CSS.
  - Thumbnails render in a Web Worker pool (`src/render/pool.ts`) with an LRU cache (`src/render/lru.ts`). If worker creation fails, rendering falls back to the main thread.
  - Every inline SVG gets its own `idPrefix` (`src/render/ids.ts`), because inline `<style>` and defs are global to the page.
- **Undo history:** slider drags collapse into one step, with a cap of 100 entries (`src/state/history.ts`).
- **Free and PRO:** badges come from `src/state/tiers.ts`, which reads the engine's `itemTier`, `FEATURES`, `FEATURE_LIMITS` and `PROMO`. Never hard-code a tier or a date in a component.
- **Storage:** drafts and saved outfits use `localStorage` only as a convenience on this device. Every access is wrapped in try/catch, and the studio must still work when storage throws.
- **Exports:** raster formats inline uploaded art as data URLs first, because remote images would taint the canvas. Still exports use `'high'`; sprite sheets, rigs, GIF and WebM use `'standard'`.
- **Premium items:** the browser engine has no art for paid, limited and NFT items and draws a placeholder. Premium looks come from a service (`src/render/premium.ts`); show the player a note when one can't be fetched, never a raw server message.
- **Embed mode** (`apps/avatar-studio/src/Embed.tsx`) implements the studio side of `@arkplay/avatar-client`'s protocol v1. It posts only to the `?origin=` it was given, ignores every other origin and source, and doesn't autosave a draft.
- **Accessibility:** ARIA tabs, radiogroups and sliders; a live region for randomize and undo; visible focus; `prefers-reduced-motion` pauses playback by default; a sticky preview with a bottom tab bar on phones.

## Known gaps

- Custom art is placed with sliders; there's no drag on the preview.
- Schema labels can't be translated yet.
- GIF transparency is 1-bit, and WebM has no alpha channel.
- The engine (about 700 KB minified) is in both the page chunk and the worker, so lazy-load the page that shows the studio.
