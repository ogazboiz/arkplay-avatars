/* A tiny drawing kit for sticker and comic art (props, backdrops, bubbles).
 *
 * Shapes are written once in a unit box (about -0.5..0.5, y down) and placed with a
 * position, a size, a rotation and a mirror, so one prop definition serves any sticker.
 * Everything is flat vector art with a dark ink outline, like the stickers' die-cut
 * look; translucency is fill-/stroke-opacity only (never group opacity) and no filters,
 * so it is always resvg-safe. */

import { hash32 } from '../core/rng.ts'

/** Outline colour of sticker art. */
export const INK = '#2b2233'

/** Compact px numbers (0.1 px is plenty for stickers and comics). */
export const n1 = (v: number): string => {
  if (!Number.isFinite(v)) return '0'
  const r = Math.round(v * 10) / 10
  return r === 0 ? '0' : String(r)
}

const CMD = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

export interface Place {
  x: number
  y: number
  /** Size of the unit box in px. */
  s: number
  /** Degrees, clockwise. */
  rot?: number
  /** Mirror horizontally (before rotating). */
  flip?: boolean
  /** Horizontal / vertical stretch of the unit box. */
  sx?: number
  sy?: number
}

/** Maps an absolute unit-space path onto the canvas (H/V become L; arcs keep their shape). */
export function placePath(d: string, pl: Place): string {
  const r = ((pl.rot ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const fx = pl.flip ? -1 : 1
  const kx = pl.s * (pl.sx ?? 1)
  const ky = pl.s * (pl.sy ?? 1)
  const map = (u: number, v: number): string => {
    const a = u * fx * kx
    const b = v * ky
    return `${n1(pl.x + a * cos - b * sin)} ${n1(pl.y + a * sin + b * cos)}`
  }
  let out = ''
  let cmd = ''
  let args: number[] = []
  let cu = 0
  let cv = 0
  const flush = () => {
    if (!cmd) return
    const n = ARITY[cmd] ?? 0
    if (n === 0) {
      out += 'Z'
      return
    }
    while (args.length >= n) {
      const a = args.splice(0, n)
      switch (cmd) {
        case 'H':
          cu = a[0]
          out += `L${map(cu, cv)}`
          break
        case 'V':
          cv = a[0]
          out += `L${map(cu, cv)}`
          break
        case 'A': {
          const rx = Math.abs(a[0] * kx)
          const ry = Math.abs(a[1] * ky)
          const xr = (pl.flip ? -a[2] : a[2]) + (pl.rot ?? 0)
          const sweep = pl.flip ? 1 - a[4] : a[4]
          cu = a[5]
          cv = a[6]
          out += `A${n1(rx)} ${n1(ry)} ${n1(xr)} ${a[3] ? 1 : 0} ${sweep ? 1 : 0} ${map(cu, cv)}`
          break
        }
        default: {
          let s = cmd
          for (let i = 0; i < n; i += 2) s += (i ? ' ' : '') + map(a[i], a[i + 1])
          out += s
          cu = a[n - 2]
          cv = a[n - 1]
          if (cmd === 'M') cmd = 'L'
        }
      }
    }
  }
  let m: RegExpExecArray | null
  CMD.lastIndex = 0
  while ((m = CMD.exec(d))) {
    if (m[1]) {
      flush()
      cmd = m[1].toUpperCase()
      args = []
      if (cmd === 'Z') {
        out += 'Z'
        cmd = ''
      }
    } else args.push(parseFloat(m[2]))
  }
  flush()
  return out
}

/* ---- Unit-space shape helpers (return absolute path data) ----------------- */

export const uCircle = (u: number, v: number, r: number): string => `M${u - r} ${v}A${r} ${r} 0 1 0 ${u + r} ${v}A${r} ${r} 0 1 0 ${u - r} ${v}Z`
export const uEllipse = (u: number, v: number, rx: number, ry: number): string => `M${u - rx} ${v}A${rx} ${ry} 0 1 0 ${u + rx} ${v}A${rx} ${ry} 0 1 0 ${u - rx} ${v}Z`
export function uRect(u: number, v: number, w: number, h: number, r = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (!rr) return `M${u} ${v}H${u + w}V${v + h}H${u}Z`
  return `M${u + rr} ${v}H${u + w - rr}A${rr} ${rr} 0 0 1 ${u + w} ${v + rr}V${v + h - rr}A${rr} ${rr} 0 0 1 ${u + w - rr} ${v + h}H${u + rr}A${rr} ${rr} 0 0 1 ${u} ${v + h - rr}V${v + rr}A${rr} ${rr} 0 0 1 ${u + rr} ${v}Z`
}
export function uPoly(pts: [number, number][], closed = true): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${+p[0].toFixed(4)} ${+p[1].toFixed(4)}`).join('') + (closed ? 'Z' : '')
}
export function uStar(u: number, v: number, r1: number, r2: number, points = 5, rotDeg = -90): string {
  const pts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const a = ((rotDeg + (180 / points) * i) * Math.PI) / 180
    const r = i % 2 ? r2 : r1
    pts.push([u + Math.cos(a) * r, v + Math.sin(a) * r])
  }
  return uPoly(pts)
}
/** A soft-cornered star: every point and notch rounded by quadratic curves. */
export function uRoundStar(u: number, v: number, r1: number, r2: number, points = 5, rotDeg = -90, round = 0.25): string {
  const pts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const a = ((rotDeg + (180 / points) * i) * Math.PI) / 180
    const r = i % 2 ? r2 : r1
    pts.push([u + Math.cos(a) * r, v + Math.sin(a) * r])
  }
  const n = pts.length
  const lerp = (p: [number, number], q: [number, number], t: number): [number, number] => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const a = lerp(cur, prev, round)
    const b = lerp(cur, next, round)
    d += `${i ? 'L' : 'M'}${+a[0].toFixed(4)} ${+a[1].toFixed(4)}Q${+cur[0].toFixed(4)} ${+cur[1].toFixed(4)} ${+b[0].toFixed(4)} ${+b[1].toFixed(4)}`
  }
  return d + 'Z'
}
/** A closed smooth curve through points (Catmull-Rom → cubic Béziers), unit space. */
export function uSmooth(pts: [number, number][], closed = true): string {
  const n = pts.length
  if (n < 3) return uPoly(pts, closed)
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]
  const r = (v: number) => +v.toFixed(4)
  let d = `M${r(at(0)[0])} ${r(at(0)[1])}`
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`
  }
  return closed ? d + 'Z' : d
}
/** Scalloped (cloud / wool) outline around a circle of `n` bumps. */
export function uScallop(u: number, v: number, rx: number, ry: number, n: number, bulge = 0.35, phase = 0): string {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2
    pts.push([u + Math.cos(a) * rx, v + Math.sin(a) * ry])
  }
  let d = `M${+pts[0][0].toFixed(4)} ${+pts[0][1].toFixed(4)}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const mx = (p[0] + q[0]) / 2
    const my = (p[1] + q[1]) / 2
    const L = Math.hypot(q[0] - p[0], q[1] - p[1])
    // Outward normal of the edge (points run clockwise on screen).
    const nx = (q[1] - p[1]) / (L || 1)
    const ny = -(q[0] - p[0]) / (L || 1)
    const k = L * bulge * 1.6
    d += `Q${+(mx + nx * k).toFixed(4)} ${+(my + ny * k).toFixed(4)} ${+q[0].toFixed(4)} ${+q[1].toFixed(4)}`
  }
  return d + 'Z'
}

/* ---- The pen: unit shapes → canvas elements ---------------------------- */

export class Pen {
  readonly pl: Place
  /** Outline width in px. */
  readonly lw: number

  constructor(pl: Place, lw?: number) {
    this.pl = pl
    this.lw = lw ?? Math.max(1.6, Math.min(6, pl.s * 0.045))
  }

  /** A unit-space path placed on the canvas. */
  p(d: string): string {
    return placePath(d, this.pl)
  }

  /** Where a unit-space point lands on the canvas. */
  at(u: number, v: number): [number, number] {
    const pl = this.pl
    const r = ((pl.rot ?? 0) * Math.PI) / 180
    const a = u * (pl.flip ? -1 : 1) * pl.s * (pl.sx ?? 1)
    const b = v * pl.s * (pl.sy ?? 1)
    return [pl.x + a * Math.cos(r) - b * Math.sin(r), pl.y + a * Math.sin(r) + b * Math.cos(r)]
  }

  /** A pen for one piece of this drawing: unit offset (u, v), relative size k, extra
   *  rotation (degrees) and mirror. Outlines keep this pen's width. */
  sub(u: number, v: number, k: number, rot = 0, flip = false): Pen {
    const [x, y] = this.at(u, v)
    const pl = this.pl
    return new Pen({ x, y, s: pl.s * k, rot: (pl.rot ?? 0) + (pl.flip ? -rot : rot), flip: !!pl.flip !== flip }, this.lw)
  }

  /** Filled shape with the ink outline. */
  fill(d: string, color: string, o: { lw?: number; opacity?: number } = {}): string {
    const op = o.opacity !== undefined && o.opacity < 1 ? ` fill-opacity="${+o.opacity.toFixed(2)}"` : ''
    return `<path d="${this.p(d)}" fill="${color}"${op} stroke="${INK}" stroke-width="${n1(o.lw ?? this.lw)}" stroke-linejoin="round" stroke-linecap="round"/>`
  }

  /** Filled shape, no outline (highlights, shading, details). */
  flat(d: string, color: string, opacity = 1): string {
    return `<path d="${this.p(d)}" fill="${color}"${opacity < 1 ? ` fill-opacity="${+opacity.toFixed(2)}"` : ''}/>`
  }

  /** A stroked line; width in unit space. */
  line(d: string, color: string, width: number, opacity = 1): string {
    return `<path d="${this.p(d)}" fill="none" stroke="${color}" stroke-width="${n1(width * this.pl.s)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` stroke-opacity="${+opacity.toFixed(2)}"` : ''}/>`
  }

  /** A coloured stroke with an ink outline around it (straps, strings, snowflakes). */
  cord(d: string, color: string, width: number): string {
    const w = width * this.pl.s
    const p = this.p(d)
    return (
      `<path d="${p}" fill="none" stroke="${INK}" stroke-width="${n1(w + this.lw * 2)}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${p}" fill="none" stroke="${color}" stroke-width="${n1(w)}" stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }

  /** White gloss (a highlight shape). */
  hl(d: string, opacity = 0.55): string {
    return this.flat(d, '#ffffff', opacity)
  }

  /** A soft shading shape. */
  shade(d: string, opacity = 0.14): string {
    return this.flat(d, INK, opacity)
  }
}

/** Deterministic 0..1 values for scattering (confetti, sparkles). */
export function scatterRng(seed: string | number): () => number {
  let i = 0
  const base = typeof seed === 'number' ? seed : hash32(seed)
  return () => (hash32(base, i++) % 100000) / 100000
}

/** A bright, friendly palette shared by props, backdrops and effects. */
export const PAL = {
  red: '#ef4b5f',
  pink: '#ff8fb1',
  rose: '#ffc2d4',
  orange: '#ff9a3c',
  gold: '#ffcb2f',
  yellow: '#ffe066',
  cream: '#fff4d6',
  green: '#48c774',
  mint: '#a6ecc1',
  teal: '#2ec4b6',
  sky: '#8fd3ff',
  blue: '#4aa3ff',
  navy: '#3552a6',
  purple: '#9b6bff',
  lavender: '#cdb8ff',
  brown: '#a0673a',
  tan: '#e0b98a',
  grey: '#aab2c0',
  stone: '#8d93a1',
  white: '#ffffff',
} as const

export const CONFETTI_COLORS = [PAL.red, PAL.gold, PAL.blue, PAL.green, PAL.purple, PAL.pink, PAL.orange, PAL.teal]
