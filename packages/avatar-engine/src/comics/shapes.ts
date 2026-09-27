/* Sticker backdrops, speech bubbles, caption boxes and banners.
 *
 * All in canvas px (the sticker's 512 × 512 box, or a comic's page). Bubbles merge their
 * body and tail into one silhouette by stroking both outlines first and filling both on
 * top. Flat colours and fill-opacity only: resvg-safe. */

import { hash32 } from '../core/rng.ts'
import { inkLettering, type InkOptions, type Lettering } from './font.ts'
import { INK, n1, PAL } from './pen.ts'

export type BackdropKind = 'none' | 'circle' | 'burst' | 'rays' | 'cloud' | 'heart' | 'splat' | 'badge' | 'rounded' | 'halftone' | 'speed' | 'glory'

export const BACKDROP_KINDS: BackdropKind[] = ['none', 'circle', 'burst', 'rays', 'cloud', 'heart', 'splat', 'badge', 'rounded', 'halftone', 'speed', 'glory']

export interface BackdropSpec {
  kind: BackdropKind
  /** Main colour. */
  color: string
  /** Second colour (rays, halftone dots, inner burst). */
  color2?: string
}

const poly = (pts: [number, number][]): string => pts.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join('') + 'Z'
const circleD = (cx: number, cy: number, r: number): string => `M${n1(cx - r)} ${n1(cy)}A${n1(r)} ${n1(r)} 0 1 0 ${n1(cx + r)} ${n1(cy)}A${n1(r)} ${n1(r)} 0 1 0 ${n1(cx - r)} ${n1(cy)}Z`
const shape = (d: string, fill: string, lw: number, op = 1): string =>
  `<path d="${d}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}${lw ? ` stroke="${INK}" stroke-width="${n1(lw)}" stroke-linejoin="round"` : ''}/>`
const flat = (d: string, fill: string, op = 1): string => `<path d="${d}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`

function starPts(cx: number, cy: number, r1: number, r2: number, n: number, jitter = 0, seed = 0): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2
    const j = jitter ? 1 + (((hash32(seed, i) % 1000) / 1000) - 0.5) * jitter : 1
    const r = (i % 2 ? r2 : r1) * j
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function scallop(cx: number, cy: number, rx: number, ry: number, n: number, bulge: number): string {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    const nx = (q[1] - p[1]) / L
    const ny = -(q[0] - p[0]) / L
    const k = L * bulge
    d += `Q${n1((p[0] + q[0]) / 2 + nx * k)} ${n1((p[1] + q[1]) / 2 + ny * k)} ${n1(q[0])} ${n1(q[1])}`
  }
  return d + 'Z'
}

export function heartD(cx: number, cy: number, r: number): string {
  const s = r * 2
  const P = (u: number, v: number) => `${n1(cx + u * s)} ${n1(cy + v * s)}`
  return `M${P(0, 0.44)}C${P(-0.2, 0.3)} ${P(-0.52, 0.08)} ${P(-0.52, -0.15)}C${P(-0.52, -0.35)} ${P(-0.37, -0.46)} ${P(-0.23, -0.46)}C${P(-0.11, -0.46)} ${P(-0.03, -0.4)} ${P(0, -0.32)}C${P(0.03, -0.4)} ${P(0.11, -0.46)} ${P(0.23, -0.46)}C${P(0.37, -0.46)} ${P(0.52, -0.35)} ${P(0.52, -0.15)}C${P(0.52, 0.08)} ${P(0.2, 0.3)} ${P(0, 0.44)}Z`
}

export function roundRectD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  return `M${n1(x + rr)} ${n1(y)}H${n1(x + w - rr)}A${n1(rr)} ${n1(rr)} 0 0 1 ${n1(x + w)} ${n1(y + rr)}V${n1(y + h - rr)}A${n1(rr)} ${n1(rr)} 0 0 1 ${n1(x + w - rr)} ${n1(y + h)}H${n1(x + rr)}A${n1(rr)} ${n1(rr)} 0 0 1 ${n1(x)} ${n1(y + h - rr)}V${n1(y + rr)}A${n1(rr)} ${n1(rr)} 0 0 1 ${n1(x + rr)} ${n1(y)}Z`
}

/** A backdrop behind a sticker's character, centred at (cx, cy) with radius r. */
export function drawBackdrop(b: BackdropSpec, cx: number, cy: number, r: number, seed = 0): string {
  const lw = Math.max(3, r * 0.026)
  const c1 = b.color
  const c2 = b.color2 ?? '#ffffff'
  switch (b.kind) {
    case 'none':
      return ''
    case 'circle':
      return shape(circleD(cx, cy, r), c1, lw) + flat(circleD(cx, cy, r * 0.84), c2, 0.28)
    case 'burst':
      return shape(poly(starPts(cx, cy, r, r * 0.8, 14)), c1, lw) + flat(poly(starPts(cx, cy, r * 0.8, r * 0.64, 14)), c2, 0.45)
    case 'rays': {
      let d = ''
      const n = 12
      for (let i = 0; i < n; i += 1) {
        if (i % 2) continue
        const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2
        const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2
        d += `M${n1(cx)} ${n1(cy)}L${n1(cx + Math.cos(a0) * r)} ${n1(cy + Math.sin(a0) * r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(cx + Math.cos(a1) * r)} ${n1(cy + Math.sin(a1) * r)}Z`
      }
      return shape(circleD(cx, cy, r), c1, lw) + flat(d, c2, 0.5)
    }
    case 'glory': {
      // Soft golden light: rays from behind, a pale disc (faith stickers).
      let d = ''
      const n = 16
      for (let i = 0; i < n; i += 2) {
        const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2
        const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2
        d += `M${n1(cx)} ${n1(cy)}L${n1(cx + Math.cos(a0) * r)} ${n1(cy + Math.sin(a0) * r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(cx + Math.cos(a1) * r)} ${n1(cy + Math.sin(a1) * r)}Z`
      }
      return shape(circleD(cx, cy, r), c1, lw) + flat(d, c2, 0.55) + flat(circleD(cx, cy, r * 0.55), '#ffffff', 0.35)
    }
    case 'cloud':
      return shape(scallop(cx, cy, r * 0.9, r * 0.84, 11, 0.32), c1, lw) + flat(scallop(cx, cy, r * 0.66, r * 0.6, 9, 0.3), c2, 0.3)
    case 'heart':
      return shape(heartD(cx, cy + r * 0.08, r * 1.02), c1, lw) + flat(heartD(cx, cy + r * 0.04, r * 0.78), c2, 0.3)
    case 'splat': {
      const pts: [number, number][] = []
      const n = 22
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const k = 0.78 + ((hash32(seed, 'splat', i) % 1000) / 1000) * 0.26 + (i % 2 ? 0 : 0.06)
        pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k])
      }
      let d = ''
      for (let i = 0; i < n; i++) {
        const p = pts[i]
        const q = pts[(i + 1) % n]
        d += `${i ? '' : `M${n1((p[0] + q[0]) / 2)} ${n1((p[1] + q[1]) / 2)}`}Q${n1(q[0])} ${n1(q[1])} ${n1((q[0] + pts[(i + 2) % n][0]) / 2)} ${n1((q[1] + pts[(i + 2) % n][1]) / 2)}`
      }
      const drops = [0.3, 2.1, 4.4].map((a, i) => shape(circleD(cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02, r * (0.07 - i * 0.012)), c1, lw * 0.8)).join('')
      return shape(d + 'Z', c1, lw) + drops
    }
    case 'badge':
      return shape(scallop(cx, cy, r, r, 24, 0.22), c1, lw) + flat(circleD(cx, cy, r * 0.82), c2, 0.35)
    case 'rounded':
      return shape(roundRectD(cx - r * 0.92, cy - r * 0.92, r * 1.84, r * 1.84, r * 0.28), c1, lw) + flat(roundRectD(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56, r * 0.2), c2, 0.25)
    case 'halftone': {
      let dots = ''
      const step = r * 0.13
      for (let y = cy - r; y <= cy + r; y += step)
        for (let x = cx - r; x <= cx + r; x += step) {
          const d = Math.hypot(x - cx, y - cy) / r
          if (d > 0.9) continue
          const rr = step * 0.36 * Math.min(1, 0.25 + d)
          dots += circleD(x + ((Math.round((y - cy) / step) % 2) * step) / 2, y, rr)
        }
      return shape(circleD(cx, cy, r), c1, lw) + flat(dots, c2, 0.4)
    }
    case 'speed': {
      let d = ''
      const n = 28
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (((hash32(seed, 'sp', i) % 100) / 100) * 0.1)
        const w = 0.035
        const r0 = r * (0.55 + ((hash32(seed, 'sr', i) % 100) / 100) * 0.2)
        d += `M${n1(cx + Math.cos(a - w) * r)} ${n1(cy + Math.sin(a - w) * r)}L${n1(cx + Math.cos(a) * r0)} ${n1(cy + Math.sin(a) * r0)}L${n1(cx + Math.cos(a + w) * r)} ${n1(cy + Math.sin(a + w) * r)}Z`
      }
      return shape(circleD(cx, cy, r), c1, lw) + flat(d, c2, 0.55)
    }
  }
  return ''
}

/* ---- Speech bubbles ------------------------------------------------------ */

export type BubbleKind = 'speech' | 'thought' | 'shout' | 'whisper' | 'caption'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface BubbleOptions {
  kind: BubbleKind
  box: Box
  /** The point the tail aims at (the speaker's mouth); none = no tail. */
  tail?: [number, number]
  /** Outline width in px. */
  lw?: number
  fill?: string
}

/** The bubble's body (and tail) as separate paths, in canvas px. */
function bubbleParts(o: BubbleOptions): { body: string; tail: string } {
  const { x, y, w, h } = o.box
  const cx = x + w / 2
  const cy = y + h / 2
  let body = ''
  switch (o.kind) {
    case 'shout':
      body = poly(starPts(cx, cy, 1, 1, 16).map(([px, py], i) => {
        const a = Math.atan2(py - cy, px - cx)
        const k = i % 2 ? 1.0 : 1.18
        return [cx + Math.cos(a) * (w / 2) * k * 1.08, cy + Math.sin(a) * (h / 2) * k * 1.1] as [number, number]
      }))
      break
    case 'thought':
      body = scallop(cx, cy, w * 0.56, h * 0.6, Math.max(9, Math.round((w + h) / 38)), 0.34)
      break
    case 'caption':
      body = poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
      break
    default:
      body = roundRectD(x, y, w, h, Math.min(h / 2, 30))
  }
  let tail = ''
  if (o.tail && o.kind !== 'caption') {
    const [tx, ty] = o.tail
    if (o.kind === 'thought') {
      // Three shrinking puffs toward the thinker.
      const bx = cx + (tx - cx) * 0.2
      const by = y + h
      for (let i = 1; i <= 3; i++) {
        const t = i / 4
        const r = Math.max(3, Math.min(w, h) * (0.11 - i * 0.025))
        tail += circleD(bx + (tx - bx) * t, by + (ty - by) * t, r)
      }
    } else {
      // A curved wedge from the bubble's bottom edge toward the speaker.
      const below = ty > y + h
      const ex = Math.max(x + w * 0.2, Math.min(x + w * 0.8, tx))
      const ey = below ? y + h - 2 : ty < y ? y + 2 : cy
      const dx = tx - ex
      const dy = ty - ey
      const len = Math.hypot(dx, dy) || 1
      const reach = Math.min(len * 0.62, Math.max(26, h * 0.9))
      const tipX = ex + (dx / len) * reach
      const tipY = ey + (dy / len) * reach
      const half = Math.min(w * 0.12, 16)
      const nx = -dy / len
      const ny = dx / len
      const ax = ex - half
      const bx2 = ex + half
      const midX = (ex + tipX) / 2 + nx * reach * 0.12
      const midY = (ey + tipY) / 2 + ny * reach * 0.12
      tail = `M${n1(ax)} ${n1(ey)}Q${n1(midX - half * 0.3)} ${n1(midY)} ${n1(tipX)} ${n1(tipY)}Q${n1(midX + half * 0.3)} ${n1(midY)} ${n1(bx2)} ${n1(ey)}Z`
      if (!below && ty >= y) tail = ''
    }
  }
  return { body, tail }
}

/** A bubble with its text lettering inside. */
export function drawBubble(o: BubbleOptions, text: Lettering | null, ink: Partial<InkOptions> = {}): string {
  const lw = o.lw ?? 3.2
  const fill = o.fill ?? (o.kind === 'caption' ? '#ffe9a8' : o.kind === 'shout' ? '#fff5b8' : '#ffffff')
  const { body, tail } = bubbleParts(o)
  const dash = o.kind === 'whisper' ? ` stroke-dasharray="${n1(lw * 2.2)} ${n1(lw * 1.6)}"` : ''
  let out = ''
  out += `<path d="${body}${tail}" fill="none" stroke="${INK}" stroke-width="${n1(lw * 2)}" stroke-linejoin="round"${dash}/>`
  out += `<path d="${body}${tail}" fill="${fill}"/>`
  if (text) out += inkLettering(text, { fill: INK, outline: '', ...ink })
  return out
}

/* ---- Sticker caption styles ---------------------------------------------- */

/** A ribbon banner behind a caption: box = the text area. */
export function drawBanner(box: Box, color: string, lw = 3.4): string {
  const { x, y, w, h } = box
  const fold = h * 0.36
  const tailW = h * 0.62
  const back = (side: -1 | 1) => {
    const ex = side < 0 ? x : x + w
    const ox = ex + side * -fold * 0.2
    return poly([
      [ox, y + fold],
      [ox + side * tailW, y + fold],
      [ox + side * (tailW - h * 0.26), y + fold + h / 2],
      [ox + side * tailW, y + fold + h],
      [ox, y + fold + h],
    ])
  }
  let out = shape(back(-1), color, lw) + shape(back(1), color, lw)
  out += flat(back(-1), '#000000', 0.2) + flat(back(1), '#000000', 0.2)
  out += shape(poly([[x, y + h], [x + fold * 0.2, y + h + fold], [x + fold * 0.2, y + h]]), color, lw)
  out += shape(poly([[x + w, y + h], [x + w - fold * 0.2, y + h + fold], [x + w - fold * 0.2, y + h]]), color, lw)
  out += shape(roundRectD(x, y, w, h, h * 0.14), color, lw)
  out += flat(roundRectD(x + lw, y + lw, w - lw * 2, h * 0.3, h * 0.1), '#ffffff', 0.22)
  return out
}

/** A pill-shaped label behind a caption. */
export function drawPill(box: Box, color: string, lw = 3.4): string {
  return shape(roundRectD(box.x, box.y, box.w, box.h, box.h / 2), color, lw) + flat(roundRectD(box.x + box.h * 0.25, box.y + box.h * 0.12, box.w - box.h * 0.5, box.h * 0.28, box.h * 0.14), '#ffffff', 0.3)
}

/** A comic sound effect burst (POW!) behind lettering. */
export function drawBurst(cx: number, cy: number, rx: number, ry: number, color: string, seed = 0, lw = 3): string {
  const pts = starPts(0, 0, 1, 0.72, 11, 0.3, seed).map(([u, v]) => [cx + u * rx, cy + v * ry] as [number, number])
  return shape(poly(pts), color, lw)
}

export { PAL }
