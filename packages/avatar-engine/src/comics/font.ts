/* Comic lettering for stickers, speech bubbles and comics.
 *
 * Text is stroked paths, never <text>: stickers and comics must look the same in every
 * browser and in the service's rasterizer, which loads no fonts. The letterforms are the
 * engine's single-stroke print font (`text/strokeFont.ts`, read through `strokeText`), plus
 * the punctuation captions need, laid out proportionally (each glyph as wide as it draws)
 * and all caps, like hand lettering. Every glyph is an affine-transformed polyline, so a
 * caption can bounce (small deterministic tilts), follow an arc, or be squeezed to fit.
 *
 * Units: glyphs live on a 4 × 6 grid (cap height 6). `size` is the cap height in output px. */

import { f } from '../core/path.ts'
import { hash32 } from '../core/rng.ts'
import { strokeText } from '../text/strokeFont.ts'

type Cmd = { c: 'M' | 'L' | 'Q' | 'Z'; p: number[] }

interface Glyph {
  cmds: Cmd[]
  /** Horizontal extent on the glyph grid. */
  x0: number
  x1: number
}

/** Glyphs the print font lacks, in the same mini path format (absolute M L H V Q Z). */
const EXTRA: Record<string, string> = {
  "'": 'M2.1 0L1.8 1.7',
  ',': 'M2.1 5.5L1.6 7',
  ':': 'M2 1.7V2M2 5.7V6',
  ';': 'M2 1.7V2M2.1 5.5L1.6 7',
  '(': 'M2.9 -0.2Q1 1.4 1 3Q1 4.6 2.9 6.2',
  ')': 'M1.1 -0.2Q3 1.4 3 3Q3 4.6 1.1 6.2',
  '/': 'M3.4 -0.2L0.6 6.2',
  '"': 'M1.3 0V1.7M2.8 0V1.7',
  '*': 'M2 1.1V4.3M0.6 1.9L3.4 3.5M3.4 1.9L0.6 3.5',
  '=': 'M0.7 2.2H3.3M0.7 3.8H3.3',
  '~': 'M0.2 3.4Q1.1 2.2 2 3Q2.9 3.8 3.8 2.6',
  '<': 'M3.3 1L0.7 3L3.3 5',
  '>': 'M0.7 1L3.3 3L0.7 5',
  '@': 'M2.9 3.9Q2.9 2.1 2 2.1Q1 2.1 1 3.3Q1 4.3 1.9 4.3Q2.9 4.3 2.9 3.2V3.9Q2.9 4.6 3.5 4.3Q4 3.9 4 3Q4 0.3 2 0.3Q0 0.3 0 3.1Q0 5.9 2.2 5.9Q3 5.9 3.6 5.5',
  '%': 'M3.6 0.3L0.4 5.7M0.9 0.3Q0.2 0.3 0.2 1.1Q0.2 1.9 0.9 1.9Q1.6 1.9 1.6 1.1Q1.6 0.3 0.9 0.3ZM3.1 4.1Q2.4 4.1 2.4 4.9Q2.4 5.7 3.1 5.7Q3.8 5.7 3.8 4.9Q3.8 4.1 3.1 4.1Z',
  $: 'M3.6 1Q3.1 0.4 2 0.4Q0.4 0.4 0.4 1.7Q0.4 2.8 2 3Q3.6 3.2 3.6 4.4Q3.6 5.6 2 5.6Q0.8 5.6 0.2 4.9M2 -0.4V6.4',
  // A small heart, drawn as a closed stroke.
  '♥': 'M2 5.6L0.5 3.6Q-0.3 2.3 0.5 1.3Q1.4 0.4 2 1.6Q2.6 0.4 3.5 1.3Q4.3 2.3 3.5 3.6Z',
}

/** Characters mapped onto supported ones before layout. */
const SUBSTITUTE: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  '❤': '♥',
}

function parseMini(d: string): Cmd[] {
  const out: Cmd[] = []
  const re = /([MLHVQZ])([^MLHVQZ]*)/g
  let cx = 0
  let cy = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const c = m[1]
    const n = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (c === 'Z') out.push({ c: 'Z', p: [] })
    else if (c === 'H') {
      cx = n[0]
      out.push({ c: 'L', p: [cx, cy] })
    } else if (c === 'V') {
      cy = n[0]
      out.push({ c: 'L', p: [cx, cy] })
    } else if (c === 'Q') {
      for (let i = 0; i + 3 < n.length; i += 4) {
        out.push({ c: 'Q', p: n.slice(i, i + 4) })
        cx = n[i + 2]
        cy = n[i + 3]
      }
    } else {
      for (let i = 0; i + 1 < n.length; i += 2) {
        out.push({ c: i === 0 ? (c as 'M' | 'L') : 'L', p: [n[i], n[i + 1]] })
        cx = n[i]
        cy = n[i + 1]
      }
    }
  }
  return out
}

const cache = new Map<string, Glyph | null>()

function glyph(ch: string): Glyph | null {
  const hit = cache.get(ch)
  if (hit !== undefined) return hit
  let d = EXTRA[ch]
  if (d === undefined && ch !== ' ') d = strokeText(ch, 0, 0, 6).d
  let g: Glyph | null = null
  if (d) {
    const cmds = parseMini(d)
    let x0 = Infinity
    let x1 = -Infinity
    for (const k of cmds) for (let i = 0; i < k.p.length; i += 2) {
      x0 = Math.min(x0, k.p[i])
      x1 = Math.max(x1, k.p[i])
    }
    if (cmds.length && Number.isFinite(x0)) g = { cmds, x0, x1 }
  }
  cache.set(ch, g)
  return g
}

/** Upper-cases, folds accents and fancy punctuation, and drops what the font cannot draw. */
export function normalizeText(text: string): string {
  let s = ''
  for (const ch of text.normalize('NFD').replace(/[̀-ͯ]/g, '')) s += SUBSTITUTE[ch] ?? ch
  s = s.toUpperCase()
  let out = ''
  for (const ch of s) {
    if (ch === ' ' || ch === '\n' || glyph(ch)) out += ch
  }
  return out.replace(/[ \t]+/g, ' ').trim()
}

export interface LetterStyle {
  /** Cap height in px. */
  size: number
  /** Stroke width as a fraction of the cap height (default 0.19: bold lettering). */
  weight?: number
  /** Extra space between letters, as a fraction of the cap height. */
  tracking?: number
  /** Line height as a multiple of the cap height (default 1.42). */
  leading?: number
  /** Max tilt of each letter in degrees (bouncy captions); 0 = straight. */
  bounce?: number
  /** Seed for the bounce (the same text bounces the same way). */
  seed?: string | number
}

const SPACE = 2.3

/** Advance of one character on the glyph grid (letters: their drawn width plus a gap). */
function advance(ch: string, st: LetterStyle): number {
  const w = (st.weight ?? 0.19) * 6
  const gap = 0.55 + w + (st.tracking ?? 0) * 6
  if (ch === ' ') return SPACE + gap * 0.3
  const g = glyph(ch)
  if (!g) return 0
  return g.x1 - g.x0 + gap
}

/** Width in px of one line of normalized text. */
export function lineWidth(line: string, st: LetterStyle): number {
  let u = 0
  for (const ch of line) u += advance(ch, st)
  // The last glyph's trailing gap is not part of the ink.
  const last = line[line.length - 1]
  if (last && last !== ' ') u -= 0.55 + (st.tracking ?? 0) * 6
  return Math.max(0, u) * (st.size / 6)
}

/** Greedy word wrap of normalized text to `maxWidth` px (explicit \n breaks are kept). */
export function wrapText(text: string, maxWidth: number, st: LetterStyle): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ').filter(Boolean)
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (!cur || lineWidth(next, st) <= maxWidth) cur = next
      else {
        lines.push(cur)
        cur = w
      }
    }
    if (cur) lines.push(cur)
  }
  return lines.length ? lines : ['']
}

type M6 = [number, number, number, number, number, number]
const mulM = (a: M6, b: M6): M6 => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
const tr = (x: number, y: number): M6 => [1, 0, 0, 1, x, y]
const sc = (x: number, y = x): M6 => [x, 0, 0, y, 0, 0]
const rot = (deg: number): M6 => {
  const r = (deg * Math.PI) / 180
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
}

function emit(g: Glyph, m: M6): string {
  let d = ''
  for (const k of g.cmds) {
    if (k.c === 'Z') {
      d += 'Z'
      continue
    }
    d += k.c
    for (let i = 0; i < k.p.length; i += 2) {
      const x = m[0] * k.p[i] + m[2] * k.p[i + 1] + m[4]
      const y = m[1] * k.p[i] + m[3] * k.p[i + 1] + m[5]
      d += `${i ? ' ' : ''}${f(x)} ${f(y)}`
    }
  }
  return d
}

/** A laid-out block of lettering: path data (stroke it) and its box. */
export interface Lettering {
  d: string
  x: number
  y: number
  w: number
  h: number
  size: number
  /** Stroke width in px for the letters themselves. */
  stroke: number
  lines: string[]
}

export interface BlockOptions extends LetterStyle {
  /** Anchor point: the block's centre (align 'center'), left or right edge at `x`. */
  x: number
  /** Vertical centre of the block. */
  y: number
  align?: 'left' | 'center' | 'right'
  /** Lines wider than this are squeezed horizontally to fit. */
  maxWidth?: number
}

/** Lays out already-wrapped lines (normalized text) around (x, y). */
export function letterLines(lines: string[], o: BlockOptions): Lettering {
  const s = o.size / 6
  const lead = o.size * (o.leading ?? 1.42)
  const h = o.size + lead * (lines.length - 1)
  const top = o.y - h / 2
  const bounce = o.bounce ?? 0
  let d = ''
  let wMax = 0
  lines.forEach((line, li) => {
    const natural = lineWidth(line, o)
    const squeeze = o.maxWidth && natural > o.maxWidth ? o.maxWidth / natural : 1
    const w = natural * squeeze
    wMax = Math.max(wMax, w)
    const x0 = (o.align ?? 'center') === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x
    const y0 = top + li * lead
    let u = 0
    let i = 0
    for (const ch of line) {
      const g = glyph(ch)
      const adv = advance(ch, o)
      if (g && ch !== ' ') {
        const gw = g.x1 - g.x0
        const cx = x0 + (u + gw / 2) * s * squeeze
        let m: M6 = tr(cx, y0 + o.size / 2)
        if (bounce) {
          const hsh = hash32(String(o.seed ?? line), li, i)
          const a = ((hsh % 1000) / 1000 - 0.5) * 2 * bounce
          const dy = (((hsh >>> 10) % 1000) / 1000 - 0.5) * o.size * 0.12
          m = mulM(m, mulM(tr(0, dy), rot(a)))
        }
        m = mulM(m, mulM(sc(s * squeeze, s), tr(-(g.x0 + gw / 2), -3)))
        d += emit(g, m)
      }
      u += adv
      i++
    }
  })
  const w = wMax
  const xL = (o.align ?? 'center') === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x
  return { d, x: xL, y: top, w, h, size: o.size, stroke: o.size * (o.weight ?? 0.19), lines }
}

export interface FitOptions extends LetterStyle {
  /** Largest cap height to try (px); `size` is ignored. */
  maxSize: number
  minSize: number
  maxLines?: number
  align?: 'left' | 'center' | 'right'
}

/** The largest lettering (≤ maxSize) whose wrapped block fits the box; centred in it. */
export function fitLettering(text: string, box: { x: number; y: number; w: number; h: number }, o: Omit<FitOptions, 'size'>): Lettering {
  const t = normalizeText(text)
  let size = o.maxSize
  const pad = (sz: number) => sz * (o.weight ?? 0.19)
  for (let k = 0; k < 40; k++) {
    const st = { ...o, size }
    const lines = wrapText(t, box.w - pad(size) * 2, st)
    const lead = size * (o.leading ?? 1.42)
    const h = size + lead * (lines.length - 1) + pad(size) * 2
    const tooWide = lines.some((l) => lineWidth(l, st) > box.w - pad(size) * 2)
    const tooMany = o.maxLines !== undefined && lines.length > o.maxLines
    if ((h <= box.h && !tooWide && !tooMany) || size <= o.minSize) {
      const x = o.align === 'left' ? box.x + pad(size) : o.align === 'right' ? box.x + box.w - pad(size) : box.x + box.w / 2
      return letterLines(lines, { ...st, x, y: box.y + box.h / 2, align: o.align, maxWidth: box.w - pad(size) * 2 })
    }
    size = Math.max(o.minSize, size * 0.92)
  }
  return letterLines([t], { ...o, size: o.minSize, x: box.x + box.w / 2, y: box.y + box.h / 2, maxWidth: box.w })
}

/**
 * Text along a circular arc, centred on the top of the circle (cx, cy, r): the letters'
 * baselines sit on the circle, reading left to right (`sweep` 1) or on the bottom of the
 * circle reading left to right (`sweep` -1).
 */
export function arcLettering(text: string, cx: number, cy: number, r: number, o: LetterStyle & { maxAngle?: number }): Lettering {
  const t = normalizeText(text).replace(/\n/g, ' ')
  const s = o.size / 6
  let total = lineWidth(t, o)
  // Too long for the arc: shrink to fit the allowed angle.
  const maxA = ((o.maxAngle ?? 150) * Math.PI) / 180
  let size = o.size
  if (total / r > maxA) {
    size = (o.size * (maxA * r)) / total
    total = maxA * r
  }
  const k = size / o.size
  let u = -total / 2
  let d = ''
  const st = { ...o, size }
  for (const ch of t) {
    const g = glyph(ch)
    const adv = advance(ch, st) * (size / 6)
    if (g && ch !== ' ') {
      const gw = (g.x1 - g.x0) * s * k
      const a = (u + gw / 2) / r
      const m = mulM(mulM(tr(cx + Math.sin(a) * r, cy - Math.cos(a) * r), rot((a * 180) / Math.PI)), mulM(sc(s * k), tr(-(g.x0 + (g.x1 - g.x0) / 2), -6)))
      d += emit(g, m)
    }
    u += adv
  }
  return { d, x: cx - r, y: cy - r - size, w: r * 2, h: size, size, stroke: size * (o.weight ?? 0.19), lines: [t] }
}

export interface InkOptions {
  fill: string
  /** Outline colour (default dark ink); '' = none. */
  outline?: string
  /** Outline width on each side, in px (default: 45 % of the letter stroke). */
  outlineWidth?: number
  /** A drop "extrusion" under the letters: offset in px (0 = none) and colour. */
  drop?: number
  dropColor?: string
  /** A thin highlight stroke inside the letters (glossy lettering). */
  shine?: string
}

const INK = '#2b2233'

/** Stroked paths for a lettering block: extrusion, outline, fill, shine. */
export function inkLettering(l: Lettering, o: InkOptions): string {
  if (!l.d) return ''
  const w = l.stroke
  const ow = o.outlineWidth ?? w * 0.45
  const outline = o.outline ?? INK
  const base = `d="${l.d}" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  let out = ''
  if (o.drop) out += `<path ${base} stroke="${o.dropColor ?? outline ?? INK}" stroke-width="${f(w + ow * 2)}" transform="translate(${f(o.drop * 0.35)} ${f(o.drop)})"/>`
  if (outline) out += `<path ${base} stroke="${outline}" stroke-width="${f(w + ow * 2)}"/>`
  out += `<path ${base} stroke="${o.fill}" stroke-width="${f(w)}"/>`
  if (o.shine) out += `<path ${base} stroke="${o.shine}" stroke-opacity="0.55" stroke-width="${f(w * 0.28)}" transform="translate(${f(-w * 0.16)} ${f(-w * 0.18)})"/>`
  return out
}
