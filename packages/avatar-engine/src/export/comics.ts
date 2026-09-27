/* Comics: multi-panel strips starring the player (and a friend), the way Bitmoji's comics
 * put your avatar into a story every day.
 *
 * A script (`comics/scripts.ts`) is 3–4 panels. Each panel has a scene preset (the
 * engine's own scenery), a shot (wide, medium, close), actors with poses and faces, speech
 * and thought bubbles whose tails point at the speaker, narration captions, props and an
 * optional effect. Layouts: `landscape` (one row), `square` (a grid) and `vertical` (a
 * stack, for phones). Deterministic and resvg-safe like every engine render: every actor
 * is the engine's own document placed by a transform, each cast member is built once and
 * reused across panels, and defs are written once. */

import type { Box } from '../core/math.ts'
import { hash32 } from '../core/rng.ts'
import { escapeXml } from '../core/svg.ts'
import { defaultDNA } from '../dna/defaults.ts'
import type { AvatarDNA } from '../dna/types.ts'
import { fitLettering, inkLettering, letterLines, normalizeText } from '../comics/font.ts'
import { INK, n1, PAL } from '../comics/pen.ts'
import { drawProp } from '../comics/props.ts'
import { COMIC_CATEGORIES, COMIC_SCRIPTS, comicScript, type ComicActor, type ComicCategory, type ComicPanel, type ComicScript } from '../comics/scripts.ts'
import { drawBubble, drawBurst, roundRectD, type BubbleKind } from '../comics/shapes.ts'
import { anchorOf, CastMember, creatureVariant, drawShot, headSize, headTopOf, mouthOf, Scenery, shoot, toCanvas, type ActorPose, type Placement, type Shot } from '../comics/stage.ts'
import { effectLayers, isEffect } from './effects.ts'
import { buddyDNA } from './stickers.ts'

export { COMIC_CATEGORIES, COMIC_SCRIPTS, comicScript, type ComicCategory, type ComicScript }

export type ComicLayout = 'landscape' | 'square' | 'vertical'
export const COMIC_LAYOUTS: ComicLayout[] = ['landscape', 'square', 'vertical']

export interface ComicOptions {
  layout?: ComicLayout
  /** Output width in px (default: the layout's natural width). */
  width?: number
  /** CSS loops for scene particles, auras and effects (default true). */
  motion?: boolean
  idPrefix?: string
  /** Art detail of the characters (default 'medium': panels are small). */
  detail?: 'low' | 'medium' | 'high'
  quality?: 'standard' | 'high'
  assetUrl?: (id: string) => string | undefined
  /** A line under the title (the daily comic's date). */
  subtitle?: string
  title?: string | false
}

/** Catalogue entry of a script (no art). */
export interface ComicInfo {
  id: string
  title: string
  blurb: string
  category: ComicCategory
  cast: 1 | 2
  panels: number
  tags: string[]
  bcu: { story: string; ref: string } | null
  season: { from: string; until: string } | null
}

export const comicInfo = (s: ComicScript): ComicInfo => ({
  id: s.id,
  title: s.title,
  blurb: s.blurb,
  category: s.category,
  cast: s.cast,
  panels: s.panels.length,
  tags: [...s.tags],
  bcu: s.bcu ? { ...s.bcu } : null,
  season: s.season ? { ...s.season } : null,
})

export function comicCatalogue(): { categories: { id: ComicCategory; label: string }[]; scripts: ComicInfo[] } {
  return { categories: COMIC_CATEGORIES.map((c) => ({ ...c })), scripts: COMIC_SCRIPTS.map(comicInfo) }
}

/* ---- The daily comic -------------------------------------------------------------- */

const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Days since 1970-01-01 of a YYYY-MM-DD date (NaN if invalid). */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date)
  if (!m) return NaN
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const d = new Date(t)
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN
  return Math.round(t / DAY_MS)
}

const inSeason = (s: { season?: { from: string; until: string } }, date: string): boolean => {
  if (!s.season) return false
  const md = date.slice(5, 10)
  const { from, until } = s.season
  return from <= until ? md >= from && md <= until : md >= from || md <= until
}

/** A deterministic permutation of `n` items for a seed. */
function permutation(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = hash32(seed, i) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * The script of the daily comic for a date (YYYY-MM-DD) and a seed (a player id, so friends
 * see different strips): evergreen scripts in a shuffled cycle without repeats, and on
 * every third day in a season (Christmas, Easter…) a seasonal one.
 */
export function dailyComic(date: string, seed: string | number = ''): ComicScript {
  const day = dayNumber(date)
  if (!Number.isFinite(day)) throw new Error(`Invalid date "${date}" (YYYY-MM-DD)`)
  const seasonal = COMIC_SCRIPTS.filter((s) => inSeason(s, date))
  if (seasonal.length && day % 3 === 0) return seasonal[hash32('seasonal', seed, day) % seasonal.length]
  const pool = COMIC_SCRIPTS.filter((s) => !s.season)
  const n = pool.length
  const cycle = Math.floor(day / n)
  const order = permutation(n, hash32('daily', seed, cycle))
  return pool[order[((day % n) + n) % n]]
}

/* ---- Layout ------------------------------------------------------------------------ */

interface Page {
  w: number
  h: number
  panels: Box[]
}

const M = 16
const G = 14
const TITLE_H = 60

function pageLayout(layout: ComicLayout, n: number): Page {
  if (layout === 'square') {
    const pw = 468
    const ph = 420
    const w = M * 2 + pw * 2 + G
    if (n === 3) {
      const top: Box = { x: M, y: TITLE_H, w: pw * 2 + G, h: ph }
      return { w, h: TITLE_H + ph * 2 + G + M, panels: [top, { x: M, y: TITLE_H + ph + G, w: pw, h: ph }, { x: M + pw + G, y: TITLE_H + ph + G, w: pw, h: ph }] }
    }
    const rows = Math.ceil(n / 2)
    const panels = Array.from({ length: n }, (_, i) => ({ x: M + (i % 2) * (pw + G), y: TITLE_H + Math.floor(i / 2) * (ph + G), w: pw, h: ph }))
    return { w, h: TITLE_H + rows * ph + (rows - 1) * G + M, panels }
  }
  if (layout === 'vertical') {
    const pw = 600
    const ph = 420
    const panels = Array.from({ length: n }, (_, i) => ({ x: M, y: TITLE_H + i * (ph + G), w: pw, h: ph }))
    return { w: pw + M * 2, h: TITLE_H + n * ph + (n - 1) * G + M, panels }
  }
  const pw = 372
  const ph = 420
  const panels = Array.from({ length: n }, (_, i) => ({ x: M + i * (pw + G), y: TITLE_H, w: pw, h: ph }))
  return { w: M * 2 + n * pw + (n - 1) * G, h: TITLE_H + ph + M, panels }
}

/* ---- Panels -------------------------------------------------------------------------- */

/** Where the tallest head top sits (fraction of the panel height) and the ground line. */
const SHOTS = {
  wide: { head: 0.44, ground: 0.91 },
  medium: { head: 0.4, ground: 1.28 },
  close: { head: 0.36, ground: 1.95 },
} as const

function actorPose(a: ComicActor, kind: AvatarDNA['kind']): ActorPose {
  if (kind === 'creature') return creatureVariant(a)
  return { pose: a.pose, clip: a.clip, t: a.t, expression: a.expression, intensity: a.intensity, look: a.look, tilt: a.tilt, view: a.view }
}

/** Pushes neighbours apart where their figures overlap too much (a long creature's head
 *  hidden behind a friend), keeping the group inside the panel when it fits. */
function separate(shots: Shot[], pls: Placement[], rect: Box): void {
  if (shots.length < 2) return
  const span = (i: number): [number, number] => {
    const b = shots[i].bounds
    const pl = pls[i]
    const a = pl.tx + (pl.flip ? -1 : 1) * b.x * pl.k
    const c = pl.tx + (pl.flip ? -1 : 1) * (b.x + b.w) * pl.k
    return [Math.min(a, c), Math.max(a, c)]
  }
  const order = shots.map((_, i) => i).sort((a, b) => span(a)[0] + span(a)[1] - (span(b)[0] + span(b)[1]))
  for (let j = 0; j + 1 < order.length; j++) {
    const L = span(order[j])
    const R = span(order[j + 1])
    const creature = shots[order[j]].member.kind === 'creature' || shots[order[j + 1]].member.kind === 'creature'
    const allow = Math.min(L[1] - L[0], R[1] - R[0]) * (creature ? 0.08 : 0.3)
    const over = L[1] - R[0] - allow
    if (over > 0) {
      pls[order[j]].tx -= over / 2
      pls[order[j + 1]].tx += over / 2
    }
  }
  const first = span(order[0])[0]
  const last = span(order[order.length - 1])[1]
  if (last - first <= rect.w - 12) {
    const shift = first < rect.x + 6 ? rect.x + 6 - first : last > rect.x + rect.w - 6 ? rect.x + rect.w - 6 - last : 0
    for (const pl of pls) pl.tx += shift
  }
}

interface PanelCtx {
  rect: Box
  members: CastMember[]
  scenery: Scenery
  script: ComicScript
  index: number
  motion: boolean
  outScale: number
  prefix: string
  effects: string[]
}

function drawPanel(p: ComicPanel, c: PanelCtx): { inside: string; over: string } {
  const { rect } = c
  const shotKind = SHOTS[p.shot ?? 'wide']
  const shots: Shot[] = p.actors.map((a) => {
    const m = c.members[Math.min(a.who, c.members.length - 1)]
    return shoot(m, actorPose(a, m.kind))
  })
  // Framing. Creatures next to a humanoid are scaled up to ~3/4 of its height (boost).
  // Wide shots: the tallest head top at `head`, the ground at `ground`, and everyone fits
  // across. Medium and close shots: scaled by head size, each face at its slot.
  const human = Math.max(0, ...shots.filter((s) => s.member.kind === 'humanoid').map((s) => s.bounds.h))
  const boost = shots.map((s) => (s.member.kind === 'creature' && human > 0 ? Math.max(1, Math.min(2.4, (human * 0.72) / Math.max(1, s.bounds.h))) : 1))
  const wide = (p.shot ?? 'wide') === 'wide'
  const slot = (a: ComicActor) => rect.x + rect.w / 2 + (a.x ?? 0) * rect.w * 0.32
  let k: number
  let groundY: number
  const pls: Placement[] = []
  if (!shots.length) {
    k = (rect.h * (shotKind.ground - shotKind.head)) / 1000
    groundY = rect.y + rect.h * shotKind.ground
  } else if (wide) {
    const top = Math.min(-300, ...shots.map((s, i) => headTopOf(s)[1] * boost[i]))
    const across = shots.reduce((sum, s, i) => sum + s.bounds.w * boost[i], 0) * (shots.length > 1 ? 0.85 : 1)
    k = Math.min((rect.h * (shotKind.ground - shotKind.head)) / -top, (rect.w * 0.9) / Math.max(1, across))
    groundY = rect.y + rect.h * shotKind.ground
    shots.forEach((s, i) => {
      const a = p.actors[i]
      const ki = k * boost[i]
      // Humanoids stand on their slot (an outstretched arm doesn't move them); creatures centre their body.
      const cx = s.member.kind === 'humanoid' ? 0 : (s.bounds.x + s.bounds.w / 2) * (a.flip ? -1 : 1)
      pls.push({ k: ki, tx: slot(a) - cx * ki, ty: groundY, flip: !!a.flip })
    })
    separate(shots, pls, rect)
  } else {
    const close = p.shot === 'close'
    const hs = Math.max(...shots.map((s, i) => headSize(s) * boost[i]))
    k = (rect.h * (close ? 0.34 : 0.21)) / hs
    const faceY = rect.y + rect.h * (close ? 0.64 : 0.57)
    shots.forEach((s, i) => {
      const a = p.actors[i]
      const ki = k * boost[i]
      const eyes = anchorOf(s, 'eyes') ?? mouthOf(s)
      const ex = eyes[0] * (a.flip ? -1 : 1)
      pls.push({ k: ki, tx: slot(a) - ex * ki, ty: faceY - eyes[1] * ki, flip: !!a.flip })
    })
    groundY = pls[0].ty
  }
  const worldW = rect.w / k
  const y0 = (rect.y - groundY) / k
  const box: Box = { x: -worldW / 2, y: y0, w: worldW, h: rect.h / k }

  let inside = ''
  // Scenery fills the panel.
  const scene = p.scene ?? c.script.scene
  const bg = c.scenery.draw(scene, box)
  if (bg) inside += `<g transform="matrix(${+k.toFixed(5)} 0 0 ${+k.toFixed(5)} ${n1(rect.x + rect.w / 2)} ${n1(groundY)})">${bg}</g>`

  // Effect layers, props behind, actors, held props, props in front, effect front.
  let fx = { back: '', front: '', defs: '' }
  if (p.effect && isEffect(p.effect) && shots.length) {
    const eyes = anchorOf(shots[0], 'eyes') ?? mouthOf(shots[0])
    const e = toCanvas(pls[0], eyes)
    fx = effectLayers(p.effect, rect, { seed: `${c.script.id}${c.index}`, motion: c.motion, prefix: `${c.prefix}f${c.index}`, subject: { x: e[0], y: e[1], r: headSize(shots[0]) * k * 0.62 } })
    c.effects.push(fx.defs)
  }
  inside += fx.back
  const prop = (pr: NonNullable<ComicPanel['props']>[number], i: number) =>
    drawProp(pr.id, { x: rect.x + pr.u * rect.w, y: rect.y + pr.v * rect.h, s: pr.size * rect.h, rot: pr.rot, flip: pr.flip }, { color: pr.color, color2: pr.color2, seed: `${c.script.id}${c.index}${i}` })
  ;(p.props ?? []).forEach((pr, i) => {
    if (pr.back !== false) inside += prop(pr, i)
  })
  shots.forEach((s, i) => {
    inside += drawShot(s, pls[i], rect, { shadow: true, outScale: c.outScale })
    const hold = p.actors[i].hold
    if (hold) {
      const hp = headSize(s) * k
      let at: [number, number]
      if (s.member.kind === 'creature') {
        // Creatures hold things under the chin (no hands).
        const face = anchorOf(s, 'face') ?? mouthOf(s)
        const fc = toCanvas(pls[i], face)
        at = [fc[0], fc[1] + hp * 0.7]
      } else {
        const l = anchorOf(s, 'handL')
        const r = anchorOf(s, 'handR')
        const w = hold.hand === 'R' ? r : hold.hand === 'L' ? l : l && r ? ([(l[0] + r[0]) / 2, (l[1] + r[1]) / 2] as [number, number]) : (l ?? r)
        at = w ? toCanvas(pls[i], w) : [rect.x + rect.w / 2, rect.y + rect.h * 0.7]
      }
      const creature = s.member.kind === 'creature'
      inside += drawProp(hold.id, { x: at[0], y: at[1] + (creature ? 0 : (hold.dy ?? 0.1) * hp), s: (hold.size ?? 1) * hp * (creature ? 0.8 : 1), rot: hold.rot, flip: pls[i].flip }, { seed: `${c.script.id}${c.index}h${i}` })
    }
  })
  ;(p.props ?? []).forEach((pr, i) => {
    if (pr.back === false) inside += prop(pr, i)
  })
  inside += fx.front
  if (p.sfx) {
    const l = letterLines([normalizeText(p.sfx.text)], { size: rect.h * 0.075, x: 0, y: 0, bounce: 9, seed: p.sfx.text, weight: 0.22 })
    const x = rect.x + p.sfx.u * rect.w
    const y = rect.y + p.sfx.v * rect.h
    const body = (p.sfx.burst ? drawBurst(0, 0, l.w / 2 + 22, l.h / 2 + 18, '#fff5b8', hash32(p.sfx.text), 2.6) : '') + inkLettering(l, { fill: p.sfx.color ?? PAL.orange, outline: INK, outlineWidth: l.stroke * 0.5, drop: l.size * 0.08 })
    inside += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${p.sfx.rot ?? -8})">${body}</g>`
  }

  // Over the panel border: narration and speech bubbles (reading order: top to bottom).
  let over = ''
  let yTop = rect.y + 8
  if (p.caption) {
    const m = fitLettering(p.caption, { x: 0, y: 0, w: rect.w * 0.78, h: rect.h * 0.16 }, { maxSize: 15, minSize: 10, maxLines: 3, align: 'left', weight: 0.2 })
    const box = { x: rect.x + 4, y: rect.y + 4, w: m.w + 22, h: m.h + 16 }
    const l = letterLines(m.lines, { size: m.size, x: box.x + 11, y: box.y + box.h / 2, align: 'left', weight: 0.2, maxWidth: m.w + 1 })
    over += drawBubble({ kind: 'caption', box, lw: 2.2 }, l, { fill: INK })
    yTop = box.y + box.h + 8
  }
  const lines = p.lines ?? []
  const zoneBottom = rect.y + rect.h * Math.max(0.34, shotKind.head - 0.04)
  const perLine = Math.max(40, (zoneBottom - yTop) / Math.max(1, lines.length) - 6)
  lines.forEach((ln, i) => {
    const speaker = ln.who >= 0 ? p.actors.findIndex((a) => a.who === ln.who) : -1
    let target: [number, number] | undefined
    if (speaker >= 0) target = toCanvas(pls[speaker], mouthOf(shots[speaker]))
    else if (ln.from) target = [rect.x + ln.from[0] * rect.w, rect.y + ln.from[1] * rect.h]
    const maxW = rect.w * (lines.length > 1 ? 0.72 : 0.88)
    const m = fitLettering(ln.text, { x: 0, y: 0, w: maxW - 26, h: perLine - 20 }, { maxSize: 19, minSize: 11, maxLines: 4, weight: 0.19 })
    const bw = m.w + 30
    const bh = m.h + 22
    const cx = target ? target[0] : rect.x + rect.w / 2
    const bx = Math.max(rect.x + 8, Math.min(rect.x + rect.w - 8 - bw, cx - bw / 2 + (i % 2 ? 14 : -14)))
    const by = yTop
    const l = letterLines(m.lines, { size: m.size, x: bx + bw / 2, y: by + bh / 2, weight: 0.19, maxWidth: m.w + 1 })
    const kind: BubbleKind = ln.kind ?? 'speech'
    over += drawBubble({ kind, box: { x: bx, y: by, w: bw, h: bh }, tail: target, lw: 2.4 }, l, { outline: '' })
    yTop = by + bh + 8
  })
  return { inside, over }
}

/* ---- The page -------------------------------------------------------------------------- */

/**
 * Renders a comic script starring `cast` (index 0 is the star; a missing friend is a
 * friendly buddy). Throws for an unknown script id.
 */
export function renderComic(scriptId: string, cast: (AvatarDNA | unknown)[], o: ComicOptions = {}): string {
  const script = comicScript(scriptId)
  if (!script) throw new Error(`Unknown comic script "${scriptId}"`)
  const layout = o.layout ?? 'landscape'
  const page = pageLayout(layout, script.panels.length)
  const width = Math.max(160, Math.round(o.width ?? page.w))
  const outScale = width / page.w
  const height = Math.round(page.h * outScale)
  const prefix = o.idPrefix ?? `m${hash32('comic', script.id).toString(36)}`
  const motion = o.motion !== false
  const stage = { prefix, quality: o.quality ?? 'high', detail: o.detail ?? 'medium', motion, assetUrl: o.assetUrl } as const
  const members = [0, 1].slice(0, script.cast).map((i) => new CastMember(cast[i] ?? (i === 0 ? defaultDNA() : buddyDNA(script.id)), stage, `c${i}`))
  const scenery = new Scenery(stage, members[0].dna)
  const effects: string[] = []

  let body = `<rect width="${page.w}" height="${page.h}" fill="#fffdf6"/>`
  // Title band.
  const title = fitLettering(script.title, { x: M, y: 10, w: page.w * 0.66 - M, h: 34 }, { maxSize: 26, minSize: 14, maxLines: 1, align: 'left', weight: 0.2 })
  body += inkLettering(title, { fill: PAL.navy, outline: '', drop: 0 })
  const tagText = script.bcu ? `Bible Comic Universe - ${script.bcu.ref}` : 'ArkPlay comics'
  const tag = fitLettering(tagText, { x: page.w * 0.6, y: 12, w: page.w * 0.4 - M, h: 18 }, { maxSize: 12, minSize: 8, maxLines: 1, align: 'right', weight: 0.2 })
  body += inkLettering(tag, { fill: script.bcu ? '#8c2f39' : PAL.purple, outline: '' })
  if (o.subtitle) {
    const sub = fitLettering(o.subtitle, { x: page.w * 0.6, y: 32, w: page.w * 0.4 - M, h: 16 }, { maxSize: 11, minSize: 8, maxLines: 1, align: 'right', weight: 0.2 })
    body += inkLettering(sub, { fill: '#6b6478', outline: '' })
  }

  const clipDefs: string[] = []
  script.panels.forEach((p, i) => {
    const rect = page.panels[i]
    const { inside, over } = drawPanel(p, { rect, members, scenery, script, index: i, motion, outScale, prefix, effects })
    const clipId = `${prefix}-p${i}`
    clipDefs.push(`<clipPath id="${clipId}"><path d="${roundRectD(rect.x, rect.y, rect.w, rect.h, 8)}"/></clipPath>`)
    body += `<g clip-path="url(#${clipId})">${inside}</g>`
    body += `<path d="${roundRectD(rect.x, rect.y, rect.w, rect.h, 8)}" fill="none" stroke="${INK}" stroke-width="4"/>`
    body += over
  })

  const defs = clipDefs.join('') + scenery.defs() + members.map((m) => m.defs()).join('') + effects.join('')
  const t = o.title === false ? '' : `<title>${escapeXml(o.title ?? script.title)}</title>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.w} ${page.h}" width="${width}" height="${height}" role="img">` +
    t +
    `<defs>${defs}</defs>` +
    body +
    '</svg>'
  )
}
