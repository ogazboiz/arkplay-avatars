/* Animated overlay effects for stickers, comics and profile avatars: sparkles, confetti,
 * hearts, snow, rain, a fire aura, glow, a halo, stars, bubbles, petals and rays of light.
 *
 * Effects are SVG drawn around a subject (the head) and a figure (the character's box), in
 * two layers: `back` goes behind the character, `front` over it. They loop through CSS
 * keyframes under the rules of `render/motion.ts`: classes scoped to an id prefix, only
 * transform and opacity animate, on wrapper groups without a transform attribute, and
 * `prefers-reduced-motion` stops them. resvg ignores keyframes and draws the base geometry,
 * so every effect's base geometry is a good still (the PNG). Translucency is fill-opacity
 * and gradient stop-opacity only; no filters, no group opacity. */

import type { Box } from '../core/math.ts'
import { hash32 } from '../core/rng.ts'
import { Defs } from '../core/svg.ts'
import { normalizeDNA } from '../dna/normalize.ts'
import type { AvatarDNA } from '../dna/types.ts'
import type { Ctx } from '../render/context.ts'
import { buildModel } from '../render/model.ts'
import { motionClass, motionPhase } from '../render/motion.ts'
import { renderModel } from '../render/render.ts'
import type { RenderOptions } from '../render/types.ts'
import { drawProp } from '../comics/props.ts'
import { CONFETTI_COLORS, INK, n1, PAL } from '../comics/pen.ts'

export type EffectId = 'sparkles' | 'confetti' | 'hearts' | 'snow' | 'rain' | 'fire' | 'glow' | 'halo' | 'stars' | 'bubbles' | 'petals' | 'rays'

export interface EffectInfo {
  id: EffectId
  label: string
  description: string
}

export const EFFECTS: EffectInfo[] = [
  { id: 'sparkles', label: 'Sparkles', description: 'Twinkling sparkles around you.' },
  { id: 'confetti', label: 'Confetti', description: 'Party confetti drifting down.' },
  { id: 'hearts', label: 'Hearts', description: 'Little hearts floating up.' },
  { id: 'snow', label: 'Snow', description: 'Gentle snowfall.' },
  { id: 'rain', label: 'Rain', description: 'A rain shower.' },
  { id: 'fire', label: 'Fire aura', description: 'Flames flickering around you.' },
  { id: 'glow', label: 'Glow', description: 'A warm glow behind you.' },
  { id: 'halo', label: 'Halo', description: 'A golden halo above your head.' },
  { id: 'stars', label: 'Stars', description: 'Twinkling stars.' },
  { id: 'bubbles', label: 'Bubbles', description: 'Bubbles floating up.' },
  { id: 'petals', label: 'Petals', description: 'Flower petals on the breeze.' },
  { id: 'rays', label: 'Rays of light', description: 'Soft rays of light from above.' },
]

export const EFFECT_IDS = EFFECTS.map((e) => e.id)

export const isEffect = (id: unknown): id is EffectId => typeof id === 'string' && (EFFECT_IDS as string[]).includes(id)

/** The head: centre and radius, in the same units as the effect box. */
export interface Subject {
  x: number
  y: number
  r: number
}

export interface EffectOptions {
  /** Scatter seed (the same seed places particles the same way). */
  seed?: string | number
  /** CSS keyframe loops (default true). Off: the still base geometry only. */
  motion?: boolean
  /** Id prefix for the effect's classes and gradients (unique per document). */
  prefix?: string
  subject?: Subject
  /** The character's bounds (auras hug it). */
  figure?: Box
  /** Keep the middle clear (effects over an opaque picture: glow and fire become rims). */
  frontOnly?: boolean
}

export interface EffectLayers {
  back: string
  front: string
  /** Defs to write once in the document (gradients, keyframes). */
  defs: string
}

interface Kit {
  box: Box
  S: number
  subj: Subject
  fig: Box
  defs: Defs
  motion: boolean
  frontOnly: boolean
  rnd: () => number
  /** Wraps content in a looping group. */
  loop(key: string, frames: string, duration: number, phase: number, content: string, o?: { timing?: string; origin?: string; direction?: 'normal' | 'alternate' }): string
}

const px = (v: number): string => `${Math.round(v * 10) / 10}px`
const circleD = (cx: number, cy: number, r: number): string => `M${n1(cx - r)} ${n1(cy)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(r * 2)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-r * 2)} 0Z`

/** Falls (dy > 0) or rises (dy < 0), fading at both ends so the loop restart is invisible. */
const travel = (dx: number, dy: number): string =>
  `0%{transform:translate(${px(-dx / 2)},${px(-dy / 2)});opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translate(${px(dx / 2)},${px(dy / 2)});opacity:0}`
const TWINKLE = '0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.55)}'
const PULSE = '0%,100%{opacity:1}50%{opacity:.6}'
const FLICKER = '0%,100%{transform:scale(1,1)}30%{transform:scale(.94,1.1)}60%{transform:scale(1.05,.94)}80%{transform:scale(.98,1.05)}'
const bob = (dy: number): string => `0%,100%{transform:translate(0px,0px)}50%{transform:translate(0px,${px(dy)})}`

function kit(box: Box, o: EffectOptions, id: string): Kit {
  const S = Math.min(box.w, box.h)
  const subj = o.subject ?? { x: box.x + box.w / 2, y: box.y + box.h * 0.36, r: S * 0.17 }
  const fig = o.figure ?? { x: subj.x - subj.r * 1.9, y: subj.y - subj.r * 1.3, w: subj.r * 3.8, h: box.y + box.h - (subj.y - subj.r * 1.3) }
  const defs = new Defs(`${o.prefix ?? 'fx'}${id.slice(0, 3)}`)
  const motion = o.motion !== false
  const ctxLike = { motion, defs } as Pick<Ctx, 'motion' | 'defs'> as Ctx
  let i = 0
  const base = hash32(String(o.seed ?? 'fx'), id)
  return {
    box,
    S,
    subj,
    fig,
    defs,
    motion,
    frontOnly: !!o.frontOnly,
    rnd: () => (hash32(base, i++) % 100000) / 100000,
    loop(key, frames, duration, phase, content, lo = {}) {
      if (!content || !motion) return content
      const cls = motionClass(ctxLike, key, frames, { duration, ...lo })
      return cls ? `<g class="${cls}" style="${motionPhase(phase)}">${content}</g>` : content
    },
  }
}

/** Points scattered over the box, thinned near the face so it stays readable. */
function scatter(k: Kit, n: number, margin = 0.04, clear = 1.15): [number, number][] {
  const out: [number, number][] = []
  let guard = 0
  while (out.length < n && guard++ < n * 20) {
    const x = k.box.x + k.box.w * (margin + k.rnd() * (1 - margin * 2))
    const y = k.box.y + k.box.h * (margin + k.rnd() * (1 - margin * 2))
    if (Math.hypot(x - k.subj.x, (y - k.subj.y) * 1.1) < k.subj.r * clear) continue
    out.push([x, y])
  }
  return out
}

function buckets<T>(items: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => [])
  items.forEach((it, i) => out[i % n].push(it))
  return out
}

function radial(k: Kit, key: string, stops: [number, string, number][]): string {
  return k.defs.add(key, (id) => `<radialGradient id="${id}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`)
}

const star5 = (cx: number, cy: number, r: number): string => {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    d += `${i ? 'L' : 'M'}${n1(cx + Math.cos(a) * rr)} ${n1(cy + Math.sin(a) * rr)}`
  }
  return d + 'Z'
}

const sparkleD = (cx: number, cy: number, r: number): string => {
  const i = r * 0.16
  return `M${n1(cx)} ${n1(cy - r)}Q${n1(cx + i)} ${n1(cy - i)} ${n1(cx + r)} ${n1(cy)}Q${n1(cx + i)} ${n1(cy + i)} ${n1(cx)} ${n1(cy + r)}Q${n1(cx - i)} ${n1(cy + i)} ${n1(cx - r)} ${n1(cy)}Q${n1(cx - i)} ${n1(cy - i)} ${n1(cx)} ${n1(cy - r)}Z`
}

const heartD = (cx: number, cy: number, s: number): string =>
  `M${n1(cx)} ${n1(cy + s * 0.9)}C${n1(cx - s * 1.2)} ${n1(cy + s * 0.1)} ${n1(cx - s * 0.9)} ${n1(cy - s * 0.85)} ${n1(cx)} ${n1(cy - s * 0.35)}C${n1(cx + s * 0.9)} ${n1(cy - s * 0.85)} ${n1(cx + s * 1.2)} ${n1(cy + s * 0.1)} ${n1(cx)} ${n1(cy + s * 0.9)}Z`

type Gen = (k: Kit) => { back: string; front: string }

const GENS: Record<EffectId, Gen> = {
  sparkles(k) {
    const pts = scatter(k, 11, 0.06, 1.3)
    const front = buckets(pts, 3)
      .map((g, bi) =>
        g
          .map(([x, y], i) => {
            const spark = `<path d="${sparkleD(x, y, k.S * (0.022 + ((i + bi) % 3) * 0.011))}" fill="#fffbe6" stroke="${PAL.gold}" stroke-width="${n1(k.S * 0.004)}" stroke-linejoin="round"/>`
            return k.loop(`tw${bi}`, TWINKLE, 1.6 + bi * 0.5, bi * 0.55 + i * 0.41, spark)
          })
          .join(''),
      )
      .join('')
    return { back: '', front }
  },
  confetti(k) {
    const pts = scatter(k, 28, 0.02, 1.2)
    const fall = k.box.h * 0.34
    const front = buckets(pts, 4)
      .map((g, bi) => {
        let d = ''
        g.forEach(([x, y], i) => {
          const c = CONFETTI_COLORS[(i * 4 + bi) % CONFETTI_COLORS.length]
          const w = k.S * 0.024
          const a = Math.round(k.rnd() * 180)
          d +=
            i % 3 === 2
              ? `<path d="${circleD(x, y, w * 0.45)}" fill="${c}"/>`
              : `<path d="M${n1(-w / 2)} ${n1(-w / 4)}h${n1(w)}v${n1(w / 2)}h${n1(-w)}Z" fill="${c}" transform="translate(${n1(x)} ${n1(y)}) rotate(${a})"/>`
        })
        return k.loop(`cf${bi}`, travel(k.S * 0.05 * (bi % 2 ? 1 : -1), fall), 3.2 + bi * 0.7, bi * 0.9, d, { timing: 'linear' })
      })
      .join('')
    return { back: '', front }
  },
  hearts(k) {
    const pts = scatter(k, 9, 0.08, 1.4)
    const rise = -k.box.h * 0.3
    const front = buckets(pts, 3)
      .map((g, bi) => {
        const d = g.map(([x, y], i) => `<path d="${heartD(x, y, k.S * (0.028 + (i % 2) * 0.012))}" fill="${i % 2 ? PAL.pink : PAL.red}" stroke="${INK}" stroke-width="${n1(k.S * 0.004)}" stroke-linejoin="round"/>`).join('')
        return k.loop(`ht${bi}`, travel(k.S * 0.04, rise), 3 + bi * 0.8, bi * 1.1, d, { timing: 'ease-in-out' })
      })
      .join('')
    return { back: '', front }
  },
  snow(k) {
    const pts = scatter(k, 34, 0.01, 0.9)
    const front = buckets(pts, 3)
      .map((g, bi) => {
        const r = k.S * (0.006 + bi * 0.005)
        let d = ''
        let flakes = ''
        g.forEach(([x, y], i) => {
          if (bi === 2 && i % 4 === 0) flakes += drawProp('snowflake', { x, y, s: k.S * 0.05, rot: (i * 17) % 60 })
          else d += circleD(x, y, r)
        })
        const body = `<path d="${d}" fill="#ffffff" stroke="#9fb6d9" stroke-width="${n1(r * 0.35)}"/>` + flakes
        return k.loop(`sn${bi}`, travel(k.S * 0.06 * (bi % 2 ? 1 : -1), k.box.h * (0.22 + bi * 0.08)), 5 + bi * 1.6, bi * 1.7, body, { timing: 'linear' })
      })
      .join('')
    return { back: '', front }
  },
  rain(k) {
    const pts = scatter(k, 30, 0.01, 0.7)
    const front = buckets(pts, 3)
      .map((g, bi) => {
        const L = k.S * (0.05 + bi * 0.015)
        const d = g.map(([x, y]) => `M${n1(x)} ${n1(y)}l${n1(-L * 0.25)} ${n1(L)}`).join('')
        const body = `<path d="${d}" fill="none" stroke="#6fb6ff" stroke-width="${n1(k.S * 0.007)}" stroke-linecap="round" stroke-opacity="0.85"/>`
        return k.loop(`rn${bi}`, travel(-k.S * 0.06, k.box.h * 0.3), 0.8 + bi * 0.25, bi * 0.3, body, { timing: 'linear' })
      })
      .join('')
    return { back: '', front }
  },
  fire(k) {
    const f = k.fig
    const flames: string[] = []
    const count = 11
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      // Around the lower two thirds of the figure: up the sides, across the feet.
      const a = Math.PI * (1.08 - t * 1.16)
      const cx = f.x + f.w / 2 + Math.cos(a) * f.w * 0.62
      const cy = f.y + f.h * 0.62 + Math.sin(a) * f.h * 0.42
      const s = k.S * (0.1 + (i % 3) * 0.03)
      if (k.frontOnly && Math.abs(cx - (f.x + f.w / 2)) < f.w * 0.3 && cy < f.y + f.h * 0.8) continue
      flames.push(k.loop(`fl${i % 3}`, FLICKER, 0.7 + (i % 3) * 0.2, i * 0.13, drawProp('flame', { x: cx, y: cy - s * 0.3, s, rot: (cx - (f.x + f.w / 2)) / (f.w || 1) * 18 }), { origin: 'center bottom' }))
    }
    const embers = scatter(k, 10, 0.1, 1.4)
      .map(([x, y]) => circleD(x, y, k.S * 0.007))
      .join('')
    const glow = radial(k, 'fg', [[0, PAL.orange, 0.55], [0.6, PAL.orange, 0.2], [1, PAL.orange, 0]])
    const back = k.frontOnly
      ? ''
      : `<ellipse cx="${n1(f.x + f.w / 2)}" cy="${n1(f.y + f.h * 0.55)}" rx="${n1(f.w * 0.95)}" ry="${n1(f.h * 0.62)}" fill="url(#${glow})"/>` + flames.join('')
    const front = (k.frontOnly ? flames.join('') : '') + k.loop('em', travel(0, -k.box.h * 0.25), 2.4, 0.4, `<path d="${embers}" fill="${PAL.yellow}"/>`)
    return { back, front }
  },
  glow(k) {
    const g = radial(k, 'gl', [[0, '#fff6cf', 0.95], [0.35, '#ffe39a', 0.6], [0.7, PAL.gold, 0.2], [1, PAL.gold, 0]])
    const ring = radial(k, 'gr', [[0, PAL.gold, 0], [0.55, PAL.gold, 0], [0.8, '#ffe39a', 0.4], [1, PAL.gold, 0]])
    const cx = k.fig.x + k.fig.w / 2
    const cy = k.subj.y + k.subj.r * 0.8
    const rx = Math.max(k.fig.w * 0.85, k.subj.r * 3)
    const ry = Math.max(k.fig.h * 0.6, k.subj.r * 3)
    const disc = (fill: string) => `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="url(#${fill})"/>`
    if (k.frontOnly) return { back: '', front: k.loop('gp', PULSE, 3, 0, disc(ring), { timing: 'ease-in-out' }) }
    return { back: k.loop('gp', PULSE, 3, 0, disc(g), { timing: 'ease-in-out' }), front: '' }
  },
  halo(k) {
    const { x, y, r } = k.subj
    const hy = y - r * 1.12
    const glow = radial(k, 'hg', [[0, '#fff6cf', 0.9], [0.5, '#ffe39a', 0.45], [1, PAL.gold, 0]])
    const ring =
      `<ellipse cx="${n1(x)}" cy="${n1(hy)}" rx="${n1(r * 0.78)}" ry="${n1(r * 0.24)}" fill="none" stroke="#b98a12" stroke-width="${n1(r * 0.16)}"/>` +
      `<ellipse cx="${n1(x)}" cy="${n1(hy)}" rx="${n1(r * 0.78)}" ry="${n1(r * 0.24)}" fill="none" stroke="${PAL.gold}" stroke-width="${n1(r * 0.1)}"/>` +
      `<path d="M${n1(x - r * 0.5)} ${n1(hy - r * 0.2)}Q${n1(x)} ${n1(hy - r * 0.3)} ${n1(x + r * 0.45)} ${n1(hy - r * 0.2)}" fill="none" stroke="#fff8d6" stroke-width="${n1(r * 0.04)}" stroke-linecap="round"/>`
    const back = k.frontOnly ? '' : `<ellipse cx="${n1(x)}" cy="${n1(hy + r * 0.2)}" rx="${n1(r * 1.5)}" ry="${n1(r * 0.9)}" fill="url(#${glow})"/>`
    return { back, front: k.loop('hb', bob(-r * 0.08), 2.6, 0, ring, { timing: 'ease-in-out' }) }
  },
  stars(k) {
    const pts = scatter(k, 10, 0.06, 1.3)
    const front = buckets(pts, 3)
      .map((g, bi) =>
        g
          .map(([x, y], i) =>
            k.loop(`st${bi}`, TWINKLE, 1.8 + bi * 0.6, bi * 0.6 + i * 0.37, `<path d="${star5(x, y, k.S * (0.025 + (i % 2) * 0.012))}" fill="${i % 3 ? PAL.yellow : '#ffffff'}" stroke="${INK}" stroke-width="${n1(k.S * 0.004)}" stroke-linejoin="round"/>`),
          )
          .join(''),
      )
      .join('')
    return { back: '', front }
  },
  bubbles(k) {
    const pts = scatter(k, 14, 0.05, 1.1)
    const front = buckets(pts, 3)
      .map((g, bi) => {
        const body = g
          .map(([x, y], i) => {
            const r = k.S * (0.018 + ((i + bi) % 3) * 0.012)
            return `<path d="${circleD(x, y, r)}" fill="#bfe6ff" fill-opacity="0.28" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${n1(r * 0.12)}"/><path d="${circleD(x - r * 0.35, y - r * 0.35, r * 0.22)}" fill="#ffffff" fill-opacity="0.85"/>`
          })
          .join('')
        return k.loop(`bb${bi}`, travel(k.S * 0.05 * (bi % 2 ? 1 : -1), -k.box.h * 0.3), 3.6 + bi, bi * 1.2, body, { timing: 'ease-in-out' })
      })
      .join('')
    return { back: '', front }
  },
  petals(k) {
    const pts = scatter(k, 16, 0.03, 1.1)
    const front = buckets(pts, 3)
      .map((g, bi) => {
        const body = g
          .map(([x, y], i) => {
            const s = k.S * (0.018 + (i % 2) * 0.008)
            const a = Math.round((hash32(bi, i) % 360) - 180)
            return `<path d="M0 ${n1(-s)}C${n1(s * 0.9)} ${n1(-s * 0.6)} ${n1(s * 0.7)} ${n1(s * 0.7)} 0 ${n1(s)}C${n1(-s * 0.7)} ${n1(s * 0.7)} ${n1(-s * 0.9)} ${n1(-s * 0.6)} 0 ${n1(-s)}Z" fill="${i % 3 ? PAL.rose : PAL.pink}" stroke="#e2789c" stroke-width="${n1(s * 0.12)}" transform="translate(${n1(x)} ${n1(y)}) rotate(${a})"/>`
          })
          .join('')
        return k.loop(`pt${bi}`, travel(k.S * 0.14, k.box.h * 0.22), 5 + bi * 1.3, bi * 1.4, body, { timing: 'ease-in-out' })
      })
      .join('')
    return { back: '', front }
  },
  rays(k) {
    const cx = k.subj.x
    const cy = k.box.y - k.box.h * 0.05
    const L = k.box.h * 1.1
    const g = k.defs.add('rl', (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(cy)}" x2="0" y2="${n1(cy + L)}"><stop offset="0" stop-color="#fff6cf" stop-opacity="0.85"/><stop offset="0.6" stop-color="#ffe39a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffe39a" stop-opacity="0"/></linearGradient>`)
    let d = ''
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i - 3) * 0.2
      const w = 0.045 + (i % 2) * 0.02
      d += `M${n1(cx)} ${n1(cy)}L${n1(cx + Math.cos(a - w) * L)} ${n1(cy + Math.sin(a - w) * L)}L${n1(cx + Math.cos(a + w) * L)} ${n1(cy + Math.sin(a + w) * L)}Z`
    }
    const rays = k.loop('rp', PULSE, 4, 0, `<path d="${d}" fill="url(#${g})"/>`, { timing: 'ease-in-out' })
    const motes = scatter(k, 8, 0.1, 1.4)
      .map(([x, y]) => sparkleD(x, y, k.S * 0.014))
      .join('')
    const sparkles = k.loop('rm', TWINKLE, 2.2, 0.3, `<path d="${motes}" fill="#fffbe6"/>`)
    return k.frontOnly ? { back: '', front: sparkles } : { back: rays, front: sparkles }
  },
}

/** The two layers of an effect over `box` (the units of the document it goes into). */
export function effectLayers(id: EffectId | string, box: Box, o: EffectOptions = {}): EffectLayers {
  const gen = GENS[id as EffectId]
  if (!gen) return { back: '', front: '', defs: '' }
  const k = kit(box, o, id)
  const { back, front } = gen(k)
  const d = k.defs.toString()
  return { back, front, defs: d ? d.slice(6, -7) : '' }
}

/**
 * An effect around a complete SVG document (a profile avatar, a sticker): its root, title
 * and defs are kept, the effect's front layer goes over the picture and, with `behind`
 * (a transparent picture), its back layer under it. Units come from the root viewBox.
 */
export function applyEffect(svg: string, id: EffectId | string, o: EffectOptions & { behind?: boolean } = {}): string {
  const open = /^<svg\b[^>]*>/.exec(svg)
  if (!open || !GENS[id as EffectId]) return svg
  const vb = /\sviewBox="([^"]+)"/.exec(open[0])
  const v = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 512, 512]
  const box: Box = { x: v[0] || 0, y: v[1] || 0, w: v[2] || 512, h: v[3] || 512 }
  const L = effectLayers(id, box, { ...o, frontOnly: o.frontOnly ?? !o.behind })
  let i = open[0].length
  let head = ''
  for (const tag of ['title', 'style']) {
    if (svg.startsWith(`<${tag}>`, i)) {
      const end = svg.indexOf(`</${tag}>`, i) + tag.length + 3
      head += svg.slice(i, end)
      i = end
    }
  }
  let defs = ''
  if (svg.startsWith('<defs>', i)) {
    const end = svg.indexOf('</defs>', i)
    defs = svg.slice(i + 6, end)
    i = end + 7
  }
  const body = svg.slice(i, svg.length - 6)
  const allDefs = defs + L.defs
  return open[0] + head + (allDefs ? `<defs>${allDefs}</defs>` : '') + (o.behind ? L.back : '') + body + L.front + '</svg>'
}

/**
 * An avatar render (any crop, like `renderSVG`) with an effect around its head: the subject
 * comes from the model, so halos sit on the head in every crop. Transparent renders (no
 * background) also get the effect's back layer behind the avatar.
 */
export function renderWithEffect(input: AvatarDNA | unknown, id: EffectId | string, opts: RenderOptions = {}): string {
  const dna = normalizeDNA(input)
  const model = buildModel(dna, opts)
  const svg = renderModel(model, opts)
  const hb = model.boxes.head
  const subject = { x: hb.x + hb.w / 2, y: hb.y + hb.h * 0.52, r: hb.w * 0.4 }
  const behind = opts.background === false || dna.sections.scene?.background === 'none'
  return applyEffect(svg, id, { subject, behind, motion: opts.motion ?? opts.anim === undefined, prefix: `${opts.idPrefix ?? 'av'}x`, seed: `${dna.seed}` })
}
