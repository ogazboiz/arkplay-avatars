/* Stickers: the avatar in chat-ready scenes, the Bitmoji use-case.
 *
 *  - `stickerSet` (the original pack): the avatar across 16 expressions and poses (12 for
 *    creatures), plain square transparent renders. The studio's sticker export uses it.
 *  - Templates (`renderSticker`): pose + face + vector props + a caption in comic lettering +
 *    a backdrop shape + an optional animated effect, with a die-cut white border, in
 *    categories (greetings, reactions, love, celebrations, faith, gaming, school, weather)
 *    and two-avatar "friendmoji" (high five, hugs, selfie, race…). Square, transparent,
 *    deterministic (same DNA + template + options → the same bytes) and resvg-safe. The
 *    templates themselves live in `comics/stickerTemplates.ts`. */

import type { Box } from '../core/math.ts'
import { hash32 } from '../core/rng.ts'
import { escapeXml } from '../core/svg.ts'
import { defaultDNA } from '../dna/defaults.ts'
import type { AvatarDNA } from '../dna/types.ts'
import { randomDNA } from '../generate/random.ts'
import { renderSVG } from '../render/render.ts'
import type { RenderOptions } from '../render/types.ts'
import { arcLettering, fitLettering, inkLettering } from '../comics/font.ts'
import { INK, PAL } from '../comics/pen.ts'
import { drawProp } from '../comics/props.ts'
import { drawBackdrop, drawBanner, drawBubble, drawBurst, drawPill } from '../comics/shapes.ts'
import { anchorOf, boneAngle, CastMember, creatureVariant, drawShot, headSize, mouthOf, shoot, toCanvas, type ActorPose, type Placement, type Shot } from '../comics/stage.ts'
import { STICKER_CATEGORIES, STICKER_TEMPLATES, stickerTemplate, type ActorSpec, type CaptionSpec, type PropSpec, type StickerCategory, type StickerTemplate } from '../comics/stickerTemplates.ts'
import { effectLayers, isEffect, type EffectId } from './effects.ts'

export { STICKER_CATEGORIES, STICKER_TEMPLATES, stickerTemplate, type StickerCategory, type StickerTemplate }

export interface Sticker {
  name: string
  label: string
  svg: string
}

const HUMAN: [string, string, string, string][] = [
  ['hello', 'Hello!', 'happy', 'wave'],
  ['yay', 'Yay!', 'excited', 'cheer'],
  ['lol', 'LOL', 'laugh', 'relaxed'],
  ['love', 'Love it', 'love', 'heart'],
  ['cool', 'Cool', 'cool', 'arms-crossed'],
  ['thumbs-up', 'Nice', 'grin', 'thumbs-up'],
  ['peace', 'Peace', 'wink', 'peace'],
  ['hmm', 'Hmm…', 'confused', 'think'],
  ['shrug', 'Dunno', 'smirk', 'shrug'],
  ['wow', 'Wow', 'shocked', 'stand'],
  ['sad', 'Sad', 'cry', 'stand'],
  ['angry', 'Grr', 'furious', 'fight'],
  ['sleepy', 'Zzz', 'sleepy', 'relaxed'],
  ['strong', 'Strong', 'determined', 'flex'],
  ['salute', 'On it!', 'determined', 'salute'],
  ['oops', 'Oops', 'embarrassed', 'stand'],
]

const CREATURE: [string, string, string][] = [
  ['hello', 'Hello!', 'happy'],
  ['yay', 'Yay!', 'excited'],
  ['lol', 'LOL', 'laugh'],
  ['love', 'Love it', 'love'],
  ['cool', 'Cool', 'cool'],
  ['wow', 'Wow', 'shocked'],
  ['sad', 'Sad', 'cry'],
  ['angry', 'Grr', 'furious'],
  ['sleepy', 'Zzz', 'sleepy'],
  ['hmm', 'Hmm…', 'confused'],
  ['cheeky', 'Hehe', 'tongue'],
  ['dizzy', 'Whoa', 'dizzy'],
]

export function stickerSet(dna: AvatarDNA, opts: RenderOptions = {}): Sticker[] {
  const base: RenderOptions = { size: 512, crop: 'fit', background: false, frame: false, shadow: false, ...opts }
  if (dna.kind === 'creature') {
    return CREATURE.map(([name, label, expression]) => ({ name, label, svg: renderSVG(dna, { ...base, expression, title: label }) }))
  }
  return HUMAN.map(([name, label, expression, pose]) => ({ name, label, svg: renderSVG(dna, { ...base, expression, pose, title: label }) }))
}

/* ---- Templates ------------------------------------------------------------------ */

/** What a catalogue lists about a template (no art). */
export interface StickerInfo {
  id: string
  label: string
  category: StickerCategory
  /** Avatars in it: 2 = friendmoji. */
  cast: 1 | 2
  keywords: string[]
  caption: string | null
  effect: EffectId | null
  season: { from: string; until: string } | null
}

export function stickerInfo(t: StickerTemplate): StickerInfo {
  return {
    id: t.id,
    label: t.label,
    category: t.category,
    cast: t.actors.length > 1 ? 2 : 1,
    keywords: [...t.keywords],
    caption: t.caption?.text ?? null,
    effect: t.effect ?? null,
    season: t.season ? { ...t.season } : null,
  }
}

export interface StickerOptions {
  /** Output width and height in px (default 512). */
  size?: number
  /** Replace the template's effect; 'none' removes it. */
  effect?: EffectId | 'none'
  /** CSS loops for effects and auras (default true). The base frame is always a good still. */
  motion?: boolean
  /** The die-cut white border (default true). */
  outline?: boolean
  /** Id prefix (several stickers inline in one HTML page need different ones). */
  idPrefix?: string
  detail?: 'low' | 'medium' | 'high'
  quality?: 'standard' | 'high'
  assetUrl?: (id: string) => string | undefined
  /** Accessible title (default: the template's label). */
  title?: string | false
}

/** The friend a two-avatar sticker shows when no second avatar is given: free items only. */
export function buddyDNA(seed: string | number): AvatarDNA {
  return randomDNA({ seed: hash32('arkplay-buddy', seed), kind: 'humanoid', freeOnly: true })
}

const W = 512
const CAPTION_TOP: Box = { x: 18, y: 12, w: 476, h: 106 }
const CAPTION_BOTTOM: Box = { x: 18, y: 396, w: 476, h: 104 }

/** Where the characters go, by caption style. */
function stageArea(t: StickerTemplate): Box {
  const c = t.caption
  if (!c) return { x: 20, y: 18, w: 472, h: 480 }
  if (c.style === 'bubble' || c.style === 'thought') return { x: 14, y: 132, w: 400, h: 370 }
  if (c.style === 'arc') return { x: 40, y: 150, w: 432, h: 352 }
  if (c.at === 'bottom') return { x: 28, y: 12, w: 456, h: 384 }
  return { x: 28, y: 114, w: 456, h: 388 }
}

function actorPose(spec: ActorSpec, kind: AvatarDNA['kind']): ActorPose {
  if (kind === 'creature') return creatureVariant(spec)
  return { pose: spec.pose, clip: spec.clip, t: spec.t, expression: spec.expression, intensity: spec.intensity, look: spec.look, tilt: spec.tilt, view: spec.view }
}

const mirror = (b: Box): Box => ({ x: -(b.x + b.w), y: b.y, w: b.w, h: b.h })
const pad = (b: Box, k: number): Box => ({ x: b.x - b.w * k, y: b.y - b.h * k, w: b.w * (1 + 2 * k), h: b.h * (1 + 2 * k) })

/** 'solo' = a single creature: its whole body, or around its head when it is long. */
type Framing = NonNullable<ActorSpec['frame']> | 'solo'

/** How a template frames its actors: one humanoid defaults to a 3/4 shot (knees up). */
function framingOf(t: StickerTemplate, shots: Shot[]): Framing {
  const creature = shots[0].member.kind === 'creature'
  if (t.actors.length === 1 && creature && (!t.actors[0].frame || t.actors[0].frame === 'knees' || t.actors[0].frame === 'full')) return 'solo'
  const f = t.actors[0].frame
  if (f) return f === 'knees' && creature ? 'full' : f
  return t.actors.length === 1 ? 'knees' : 'full'
}

/** Creatures next to a humanoid are scaled up to about three quarters of its height. */
function boosts(shots: Shot[]): number[] {
  const human = Math.max(0, ...shots.filter((s) => s.member.kind === 'humanoid').map((s) => s.bounds.h))
  return shots.map((s) => (s.member.kind === 'creature' && human > 0 ? Math.max(1, Math.min(2.4, (human * 0.72) / Math.max(1, s.bounds.h))) : 1))
}

/** World box to frame for an actor: posed bounds (cut at mid-thigh for 'knees'), or the model's bust/head box. */
function frameBox(shot: Shot, framing: Framing, headroom = 0): Box {
  if (framing === 'bust') return shot.model.boxes.bust
  if (framing === 'head') return shot.model.boxes.head
  const b = pad(shot.bounds, 0.03)
  if (headroom) {
    const r = headroom * headSize(shot)
    b.y -= r
    b.h += r
  }
  if (framing === 'solo' && b.w > b.h * 1.3) {
    // A long side-view creature: frame around its head (the tail runs off the sticker's
    // edge) so the face is sticker-sized.
    const eyes = anchorOf(shot, 'eyes') ?? anchorOf(shot, 'face')
    const hx = eyes ? eyes[0] : b.x + b.w / 2
    const w = Math.max(b.h * 1.3, headSize(shot) * 2.4)
    const x = Math.max(b.x, Math.min(b.x + b.w - w, hx - w / 2))
    return { x, y: b.y, w, h: b.h }
  }
  const hr = shot.model.ctx.hr
  if (framing === 'knees' && hr) {
    const waist = anchorOf(shot, 'waist')
    const cut = (waist ? waist[1] : -hr.m.legLen) + hr.m.thigh * 0.62
    return { x: b.x, y: b.y, w: b.w, h: Math.max(b.h * 0.3, cut - b.y) }
  }
  return b
}

/** Places one or two actors in the stage area: one shared scale, feet on one line. */
function placeActors(shots: Shot[], specs: ActorSpec[], area: Box, framing: Framing): Placement[] {
  const boost = boosts(shots)
  const boxes = shots.map((s, i) => {
    const f = frameBox(s, framing, specs[i].headroom)
    const b = { x: f.x * boost[i], y: f.y * boost[i], w: f.w * boost[i], h: f.h * boost[i] }
    return specs[i].flip ? mirror(b) : b
  })
  // Two actors: box centres (w0 + w1) / 2 × |x1 − x0| / 2 apart (touching at x = ±1,
  // overlapping below that); a creature beside a humanoid tucks in a little closer.
  let dx = specs.map(() => 0)
  if (specs.length > 1) {
    const order = specs.map((s, i) => ({ i, x: s.x ?? 0 })).sort((a, b) => a.x - b.x)
    const [a, b] = [order[0], order[order.length - 1]]
    const mixed = shots.some((s) => s.member.kind === 'creature') && shots.some((s) => s.member.kind === 'humanoid')
    const D = ((boxes[a.i].w + boxes[b.i].w) / 2) * (Math.abs(b.x - a.x) / 2) * (mixed ? 0.8 : 1)
    const ca = a.x < 0 || b.x > 0 ? -D / 2 : 0
    dx = specs.map((_, i) => {
      const centre = i === a.i ? ca : i === b.i ? ca + D : 0
      return centre - (boxes[i].x + boxes[i].w / 2)
    })
  }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  boxes.forEach((b, i) => {
    x0 = Math.min(x0, b.x + dx[i])
    x1 = Math.max(x1, b.x + b.w + dx[i])
    y0 = Math.min(y0, b.y)
    y1 = Math.max(y1, b.y + b.h)
  })
  const U = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  // Full figures stand on the bottom of the area; 3/4 shots and busts are cut by the
  // sticker's bottom edge (so the die-cut border never runs along the cut).
  const cut = framing === 'knees' || framing === 'bust' || framing === 'head'
  const k = Math.min(area.w / U.w, (cut ? W - area.y : area.h) / U.h)
  const ox = area.x + (area.w - U.w * k) / 2
  const ty = cut ? W - (U.y + U.h) * k : area.y + area.h - (U.y + U.h) * k
  return specs.map((s, i) => ({ k: k * boost[i], tx: ox + (dx[i] - U.x) * k, ty, flip: !!s.flip }))
}

function canvasBounds(shot: Shot, pl: Placement): Box {
  const b = shot.bounds
  const a = toCanvas(pl, [b.x, b.y])
  const c = toCanvas(pl, [b.x + b.w, b.y + b.h])
  return { x: Math.min(a[0], c[0]), y: Math.min(a[1], c[1]), w: Math.abs(c[0] - a[0]), h: Math.abs(c[1] - a[1]) }
}

const HANDS = new Set(['handR', 'handL', 'hands'])

function propAt(spec: PropSpec, shots: Shot[], pls: Placement[], seed: string, i: number): string {
  const a = Math.min(spec.actor ?? 0, shots.length - 1)
  const shot = shots[a]
  const pl = pls[a]
  const kind = shot.member.kind
  if (spec.kinds && !spec.kinds.includes(kind)) return ''
  const hp = headSize(shot) * pl.k
  let at = spec.at
  let dx = spec.dx ?? 0
  let dy = spec.dy ?? 0
  let size = spec.size
  let canvasUnits = Array.isArray(at)
  if (kind === 'creature' && typeof at === 'string' && HANDS.has(at)) {
    // Creatures have no hands: the prop goes where the template says, or in front of the chest.
    if (spec.creatureAt) {
      at = spec.creatureAt
      canvasUnits = Array.isArray(at)
      if (canvasUnits) {
        dx = 0
        dy = 0
        size = spec.size * Math.min(110, hp * 1.1)
      }
    } else {
      at = 'face'
      dx = 0
      dy = 0.75
      size = spec.size * 0.75
    }
  }
  let x: number
  let y: number
  let px: number
  let rot = spec.rot ?? 0
  if (Array.isArray(at)) {
    x = at[0] + dx
    y = at[1] + dy
    px = size
  } else {
    let w: [number, number] | null
    if (at === 'hands') {
      const l = anchorOf(shot, 'handL')
      const r = anchorOf(shot, 'handR')
      w = l && r ? [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2] : (l ?? r)
    } else w = anchorOf(shot, at)
    w ??= anchorOf(shot, 'chest') ?? [shot.bounds.x + shot.bounds.w / 2, shot.bounds.y + shot.bounds.h / 2]
    const c = toCanvas(pl, w)
    x = c[0] + dx * hp
    y = c[1] + dy * hp
    px = size * hp
    if (spec.follow) rot += boneAngle(shot, 'head') * (pl.flip ? -1 : 1)
  }
  return drawProp(spec.id, { x, y, s: px, rot, flip: spec.flip }, { color: spec.color, color2: spec.color2, seed: `${seed}${i}` })
}

function caption(c: CaptionSpec, seed: string, shots: Shot[], pls: Placement[], area: Box): string {
  const ink = { outline: INK }
  const band = c.at === 'bottom' ? CAPTION_BOTTOM : CAPTION_TOP
  switch (c.style) {
    case 'plain': {
      const l = fitLettering(c.text, band, { maxSize: 66, minSize: 24, maxLines: 2, bounce: 4, seed, weight: 0.21 })
      return inkLettering(l, { ...ink, fill: c.color, outlineWidth: l.stroke * 0.55, drop: l.size * 0.09, shine: '#ffffff' })
    }
    case 'shout': {
      const l = fitLettering(c.text, { x: 70, y: band.y + 8, w: 372, h: 92 }, { maxSize: 64, minSize: 24, maxLines: 2, bounce: 7, seed, weight: 0.22 })
      return drawBurst(256, l.y + l.h / 2, l.w / 2 + 64, l.h / 2 + 40, c.color, hash32(seed), 3.6) + inkLettering(l, { ...ink, fill: PAL.red, outlineWidth: l.stroke * 0.5, drop: l.size * 0.08 })
    }
    case 'banner':
    case 'pill': {
      const l = fitLettering(c.text, { x: 70, y: band.y + 10, w: 372, h: 78 }, { maxSize: 46, minSize: 20, maxLines: 2, weight: 0.2 })
      const box = { x: l.x - 26, y: l.y - 16, w: l.w + 52, h: l.h + 32 }
      const shape = c.style === 'banner' ? drawBanner(box, c.color) : drawPill({ ...box, x: box.x - 10, w: box.w + 20 }, c.color)
      return shape + inkLettering(l, { fill: c.ink ?? '#ffffff', outline: INK, outlineWidth: l.stroke * 0.45 })
    }
    case 'arc': {
      const r = 236
      const cy = area.y + r - 22
      const l = arcLettering(c.text, W / 2, cy, r, { size: 62, weight: 0.21, maxAngle: 100 })
      return inkLettering(l, { ...ink, fill: c.color, outlineWidth: l.stroke * 0.55, drop: l.size * 0.08, shine: '#ffffff' })
    }
    case 'bubble':
    case 'thought': {
      const l = fitLettering(c.text, { x: 250, y: 30, w: 230, h: 86 }, { maxSize: 44, minSize: 20, maxLines: 3, weight: 0.19 })
      const box = { x: l.x - 22, y: l.y - 18, w: l.w + 44, h: l.h + 36 }
      if (box.x + box.w > W - 10) box.x = W - 10 - box.w
      const mouth = toCanvas(pls[0], mouthOf(shots[0]))
      return drawBubble({ kind: c.style === 'thought' ? 'thought' : 'speech', box, tail: mouth, lw: 3.4, fill: c.color }, l)
    }
  }
  return ''
}

const DIE_CUT = (id: string) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="-12" y="-12" width="${W + 24}" height="${W + 24}" color-interpolation-filters="sRGB">` +
  '<feGaussianBlur in="SourceAlpha" stdDeviation="4.2" result="b"/>' +
  '<feColorMatrix in="b" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 10 -0.5" result="w"/>' +
  '<feGaussianBlur in="w" stdDeviation="3" result="s"/>' +
  '<feOffset in="s" dx="0" dy="3" result="so"/>' +
  '<feColorMatrix in="so" type="matrix" values="0 0 0 0 0.1 0 0 0 0 0.08 0 0 0 0 0.16 0 0 0 0.32 0" result="sh"/>' +
  '<feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>' +
  '</filter>'

/**
 * Renders a sticker template for one or two avatars (the second defaults to a friendly
 * "buddy" for friendmoji). Throws for an unknown template id.
 */
export function renderSticker(templateId: string, cast: (AvatarDNA | unknown)[], o: StickerOptions = {}): string {
  const t = stickerTemplate(templateId)
  if (!t) throw new Error(`Unknown sticker template "${templateId}"`)
  const prefix = o.idPrefix ?? `k${hash32('sticker', t.id).toString(36)}`
  const size = Math.max(16, Math.round(o.size ?? W))
  const motion = o.motion !== false
  const stage = { prefix, quality: o.quality ?? 'high', detail: o.detail, motion, assetUrl: o.assetUrl } as const
  const members = t.actors.map((_, i) => new CastMember(cast[i] ?? (i === 0 ? defaultDNA() : buddyDNA(t.id)), stage, `a${i}`))
  const shots = t.actors.map((spec, i) => shoot(members[i], actorPose(spec, members[i].kind)))
  const area = stageArea(t)
  const framing = framingOf(t, shots)
  const pls = placeActors(shots, t.actors, area, framing)
  const canvas: Box = { x: 0, y: 0, w: W, h: W }
  const outScale = size / W

  // Effect: the template's, or the caller's choice.
  const fxId = o.effect === 'none' ? null : (o.effect ?? t.effect ?? null)
  let fx = { back: '', front: '', defs: '' }
  if (fxId && isEffect(fxId)) {
    const eyes = anchorOf(shots[0], 'eyes') ?? anchorOf(shots[0], 'face')
    const hc = eyes ? toCanvas(pls[0], eyes) : [W / 2, W * 0.4]
    const figs = shots.map((s, i) => canvasBounds(s, pls[i]))
    const fx0 = Math.min(...figs.map((b) => b.x))
    const fy0 = Math.min(...figs.map((b) => b.y))
    const figure = { x: fx0, y: fy0, w: Math.max(...figs.map((b) => b.x + b.w)) - fx0, h: Math.max(...figs.map((b) => b.y + b.h)) - fy0 }
    const fxBox = !t.caption || t.caption.style === 'bubble' || t.caption.style === 'thought' ? canvas : t.caption.at === 'bottom' ? { x: 0, y: 0, w: W, h: 392 } : { x: 0, y: 112, w: W, h: W - 112 }
    fx = effectLayers(fxId, fxBox, { seed: t.id, motion, prefix: `${prefix}x`, subject: { x: hc[0], y: hc[1], r: headSize(shots[0]) * pls[0].k * 0.62 }, figure })
  }

  const areaCx = area.x + area.w / 2
  const areaCy = area.y + area.h / 2
  let body = ''
  if (t.backdrop && t.backdrop.kind !== 'none') body += drawBackdrop(t.backdrop, areaCx, areaCy, Math.min(area.w, area.h) * 0.49, hash32(t.id))
  const props = t.props ?? []
  props.forEach((p, i) => {
    if (p.back) body += propAt(p, shots, pls, t.id, i)
  })
  shots.forEach((s, i) => (body += drawShot(s, pls[i], canvas, { outScale })))
  props.forEach((p, i) => {
    if (!p.back) body += propAt(p, shots, pls, t.id, i)
  })
  if (t.caption) body += caption(t.caption, t.id, shots, pls, area)

  const outline = o.outline !== false
  const dcId = `${prefix}-dc`
  const defs = (outline ? DIE_CUT(dcId) : '') + members.map((m) => m.defs()).join('') + fx.defs
  const title = o.title === false ? '' : `<title>${escapeXml(o.title ?? t.label)}</title>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${size}" height="${size}" role="img">` +
    title +
    (defs ? `<defs>${defs}</defs>` : '') +
    fx.back +
    (outline ? `<g filter="url(#${dcId})">${body}</g>` : body) +
    fx.front +
    '</svg>'
  )
}

/** Every template as catalogue entries, in display order. */
export function stickerCatalogue(): { categories: { id: StickerCategory; label: string }[]; templates: StickerInfo[] } {
  return { categories: STICKER_CATEGORIES.map((c) => ({ ...c })), templates: STICKER_TEMPLATES.map(stickerInfo) }
}

/** Seasonal templates in season on `date` (YYYY-MM-DD). */
export function inSeason(t: Pick<StickerTemplate, 'season'>, date: string): boolean {
  if (!t.season) return false
  const md = date.slice(5, 10)
  const { from, until } = t.season
  return from <= until ? md >= from && md <= until : md >= from || md <= until
}

