# Embedding the studio

There are three ways to use avatars on a page, from the lightest to the richest.

## 1. Show an avatar

- **In React:** `<AvatarImage code={code} size={64} />` from `@arkplay/avatar-studio` renders inline (see [The React studio](studio.md#showing-avatars-avatarimage)).
- **Anywhere else:** render once with the engine and use the SVG or PNG (see [Getting started](getting-started.md#2-render-it)), or point an `<img>` at an avatar service's image URL. `AvatarClient` builds those URLs (see [The service client](client.md#image-urls)):

```html
<img src="/avatar/v1/render/A2qt_TkdDEEU0Ja….png?crop=portrait&size=96" width="48" height="48" alt="">
```

Showing avatars as images keeps the engine out of the page's bundle.

## 2. React apps: import the studio

```tsx
import { AvatarStudio } from '@arkplay/avatar-studio'
import '@arkplay/avatar-studio/styles.css'

<AvatarStudio initial={dnaOrShareCode} onSave={async ({ dna, code, name }) => save(code)} />
```

Lazy-load the page that shows it, because the engine and studio are the page's own chunk. See [The React studio](studio.md) for uploads, outfits, premium items and theming.

## 3. Any other page: the iframe embed

Run the studio app (`apps/avatar-studio`) somewhere, then mount it with `mountStudio`:

```ts
import { mountStudio } from '@arkplay/avatar-client'

const studio = mountStudio(document.getElementById('avatar')!, {
  studioUrl: 'https://your-host.example/avatar/studio/',
  code: savedShareCode,                          // optional starting avatar
  config: { saveLabel: 'Use this avatar', kinds: ['humanoid'], exports: false, theme: 'dark' },
  onSave: ({ dna, code, name }) => { /* store it: the studio saves nothing itself in embed mode */ },
  onCancel: () => studio.destroy(),
})

studio.setTheme('light')
studio.requestSave()
```

`mountStudio` creates the iframe (`<studioUrl>?embed=1&origin=<your origin>`), queues messages until the studio is ready, and resizes the iframe to its content (`autoResize`, default on).

No bundler? [`examples/embed/index.html`](../examples/embed/index.html) speaks the protocol by hand in a plain HTML page.

### Config

| Field | Meaning |
|---|---|
| `saveLabel` | Label of the primary button (default "Save"), up to 40 characters |
| `cancel` | Show a Cancel button that sends `cancel` (default true) |
| `kinds` | `['humanoid']`, `['creature']` or both |
| `exports` | Show the export dialog (a game may only want the DNA back) |
| `theme` | `'dark'` or `'light'` |
| `locale` | BCP-47 language tag for UI strings |

### The v1 postMessage protocol

Every message is an envelope: `{ source: 'arkplay-avatar', v: 1, type, … }`. Version 1 is frozen: fields and types may be added, never changed.

- **Host → studio:**
  - `load { dna? | code? }`
  - `config { config }`
  - `theme { theme }`
  - `requestSave`
- **Studio → host:**
  - `ready { engineVersion }`
  - `change { dna, code }` (debounced to at least 250 ms)
  - `save { dna, code, name }`
  - `cancel`
  - `resize { height }`
  - `error { code, message }`

### Security

- The host passes its own origin as `?origin=`; the studio posts only to that exact origin and refuses to run in embed mode without a valid one.
- Each side accepts a message only if its origin is the expected origin **and**, on the host, its source is the iframe's window. `mountStudio` does this for you; do the same if you write the host side by hand.
- The iframe never sees tokens. To save to a player's account, call your backend from `onSave` with your own credentials.
- `mountStudio` sets `allow="clipboard-write"` (for "Copy code"). Picking a photo from files works in any embed; taking one with the camera also needs `camera` in the iframe's `allow`, as in the plain HTML example.

## Games

Use sprite sheets or rigs (see [Exports and animation](exports.md)), made once from the player's share code. A game's web shell can use the iframe embed to let players edit their avatar and get the new share code back.
