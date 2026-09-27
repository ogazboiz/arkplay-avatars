# Adding content

All content is data plus procedural art in `packages/avatar-engine`. The studio, the randomizer and validation are driven by the schema, so anything you add shows up in the studio automatically. Read [`packages/avatar-engine/README.md`](../packages/avatar-engine/README.md) first: its contract rules are not optional.

## The three unbreakable rules

1. **Frozen defaults and ids.** Never change an existing param's default or meaning, and never rename or reuse any id (param key, section, item, choice option, species, clip, theme). New params get defaults that keep the current look. Share codes store only differences from the defaults, so breaking this silently changes avatars people already made.
2. **Determinism.** Randomness only comes from `ctx.rng(label)`, `createRng(seed).fork(label)` or `hash32`. Never `Math.random`.
3. **No DOM, and resvg-safe output.** Use the Painter and `ctx.defs`; use `fill-opacity`, not group `opacity`; keep filters local to the part that uses them.

## Recipes

**Garment or accessory**

1. Add an `ItemSpec` to `GARMENTS` or `ACCESSORIES` in `src/dna/schema/items.ts`: `id`, `label`, `slot`, `kinds`, `tags` (used by themes), `params` (built with `range`/`color`/`choice`/`toggle`), and optionally `occupies`, `hides` and `weight`.
2. Draw it:
   - garments: `src/parts/humanoid/garments.ts`, as offsets of the body outlines
   - head items: `src/parts/shared/accHead.ts`
   - face and ear items: `accFace.ts`
   - neck, back, waist, wrist and tail items: `accBody.ts`
   - held items: `accHeld.ts`
   - auras and particles: `accFx.ts`

   Placement on the body is in `src/parts/humanoid/accessories.ts`, and on creatures in `src/parts/creature/accessories.ts`.
3. Draw every view (front, side, back). Use `paint.shape(d, color, { shade, gloss, material… })`, and gate expensive detail with `ctx.baked`.

Items are free by default. Paid, limited and NFT items (the `PAID_ITEMS` table, `tier: 'limited'`, `nftOnly`) keep their art outside this repository and draw a placeholder here; only they affect rarity.

**Hairstyle:** add the option to `HAIR_STYLES` (`src/dna/schema/humanoid.ts`) and write its recipe in `src/parts/humanoid/hair.ts` (back mass, front mass, bangs, strands).

**Creature species:** add a `SpeciesPreset` to `src/dna/species.ts`: values for the existing creature params plus a body `plan`. If the species needs a new ear, horn, tail or pattern *option*, add the option (with the default unchanged) and its art in `src/parts/creature/*`.
Careful: `randomDNA` picks creatures from `SPECIES`, so appending a species changes which creature a given seed rolls. If you use seeded creatures as stable defaults (for example one per account), pick them from a frozen list first.

**Animation clip:** timing lives only in `CLIPS` (`src/anim/clips.ts`: `info(name, label, loop, duration, fps, kinds, tags)`, with duration × fps ≤ 36 frames). The builder in `src/anim/humanClips.ts` or `creatureClips.ts` returns motion only: place feet with the IK kits (`legKit`, `creatureKit.place`) and `stance()` so they plant and never slide, and list wings the clip flaps in `owns`. Name its events (for example `footstep`) so they reach the sprite-sheet and rig exports. Check it across bodies with `node scripts/anim-qa.ts <clip> plans` and `node scripts/anim-qa.ts <clip> bodies`, and look at the PNGs.

**Theme:** add it to `THEMES` in `src/generate/themes.ts` (tags, skin and hair odds, item picks).

**Expression:** add a preset to `EXPRESSION_PRESETS` in `src/anim/expression.ts` and an option to `EXPRESSIONS` in `src/dna/schema/shared.ts`.

**Scene preset or background pattern:** add it to `SCENE_PRESETS` or `BG_PATTERNS` (`src/dna/schema/shared.ts`) and draw it in `src/parts/shared/scene.ts`. Keep it behind the character: lower contrast in the distance, and a focal light behind the head.

## Register new ids in the share-code codebook (always)

A2 share codes write every id as its position in the append-only codebook (`src/dna/codebook.data.ts`, generated). After adding a param, a choice option (a hairstyle, pattern or expression is one), an item, a species or a palette colour, run:

```bash
npm run codebook
```

It appends the new ids and never reorders or removes anything; `npm test` fails until you run it. Never edit `codebook.data.ts` by hand. If the script reports a changed default or type, undo that schema change instead.

## Check your work (always)

```bash
cd packages/avatar-engine
npx tsc -p tsconfig.json
npm run codebook -- --check
GALLERY_TAG=mine GALLERY_ZOOM=2 node scripts/gallery.ts items <slot> front   # also side and back
npm test
```

Gallery modes: `default random themes portraits creatures views expressions poses pets`, `items <slot> [view]`, `anim [clip] [view] [species]`. Sheets land in `packages/avatar-engine/out/` (gitignored).

- **Look at the gallery PNG** and judge it like an art director: all three views, the `head` and `portrait` crops, the style settings (flat, cel, soft, rim; outline 0 and bold; `detail: low`) and `GALLERY_QUALITY=standard`.
- `npm test` fails if a new item draws nothing, if any species, expression, pose or clip throws, or if output isn't resvg-safe.
- If the output of existing avatars changed, bump `ENGINE_VERSION` in `src/version.ts`: it is part of every render-cache key.
