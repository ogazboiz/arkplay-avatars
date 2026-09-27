# Getting started

This guide takes you from an empty folder to rendering, editing, sharing and animating avatars. Every snippet runs as is in Node 22.18+ (the `.ts` files run directly) and in any bundler (Vite, esbuild, webpack).

## Install

In this repository:

```bash
npm install
```

To use the packages from another project, add them as dependencies from this repository (a git dependency, a workspace, or `npm pack`). They are TypeScript sources with no build step: Node runs them with type stripping, and bundlers compile them. Import only from the package roots (`@arkplay/avatar-engine`, `@arkplay/avatar-studio`, `@arkplay/avatar-client`, `@arkplay/avatar-vision`); deep imports aren't part of the API.

## 1. Make an avatar

```ts
import { defaultDNA, randomDNA, applySpecies } from '@arkplay/avatar-engine'

const plain = defaultDNA('humanoid')                            // the default humanoid
const rolled = randomDNA({ seed: 42 })                          // any kind, any theme
const knight = randomDNA({ seed: 'player-7', kind: 'humanoid', theme: 'knight' })
const fox = applySpecies(defaultDNA('creature'), 'fox')          // a creature preset
const safe = randomDNA({ seed: 9, freeOnly: true })              // only free items
```

- A **seed** (number or string) fixes every random choice. `randomDNA({ seed: 42 })` is the same avatar on every machine, forever (for a given engine version).
- `kind` is `'humanoid'`, `'creature'` or `'any'`.
- Themes: `casual sporty formal cute fantasy wizard knight scifi spooky pirate royal punk beach winter ninja hero gaming party` (`THEMES`).
- Species: `SPECIES` lists 40+ presets (cat, fox, dragon, owl, axolotl, slime, ghost, robot…).

## 2. Render it

```ts
import { renderSVG } from '@arkplay/avatar-engine'

const svg = renderSVG(knight, { crop: 'portrait', size: 256 })
```

`renderSVG` returns an SVG string. Put it in the page (`innerHTML`), in an `<img>` (as a Blob URL or data URL), or rasterize it:

```ts
// Node: resvg
import { Resvg } from '@resvg/resvg-js'
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
```

```ts
// Browser: a canvas
const img = new Image()
img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
await img.decode()
const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 })
canvas.getContext('2d')!.drawImage(img, 0, 0, 512, 512)
```

When several avatars share one HTML page, each render gets its own id prefix automatically. Pass `idPrefix` yourself when you need byte-identical output (caching, tests). More options: [Rendering](rendering.md).

In React, `AvatarImage` from `@arkplay/avatar-studio` does this for you, memoized:

```tsx
import { AvatarImage } from '@arkplay/avatar-studio'

<AvatarImage code={shareCode} crop="portrait" size={64} />
```

## 3. Edit it

Edits are immutable and always return valid DNA:

```ts
import { defaultDNA, setParam, addItem, removeItemById, setItemParam } from '@arkplay/avatar-engine'

let dna = defaultDNA('humanoid', 7)
dna = setParam(dna, 'hair', 'style', 'bob')
dna = setParam(dna, 'hair', 'color', '#d2691e')
dna = addItem(dna, 'hoodie', { color: '#2f6f8f' })          // slot rules and caps are enforced
dna = setItemParam(dna, 'outfit', 0, 'color', '#8f2f4a')    // by list and index
dna = removeItemById(dna, 'hoodie')
```

What can be edited is described by the schema (`ALL_SECTIONS`, `sectionsFor(kind)`, `ALL_ITEMS`): every param has a type, a default, and limits or options. The studio builds its whole UI from it. See [Avatar DNA](dna.md).

## 4. Share it

```ts
import { encodeShareCode, decodeShareCode, ShareCodeError } from '@arkplay/avatar-engine'

const code = encodeShareCode(dna)        // "A2…": ~20 characters for a default avatar, ~250 for a busy one
try {
  const back = decodeShareCode(pasted)
} catch (e) {
  if (e instanceof ShareCodeError) showToUser(e.message)   // friendly: "That avatar code has a typo…"
}
```

Share codes carry a checksum, survive copy-paste (spaces and line breaks are ignored), and decode forever. For binary transports such as netcode, `encodeAvatarBytes`/`decodeAvatarBytes` give the same bytes without the text.

## 5. Accept avatars from anywhere

Treat any DNA from outside (a request body, local storage, a file) as untrusted:

```ts
import { normalizeDNA, validateDNA } from '@arkplay/avatar-engine'

const dna = normalizeDNA(untrusted)           // always valid: defaults filled in, values clamped, unknown keys dropped
const problems = validateDNA(untrusted)       // what normalizing would change; [] when it was already valid
```

## 6. Animate it

```ts
import { renderSVG, animatedSVG, spriteSheet, clipsForAvatar } from '@arkplay/avatar-engine'

clipsForAvatar(dna).map((c) => c.name)             // the clips that suit this body
renderSVG(dna, { anim: 'walk', time: 0.25 })       // one frame of a clip
animatedSVG(dna, { anim: 'wave', crop: 'fit' })    // a self-contained animated SVG
spriteSheet(dna, { anims: ['idle', 'walk'], view: 'side', cell: 192 })   // { svg, width, height, meta }
```

See [Exports and animation](exports.md) for sprite sheets, rigs, GIF, WebM and the clip catalogue.

## 7. Put the studio in your app

```tsx
import { AvatarStudio } from '@arkplay/avatar-studio'
import '@arkplay/avatar-studio/styles.css'

<AvatarStudio initial={savedCode} onSave={async ({ dna, code }) => save(code)} />
```

See [The React studio](studio.md), or [Embedding the studio](embedding.md) for pages that don't use React.

## Runnable examples

```bash
node examples/node/basic.ts 42          # roll, edit, share, write SVG + PNG to examples/out/
node examples/node/game-assets.ts       # sprite sheet, rig and animated SVG for a dragon
npm run examples                        # re-render the README images in docs/images/
```

`examples/embed/index.html` embeds the studio in a plain HTML page (no build step).
