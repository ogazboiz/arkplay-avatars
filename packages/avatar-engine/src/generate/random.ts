/* Procedural avatars from a seed.
 *
 * Every param is drawn from its spec (ranges around their defaults, weighted choices,
 * palettes), then coherence rules take over: an outfit is coloured from one harmony,
 * a theme favours matching items, skin and eye colours follow natural distributions
 * with a rare fantasy twist. Same seed + options → same avatar, everywhere. */

import { EYE_COLORS, FANTASY_SKIN, HAIR_FANTASY, HAIR_NATURAL, harmony, NATURE_COLORS, PALETTES, SKIN_TONES } from '../core/color.ts'
import { clamp } from '../core/math.ts'
import { createRng, type Rng } from '../core/rng.ts'
import { makeItem, applySpecies } from '../dna/defaults.ts'
import { normalizeDNA, resolveItems } from '../dna/normalize.ts'
import { coerce, type AvatarKind, type ParamSpec, type Params, type ParamValue } from '../dna/params.ts'
import { ACCESSORIES, GARMENTS, itemTier, sectionsFor, type ItemSpec, type SlotId } from '../dna/schema/index.ts'
import { SPECIES } from '../dna/species.ts'
import { DNA_VERSION, type AvatarDNA, type ItemRef } from '../dna/types.ts'
import { themeById, type Theme } from './themes.ts'

export interface RandomOptions {
  seed: number | string
  kind?: AvatarKind | 'any'
  theme?: string
  /** Start from this avatar and only re-roll what is not locked. */
  base?: AvatarDNA
  /** Locked section ids, `section.key` params, or 'outfit' / 'accessories' / 'colors'. */
  locks?: string[]
  /** Re-roll only these sections (and/or 'outfit', 'accessories'). */
  only?: string[]
  /** Creature species preset to start from. */
  species?: string
  /** Only roll free items (no paid, limited or NFT ones), so the avatar stays Common. Used
   *  for account default avatars. Items kept from `base` are left alone. */
  freeOnly?: boolean
}

const tagBoost = (tags: readonly string[] | undefined, theme: Theme): number =>
  !theme.tags.length || !tags?.length ? 1 : tags.some((t) => theme.tags.includes(t)) ? 7 : 0.6

/** A random value for one param. */
export function randomParam(spec: ParamSpec, rng: Rng, theme: Theme = themeById('any'), current?: ParamValue): ParamValue {
  const h = spec.random ?? {}
  if (h.mode === 'keep') return current ?? spec.default
  switch (spec.type) {
    case 'range': {
      const lo = h.min ?? spec.min
      const hi = h.max ?? spec.max
      if (h.p !== undefined && !rng.chance(h.p)) return spec.default
      const v = h.mode === 'normal' ? rng.normal(spec.default, h.sd ?? 0.15, lo, hi) : rng.range(lo, hi)
      return coerce(spec, spec.step >= 1 ? Math.round(v) : v)
    }
    case 'color': {
      if (spec.allowAuto && h.p !== undefined && !rng.chance(h.p)) return ''
      return rng.pick(PALETTES[spec.palette])
    }
    case 'choice': {
      const opts = spec.options.filter((o) => (o.weight ?? 1) > 0)
      return rng.weighted(opts, (o) => (o.weight ?? 1) * tagBoost(o.tags, theme)).id
    }
    case 'toggle':
      return rng.chance(h.p ?? 0.5)
    case 'text':
      return current ?? spec.default
  }
}

/** Sections both kinds share; everything else on a creature is species anatomy. */
const SHARED_SECTION_IDS = new Set(['expression', 'pose', 'scene', 'style'])

function isLocked(locks: Set<string>, section: string, key?: string): boolean {
  return locks.has(section) || (key !== undefined && locks.has(`${section}.${key}`))
}

function naturalEye(rng: Rng): string {
  const r = rng.next()
  if (r < 0.5) return rng.pick(EYE_COLORS.slice(0, 4))
  if (r < 0.62) return rng.pick(EYE_COLORS.slice(4, 6))
  if (r < 0.74) return rng.pick(EYE_COLORS.slice(6, 8))
  if (r < 0.9) return rng.pick(EYE_COLORS.slice(8, 11))
  if (r < 0.96) return EYE_COLORS[11]
  return rng.pick(EYE_COLORS.slice(12))
}

function pickItem(rng: Rng, pool: ItemSpec[], theme: Theme): ItemSpec | undefined {
  const list = pool.filter((i) => (i.weight ?? 1) > 0)
  if (!list.length) return undefined
  return rng.weighted(list, (i) => (i.weight ?? 1) * tagBoost(i.tags, theme))
}

function colourItem(spec: ItemSpec, rng: Rng, pal: string[], role: 'main' | 'bottom' | 'shoes' | 'accent'): Params {
  const out: Params = {}
  for (const p of spec.params) {
    if (p.type === 'color') {
      if (p.palette === 'metal') out[p.key] = rng.pick(PALETTES.metal)
      else if (p.key === 'color') out[p.key] = role === 'main' ? pal[0] : role === 'bottom' ? (rng.chance(0.45) ? '#3b5b92' : pal[3]) : role === 'shoes' ? rng.pick([pal[3], pal[4], '#f5f2eb', '#26252c']) : pal[2]
      else if (p.key === 'color2') out[p.key] = pal[rng.int(1, 4)]
      else if (p.key === 'patternColor') out[p.key] = pal[4]
      else if (p.allowAuto) out[p.key] = ''
      else out[p.key] = rng.pick(pal)
    } else if (p.key === 'pattern') {
      out[p.key] = rng.chance(0.2) ? randomParam(p, rng) : 'solid'
    } else if (p.key === 'graphic') {
      out[p.key] = rng.chance(0.3) ? randomParam(p, rng) : 'none'
    } else if (p.type !== 'text') {
      out[p.key] = randomParam(p, rng)
    }
  }
  return out
}

/** Pool filter: everything, or only free items (`freeOnly`). */
const allowed = (freeOnly: boolean) => (spec: ItemSpec) => !freeOnly || itemTier(spec.id) === 'free'

function randomOutfit(rng: Rng, theme: Theme, freeOnly = false): ItemRef[] {
  const pal = harmony(rng, undefined, theme.hues ? rng.pick(theme.hues) : undefined)
  const ok = allowed(freeOnly)
  const bySlot = (slot: SlotId) => GARMENTS.filter((g) => g.slot === slot && ok(g))
  const items: ItemRef[] = []
  const add = (spec: ItemSpec | undefined, role: 'main' | 'bottom' | 'shoes' | 'accent') => {
    if (spec) items.push(makeItem(spec.id, colourItem(spec, rng, pal, role)))
  }
  if (rng.chance(0.18)) add(pickItem(rng, bySlot('full'), theme), 'main')
  else {
    add(pickItem(rng, bySlot('top'), theme), 'main')
    add(pickItem(rng, bySlot('bottom'), theme), 'bottom')
    if (rng.chance(0.3)) add(pickItem(rng, bySlot('outer'), theme), 'accent')
  }
  if (rng.chance(0.95)) add(pickItem(rng, bySlot('shoes'), theme), 'shoes')
  if (rng.chance(0.18)) add(pickItem(rng, bySlot('socks'), theme), 'accent')
  // Theme must-haves.
  for (const inc of theme.include) {
    if (!rng.chance(inc.p)) continue
    const id = rng.pick(inc.ids)
    const spec = GARMENTS.find((g) => g.id === id)
    if (spec && ok(spec)) add(spec, spec.slot === 'shoes' ? 'shoes' : 'main')
  }
  return resolveItems(items, 'humanoid')
}

function randomAccessories(rng: Rng, theme: Theme, kind: AvatarKind, freeOnly = false): ItemRef[] {
  const out: ItemRef[] = []
  const ok = allowed(freeOnly)
  const pal = harmony(rng)
  const rates: [SlotId, number][] =
    kind === 'humanoid'
      ? [['eyes', 0.2], ['head', 0.22], ['ears', 0.2], ['neck', 0.14], ['hairAcc', 0.1], ['face', 0.07], ['headFeature', 0.06], ['wrist', 0.12], ['handR', 0.08], ['back', 0.07], ['waist', 0.08], ['aura', 0.04], ['companion', 0.05], ['tailAcc', 0.03]]
      : [['head', 0.12], ['neck', 0.12], ['eyes', 0.05], ['aura', 0.04]]
  for (const [slot, p] of rates) {
    if (!rng.chance(Math.min(0.9, p * theme.accessories))) continue
    const spec = pickItem(rng, ACCESSORIES.filter((a) => a.slot === slot && a.kinds.includes(kind) && ok(a)), theme)
    if (spec) out.push(makeItem(spec.id, colourItem(spec, rng, pal, 'accent')))
  }
  for (const inc of theme.include) {
    if (!rng.chance(inc.p)) continue
    const spec = ACCESSORIES.find((a) => a.id === rng.pick(inc.ids) && a.kinds.includes(kind) && ok(a))
    if (spec) out.push(makeItem(spec.id, colourItem(spec, rng, pal, 'accent')))
  }
  return resolveItems(out, kind)
}

function randomScene(rng: Rng, theme: Theme, current: Params): Params {
  const pal = harmony(rng)
  const kind = rng.weighted(['gradient', 'radial', 'solid', 'pattern', 'scene', 'none'], (k) => ({ gradient: 5, radial: 2, solid: 1.5, pattern: 1.5, scene: theme.scenes ? 3 : 1.5, none: 0.3 })[k] ?? 1)
  return {
    ...current,
    background: kind,
    color1: pal[3],
    color2: pal[0],
    angle: rng.range(0.2, 0.8),
    pattern: rng.pick(['dots', 'stripes', 'stars', 'hearts', 'confetti', 'zigzag', 'waves', 'hex', 'rays', 'grid', 'checker']),
    preset: theme.scenes ? rng.pick(theme.scenes) : rng.pick(['sky', 'sunset', 'night', 'forest', 'meadow', 'beach', 'city', 'snow', 'space', 'underwater', 'stage', 'candy']),
  }
}

export function randomDNA(opts: RandomOptions): AvatarDNA {
  const rng = createRng(opts.seed)
  const theme = themeById(opts.theme)
  const locks = new Set(opts.locks ?? [])
  const only = opts.only ? new Set(opts.only) : null
  const base = opts.base
  const kind: AvatarKind =
    opts.kind === 'humanoid' || opts.kind === 'creature' ? opts.kind : base && opts.kind !== 'any' ? base.kind : rng.chance(0.28) ? 'creature' : 'humanoid'
  const keepKind = base && base.kind === kind
  const reroll = (section: string) => (only ? only.has(section) : true) && !locks.has(section)

  let dna: AvatarDNA = {
    v: DNA_VERSION,
    kind,
    seed: keepKind && (locks.has('seed') || (only && !only.has('seed'))) ? base!.seed : rng.int(0, 0xffffffff) >>> 0,
    name: keepKind ? base!.name : '',
    sections: {},
    outfit: [],
    accessories: [],
  }

  const speciesRolled = kind === 'creature' && (!keepKind || reroll('species'))
  if (speciesRolled) {
    const tagged = SPECIES.filter((s) => !theme.tags.length || s.tags.some((t) => theme.tags.includes(t)))
    const preset = opts.species ?? rng.pick(tagged.length ? tagged : SPECIES).id
    dna = applySpecies({ ...dna, sections: Object.fromEntries(sectionsFor('creature').map((s) => [s.id, {}])) }, preset)
    // Treat the preset as a mean and wander from it.
    for (const s of sectionsFor('creature')) {
      if (s.id === 'species' || s.id === 'scene' || s.id === 'style' || s.id === 'expression') continue
      for (const p of s.params) {
        const cur = dna.sections[s.id][p.key]
        if (p.type === 'range' && p.random?.mode !== 'keep') dna.sections[s.id][p.key] = coerce(p, clamp(Number(cur) + rng.normal(0, 0.1), p.min, p.max))
        else if (p.type === 'color' && s.id === 'coat' && rng.chance(0.35)) dna.sections[s.id][p.key] = rng.chance(0.6) ? rng.pick(NATURE_COLORS) : rng.pick(PALETTES.cloth)
      }
    }
  }

  // Creature anatomy isn't drawn param by param: it comes from a species preset. Re-rolling
  // the species re-rolls every unlocked anatomy section; re-rolling one part on its own
  // (`only: ['ears']`) borrows that part from a random creature so it actually changes.
  let donor: AvatarDNA | undefined
  const donorSection = (id: string): Params => {
    donor ??= randomDNA({ seed: rng.fork('donor').int(0, 0xffffffff), kind: 'creature', theme: opts.theme, species: opts.species })
    return { ...donor.sections[id] }
  }

  for (const s of sectionsFor(kind)) {
    const anatomy = kind === 'creature' && !SHARED_SECTION_IDS.has(s.id)
    const kept: Params = keepKind ? (base!.sections[s.id] ?? {}) : {}
    const fresh = !keepKind || reroll(s.id) || (anatomy && speciesRolled && !locks.has(s.id))
    const cur: Params = !keepKind
      ? { ...(dna.sections[s.id] ?? {}) }
      : anatomy && fresh
        ? speciesRolled
          ? { ...dna.sections[s.id] }
          : donorSection(s.id)
        : { ...kept }
    const out: Params = { ...cur }
    for (const p of s.params) {
      if (!fresh || isLocked(locks, s.id, p.key)) {
        out[p.key] = p.key in kept ? kept[p.key] : (out[p.key] ?? p.default)
        continue
      }
      if (anatomy) {
        if (!(p.key in out)) out[p.key] = p.default
        continue
      }
      out[p.key] = s.id === 'style' || s.id === 'pose' ? (cur[p.key] ?? p.default) : randomParam(p, rng.fork(`${s.id}.${p.key}`), theme, cur[p.key])
    }
    dna.sections[s.id] = out
  }

  if (kind === 'humanoid') {
    const sec = dna.sections
    const r = rng.fork('coherence')
    if (reroll('skin') && !isLocked(locks, 'skin', 'tone')) sec.skin.tone = r.chance(theme.fantasySkin) ? r.pick(FANTASY_SKIN) : r.pick(SKIN_TONES)
    if (reroll('hair') && !isLocked(locks, 'hair', 'color')) sec.hair.color = r.chance(theme.fantasyHair) ? r.pick(HAIR_FANTASY) : r.pick(HAIR_NATURAL.slice(0, 14))
    if (reroll('eyes') && !isLocked(locks, 'eyes', 'iris')) sec.eyes.iris = naturalEye(r)
    if (reroll('facialHair')) {
      sec.facialHair.beard = r.chance(0.2) ? sec.facialHair.beard : 'none'
      sec.facialHair.mustache = r.chance(0.15) ? sec.facialHair.mustache : 'none'
    }
    if (reroll('skin')) {
      sec.skin.scar = r.chance(0.06) ? sec.skin.scar : 'none'
      sec.skin.facePaint = r.chance(0.06 + (theme.id === 'party' ? 0.3 : 0)) ? sec.skin.facePaint : 'none'
      sec.skin.bodyArt = r.chance(0.06) ? sec.skin.bodyArt : 'none'
    }
    if (reroll('body') && !isLocked(locks, 'body', 'limbDiff')) sec.body.limbDiff = r.chance(0.02) ? sec.body.limbDiff : 'none'
    if (reroll('eyes')) {
      if (!r.chance(0.2)) sec.eyes.liner = 0
      if (!r.chance(0.12)) sec.eyes.shadow = 0
    }
  }

  if (!keepKind || (reroll('scene') && !locks.has('colors'))) dna.sections.scene = randomScene(rng.fork('scene'), theme, dna.sections.scene)

  const rollOutfit = kind === 'humanoid' && (!keepKind || (only ? only.has('outfit') : !locks.has('outfit')))
  const rollAcc = !keepKind || (only ? only.has('accessories') : !locks.has('accessories'))
  dna.outfit = kind === 'humanoid' ? (rollOutfit ? randomOutfit(rng.fork('outfit'), theme, opts.freeOnly) : structuredClone(base!.outfit)) : []
  dna.accessories = rollAcc ? randomAccessories(rng.fork('acc'), theme, kind, opts.freeOnly) : structuredClone(base!.accessories).filter((a) => a.id !== 'custom' || keepKind)
  if (theme.id !== 'any') dna.meta = { ...dna.meta, theme: theme.id }
  // Generators draw raw floats; normalizing rounds them to what storage keeps, so a random
  // avatar survives share codes and saving unchanged (same dnaHash on client and server).
  return normalizeDNA(dna)
}
