/* Vector props for stickers and comics: hearts, stars, balloons, trophies, controllers,
 * doves, suns, Bible-story objects (the ark, a sling, loaves and fishes…) and more.
 *
 * Each prop is drawn in a unit box centred on (0, 0) (about ±0.5, y down) with the Pen,
 * so it can be placed at any position, size, rotation and mirror. Flat colours with an ink
 * outline and a white gloss: the sticker look. No filters, no group opacity (resvg-safe),
 * no randomness except seeded scattering. */

import { inkLettering, letterLines, normalizeText } from './font.ts'
import { CONFETTI_COLORS, INK, PAL, Pen, scatterRng, uCircle, uEllipse, uPoly, uRect, uRoundStar, uScallop, type Place } from './pen.ts'

export interface PropOptions {
  /** Main colour (props that have one: balloons, gifts, hearts…). */
  color?: string
  /** Second colour (ribbons, stripes). */
  color2?: string
  /** Seed for scattered props (confetti, sparkles). */
  seed?: string | number
  /** Sun and cloud faces. */
  face?: boolean
}

type Draw = (p: Pen, o: PropOptions) => string

export interface PropDef {
  id: string
  label: string
  draw: Draw
}

const HEART = 'M0 0.44C-0.2 0.3 -0.52 0.08 -0.52 -0.15C-0.52 -0.35 -0.37 -0.46 -0.23 -0.46C-0.11 -0.46 -0.03 -0.4 0 -0.32C0.03 -0.4 0.11 -0.46 0.23 -0.46C0.37 -0.46 0.52 -0.35 0.52 -0.15C0.52 0.08 0.2 0.3 0 0.44Z'
const CLOUD = 'M-0.36 0.24C-0.5 0.24 -0.55 0.06 -0.42 0C-0.46 -0.17 -0.27 -0.27 -0.15 -0.17C-0.1 -0.37 0.17 -0.4 0.24 -0.18C0.39 -0.24 0.53 -0.1 0.45 0.04C0.57 0.1 0.51 0.24 0.38 0.24Z'
const DROP = 'M0 -0.5C0.2 -0.2 0.32 0 0.32 0.16C0.32 0.36 0.17 0.5 0 0.5C-0.17 0.5 -0.32 0.36 -0.32 0.16C-0.32 0 -0.2 -0.2 0 -0.5Z'
const SPARKLE = 'M0 -0.5Q0.07 -0.07 0.5 0Q0.07 0.07 0 0.5Q-0.07 0.07 -0.5 0Q-0.07 -0.07 0 -0.5Z'
const FLAME = 'M0 0.46C-0.28 0.46 -0.4 0.24 -0.34 0.02C-0.3 -0.14 -0.18 -0.2 -0.16 -0.36C-0.04 -0.26 0 -0.16 0 -0.06C0.06 -0.24 0.16 -0.38 0.14 -0.5C0.34 -0.36 0.42 -0.12 0.38 0.08C0.36 0.3 0.24 0.46 0 0.46Z'
const FLAME_IN = 'M0 0.44C-0.14 0.44 -0.2 0.32 -0.16 0.2C-0.12 0.08 -0.04 0.04 -0.02 -0.08C0.1 0.02 0.18 0.14 0.16 0.26C0.14 0.38 0.08 0.44 0 0.44Z'

const heart: Draw = (p, o) =>
  p.fill(HEART, o.color ?? PAL.red) +
  p.shade('M0.3 -0.42C0.48 -0.34 0.54 -0.14 0.44 0.04C0.32 0.22 0.14 0.34 0 0.44C0.22 0.24 0.42 0.02 0.3 -0.42Z', 0.13) +
  p.line('M-0.37 -0.15C-0.38 -0.28 -0.3 -0.35 -0.21 -0.35', '#fff', 0.07, 0.85)

const star: Draw = (p, o) =>
  p.fill(uRoundStar(0, 0.04, 0.52, 0.24, 5, -90, 0.16), o.color ?? PAL.gold) +
  p.shade('M0 0.3L0.31 0.46L0.24 0.13L0.49 -0.12L0.18 -0.13Z', 0.1) +
  p.line('M-0.06 -0.27L-0.14 -0.1', '#fff', 0.07, 0.8)

const sparkle: Draw = (p, o) => {
  const q = new Pen(p.pl, p.lw * 0.75)
  return q.fill(SPARKLE, o.color ?? '#fff6c9') + q.flat(uCircle(0, 0, 0.06), '#ffffff', 0.9)
}

function balloon(p: Pen, color: string, string = true): string {
  return (
    (string ? p.line('M0 0.29C-0.07 0.36 0.07 0.43 0 0.52', INK, 0.022) : '') +
    p.fill('M-0.06 0.3L0 0.22L0.06 0.3Z', color) +
    p.fill('M0 0.24C-0.2 0.24 -0.31 0.02 -0.31 -0.14C-0.31 -0.35 -0.17 -0.48 0 -0.48C0.17 -0.48 0.31 -0.35 0.31 -0.14C0.31 0.02 0.2 0.24 0 0.24Z', color) +
    p.shade('M0.18 -0.4C0.3 -0.3 0.33 -0.1 0.24 0.06C0.18 0.16 0.1 0.22 0 0.24C0.16 0.12 0.26 -0.12 0.18 -0.4Z', 0.12) +
    p.hl(uEllipse(-0.14, -0.26, 0.06, 0.1), 0.6)
  )
}

function gift(p: Pen, o: PropOptions): string {
  const c = o.color ?? PAL.red
  const r = o.color2 ?? PAL.gold
  return (
    p.fill(uRect(-0.36, -0.06, 0.72, 0.52, 0.03), c) +
    p.shade(uRect(0.14, -0.06, 0.22, 0.52), 0.12) +
    p.fill(uRect(-0.07, -0.06, 0.14, 0.52), r) +
    p.fill(uRect(-0.42, -0.2, 0.84, 0.16, 0.03), c) +
    p.fill(uRect(-0.07, -0.2, 0.14, 0.16), r) +
    p.fill('M0 -0.2C-0.1 -0.44 -0.36 -0.42 -0.3 -0.28C-0.25 -0.18 -0.1 -0.2 0 -0.2Z', r) +
    p.fill('M0 -0.2C0.1 -0.44 0.36 -0.42 0.3 -0.28C0.25 -0.18 0.1 -0.2 0 -0.2Z', r) +
    p.fill(uCircle(0, -0.21, 0.05), r)
  )
}

function cloud(p: Pen, color: string, face = false): string {
  return (
    p.fill(CLOUD, color) +
    p.flat('M-0.45 0.12C-0.2 0.2 0.2 0.2 0.5 0.12C0.49 0.2 0.44 0.24 0.38 0.24H-0.36C-0.42 0.24 -0.45 0.18 -0.45 0.12Z', '#c9d6f2', 0.7) +
    p.hl('M-0.3 -0.08C-0.28 -0.18 -0.16 -0.2 -0.1 -0.12C-0.18 -0.14 -0.26 -0.12 -0.3 -0.08Z', 0.8) +
    (face ? p.flat(uCircle(-0.1, 0.04, 0.03), INK) + p.flat(uCircle(0.12, 0.04, 0.03), INK) + p.line('M-0.04 0.1Q0.01 0.15 0.06 0.1', INK, 0.025) : '')
  )
}

function lettering(p: Pen, text: string, color: string, k = 0.9): string {
  const [x, y] = p.at(0, 0)
  const l = letterLines([normalizeText(text)], { size: p.pl.s * k * 0.62, x, y })
  const body = inkLettering(l, { fill: color, outlineWidth: Math.max(1.5, l.stroke * 0.5) })
  return p.pl.rot ? `<g transform="rotate(${Math.round(p.pl.rot)} ${Math.round(x)} ${Math.round(y)})">${body}</g>` : body
}

const P: PropDef[] = [
  { id: 'heart', label: 'Heart', draw: heart },
  {
    id: 'hearts',
    label: 'Hearts',
    draw: (p, o) => heart(p.sub(-0.14, 0.14, 0.62, -8), o) + heart(p.sub(0.3, -0.2, 0.36, 14), { color: o.color2 ?? PAL.pink }) + heart(p.sub(-0.34, -0.32, 0.24, -18), { color: o.color2 ?? PAL.pink }),
  },
  { id: 'star', label: 'Star', draw: star },
  {
    id: 'stars',
    label: 'Stars',
    draw: (p, o) => star(p.sub(-0.1, 0.12, 0.6, -6), o) + star(p.sub(0.32, -0.24, 0.32, 12), o) + sparkle(p.sub(-0.36, -0.3, 0.3), {}),
  },
  { id: 'sparkle', label: 'Sparkle', draw: sparkle },
  {
    id: 'sparkles',
    label: 'Sparkles',
    draw: (p, o) => sparkle(p.sub(-0.12, 0.08, 0.66), o) + sparkle(p.sub(0.3, -0.26, 0.36), o) + sparkle(p.sub(0.28, 0.32, 0.26), o),
  },
  { id: 'balloon', label: 'Balloon', draw: (p, o) => balloon(p, o.color ?? PAL.red) },
  {
    id: 'balloons',
    label: 'Balloons',
    draw: (p, o) => {
      const knots: [number, number, number, string][] = [
        [-0.22, -0.1, 0.56, o.color ?? PAL.red],
        [0.22, -0.14, 0.56, o.color2 ?? PAL.blue],
        [0, -0.26, 0.56, PAL.gold],
      ]
      let strings = ''
      for (const [u, v, k] of knots) strings += p.line(`M${u} ${(v + 0.29 * k * 0.95).toFixed(3)}Q${(u * 0.4).toFixed(3)} 0.3 0 0.5`, INK, 0.018)
      return strings + knots.map(([u, v, k, c]) => balloon(p.sub(u, v, k * 0.95), c, false)).join('')
    },
  },
  { id: 'gift', label: 'Gift', draw: gift },
  {
    id: 'cake',
    label: 'Birthday cake',
    draw: (p, o) => {
      let out = p.fill(uEllipse(0, 0.42, 0.5, 0.08), '#ffffff') + p.fill(uRect(-0.42, -0.06, 0.84, 0.46, 0.06), '#ffd6a5') + p.shade(uRect(0.22, -0.02, 0.2, 0.42), 0.1)
      out += p.fill('M-0.42 0.02V-0.08Q-0.42 -0.13 -0.36 -0.13H0.36Q0.42 -0.13 0.42 -0.08V0.06Q0.36 0.13 0.3 0.04Q0.24 -0.02 0.18 0.1Q0.12 0.16 0.06 0.04Q0 -0.02 -0.06 0.08Q-0.12 0.14 -0.18 0.04Q-0.24 -0.02 -0.3 0.08Q-0.38 0.12 -0.42 0.02Z', o.color ?? PAL.pink)
      const sprinkles: [number, number, string][] = [[-0.3, 0.22, PAL.blue], [-0.1, 0.3, PAL.gold], [0.12, 0.24, PAL.green], [0.3, 0.3, PAL.purple], [0.02, 0.18, PAL.red]]
      for (const [u, v, c] of sprinkles) out += p.line(`M${u - 0.03} ${v}L${u + 0.03} ${v - 0.03}`, c, 0.03)
      for (const u of [-0.2, 0, 0.2]) {
        out += p.fill(uRect(u - 0.03, -0.36, 0.06, 0.23, 0.015), '#ffffff') + p.line(`M${u - 0.03} -0.3L${u + 0.03} -0.26M${u - 0.03} -0.22L${u + 0.03} -0.18`, PAL.blue, 0.02)
        out += p.fill(`M${u} -0.37C${u - 0.06} -0.43 ${u - 0.03} -0.49 ${u} -0.54C${u + 0.03} -0.49 ${u + 0.06} -0.43 ${u} -0.37Z`, PAL.orange, { lw: p.lw * 0.7 })
        out += p.flat(`M${u} -0.38C${u - 0.025} -0.41 ${u - 0.012} -0.45 ${u} -0.47C${u + 0.012} -0.45 ${u + 0.025} -0.41 ${u} -0.38Z`, PAL.yellow)
      }
      return out
    },
  },
  {
    id: 'trophy',
    label: 'Trophy',
    draw: (p, o) => {
      const c = o.color ?? PAL.gold
      return (
        p.cord('M-0.29 -0.36C-0.52 -0.38 -0.52 -0.1 -0.22 -0.08', c, 0.06) +
        p.cord('M0.29 -0.36C0.52 -0.38 0.52 -0.1 0.22 -0.08', c, 0.06) +
        p.fill(uRect(-0.3, 0.3, 0.6, 0.18, 0.03), '#6b4a2f') +
        p.fill(uRect(-0.06, 0.05, 0.12, 0.17), c) +
        p.fill(uRect(-0.22, 0.2, 0.44, 0.1, 0.02), c) +
        p.fill('M-0.32 -0.47H0.32V-0.36C0.32 -0.1 0.18 0.06 0 0.08C-0.18 0.06 -0.32 -0.1 -0.32 -0.36Z', c) +
        p.shade('M0.14 -0.47H0.32V-0.36C0.32 -0.1 0.18 0.06 0 0.08C0.14 -0.04 0.2 -0.2 0.14 -0.47Z', 0.14) +
        p.fill(uRoundStar(0, -0.22, 0.12, 0.055, 5, -90, 0.2), '#fff3c4', { lw: p.lw * 0.6 }) +
        p.line('M-0.21 -0.38C-0.21 -0.22 -0.16 -0.1 -0.07 -0.03', '#fff', 0.045, 0.7) +
        p.flat(uRect(-0.14, 0.36, 0.28, 0.05, 0.01), PAL.gold, 0.9)
      )
    },
  },
  {
    id: 'medal',
    label: 'Medal',
    draw: (p, o) =>
      p.fill('M-0.3 -0.5L-0.05 -0.02H0.1L-0.14 -0.5Z', PAL.blue) +
      p.fill('M0.3 -0.5L0.05 -0.02H-0.1L0.14 -0.5Z', PAL.red) +
      p.fill(uCircle(0, 0.18, 0.3), o.color ?? PAL.gold) +
      p.flat(uCircle(0, 0.18, 0.21), '#ffe38a', 0.9) +
      p.fill(uRoundStar(0, 0.19, 0.14, 0.065, 5, -90, 0.2), o.color ?? PAL.gold, { lw: p.lw * 0.6 }) +
      p.line('M-0.2 0.06C-0.24 0.14 -0.23 0.24 -0.18 0.3', '#fff', 0.04, 0.7),
  },
  {
    id: 'crown',
    label: 'Crown',
    draw: (p, o) => {
      const c = o.color ?? PAL.gold
      return (
        p.fill('M-0.44 0.24L-0.5 -0.22L-0.24 0.02L0 -0.34L0.24 0.02L0.5 -0.22L0.44 0.24Z', c) +
        p.shade('M0.24 0.02L0.5 -0.22L0.44 0.24H0.2Z', 0.12) +
        p.fill(uRect(-0.45, 0.12, 0.9, 0.15, 0.03), c) +
        p.fill(uCircle(-0.25, 0.195, 0.045), PAL.red, { lw: p.lw * 0.6 }) +
        p.fill(uCircle(0, 0.195, 0.05), PAL.blue, { lw: p.lw * 0.6 }) +
        p.fill(uCircle(0.25, 0.195, 0.045), PAL.green, { lw: p.lw * 0.6 }) +
        p.fill(uCircle(-0.5, -0.24, 0.05), c) +
        p.fill(uCircle(0, -0.36, 0.055), c) +
        p.fill(uCircle(0.5, -0.24, 0.05), c)
      )
    },
  },
  {
    id: 'controller',
    label: 'Game controller',
    draw: (p, o) =>
      p.fill('M-0.32 -0.2H0.32C0.45 -0.2 0.52 -0.08 0.52 0.06C0.52 0.22 0.44 0.3 0.36 0.3C0.28 0.3 0.24 0.22 0.18 0.14H-0.18C-0.24 0.22 -0.28 0.3 -0.36 0.3C-0.44 0.3 -0.52 0.22 -0.52 0.06C-0.52 -0.08 -0.45 -0.2 -0.32 -0.2Z', o.color ?? '#6c63ff') +
      p.shade('M-0.18 0.14H0.18C0.24 0.22 0.28 0.3 0.36 0.3C0.44 0.3 0.52 0.22 0.52 0.06C0.46 0.16 0.3 0.12 0.18 0.06H-0.18C-0.3 0.12 -0.46 0.16 -0.52 0.06C-0.52 0.22 -0.44 0.3 -0.36 0.3C-0.28 0.3 -0.24 0.22 -0.18 0.14Z', 0.15) +
      p.flat(uRect(-0.37, -0.03, 0.17, 0.06, 0.015), '#2f2a45') +
      p.flat(uRect(-0.315, -0.085, 0.06, 0.17, 0.015), '#2f2a45') +
      p.fill(uCircle(0.28, -0.09, 0.04), PAL.red, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.36, -0.01, 0.04), PAL.blue, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.2, -0.01, 0.04), PAL.green, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.28, 0.07, 0.04), PAL.gold, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(-0.1, 0.06, 0.055), '#4a4466', { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.08, 0.06, 0.055), '#4a4466', { lw: p.lw * 0.5 }) +
      p.line('M-0.36 -0.14C-0.26 -0.16 -0.1 -0.16 0 -0.16', '#fff', 0.035, 0.5),
  },
  {
    id: 'coin',
    label: 'Coin',
    draw: (p, o) =>
      p.fill(uCircle(0, 0, 0.46), o.color ?? PAL.gold) +
      p.line('M0 -0.33A0.33 0.33 0 1 1 -0.01 -0.33', '#c98a14', 0.04) +
      p.fill(uRoundStar(0, 0.02, 0.18, 0.08, 5, -90, 0.2), '#fff0b3', { lw: p.lw * 0.6 }) +
      p.line('M-0.3 -0.12C-0.3 -0.24 -0.22 -0.32 -0.12 -0.35', '#fff', 0.05, 0.8),
  },
  {
    id: 'level-up',
    label: 'Level up arrow',
    draw: (p, o) =>
      p.fill('M0 -0.5L0.44 -0.04H0.19V0.46H-0.19V-0.04H-0.44Z', o.color ?? PAL.green) +
      p.shade('M0 -0.5L0.44 -0.04H0.19V0.46H0.04V-0.1H0.2Z', 0.12) +
      p.line('M-0.08 0.36V-0.1H-0.28L-0.02 -0.38', '#fff', 0.045, 0.6),
  },
  {
    id: 'rocket',
    label: 'Rocket',
    draw: (p) =>
      p.sub(0, 0.38, 0.34, 180).fill(FLAME, PAL.orange) +
        p.sub(0, 0.34, 0.2, 180).flat(FLAME, PAL.yellow) +
        p.fill('M-0.16 0.1L-0.34 0.3L-0.3 0.06Z', PAL.red) +
        p.fill('M0.16 0.1L0.34 0.3L0.3 0.06Z', PAL.red) +
        p.fill('M0 -0.5C0.16 -0.36 0.2 -0.14 0.18 0.2H-0.18C-0.2 -0.14 -0.16 -0.36 0 -0.5Z', '#f4f4fb') +
        p.fill('M0 -0.5C0.08 -0.43 0.12 -0.36 0.14 -0.3H-0.14C-0.12 -0.36 -0.08 -0.43 0 -0.5Z', PAL.red) +
        p.fill(uCircle(0, -0.1, 0.08), PAL.sky) +
        p.hl(uCircle(-0.03, -0.12, 0.03), 0.8) +
        p.shade('M0.08 -0.42C0.16 -0.3 0.19 -0.1 0.18 0.2H0.08C0.12 -0.04 0.12 -0.24 0.08 -0.42Z', 0.12),
  },
  {
    id: 'sun',
    label: 'Sun',
    draw: (p, o) => {
      let rays = ''
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const w = 0.13
        rays += uPoly([
          [Math.cos(a - w) * 0.33, Math.sin(a - w) * 0.33],
          [Math.cos(a) * 0.5, Math.sin(a) * 0.5],
          [Math.cos(a + w) * 0.33, Math.sin(a + w) * 0.33],
        ])
      }
      const face = o.face !== false
      return (
        p.fill(rays, PAL.orange) +
        p.fill(uCircle(0, 0, 0.32), o.color ?? PAL.gold) +
        p.shade('M0.2 -0.25A0.32 0.32 0 0 1 -0.25 0.2A0.3 0.3 0 0 0 0.2 -0.25Z', 0.08) +
        p.line('M-0.2 -0.1C-0.18 -0.18 -0.12 -0.22 -0.05 -0.23', '#fff', 0.04, 0.7) +
        (face
          ? p.line('M-0.14 -0.02Q-0.1 -0.07 -0.06 -0.02M0.06 -0.02Q0.1 -0.07 0.14 -0.02', INK, 0.03) +
            p.line('M-0.1 0.08Q0 0.18 0.1 0.08', INK, 0.03) +
            p.flat(uEllipse(-0.18, 0.08, 0.05, 0.03), PAL.red, 0.35) +
            p.flat(uEllipse(0.18, 0.08, 0.05, 0.03), PAL.red, 0.35)
          : '')
      )
    },
  },
  { id: 'cloud', label: 'Cloud', draw: (p, o) => cloud(p, o.color ?? '#ffffff', o.face) },
  {
    id: 'rain-cloud',
    label: 'Rain cloud',
    draw: (p) => {
      let drops = ''
      for (const [u, v] of [[-0.22, 0.26], [0.04, 0.36], [0.28, 0.24]] as [number, number][]) drops += p.sub(u, v, 0.2).fill(DROP, PAL.blue)
      return drops + cloud(p.sub(0, -0.14, 0.9), '#c3cbdb')
    },
  },
  {
    id: 'snowflake',
    label: 'Snowflake',
    draw: (p) => {
      let d = ''
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const ex = Math.cos(a) * 0.46
        const ey = Math.sin(a) * 0.46
        const bx = Math.cos(a) * 0.27
        const by = Math.sin(a) * 0.27
        d += `M0 0L${ex.toFixed(3)} ${ey.toFixed(3)}`
        for (const s of [-1, 1]) {
          const b = a + s * 0.75
          d += `M${bx.toFixed(3)} ${by.toFixed(3)}L${(bx + Math.cos(b) * 0.14).toFixed(3)} ${(by + Math.sin(b) * 0.14).toFixed(3)}`
        }
      }
      return p.cord(d, '#ffffff', 0.07) + p.flat(uCircle(0, 0, 0.05), PAL.sky)
    },
  },
  {
    id: 'umbrella',
    label: 'Umbrella',
    draw: (p, o) =>
      p.cord('M0 0V0.38C0 0.47 0.13 0.47 0.13 0.38', PAL.brown, 0.05) +
      p.fill('M-0.48 0.02C-0.46 -0.3 -0.24 -0.46 0 -0.46C0.24 -0.46 0.46 -0.3 0.48 0.02C0.4 -0.04 0.32 -0.04 0.24 0.02C0.16 -0.04 0.08 -0.04 0 0.02C-0.08 -0.04 -0.16 -0.04 -0.24 0.02C-0.32 -0.04 -0.4 -0.04 -0.48 0.02Z', o.color ?? PAL.red) +
      p.line('M0 -0.46C-0.12 -0.3 -0.2 -0.14 -0.24 0.02M0 -0.46C0.12 -0.3 0.2 -0.14 0.24 0.02M0 -0.46V0.02', INK, 0.018, 0.5) +
      p.line('M-0.3 -0.2C-0.26 -0.3 -0.18 -0.36 -0.1 -0.39', '#fff', 0.04, 0.7) +
      p.line('M0 -0.46V-0.53', INK, 0.035),
  },
  {
    id: 'rainbow',
    label: 'Rainbow',
    draw: (p) => {
      const cols = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.blue, PAL.purple]
      const band = 0.055
      let out = p.line(`M${-0.44 + (band * cols.length) / 2} 0.24A${0.44 - (band * cols.length) / 2} ${0.44 - (band * cols.length) / 2} 0 0 1 ${0.44 - (band * cols.length) / 2} 0.24`, INK, band * cols.length + (p.lw * 2) / p.pl.s)
      cols.forEach((c, i) => {
        const r = 0.44 - band * (i + 0.5)
        out += p.line(`M${-r} 0.24A${r} ${r} 0 0 1 ${r} 0.24`, c, band + 0.004)
      })
      return out + cloud(p.sub(-0.33, 0.26, 0.42), '#ffffff') + cloud(p.sub(0.33, 0.26, 0.42), '#ffffff')
    },
  },
  {
    id: 'lightning',
    label: 'Lightning',
    draw: (p) => p.fill('M0.08 -0.5L-0.3 0.06H-0.02L-0.12 0.5L0.3 -0.1H0.02L0.16 -0.5Z', PAL.yellow) + p.line('M0.02 -0.4L-0.18 -0.02', '#fff', 0.035, 0.7),
  },
  {
    id: 'moon',
    label: 'Moon',
    draw: (p) =>
      p.fill('M0.12 -0.46A0.46 0.46 0 1 0 0.46 0.18A0.36 0.36 0 1 1 0.12 -0.46Z', '#ffe9a8') +
      p.flat(uCircle(-0.22, 0.02, 0.05), '#e8c878', 0.8) +
      p.flat(uCircle(-0.08, 0.24, 0.035), '#e8c878', 0.8),
  },
  {
    id: 'flower',
    label: 'Flower',
    draw: (p, o) => {
      let petals = ''
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        petals += p.fill(uCircle(Math.cos(a) * 0.19, -0.14 + Math.sin(a) * 0.19, 0.15), o.color ?? PAL.pink)
      }
      return (
        p.cord('M0 0V0.5', PAL.green, 0.05) +
        p.fill('M0 0.32C0.12 0.18 0.3 0.2 0.32 0.24C0.26 0.35 0.1 0.38 0 0.32Z', PAL.green) +
        petals +
        p.fill(uCircle(0, -0.14, 0.12), PAL.gold) +
        p.hl(uCircle(-0.04, -0.18, 0.035), 0.7)
      )
    },
  },
  {
    id: 'lily',
    label: 'Easter lily',
    draw: (p) => {
      const petal = 'M0 0.12C-0.1 -0.06 -0.07 -0.32 0 -0.46C0.07 -0.32 0.1 -0.06 0 0.12Z'
      return (
        p.cord('M0 0.2V0.5', PAL.green, 0.05) +
        p.fill('M0 0.4C-0.12 0.3 -0.3 0.3 -0.34 0.34C-0.28 0.44 -0.1 0.46 0 0.4Z', PAL.green) +
        p.sub(0, 0, 1, -48).fill(petal, '#fffdf4') +
        p.sub(0, 0, 1, 48).fill(petal, '#fffdf4') +
        p.fill(petal, '#ffffff') +
        p.fill('M-0.1 0.1H0.1L0.05 0.24H-0.05Z', PAL.mint) +
        p.line('M0 0.06L-0.06 -0.2M0 0.06L0.06 -0.2M0 0.06V-0.24', PAL.orange, 0.018) +
        p.flat(uCircle(-0.06, -0.21, 0.025), PAL.orange) +
        p.flat(uCircle(0.06, -0.21, 0.025), PAL.orange) +
        p.flat(uCircle(0, -0.25, 0.025), PAL.orange)
      )
    },
  },
  {
    id: 'dove',
    label: 'Dove with an olive branch',
    draw: (p, o) => {
      const branch = o.face === false ? '' : p.cord('M0.47 -0.02C0.54 0.04 0.58 0.12 0.57 0.2', '#6b8f3a', 0.02) + p.fill(uEllipse(0.52, 0.06, 0.045, 0.022), PAL.green, { lw: p.lw * 0.5 }) + p.fill(uEllipse(0.58, 0.15, 0.045, 0.022), PAL.green, { lw: p.lw * 0.5 })
      return (
        p.fill('M-0.44 0.05L-0.6 -0.06L-0.55 0.08L-0.62 0.17L-0.4 0.13Z', '#f7f9ff') +
        p.fill('M-0.46 0.06C-0.34 -0.02 -0.18 -0.02 -0.02 0.02C0.08 -0.14 0.22 -0.2 0.34 -0.14C0.4 -0.11 0.43 -0.07 0.44 -0.03L0.44 0.03C0.42 0.16 0.3 0.24 0.12 0.24C-0.06 0.24 -0.26 0.18 -0.46 0.06Z', '#ffffff') +
        p.fill('M0.43 -0.05L0.53 -0.01L0.43 0.03Z', PAL.orange, { lw: p.lw * 0.6 }) +
        p.fill('M-0.1 0.04C-0.22 -0.16 -0.18 -0.42 0.02 -0.54C0 -0.34 0.1 -0.18 0.17 -0.01Z', '#ffffff') +
        p.line('M-0.06 -0.1C-0.02 -0.2 0.02 -0.26 0.04 -0.3M0.02 -0.04C0.04 -0.12 0.08 -0.18 0.1 -0.22', '#c9d3ea', 0.02) +
        p.shade('M-0.4 0.08C-0.2 0.16 0.1 0.2 0.3 0.12C0.2 0.22 0 0.26 -0.2 0.2Z', 0.08) +
        p.flat(uCircle(0.32, -0.08, 0.028), INK) +
        branch
      )
    },
  },
  {
    id: 'cross',
    label: 'Cross',
    draw: (p, o) =>
      p.fill('M-0.08 -0.5H0.08V-0.23H0.3V-0.09H0.08V0.5H-0.08V-0.09H-0.3V-0.23H-0.08Z', o.color ?? '#c68a4e') +
      p.shade('M0.02 -0.5H0.08V-0.23H0.3V-0.09H0.08V0.5H0.02Z', 0.14) +
      p.line('M-0.03 -0.44V-0.28M-0.03 0V0.44M-0.24 -0.16H-0.12', '#fff', 0.025, 0.55),
  },
  {
    id: 'bible',
    label: 'Open Bible',
    draw: (p) => {
      let text = ''
      for (let i = 0; i < 4; i++) {
        const v = -0.12 + i * 0.08
        text += `M-0.38 ${v + 0.02}Q-0.22 ${v - 0.03} -0.08 ${v + 0.02}M0.08 ${v + 0.02}Q0.22 ${v - 0.03} 0.38 ${v + 0.02}`
      }
      return (
        p.fill('M0 -0.14C-0.2 -0.28 -0.42 -0.28 -0.52 -0.22V0.38C-0.42 0.32 -0.2 0.32 0 0.44C0.2 0.32 0.42 0.32 0.52 0.38V-0.22C0.42 -0.28 0.2 -0.28 0 -0.14Z', '#8c2f39') +
        p.fill('M0 -0.22C-0.2 -0.36 -0.38 -0.36 -0.46 -0.3V0.28C-0.38 0.22 -0.2 0.22 0 0.34C0.2 0.22 0.38 0.22 0.46 0.28V-0.3C0.38 -0.36 0.2 -0.36 0 -0.22Z', '#fff8e8') +
        p.shade('M0 -0.22C0.2 -0.36 0.38 -0.36 0.46 -0.3V0.28C0.38 0.22 0.2 0.22 0 0.34Z', 0.06) +
        p.line(text, '#b9ad97', 0.018) +
        p.line('M0 -0.22V0.34', INK, 0.02, 0.6) +
        p.fill('M-0.25 -0.28H-0.21V-0.2H-0.17V-0.16H-0.21V-0.02H-0.25V-0.16H-0.29V-0.2H-0.25Z', PAL.gold, { lw: p.lw * 0.4 }) +
        p.fill('M0.02 0.33L0.02 0.5L0.07 0.45L0.12 0.5L0.12 0.28Z', PAL.red, { lw: p.lw * 0.6 })
      )
    },
  },
  {
    id: 'candle',
    label: 'Candle',
    draw: (p) =>
      p.flat(uCircle(0, -0.3, 0.2), PAL.yellow, 0.3) +
      p.fill(uRect(-0.11, -0.12, 0.22, 0.58, 0.03), '#fff6e0') +
      p.fill('M-0.11 -0.08Q-0.11 -0.12 -0.07 -0.12H0.07Q0.11 -0.12 0.11 -0.08V0Q0.06 0.06 0.04 -0.02Q0 0.1 -0.03 -0.02Q-0.08 0.04 -0.11 -0.02Z', '#ffffff', { lw: p.lw * 0.6 }) +
      p.line('M0 -0.12V-0.18', INK, 0.02) +
      p.sub(0, -0.3, 0.26).fill(FLAME, PAL.orange) +
      p.sub(0, -0.27, 0.15).flat(FLAME, PAL.yellow),
  },
  {
    id: 'star-bethlehem',
    label: 'Star of Bethlehem',
    draw: (p) =>
      p.flat(uCircle(0, -0.08, 0.3), PAL.yellow, 0.3) +
      p.fill('M0 -0.44Q0.05 -0.13 0.36 -0.08Q0.05 -0.03 0 0.56Q-0.05 -0.03 -0.36 -0.08Q-0.05 -0.13 0 -0.44Z', PAL.gold) +
      p.sub(0, -0.08, 0.4, 45).fill(SPARKLE, '#fff3c4', { lw: p.lw * 0.6 }) +
      p.line('M0 -0.36V-0.14', '#fff', 0.03, 0.8),
  },
  {
    id: 'tomb',
    label: 'Empty tomb',
    draw: (p) => {
      let rays = ''
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.32
        rays += `M-0.06 0.1L${(-0.06 + Math.cos(a) * 0.6).toFixed(3)} ${(0.1 + Math.sin(a) * 0.6).toFixed(3)}`
      }
      return (
        p.line(rays, PAL.yellow, 0.05, 0.45) +
        p.fill('M-0.5 0.42C-0.47 -0.08 -0.22 -0.34 0.04 -0.34C0.3 -0.34 0.5 -0.08 0.5 0.42Z', '#b8b0a4') +
        p.shade('M0.2 -0.3C0.38 -0.2 0.5 0 0.5 0.42H0.34C0.36 0.1 0.3 -0.12 0.2 -0.3Z', 0.12) +
        p.fill('M-0.2 0.42V0.08C-0.2 -0.07 0.08 -0.07 0.08 0.08V0.42Z', '#fff4c4') +
        p.flat('M-0.2 0.42V0.08C-0.2 -0.07 0.08 -0.07 0.08 0.08V0.42Z', PAL.yellow, 0.4) +
        p.fill(uCircle(0.33, 0.25, 0.17), '#9d958a') +
        p.line('M0.24 0.18C0.28 0.12 0.34 0.11 0.39 0.13', '#fff', 0.03, 0.5) +
        p.fill('M-0.52 0.42C-0.3 0.36 0.3 0.36 0.52 0.42V0.48H-0.52Z', PAL.green)
      )
    },
  },
  {
    id: 'fish',
    label: 'Fish',
    draw: (p, o) =>
      p.fill('M0.26 0L0.5 -0.2V0.2Z', o.color ?? '#5aa9e6') +
      p.fill('M-0.36 0C-0.22 -0.24 0.16 -0.24 0.32 0C0.16 0.24 -0.22 0.24 -0.36 0Z', o.color ?? '#5aa9e6') +
      p.shade('M-0.36 0C-0.22 0.24 0.16 0.24 0.32 0C0.1 0.12 -0.16 0.12 -0.36 0Z', 0.12) +
      p.line('M0 -0.12Q0.06 0 0 0.12M0.1 -0.1Q0.16 0 0.1 0.1', '#ffffff', 0.02, 0.6) +
      p.flat(uCircle(-0.2, -0.04, 0.035), INK) +
      p.hl(uCircle(-0.21, -0.05, 0.012), 0.9),
  },
  {
    id: 'bread',
    label: 'Loaf of bread',
    draw: (p) =>
      p.fill('M-0.46 0.18C-0.5 -0.1 -0.3 -0.26 0 -0.26C0.3 -0.26 0.5 -0.1 0.46 0.18Z', '#d9964c') +
      p.shade('M-0.46 0.18C-0.3 0.1 0.3 0.1 0.46 0.18Z', 0.15) +
      p.line('M-0.24 -0.06L-0.14 -0.18M-0.04 -0.04L0.06 -0.18M0.16 -0.04L0.26 -0.16', '#8a5423', 0.03) +
      p.line('M-0.34 -0.06C-0.3 -0.14 -0.22 -0.2 -0.12 -0.22', '#ffe2b3', 0.04, 0.7),
  },
  {
    id: 'basket',
    label: 'Basket of loaves and fishes',
    draw: (p) => {
      const P2 = p.sub(-0.14, -0.14, 0.4)
      const F = p.sub(0.16, -0.16, 0.45, -24)
      return (
        p.cord('M-0.34 -0.02C-0.34 -0.44 0.34 -0.44 0.34 -0.02', PAL.brown, 0.05) +
        (P2.fill('M-0.46 0.18C-0.5 -0.1 -0.3 -0.26 0 -0.26C0.3 -0.26 0.5 -0.1 0.46 0.18Z', '#d9964c') + P2.line('M-0.2 -0.06L-0.1 -0.18M0.04 -0.06L0.14 -0.18', '#8a5423', 0.04)) +
        (F.fill('M0.26 0L0.5 -0.2V0.2Z', '#5aa9e6') + F.fill('M-0.36 0C-0.22 -0.24 0.16 -0.24 0.32 0C0.16 0.24 -0.22 0.24 -0.36 0Z', '#5aa9e6') + F.flat(uCircle(-0.2, -0.04, 0.04), INK)) +
        p.fill('M-0.46 -0.04H0.46L0.36 0.42H-0.36Z', '#c68a4e') +
        p.line('M-0.42 0.1H0.42M-0.39 0.24H0.39M-0.2 -0.04L-0.16 0.42M0 -0.04V0.42M0.2 -0.04L0.16 0.42', '#8a5423', 0.02, 0.8)
      )
    },
  },
  {
    id: 'ark',
    label: "Noah's ark",
    draw: (p) =>
      p.cord('M0.2 -0.2V-0.48', '#f4c542', 0.06) +
      p.fill(uEllipse(0.25, -0.5, 0.09, 0.05), '#f4c542') +
      p.line('M0.2 -0.53L0.19 -0.6M0.26 -0.54L0.27 -0.61', INK, 0.015) +
      p.flat(uCircle(0.2, -0.36, 0.02), '#a0673a') +
      p.flat(uCircle(0.21, -0.28, 0.018), '#a0673a') +
      p.flat(uCircle(0.28, -0.51, 0.012), INK) +
      p.fill(uRect(-0.3, -0.26, 0.6, 0.3, 0.02), '#e0b98a') +
      p.fill('M-0.37 -0.24L0 -0.44L0.37 -0.24Z', '#9b4b2f') +
      p.fill(uRect(-0.2, -0.18, 0.12, 0.1, 0.01), '#5b3a22', { lw: p.lw * 0.6 }) +
      p.fill(uRect(0.08, -0.18, 0.12, 0.1, 0.01), '#5b3a22', { lw: p.lw * 0.6 }) +
      p.fill('M-0.54 0.02H0.54L0.42 0.3Q0.4 0.36 0.32 0.36H-0.32Q-0.4 0.36 -0.42 0.3Z', '#a0673a') +
      p.line('M-0.5 0.12H0.5M-0.46 0.22H0.46', '#6e4526', 0.018, 0.9) +
      p.line('M-0.54 0.4Q-0.44 0.34 -0.34 0.4T-0.14 0.4T0.06 0.4T0.26 0.4T0.46 0.4', PAL.blue, 0.035),
  },
  {
    id: 'sheep',
    label: 'Sheep',
    draw: (p) =>
      p.line('M-0.2 0.2V0.42M-0.06 0.22V0.44M0.1 0.22V0.44M0.22 0.2V0.42', '#4a3f4f', 0.05) +
      p.fill(uScallop(-0.02, 0.04, 0.36, 0.24, 11, 0.32), '#ffffff') +
      p.shade('M-0.36 0.1C-0.2 0.26 0.2 0.28 0.34 0.12C0.3 0.24 0.14 0.3 -0.02 0.3C-0.2 0.3 -0.32 0.22 -0.36 0.1Z', 0.08) +
      p.fill(uEllipse(0.4, -0.06, 0.07, 0.035), '#4a3f4f') +
      p.fill(uEllipse(0.34, -0.02, 0.11, 0.14), '#4a3f4f') +
      p.fill(uScallop(0.33, -0.15, 0.09, 0.05, 6, 0.4), '#ffffff', { lw: p.lw * 0.7 }) +
      p.flat(uCircle(0.31, -0.03, 0.022), '#ffffff') +
      p.flat(uCircle(0.4, -0.03, 0.022), '#ffffff') +
      p.flat(uCircle(0.31, -0.03, 0.011), INK) +
      p.flat(uCircle(0.4, -0.03, 0.011), INK),
  },
  {
    id: 'lion',
    label: 'Lion',
    draw: (p) =>
      p.fill(uScallop(0, 0, 0.46, 0.46, 12, 0.28), '#e8923a') +
      p.fill(uCircle(-0.2, -0.22, 0.08), '#f6c46b') +
      p.fill(uCircle(0.2, -0.22, 0.08), '#f6c46b') +
      p.fill(uCircle(0, 0.04, 0.29), '#f6c46b') +
      p.flat(uEllipse(0, 0.14, 0.14, 0.1), '#fff1d6') +
      p.flat(uCircle(-0.1, -0.04, 0.035), INK) +
      p.flat(uCircle(0.1, -0.04, 0.035), INK) +
      p.hl(uCircle(-0.11, -0.05, 0.012), 0.9) +
      p.hl(uCircle(0.09, -0.05, 0.012), 0.9) +
      p.fill('M-0.05 0.06H0.05L0 0.11Z', '#6b3f2a', { lw: p.lw * 0.5 }) +
      p.line('M0 0.11V0.15M-0.07 0.16Q-0.035 0.2 0 0.15Q0.035 0.2 0.07 0.16', INK, 0.02) +
      p.flat(uEllipse(-0.2, 0.08, 0.05, 0.03), PAL.red, 0.25) +
      p.flat(uEllipse(0.2, 0.08, 0.05, 0.03), PAL.red, 0.25),
  },
  {
    id: 'sling',
    label: "David's sling",
    draw: (p) =>
      p.line('M-0.46 -0.1A0.52 0.52 0 0 1 0.34 -0.5', '#ffffff', 0.03, 0.7) +
      p.line('M-0.4 0.06A0.46 0.46 0 0 1 0.44 -0.34', '#ffffff', 0.02, 0.5) +
      p.cord('M0 0.5C-0.22 0.2 -0.26 -0.2 -0.07 -0.34', '#8a5a2b', 0.03) +
      p.cord('M0 0.5C0.18 0.2 0.22 -0.2 0.07 -0.34', '#8a5a2b', 0.03) +
      p.fill(uEllipse(0, -0.36, 0.12, 0.07), '#a8703a') +
      p.fill(uCircle(0, -0.42, 0.075), '#9ba1ad'),
  },
  {
    id: 'stone',
    label: 'Smooth stone',
    draw: (p) => p.fill('M-0.36 0.1C-0.4 -0.16 -0.14 -0.3 0.1 -0.28C0.34 -0.26 0.42 -0.06 0.36 0.12C0.3 0.28 0.08 0.32 -0.12 0.3C-0.26 0.28 -0.34 0.22 -0.36 0.1Z', '#9ba1ad') + p.line('M-0.2 -0.12C-0.12 -0.18 0 -0.2 0.1 -0.18', '#fff', 0.04, 0.6),
  },
  {
    id: 'harp',
    label: 'Harp',
    draw: (p) => {
      let strings = ''
      for (const u of [-0.2, -0.08, 0.04, 0.16, 0.26]) {
        const top = -0.36 + (u + 0.3) * 0.02 - Math.sin(((u + 0.3) / 0.64) * Math.PI) * 0.06
        const bottom = -0.4 + (0.34 - u) * (0.86 / 0.64)
        strings += `M${u} ${top.toFixed(3)}V${bottom.toFixed(3)}`
      }
      return p.line(strings, '#fff4c4', 0.012) + p.cord('M0.34 -0.4L-0.3 0.46', '#c98a2e', 0.08) + p.cord('M-0.3 0.46V-0.32', PAL.gold, 0.06) + p.cord('M-0.3 -0.32C-0.14 -0.5 0.06 -0.24 0.34 -0.4', PAL.gold, 0.06)
    },
  },
  {
    id: 'staff',
    label: "Shepherd's staff",
    draw: (p) => p.cord('M0.12 0.5V-0.26C0.12 -0.48 -0.22 -0.5 -0.22 -0.3', PAL.brown, 0.06),
  },
  {
    id: 'tablets',
    label: 'Stone tablets',
    draw: (p) => {
      const lines = (u: number) => `M${u + 0.06} -0.16H${u + 0.3}M${u + 0.06} -0.04H${u + 0.3}M${u + 0.06} 0.08H${u + 0.3}M${u + 0.06} 0.2H${u + 0.24}`
      return (
        p.fill('M-0.46 0.44V-0.2A0.22 0.22 0 0 1 -0.02 -0.2V0.44Z', '#cfc9bf') +
        p.fill('M0.02 0.44V-0.2A0.22 0.22 0 0 1 0.46 -0.2V0.44Z', '#cfc9bf') +
        p.line(lines(-0.44) + lines(0.04), INK, 0.02, 0.45) +
        p.line('M-0.38 -0.28C-0.32 -0.36 -0.24 -0.38 -0.18 -0.38', '#fff', 0.03, 0.6)
      )
    },
  },
  {
    id: 'whale',
    label: 'Whale',
    draw: (p) =>
      p.line('M0.12 -0.3C0.08 -0.44 0 -0.48 -0.06 -0.46M0.12 -0.3C0.16 -0.44 0.24 -0.48 0.3 -0.46M0.12 -0.3V-0.48', PAL.sky, 0.035) +
      p.fill('M-0.44 0.1L-0.6 -0.1L-0.54 0.12L-0.62 0.3Z', '#4f8fd6') +
      p.fill('M-0.5 0.1C-0.5 -0.2 -0.2 -0.34 0.1 -0.3C0.36 -0.26 0.5 -0.06 0.46 0.12C0.42 0.28 0.2 0.34 -0.1 0.32C-0.3 0.3 -0.44 0.24 -0.5 0.1Z', '#4f8fd6') +
      p.flat('M-0.36 0.18C-0.16 0.3 0.24 0.3 0.42 0.16C0.36 0.28 0.2 0.32 -0.1 0.32C-0.24 0.31 -0.32 0.26 -0.36 0.18Z', '#bfe0ff') +
      p.flat(uCircle(0.26, -0.04, 0.035), INK) +
      p.line('M0.16 0.08Q0.28 0.14 0.38 0.06', INK, 0.02) +
      p.hl('M-0.2 -0.2C-0.1 -0.26 0 -0.27 0.08 -0.26C0 -0.23 -0.1 -0.2 -0.2 -0.2Z', 0.5),
  },
  {
    id: 'christmas-tree',
    label: 'Christmas tree',
    draw: (p) =>
      p.fill(uRect(-0.07, 0.34, 0.14, 0.14), PAL.brown) +
      p.fill('M0 -0.42L0.26 -0.12H0.14L0.36 0.12H0.2L0.44 0.36H-0.44L-0.2 0.12H-0.36L-0.14 -0.12H-0.26Z', '#2f9e5b') +
      p.shade('M0 -0.42L0.26 -0.12H0.14L0.36 0.12H0.2L0.44 0.36H0.06Z', 0.12) +
      p.line('M-0.2 -0.02Q0 0.06 0.2 -0.04M-0.3 0.24Q0 0.32 0.3 0.22', PAL.gold, 0.02) +
      p.fill(uCircle(-0.12, 0.02, 0.04), PAL.red, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.14, 0.12, 0.04), PAL.blue, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(-0.2, 0.28, 0.04), PAL.gold, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.22, 0.3, 0.04), PAL.red, { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.04, -0.18, 0.035), PAL.gold, { lw: p.lw * 0.5 }) +
      p.fill(uRoundStar(0, -0.44, 0.11, 0.05, 5, -90, 0.2), PAL.gold, { lw: p.lw * 0.7 }),
  },
  {
    id: 'candy-cane',
    label: 'Candy cane',
    draw: (p) => {
      const d = 'M0.08 0.5V-0.2C0.08 -0.44 -0.24 -0.44 -0.24 -0.22'
      const w = 0.13 * p.pl.s
      return p.cord(d, '#ffffff', 0.13) + `<path d="${p.p(d)}" fill="none" stroke="${PAL.red}" stroke-width="${(w * 0.98).toFixed(1)}" stroke-dasharray="${(w * 0.5).toFixed(1)} ${(w * 0.6).toFixed(1)}"/>`
    },
  },
  {
    id: 'snowman',
    label: 'Snowman',
    draw: (p) =>
      p.line('M-0.18 0.06L-0.44 -0.12M0.18 0.06L0.44 -0.14', PAL.brown, 0.03) +
      p.fill(uCircle(0, 0.24, 0.25), '#ffffff') +
      p.fill(uCircle(0, -0.1, 0.18), '#ffffff') +
      p.fill('M-0.18 0.04Q0 0.12 0.18 0.04L0.2 0.1Q0 0.18 -0.2 0.1Z', PAL.red) +
      p.fill('M0.1 0.08L0.2 0.28L0.06 0.26Z', PAL.red) +
      p.fill(uRect(-0.2, -0.29, 0.4, 0.05, 0.02), '#2f2a45') +
      p.fill(uRect(-0.12, -0.5, 0.24, 0.22, 0.02), '#2f2a45') +
      p.flat(uCircle(-0.06, -0.14, 0.022), INK) +
      p.flat(uCircle(0.06, -0.14, 0.022), INK) +
      p.fill('M0 -0.09L0.16 -0.06L0 -0.04Z', PAL.orange, { lw: p.lw * 0.5 }) +
      p.flat(uCircle(0, 0.2, 0.025), INK) +
      p.flat(uCircle(0, 0.3, 0.025), INK),
  },
  {
    id: 'pumpkin',
    label: 'Pumpkin',
    draw: (p) =>
      p.cord('M0 -0.24C0 -0.34 0.04 -0.4 0.1 -0.42', '#6b8f3a', 0.06) +
      p.fill(uEllipse(0, 0.08, 0.46, 0.34), PAL.orange) +
      p.line('M0 -0.25Q-0.16 0.08 0 0.42M0 -0.25Q0.16 0.08 0 0.42M-0.22 -0.2Q-0.4 0.08 -0.2 0.38M0.22 -0.2Q0.4 0.08 0.2 0.38', '#c96a1c', 0.025) +
      p.fill('M0.06 -0.3C0.2 -0.44 0.34 -0.36 0.3 -0.3C0.22 -0.24 0.12 -0.26 0.06 -0.3Z', PAL.green),
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    draw: (p, o) => {
      const r = scatterRng(o.seed ?? 'fw')
      let out = ''
      const bursts: [number, number, number, string][] = [[-0.12, -0.06, 0.34, o.color ?? PAL.gold], [0.26, 0.2, 0.2, PAL.pink], [0.28, -0.3, 0.16, PAL.sky]]
      for (const [u, v, rr, c] of bursts) {
        let d = ''
        const n = 12
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r() * 0.2
          d += `M${(u + Math.cos(a) * rr * 0.3).toFixed(3)} ${(v + Math.sin(a) * rr * 0.3).toFixed(3)}L${(u + Math.cos(a) * rr).toFixed(3)} ${(v + Math.sin(a) * rr).toFixed(3)}`
        }
        out += p.cord(d, c, 0.025)
        for (let i = 0; i < 12; i += 2) {
          const a = (i / 12) * Math.PI * 2
          out += p.flat(uCircle(u + Math.cos(a) * rr * 1.12, v + Math.sin(a) * rr * 1.12, 0.02), c)
        }
      }
      return out
    },
  },
  {
    id: 'party-popper',
    label: 'Party popper',
    draw: (p, o) => {
      const r = scatterRng(o.seed ?? 'pp')
      let bits = ''
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 4 + (r() - 0.5) * 1.3
        const d = 0.22 + r() * 0.36
        const u = -0.02 + Math.cos(a) * d
        const v = 0.02 + Math.sin(a) * d - 0.1
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        bits += i % 3 === 0 ? p.flat(uCircle(u, v, 0.025), c) : p.sub(u, v, 0.08, r() * 180).flat(uRect(-0.5, -0.2, 1, 0.4), c)
      }
      return (
        bits +
        p.fill('M-0.44 0.46L-0.12 -0.06L0.06 0.14Z', o.color ?? PAL.purple) +
        p.line('M-0.32 0.26L-0.16 0.34M-0.24 0.12L-0.04 0.22', PAL.gold, 0.04) +
        p.fill(uEllipse(-0.03, 0.04, 0.1, 0.05), '#6b4fd1')
      )
    },
  },
  {
    id: 'party-hat',
    label: 'Party hat',
    draw: (p, o) =>
      p.fill('M-0.3 0.4L0 -0.4L0.3 0.4Z', o.color ?? PAL.blue) +
      p.line('M-0.18 0.08L0.12 0.2M-0.08 -0.18L0.06 -0.12M-0.26 0.3L0.2 0.38', o.color2 ?? PAL.gold, 0.05) +
      p.fill(uCircle(0, -0.42, 0.08), PAL.gold) +
      p.fill(uRect(-0.34, 0.36, 0.68, 0.1, 0.05), '#ffffff'),
  },
  {
    id: 'santa-hat',
    label: 'Santa hat',
    draw: (p) =>
      p.fill('M-0.44 0.28C-0.4 -0.1 -0.2 -0.34 0.1 -0.38C0.3 -0.4 0.42 -0.28 0.46 -0.1C0.36 -0.2 0.24 -0.2 0.2 -0.1C0.3 0.02 0.36 0.16 0.4 0.28Z', PAL.red) +
      p.shade('M0.2 -0.1C0.3 0.02 0.36 0.16 0.4 0.28H0.16C0.18 0.12 0.18 0 0.2 -0.1Z', 0.14) +
      p.fill(uRect(-0.48, 0.2, 0.94, 0.17, 0.085), '#ffffff') +
      p.fill(uCircle(0.46, -0.1, 0.1), '#ffffff'),
  },
  {
    id: 'confetti',
    label: 'Confetti',
    draw: (p, o) => {
      const r = scatterRng(o.seed ?? 'confetti')
      let out = ''
      for (let i = 0; i < 22; i++) {
        const u = (r() - 0.5) * 0.96
        const v = (r() - 0.5) * 0.96
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const k = r()
        if (k < 0.45) out += p.sub(u, v, 0.1, r() * 180).fill(uRect(-0.5, -0.22, 1, 0.44, 0.06), c, { lw: p.lw * 0.4 })
        else if (k < 0.75) out += p.fill(uCircle(u, v, 0.025), c, { lw: p.lw * 0.4 })
        else out += p.sub(u, v, 0.12, r() * 180).line('M-0.5 0Q-0.25 -0.4 0 0T0.5 0', c, 0.18)
      }
      return out
    },
  },
  {
    id: 'book',
    label: 'Book',
    draw: (p, o) =>
      p.fill(uRect(-0.36, 0.14, 0.72, 0.12, 0.02), '#fff8e8') +
      p.fill(uRect(-0.4, -0.3, 0.8, 0.46, 0.04), o.color ?? PAL.blue) +
      p.fill(uRect(-0.4, 0.14, 0.8, 0.16, 0.04), o.color ?? PAL.blue) +
      p.flat(uRect(-0.34, 0.16, 0.7, 0.07, 0.01), '#fff8e8') +
      p.flat(uRect(-0.2, -0.2, 0.4, 0.08, 0.02), '#ffffff', 0.7) +
      p.line('M-0.3 -0.24V0.08', '#fff', 0.03, 0.4),
  },
  {
    id: 'books',
    label: 'Stack of books',
    draw: (p) => {
      const book = (v: number, w: number, c: string, du: number) =>
        p.fill(uRect(-w / 2 + du, v, w, 0.2, 0.03), c) + p.flat(uRect(-w / 2 + du + 0.04, v + 0.13, w - 0.06, 0.04), '#fff8e8') + p.flat(uRect(du - 0.06, v + 0.05, 0.14, 0.04), '#ffffff', 0.6)
      return book(0.24, 0.84, PAL.red, 0) + book(0.02, 0.74, PAL.green, 0.05) + book(-0.2, 0.64, PAL.blue, -0.03) + book(-0.42, 0.56, PAL.gold, 0.04)
    },
  },
  {
    id: 'pencil',
    label: 'Pencil',
    draw: (p) => {
      const q = p.sub(0, 0, 1, -32)
      return (
        q.fill('M0.26 -0.07L0.47 0L0.26 0.07Z', '#f2d0a4') +
        q.flat('M0.4 -0.023L0.47 0L0.4 0.023Z', INK) +
        q.fill(uRect(-0.34, -0.07, 0.6, 0.14), PAL.yellow) +
        q.line('M-0.34 0H0.26', '#e0a800', 0.02) +
        q.fill(uRect(-0.42, -0.07, 0.09, 0.14), '#b7bcc8') +
        q.fill('M-0.42 -0.07H-0.48Q-0.52 -0.07 -0.52 -0.03V0.03Q-0.52 0.07 -0.48 0.07H-0.42Z', PAL.pink)
      )
    },
  },
  {
    id: 'laptop',
    label: 'Laptop',
    draw: (p) =>
      p.fill(uRect(-0.36, -0.4, 0.72, 0.46, 0.04), '#3a3550') +
      p.flat(uRect(-0.31, -0.35, 0.62, 0.36, 0.02), '#8fd3ff') +
      p.flat('M-0.31 -0.35H0L-0.31 -0.05Z', '#ffffff', 0.3) +
      p.fill('M-0.46 0.06H0.46L0.5 0.16Q0.5 0.19 0.46 0.19H-0.46Q-0.5 0.19 -0.5 0.16Z', '#b7bcc8') +
      p.flat(uRect(-0.08, 0.08, 0.16, 0.03, 0.01), INK, 0.35),
  },
  {
    id: 'coffee',
    label: 'Mug of coffee',
    draw: (p, o) =>
      p.line('M-0.12 -0.24C-0.18 -0.32 -0.06 -0.38 -0.12 -0.48M0.06 -0.24C0 -0.32 0.12 -0.38 0.06 -0.48', '#c9ccd6', 0.035, 0.8) +
      p.cord('M0.2 -0.06C0.42 -0.08 0.42 0.24 0.2 0.22', o.color ?? '#ffffff', 0.05) +
      p.fill(uRect(-0.3, -0.16, 0.5, 0.52, 0.07), o.color ?? '#ffffff') +
      p.flat(uEllipse(-0.05, -0.13, 0.21, 0.035), '#7a4a26') +
      p.fill(uRoundStar(-0.05, 0.12, 0.08, 0.04, 5, -90, 0.2), PAL.red, { lw: p.lw * 0.4 }) +
      p.shade(uRect(0.08, -0.12, 0.1, 0.46, 0.04), 0.1),
  },
  {
    id: 'alarm',
    label: 'Alarm clock',
    draw: (p, o) =>
      p.line('M-0.22 0.34L-0.3 0.46M0.22 0.34L0.3 0.46', INK, 0.04) +
      p.fill(uCircle(-0.25, -0.3, 0.11), o.color ?? PAL.red) +
      p.fill(uCircle(0.25, -0.3, 0.11), o.color ?? PAL.red) +
      p.fill(uCircle(0, 0.04, 0.37), o.color ?? PAL.red) +
      p.fill(uCircle(0, 0.04, 0.28), '#ffffff') +
      p.line('M0 0.04V-0.14M0 0.04L0.12 0.1', INK, 0.035) +
      p.flat(uCircle(0, 0.04, 0.03), INK) +
      p.line('M-0.12 -0.36C-0.06 -0.4 0.06 -0.4 0.12 -0.36', INK, 0.03),
  },
  {
    id: 'apple',
    label: 'Apple',
    draw: (p, o) =>
      p.cord('M0 -0.26C0 -0.36 0.03 -0.42 0.07 -0.46', PAL.brown, 0.04) +
      p.fill('M0.04 -0.32C0.16 -0.46 0.32 -0.44 0.34 -0.38C0.24 -0.28 0.12 -0.28 0.04 -0.32Z', PAL.green) +
      p.fill('M0 -0.26C0.2 -0.4 0.46 -0.28 0.44 0.02C0.42 0.3 0.2 0.44 0 0.36C-0.2 0.44 -0.42 0.3 -0.44 0.02C-0.46 -0.28 -0.2 -0.4 0 -0.26Z', o.color ?? PAL.red) +
      p.shade('M0.2 -0.3C0.4 -0.2 0.46 0.1 0.34 0.26C0.26 0.36 0.12 0.4 0 0.36C0.2 0.26 0.3 0 0.2 -0.3Z', 0.13) +
      p.hl(uEllipse(-0.22, -0.1, 0.05, 0.09), 0.6),
  },
  {
    id: 'grade',
    label: 'A+ paper',
    draw: (p) =>
      p.fill(uRect(-0.34, -0.44, 0.68, 0.88, 0.03), '#ffffff') +
      p.line('M-0.24 0.16H0.24M-0.24 0.26H0.24M-0.24 0.36H0.1', '#b9c3d6', 0.02) +
      p.line('M-0.28 -0.44V0.44', PAL.red, 0.012, 0.5) +
      lettering(p.sub(0, -0.14, 0.72), 'A+', PAL.red),
  },
  {
    id: 'lightbulb',
    label: 'Light bulb',
    draw: (p) => {
      let rays = ''
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI
        rays += `M${(Math.cos(a) * 0.4).toFixed(3)} ${(-0.12 + Math.sin(a) * 0.4).toFixed(3)}L${(Math.cos(a) * 0.5).toFixed(3)} ${(-0.12 + Math.sin(a) * 0.5).toFixed(3)}`
      }
      return (
        p.cord(rays, PAL.yellow, 0.03) +
        p.fill('M0 -0.42C0.2 -0.42 0.31 -0.28 0.31 -0.12C0.31 0.02 0.18 0.1 0.15 0.22H-0.15C-0.18 0.1 -0.31 0.02 -0.31 -0.12C-0.31 -0.28 -0.2 -0.42 0 -0.42Z', PAL.yellow) +
        p.line('M-0.06 0.2V0.04L0 -0.04L0.06 0.04V0.2', '#e0a800', 0.02) +
        p.fill(uRect(-0.14, 0.22, 0.28, 0.16, 0.03), '#b7bcc8') +
        p.line('M-0.13 0.28H0.13M-0.13 0.33H0.13', INK, 0.012, 0.5) +
        p.hl('M-0.2 -0.2C-0.18 -0.3 -0.1 -0.34 -0.04 -0.35C-0.1 -0.3 -0.16 -0.24 -0.2 -0.2Z', 0.8)
      )
    },
  },
  { id: 'question', label: 'Question mark', draw: (p, o) => lettering(p, '?', o.color ?? PAL.purple) },
  { id: 'exclaim', label: 'Exclamation mark', draw: (p, o) => lettering(p, '!', o.color ?? PAL.red) },
  {
    id: 'zzz',
    label: 'Zzz',
    draw: (p, o) => lettering(p.sub(-0.28, 0.26, 0.42), 'Z', o.color ?? PAL.blue) + lettering(p.sub(0.02, 0, 0.58), 'Z', o.color ?? PAL.blue) + lettering(p.sub(0.3, -0.3, 0.74), 'Z', o.color ?? PAL.blue),
  },
  { id: 'sweat', label: 'Sweat drop', draw: (p) => p.fill(DROP, '#9fdcff') + p.hl(uEllipse(-0.1, 0.12, 0.06, 0.1), 0.8) },
  {
    id: 'music',
    label: 'Music notes',
    draw: (p, o) => {
      const c = o.color ?? PAL.purple
      return (
        p.fill('M-0.22 -0.3L0.34 -0.46V-0.34L-0.22 -0.18Z', c) +
        p.line('M-0.2 -0.24V0.26M0.32 -0.4V0.12', INK, 0.05) +
        p.sub(-0.32, 0.28, 1, -20).fill(uEllipse(0, 0, 0.13, 0.09), c) +
        p.sub(0.2, 0.14, 1, -20).fill(uEllipse(0, 0, 0.13, 0.09), c)
      )
    },
  },
  { id: 'flame', label: 'Flame', draw: (p) => p.fill(FLAME, PAL.orange) + p.flat(FLAME_IN, PAL.yellow) + p.line('M-0.2 0.1C-0.22 0 -0.18 -0.08 -0.12 -0.14', '#fff', 0.03, 0.6) },
  {
    id: 'phone',
    label: 'Phone',
    draw: (p) =>
      p.fill(uRect(-0.2, -0.42, 0.4, 0.84, 0.08), '#2f2a45') +
      p.flat(uRect(-0.16, -0.34, 0.32, 0.64, 0.04), PAL.sky) +
      p.flat('M-0.16 -0.34H0.06L-0.16 -0.04Z', '#ffffff', 0.35) +
      p.flat(uCircle(0, -0.38, 0.015), '#8fa0c0'),
  },
  {
    id: 'check',
    label: 'Check mark',
    draw: (p, o) => p.fill(uCircle(0, 0, 0.46), o.color ?? PAL.green) + p.line('M-0.22 0.02L-0.06 0.18L0.24 -0.16', '#ffffff', 0.1) + p.line('M-0.3 -0.16C-0.26 -0.26 -0.18 -0.32 -0.1 -0.35', '#fff', 0.04, 0.6),
  },
  {
    id: 'egg',
    label: 'Painted egg',
    draw: (p, o) =>
      p.fill('M0 -0.46C0.24 -0.46 0.36 -0.1 0.36 0.12C0.36 0.34 0.2 0.46 0 0.46C-0.2 0.46 -0.36 0.34 -0.36 0.12C-0.36 -0.1 -0.24 -0.46 0 -0.46Z', o.color ?? PAL.lavender) +
      p.line('M-0.33 0.04L-0.24 -0.04L-0.12 0.04L0 -0.04L0.12 0.04L0.24 -0.04L0.33 0.04', o.color2 ?? '#ffffff', 0.045) +
      p.flat(uCircle(-0.12, 0.22, 0.045), PAL.gold) +
      p.flat(uCircle(0.1, 0.24, 0.045), PAL.pink) +
      p.flat(uCircle(0, -0.22, 0.04), PAL.mint) +
      p.hl(uEllipse(-0.16, -0.22, 0.04, 0.09), 0.6),
  },
  {
    id: 'letter',
    label: 'Love letter',
    draw: (p) =>
      p.fill(uRect(-0.44, -0.28, 0.88, 0.56, 0.04), '#fffaf0') +
      p.line('M-0.42 -0.25L0 0.06L0.42 -0.25M-0.42 0.26L-0.12 -0.02M0.42 0.26L0.12 -0.02', INK, 0.022, 0.7) +
      heart(p.sub(0, 0.04, 0.24), { color: PAL.red }),
  },
  {
    id: 'flag',
    label: 'Finish flag',
    draw: (p) => {
      const top = (u: number) => -0.46 + Math.sin((u + 0.3) * 6) * 0.04
      const bot = (u: number) => 0.02 + Math.sin((u + 0.3) * 6) * 0.04
      const cols = 6
      const rows = 3
      let checks = ''
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if ((i + j) % 2) continue
          const u0 = -0.3 + (i / cols) * 0.76
          const u1 = -0.3 + ((i + 1) / cols) * 0.76
          const v = (u: number, t: number) => top(u) + (bot(u) - top(u)) * t
          checks += uPoly([[u0, v(u0, j / rows)], [u1, v(u1, j / rows)], [u1, v(u1, (j + 1) / rows)], [u0, v(u0, (j + 1) / rows)]])
        }
      let outline = `M-0.3 ${top(-0.3).toFixed(3)}`
      for (let k = 1; k <= 8; k++) outline += `L${(-0.3 + (k / 8) * 0.76).toFixed(3)} ${top(-0.3 + (k / 8) * 0.76).toFixed(3)}`
      for (let k = 8; k >= 0; k--) outline += `L${(-0.3 + (k / 8) * 0.76).toFixed(3)} ${bot(-0.3 + (k / 8) * 0.76).toFixed(3)}`
      return p.cord('M-0.3 -0.5V0.5', '#8d93a1', 0.04) + p.fill(outline + 'Z', '#ffffff') + p.flat(checks, '#2f2a45')
    },
  },
  {
    id: 'crate',
    label: 'Wooden crate',
    draw: (p) =>
      p.fill(uRect(-0.4, -0.36, 0.8, 0.72, 0.02), '#d9a066') +
      p.line('M-0.4 -0.12H0.4M-0.4 0.12H0.4', '#9a6436', 0.02) +
      p.line('M-0.34 -0.3L0.34 0.3', '#b87c45', 0.06) +
      p.fill(uRect(-0.4, -0.36, 0.8, 0.08), '#c98d52', { lw: p.lw * 0.8 }) +
      p.fill(uRect(-0.4, 0.28, 0.8, 0.08), '#c98d52', { lw: p.lw * 0.8 }),
  },
  {
    id: 'giraffe',
    label: 'Giraffe',
    draw: (p) =>
      p.cord('M0 0.5C0 0.2 0.02 -0.06 0.04 -0.22', '#f4c542', 0.13) +
      p.flat(uCircle(-0.01, 0.26, 0.03), '#b8742a') +
      p.flat(uCircle(0.03, 0.06, 0.028), '#b8742a') +
      p.flat(uCircle(-0.02, -0.08, 0.025), '#b8742a') +
      p.line('M0.04 -0.34L0.02 -0.46M0.12 -0.34L0.14 -0.45', INK, 0.02) +
      p.fill(uCircle(0.02, -0.47, 0.03), '#b8742a', { lw: p.lw * 0.5 }) +
      p.fill(uCircle(0.14, -0.46, 0.03), '#b8742a', { lw: p.lw * 0.5 }) +
      p.sub(0.12, -0.28, 1, 12).fill(uEllipse(0, 0, 0.2, 0.1), '#f4c542') +
      p.flat(uCircle(0.14, -0.32, 0.02), INK) +
      p.flat(uCircle(0.28, -0.26, 0.012), INK),
  },
  {
    id: 'tree',
    label: 'Tree',
    draw: (p) =>
      p.fill('M-0.08 0.5L-0.06 0.08H0.06L0.08 0.5Z', PAL.brown) +
      p.fill(uScallop(0, -0.16, 0.42, 0.34, 9, 0.3), '#3fae5f') +
      p.flat(uScallop(-0.1, -0.24, 0.16, 0.12, 6, 0.3), '#6fd08a', 0.8) +
      p.shade('M0.1 0.1C0.3 0.06 0.44 -0.06 0.44 -0.16C0.38 -0.04 0.2 0.04 0 0.08Z', 0.12),
  },
  {
    id: 'manger',
    label: 'Manger',
    draw: (p) =>
      p.flat(uCircle(0, -0.1, 0.42), PAL.yellow, 0.28) +
      p.line('M-0.36 0.26L-0.18 0.5M0.36 0.26L0.18 0.5M-0.18 0.26L-0.36 0.5M0.18 0.26L0.36 0.5', '#6e4526', 0.04) +
      p.fill('M-0.3 -0.04L-0.36 -0.12L-0.24 -0.08L-0.18 -0.16L-0.1 -0.08L0 -0.16L0.1 -0.08L0.2 -0.16L0.26 -0.08L0.36 -0.12L0.3 -0.04Z', PAL.yellow) +
      p.fill(uEllipse(0.02, -0.08, 0.24, 0.1), '#fff8e8') +
      p.fill(uCircle(-0.2, -0.1, 0.085), '#f2c9a0') +
      p.line('M-0.24 -0.1Q-0.22 -0.08 -0.2 -0.1M-0.17 -0.1Q-0.15 -0.08 -0.13 -0.1', INK, 0.012) +
      p.line('M-0.08 -0.14Q0.02 -0.04 0.12 -0.14M0.02 -0.16Q0.12 -0.06 0.2 -0.14', '#e2d6bf', 0.015) +
      p.fill('M-0.46 -0.04H0.46L0.36 0.28H-0.36Z', '#a0673a') +
      p.line('M-0.42 0.08H0.42', '#6e4526', 0.018),
  },
  {
    id: 'water-wall',
    label: 'Wall of water',
    draw: (p) =>
      p.fill('M-0.3 0.5V-0.2C-0.3 -0.42 -0.1 -0.5 0.08 -0.44C0.26 -0.38 0.3 -0.2 0.2 -0.1C0.34 -0.12 0.36 0.02 0.3 0.1V0.5Z', '#3f8fd8') +
      p.flat('M-0.2 0.5V-0.16C-0.2 -0.3 -0.1 -0.36 0 -0.34C-0.06 -0.26 -0.08 -0.1 -0.06 0.5Z', '#7cc0f2', 0.7) +
      p.line('M0.08 -0.44C0.2 -0.36 0.2 -0.22 0.08 -0.2M0.2 -0.1C0.26 -0.04 0.24 0.04 0.16 0.06', '#ffffff', 0.04) +
      p.flat(uCircle(0.02, -0.28, 0.025), '#ffffff') +
      p.flat(uCircle(0.14, 0.0, 0.02), '#ffffff'),
  },
  {
    id: 'waves',
    label: 'Waves',
    draw: (p) =>
      p.fill('M-0.5 0.4V0Q-0.42 -0.12 -0.33 0Q-0.25 -0.12 -0.17 0Q-0.08 -0.12 0 0Q0.08 -0.12 0.17 0Q0.25 -0.12 0.33 0Q0.42 -0.12 0.5 0V0.4Z', '#3f8fd8') +
      p.line('M-0.46 0.1Q-0.38 0.04 -0.3 0.1M-0.12 0.12Q-0.04 0.06 0.04 0.12M0.22 0.1Q0.3 0.04 0.38 0.1', '#ffffff', 0.025, 0.8),
  },
  {
    id: 'shades',
    label: 'Sunglasses',
    draw: (p) =>
      p.line('M-0.5 -0.12L-0.42 -0.06M0.5 -0.12L0.42 -0.06', INK, 0.04) +
      p.fill('M-0.44 -0.14H-0.06Q-0.04 0.14 -0.24 0.16Q-0.42 0.14 -0.44 -0.14Z', '#1d1a2b') +
      p.fill('M0.44 -0.14H0.06Q0.04 0.14 0.24 0.16Q0.42 0.14 0.44 -0.14Z', '#1d1a2b') +
      p.line('M-0.06 -0.1Q0 -0.14 0.06 -0.1', INK, 0.05) +
      p.line('M-0.36 -0.08L-0.26 0.02M0.14 -0.08L0.24 0.02', '#ffffff', 0.025, 0.7),
  },
]

export const PROPS: Record<string, PropDef> = Object.fromEntries(P.map((d) => [d.id, d]))
export const PROP_IDS = P.map((d) => d.id)

/** Draws a prop centred at (x, y), `s` px across (its unit box), rotated/mirrored. */
export function drawProp(id: string, place: Place, o: PropOptions = {}): string {
  const def = PROPS[id]
  if (!def) return ''
  return def.draw(new Pen(place), o)
}
