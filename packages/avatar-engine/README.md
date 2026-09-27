# @arkplay/avatar-engine

Procedural 2D avatars: DNA schema → rig → part generators → SVG string. Pure TypeScript, no DOM, deterministic. Every other avatar package consumes it, so its contracts are everyone's contracts.

```ts
import { randomDNA, renderSVG, encodeShareCode } from '@arkplay/avatar-engine'

const dna = randomDNA({ seed: 42, theme: 'wizard' })
const svg = renderSVG(dna, { crop: 'portrait', size: 256 })
const code = encodeShareCode(dna)
```

Guides: [Getting started](../../docs/getting-started.md), [DNA](../../docs/dna.md), [Rendering](../../docs/rendering.md), [Exports and animation](../../docs/exports.md), [Adding content](../../docs/adding-content.md).

## Commands (from this folder)

```bash
npx tsc -p tsconfig.json                          # typecheck
npm test                                          # node --test (determinism, codec, every item/species/expression/pose/clip, exports, resvg safety)
npm run codebook                                  # append new schema ids to the A2 share-code codebook (`-- --check` only verifies)
node scripts/gallery.ts <mode>                    # visual QA → out/gallery-<mode>.png
GALLERY_TAG=me GALLERY_ZOOM=3 node scripts/gallery.ts portraits    # own filename, 3× close-up
GALLERY_QUALITY=standard node scripts/gallery.ts random           # the animation-frame look
node scripts/anim-qa.ts walk plans                                # a clip on every body plan; also `bodies`, `--grid`, `--at`, `--onion`
```

Gallery modes: `default random themes portraits creatures views expressions poses pets`, `items <slot> [view]`, `anim [clip] [view] [species]`. `out/` is gitignored.

## Source-first

`exports` points at `src/index.ts`; there's no build. Node runs the `.ts` files directly (type stripping), and Vite and esbuild bundle them. That means:

- Imports use explicit `.ts` extensions, and types come in through `import type` (`verbatimModuleSyntax`).
- No enums, namespaces or constructor parameter properties (`erasableSyntaxOnly`).
- `noUnusedLocals` and `noUnusedParameters` are on.
- Consumers import only from `@arkplay/avatar-engine` (that is, `src/index.ts`). Deep imports aren't part of the API.

## Contracts: don't break these

- **DNA v1** is `{ v, kind, seed, name, sections, outfit, accessories, meta }`, described in `dna/types.ts`. The ParamSpecs in `dna/schema/*` are the single source of truth for the studio UI, the randomizer and validation.
- **Defaults are frozen forever.** Share codes store only differences from the schema defaults, so changing a default silently changes every existing avatar.
  - Never change a default, rename or reuse an id (param keys, section ids, item ids, choice ids), or change what a value means.
  - Add params with defaults that keep today's look.
  - For a real format change, add a migration in `dna/migrate.ts` and bump `DNA_VERSION`.
- **Share codes** are `"A2" + base64url(bitstream + CRC-16)` (`dna/packed.ts`, the default) or the older `"A1" + base64url(deflate(sparse JSON))`. `decodeShareCode` reads both forever. Both carry exactly `compactDNA` (so a round trip keeps `dnaHash`); inline custom art (`asset.src`) is stripped. Don't change `compactDNA`, `canonicalJSON`, `dnaHash` or `dnaEquals`: they key every cache and ETag.
- **The A2 codebook is append-only.** `dna/codebook.data.ts` (generated) maps every section, param key, item, species, choice option and palette colour to its position, and A2 codes store those positions. Never reorder, rename or delete an entry. **After adding a param, option, item, species or palette colour, run `npm run codebook`.** The golden vectors in `test/fixtures/share-codes.json` are never regenerated.
- **Determinism:** all randomness goes through `createRng(seed).fork(label)`, `ctx.rng(label)` or `hash32`, never `Math.random`. `freshSeed()` is for UIs only.
  - With a fixed `idPrefix`, the same DNA and options give byte-identical SVG.
  - Without one, each render gets a fresh prefix (`av0`, `av1`…) so several avatars can share an HTML page.
- **Generators return normalized DNA.** `randomDNA`, `mutate`, `crossover` and `interpolate` round through the schema, so saving or sharing never changes an avatar or its `dnaHash`.
- **`ENGINE_VERSION`** (`version.ts`) is part of every render-cache key. Bump it whenever the output changes.
- **No DOM.** Output is SVG strings only, so the same code runs in browsers, workers and Node.

## Rendering

- `renderSVG(dna, RenderOptions)`: views `front | side | back`; crops `full` (fixed world frame, used for game sprites), `fit`, `bust`, `head` and `portrait`.
- **`quality`:** `'high'`, the default for stills, bakes in the expensive lighting and material detail; `'standard'` is the lighter look for animation frames (sprite sheets, rigs and sampled frames always use it). Generators read it as `ctx.baked`; put anything costly behind it.
- **`motion`** is on by default for `'high'` stills and always off when `anim` is set. Auras, effects and scene particles loop through CSS keyframes embedded in the SVG (`render/motion.ts` scopes the CSS to the id prefix and handles `prefers-reduced-motion`). resvg ignores `@keyframes` and draws the base geometry, so the base geometry must work as a still.
- **Budgets** for a typical full avatar: standard under about 8 ms; baked SVG generation ≤ 25 ms, document ≤ 400 KB, resvg at 512 px ≤ 500 ms.
- **The Painter** (`render/painter.ts`) is the only place fills, shading, outlines and colour grades are decided. Part generators describe shapes and call `paint.shape`, `union`, `line`, `flat`, `glow` and `linear`, so all art obeys the style section. Register gradients, patterns, filters, masks and clips through `ctx.defs`, which prefixes their ids.
- **Z order:** the humanoid table `Z` is in `render/context.ts`; the creature table `CZ` is in `parts/creature/head.ts`.

## resvg safety

resvg (used to rasterize in Node) can crash the process on layers that are entirely off-canvas and carry group `opacity` or a clip, mask or filter. `partsSVG` culls parts outside the crop box, and the Painter uses `fill-opacity`/`stroke-opacity` rather than group opacity. Keep it that way, and keep filters local to the part that uses them. `npm test` rasterizes every crop and view of risky avatars.

## Economy: tiers, rarity, features

- **Item tiers** (`ItemSpec.tier`: `free` default, `paid`, `limited`, `nft`). The paid list is one table, `PAID_ITEMS` in `dna/schema/items.ts`.
- **Premium art:** the art of paid, limited and NFT items is not part of this package. `premiumArt()` (`render/premiumArt.ts`) is the registry it plugs into; without it those items draw a neutral placeholder (`needsPremiumArt(dna)` tells you when), and a service that has the art can draw them.
- **Rarity** (`rarity.ts`): only paid, limited and NFT items score; free choices never rise above Common.
- **Features and promotions** (`features.ts`): `FEATURES`, `PROMO`, `promoActive(now)`. Helpers take the time as an argument so they stay deterministic.
- `randomDNA({ freeOnly: true })` rolls only free items.

## Adding content

See [Adding content](../../docs/adding-content.md). In short: an item is an `ItemSpec` plus art in the slot's `parts/shared/acc*.ts` or `parts/humanoid/garments.ts`; a species is a preset in `dna/species.ts`; a clip is timing in `anim/clips.ts` plus motion in `anim/*Clips.ts`; a theme goes in `generate/themes.ts`; an expression in `anim/expression.ts`. Then `npm run codebook`, the gallery, and `npm test`.
