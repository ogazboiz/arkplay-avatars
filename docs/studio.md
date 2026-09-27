# The React studio

`@arkplay/avatar-studio` is the full avatar creator as a React 19 component: a schema-driven editor with tabs for every section, a randomizer with locks, a wardrobe, undo/redo, an animation preview with every clip, "From photo", share codes and links, and an export dialog for 11 formats.

```tsx
import { AvatarStudio } from '@arkplay/avatar-studio'
import '@arkplay/avatar-studio/styles.css'

export function AvatarPage({ saved }: { saved?: string }) {
  return (
    <AvatarStudio
      initial={saved}                                        // DNA or a share code; default: a random avatar (or the local draft)
      onSave={async ({ dna, code, name }) => {               // shows a Save button; a rejection is shown inline
        await fetch('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ code, name }) })
      }}
      saveLabel="Save avatar"
    />
  )
}
```

The engine and studio are about 700 KB minified, so lazy-load the page that shows the studio (`React.lazy`). Everywhere else, show avatars as images (`AvatarImage`, or image URLs from a service) so the engine stays out of your main bundle.

## Props

| Prop | What it does |
|---|---|
| `initial` | DNA or a share code. Read on mount; later changes load the new avatar as an undoable step. |
| `onChange(dna)` | After every committed edit (a slider drag reports once, on release). |
| `onSave({ dna, code, name })` | Shows a Save button. May return a promise; the studio shows a busy state and any error message inline. |
| `onCancel()`, `saveLabel` | A Cancel button, and the Save button's label. |
| `kinds` | Which kinds the player may create: `['humanoid']`, `['creature']` or both (default). |
| `exports` | Show the export dialog (default `true`). |
| `photo` | "From photo": default on when humanoids are allowed; `false` hides it; `{ modelBase }` says where the vision models are served (default `/avatar/v1/vision/models/`). See [Avatar from a photo](photo-avatars.md). |
| `uploadAsset(file)` | Stores uploaded custom art in your backend and returns `{ id, w, h, … }`. Default: an inline data URL, local to this device, with a warning. |
| `assetUrl(id)` | Resolves an uploaded asset id to an image URL. |
| `customArt` | `false` hides the Custom art slot and its uploader, for hosts that can store neither uploads nor inline art. |
| `outfitStore` | Where saved outfits live (`{ list, save, remove }`). Default: `localOutfitStore()` (this device). |
| `draftKey` | The `localStorage` autosave key (default `'arkplay-avatar-draft'`); `false` disables autosave. |
| `theme` | `'dark'` or `'light'`. |
| `strings` | Override any UI string (`STRINGS` lists them, `fmt` fills placeholders). |
| `shareUrl(code)` | Builds the "Copy link" URL (default: this page + `#code=` + code). |
| `toolbarExtra` | Your own element at the end of the toolbar (a "Saved avatars" menu, for example). |
| `className` | A class on the root. |
| `ref` | An `AvatarStudioHandle`: `getDNA()`, `load(dnaOrCode)`, `save()`, `undo()`, `redo()`, `randomize()`. |
| `previewBase`, `previewFetch` | An avatar service for premium looks (below). |
| `serverExports`, `serverStudio`, `serverPhoto` | Let a service do the work (below). Default off. |
| `partners` | The creator partners picker (below). |
| `onTelemetry(event)` | Anonymous feature-use events (below). Omit it and nothing is reported. |

## Showing avatars: `AvatarImage`

```tsx
import { AvatarImage } from '@arkplay/avatar-studio'

<AvatarImage code={shareCode} size={64} />                            // portrait crop by default
<AvatarImage dna={dna} crop="fit" view="side" expression="happy" background={false} alt="" />
<AvatarImage dna={dna} quality="standard" motion={false} size={48} />  // lighter, for long lists
```

It renders inline and memoizes by DNA and options. With `serviceBase`, avatars that wear premium items load the service's public image instead.

## Exports without the dialog

```ts
import { exportAvatar, EXPORT_FORMATS } from '@arkplay/avatar-studio'

const { blob, filename } = await exportAvatar(dna, { format: 'gif', anim: 'wave', size: 256, fps: 12 })
```

Formats (`EXPORT_FORMATS`): `png svg webp jpeg pixel gif webm animated-svg spritesheet rig stickers`. Each lists the options it takes. Stills use the `high` quality; GIF, WebM, sprite sheets and rigs use `standard`. See [Exports and animation](exports.md).

## Styling

Every class starts with `aps-`, and the theme variables live on `.aps-root`, so the studio never collides with your CSS.

- Override tokens on `.aps-root` (colours, radii, the `--aps-glass*` surface tokens, `--aps-ambient`).
- A host with its own sticky header sets `--aps-sticky-top` to that header's height.
- `prefers-reduced-transparency` and browsers without `backdrop-filter` get opaque surfaces; `prefers-reduced-motion` pauses playback by default.
- On phones the layout switches to a sticky preview with a bottom tab bar.

## Storage and consent

Drafts and saved outfits use `localStorage` only as a convenience on this device, and every access is wrapped so the studio still works when storage throws (private windows, blocked storage). If your site asks for cookie consent, pass `draftKey={false}` and your own `outfitStore` until optional storage is allowed.

## Premium items

Paid, limited and NFT items are part of the schema, so their ids, share codes and rarity work everywhere, but their art is not in the browser engine: it draws a neutral placeholder in their place (`needsPremiumArt(dna)` tells you when). A service that has the art can draw them:

- Pass `previewBase` (the avatar API base on the same origin, e.g. `/avatar/v1`) and optionally `previewFetch` (to add a bearer token).
- The stage then shows the service's render whenever the avatar wears premium items (`POST {previewBase}/studio/preview`, debounced and cached), premium picker tiles come from `{previewBase}/catalog/items/{id}.svg`, and exports of premium looks are made by the service.
- Without it (or when the service can't be reached) premium items stay placeholders, and the studio shows the player a short note, never a raw server message.

`premiumService(base, fetch?)` is the same helper for your own UI.

## Server rendering

Three switches move work from the browser to an avatar service. All need `previewBase`, and all default to off:

- `serverExports`: every download is made by the service (`POST {previewBase}/studio/export`).
- `serverStudio`: the stage, clip playback and picker tiles are drawn by the service (`/studio/preview`, `/studio/tiles`); `AvatarImage` takes `server` for the same.
- `serverPhoto`: "From photo" is analysed by the service (`POST {previewBase}/vision/avatar`) instead of on the device, and the consent screen says so.

The standalone app turns them on with `VITE_SERVER_EXPORTS=1`, `VITE_SERVER_STUDIO=1` and `VITE_SERVER_PHOTO=1`.

## Creator partners

`partners={{ catalogUrl, baseUrl, programmeUrl }}` turns on a Partners picker that lists items published by creator partners, read from a public catalog (`GET /avatar/v1/partners/catalog` by default). `partners={false}` (the default) hides it.

## Telemetry

`onTelemetry` receives anonymous feature-use events: `session_start`, `session_end` (active seconds), `tab_open`, `dialog_open`, `param_edit` (by section), `item_add`, `item_remove`, `premium_preview`, `lock_toggle`, exports by format, and so on (`STUDIO_EVENTS`). Never an account, the avatar, its DNA or anything the player typed. Omit the prop and nothing is reported; pass it only with the visitor's consent.

`createTelemetryTracker({ send })` batches events for you. Call `tracker.flush(true)` when the page is hidden, and use `sendBeacon` when `final` is true:

```ts
import { createTelemetryTracker } from '@arkplay/avatar-studio'

const tracker = createTelemetryTracker({
  send: (batch, final) => (final ? navigator.sendBeacon('/telemetry', JSON.stringify(batch)) : void fetch('/telemetry', { method: 'POST', body: JSON.stringify(batch) })),
})
addEventListener('pagehide', () => tracker.flush(true))

<AvatarStudio onTelemetry={tracker.track} />
```

## Accessibility

ARIA tabs, radiogroups and sliders; a live region announces randomize and undo; focus is always visible; `prefers-reduced-motion` pauses playback. All UI strings are translation-ready through `strings` (option labels come from the engine schema, in English).

## The standalone app

`apps/avatar-studio` hosts the studio as a page at `/avatar/studio/` and as an iframe embed (`?embed=1&origin=…`). `npm run dev` starts it on port 5181; `npm run build -w @arkplay/avatar-studio-app` builds static files into `apps/avatar-studio/dist` (set `BASE_PATH` to serve it elsewhere). See [Embedding the studio](embedding.md).
