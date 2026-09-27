# Avatar DNA and share codes

An ArkPlay avatar is a small JSON document called its **DNA**. Every image, sprite sheet or rig is a pure function of that DNA plus the engine version: nothing about an avatar lives anywhere else. The studio edits DNA, a service stores it, and games render it.

Types: `packages/avatar-engine/src/dna/types.ts`. Schema: `packages/avatar-engine/src/dna/schema/`.

## Shape (v1)

```jsonc
{
  "v": 1,                      // DNA version; changes only with a migration (dna/migrate.ts)
  "kind": "humanoid",          // or "creature"
  "seed": 3141592653,          // uint32; seeds every procedural detail (strands, freckles, fur tufts)
  "name": "Ada",               // ≤ 40 chars
  "sections": {                // section id → { param key → value }
    "body":  { "height": 0.55, "build": 0.4 },
    "hair":  { "style": "bob", "color": "#3b2a20" },
    "scene": { "background": "scene", "preset": "sunset" },
    "style": { "shading": "cel", "outline": 0.4 }
    // …which sections exist depends on `kind` (sectionsFor(kind))
  },
  "outfit": [ { "id": "hoodie", "params": { "color": "#2f6f8f" } } ],     // humanoid garments
  "accessories": [ { "id": "crown", "params": {} },
                   { "id": "custom", "params": { "anchor": "head" },
                     "asset": { "id": "as_01J…", "w": 256, "h": 256 } } ],
  "meta": { "species": "fox", "theme": "fantasy" }                       // informational
}
```

- **Params** are declared once as `ParamSpec`s (`dna/params.ts`), and each has one of five types:
  - `range`: a number within min/max/step
  - `color`: `#rrggbb`, or `""` for "auto" where it's allowed
  - `choice`: an option id
  - `toggle`
  - `text`: with a charset and a max length
- The specs drive the studio's controls, the randomizer and validation, so a new param shows up in the studio without UI code.
- **Animation-only params** change how an avatar moves, never how a still looks. `species.gait` (creatures: `auto`, `walk`, `hop`, `waddle`, `float`) picks the gait of walks, runs and idles; `auto` derives it from the body.
- **Items** reference an `ItemSpec` id (`dna/schema/items.ts`). Each item lives in a **slot** that has a capacity (a dress also fills top and bottom). `normalizeDNA` resolves conflicts and caps: at most 8 outfit items and 24 accessories.
- **Custom art** (`id: "custom"`) is either:
  - an uploaded image referenced by `asset.id`, which is what gets stored and shared (the host resolves ids to URLs with `assetUrl`)
  - or an inline `asset.src` data URL, for local drafts only (at most 700,000 characters)

## Rules

- **Normalize untrusted input:** `normalizeDNA(anything)` always returns valid DNA. It fills in defaults, clamps and coerces values, drops unknown keys and migrates old versions. `validateDNA(x)` lists what normalizing would change; a service should reject saves that have problems.
- **Defaults are frozen forever**, and ids are never renamed or reused. Share codes store only non-default values, so changing a default would change every existing avatar.
- **Engine output changes are versioned:** `ENGINE_VERSION` is part of every render-cache key and ETag.
- **Generators return normalized DNA.** `randomDNA`, `mutate`, `crossover` and `interpolate` round through the schema, so saving or sharing never changes an avatar or its `dnaHash`.

## Share codes

```
A2<base64url(bitstream + CRC-16)>        the default
A1<base64url(deflate(compact JSON))>     the original format, still read forever
```

- Both carry the **compact form**, `compactDNA(dna)`: `{ v, k: "h"|"c", s: seed, n?: name, x?: {section: {non-default params}}, o?: outfit, a?: accessories, sp?: species }`. Items are `{ id, p?: non-default params, a?: uploaded asset }`. Inline custom art, asset names and `meta.theme`/`meta.source` are not part of it.
- `dnaHash(dna)` hashes the canonical compact form (use it for cache keys and ETags). An A2 round trip is exact: `decodeShareCode(encodeShareCode(dna))` has the same compact form and the same `dnaHash` as `normalizeDNA(dna)`.
- `encodeShareCode(dna)` writes A2; `encodeShareCode(dna, { format: 'A1' })` still writes A1.
- `decodeShareCode(code, report?)` reads both. It ignores spaces and line breaks inside a pasted code, refuses anything over 8000 characters, and throws `ShareCodeError` with a message you can show:
  - "Not an avatar code."
  - "That avatar code has a typo or is incomplete." (the A2 checksum doesn't match)
  - "That avatar code is damaged or incomplete."
  - "That avatar code was made by a newer version of the studio. Reload and try again."
- `encodeAvatarBytes(dna)` and `decodeAvatarBytes(bytes, report?)` are the same A2 bytes without the text wrapping, for binary transports such as game netcode.
- The studio opens a code from the URL hash: `…/avatar/studio/#code=A2…`.

### Sizes

Characters, mean / p95 / max. `randomDNA` avatars are the worst case: every slider sits at an arbitrary 1e-4 position and outfits use generated colours.

| Avatars | A1 | A2 | A2 is |
| --- | --- | --- | --- |
| Random humanoid (1000, seeds 1–1000) | 1198 / 1277 / 1376 | 253 / 272 / 289 | 4.7× shorter |
| Random creature (1000, seeds 1–1000) | 684 / 758 / 838 | 133 / 148 / 158 | 5.1× shorter |
| Default humanoid (`defaultDNA()`) | 80 | 18 | |
| Default creature (the fox preset) | 310 | 56 | |

### How A2 is built

The code lives in `packages/avatar-engine/src/dna/packed.ts` (layout), `bits.ts` (bit coding) and `codebook.ts`. Bits are MSB-first.

- **Ids are numbers.** Every section, param key, item, species, choice option and common colour is written as its position in the **codebook**. Wire index 0 means "the literal id follows", so the encoder works even with an out-of-date book; it just spends more bits.
- **Only what differs from the defaults is written**: a count, then gap-coded key indices, then the values.
- **Each value uses the fewest bits its type allows:**
  - `range` is stored at 1e-4 precision. A value on the slider's step grid is its grid position (7 bits for a 0–1 slider with step 0.01). Any other value is its position in 1e-4 units between the min and max (about 13.3 bits for 0–1). Values outside the recorded bounds fall back to a zigzag Exp-Golomb offset from the default, or a raw double.
  - `color` takes the cheapest of: an index into the param's palette, a back-reference to a colour this code already used, an index into the common colours, raw `#rrggbb` (24 bits), `#rgb` (12 bits) or `''` (auto).
  - `choice` is the option's index with an Exp-Golomb order that suits the option count. `toggle` is 1 bit. `text` and the name are UTF-8.
  - The seed is 32 raw bits. Items keep their order, because order is part of the avatar.
- **Integrity:** a CRC-16/GENIBUS closes the code. A single mistyped character is always refused, and so are two swapped neighbours and a dropped or doubled character.
- **Readers must be at least as new as writers.** When a code mentions a choice option, colour or species that the reader's codebook doesn't have yet, that value is reset to its default and a warning is reported. A section, param or item it doesn't have can't be skipped, so the code is refused with the "newer version" message. So update whatever decodes codes (for example a service) before, or with, a studio release that adds content.

### The codebook (append-only)

`packages/avatar-engine/src/dna/codebook.data.ts` is generated. It lists section ids and their param keys, item ids and their param keys, species ids, choice option lists and every palette colour. Each param entry records what decoding needs (defaults, bounds, palettes, options) as it was when the param was registered, so decoding never depends on the schema's current order.

- **It is append-only.** Never reorder, rename or delete an entry. Every A2 code ever made points into these lists by position.
- **After adding a param, choice option, item, species or palette colour, run `npm run codebook`.** It appends the new ids and leaves everything else alone. `npm run codebook -- --check` only verifies. The engine tests fail while the book is out of date, and the script refuses to write if a param's type or default changed.
- **Golden vectors:** `packages/avatar-engine/test/fixtures/share-codes.json` pins A2 and A1 codes in both directions. Never regenerate it. If a vector fails, codes people already shared would decode differently.

## Generating and editing

- `randomDNA({ seed, kind, theme, locks, only, species, base, freeOnly })`: themed randomization with per-section locks (`locks: ['hair', 'body.height', 'outfit', 'colors']`).
- `mutate`, `variations`, `crossover` and `interpolate`: breed and morph avatars. Their output is already normalized.
- `setParam`, `setSection`, `addItem`, `removeItem`, `removeItemById`, `setItemParam`, `moveItem`, `extractOutfit` and `applyOutfit`: immutable edits that enforce the slot rules.
- `describeDNA(dna)`: alt text.
- `avatarRarity(dna)`: the avatar's rarity. Only paid, limited and NFT items score; free choices never rise above Common.
