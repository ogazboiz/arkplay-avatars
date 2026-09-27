/* Animation QA sheets: many avatars × clips on one PNG, framed the way sprite sheets frame
 * them (one box per clip, so a bob or a jump reads against a fixed ground line).
 *
 *   node scripts/anim-qa.ts <clip[,clip…]|all|core|emote|locomotion|rest|combat|idle> [who…] [--view side|front|back]
 *        [--frames 8] [--cell 150] [--tag name] [--onion] [--grid N] [--at 0..1]
 *
 * who: human (default) tall short heavy chibi old strong caped, any species id (cat, horse,
 *      snake, fish, slime, octopus, robot…), `plans` (one creature per body plan and gait),
 *      `bodies` (every humanoid variant), or r<seed> / c<seed> for random humanoids / creatures.
 * --onion overlays every frame of a clip in one cell (foot sliding and arcs show up at once).
 *
 * Writes out/anim-qa-<tag>.png (and .svg). Read the PNG: don't guess. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { CLIPS, addItem, applySpecies, buildModel, defaultDNA, frameContent, randomDNA, sampleAnim, setParam, type AvatarDNA, type View } from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'out')
mkdirSync(outDir, { recursive: true })

const args = process.argv.slice(2)
const flag = (name: string, d: string): string => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return d
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const onion = args.includes('--onion')
if (onion) args.splice(args.indexOf('--onion'), 1)
/** --grid N: lay every cell out in a grid N wide (with its own label) instead of one row per clip. */
const gridCols = Number(flag('grid', '0'))
const gridCells: string[] = []
const view = flag('view', 'side') as View
const frames = Number(flag('frames', '8'))
/** --at 0..1: one frame per clip, at this fraction of it (with --grid: one cell per avatar × clip). */
const at = Number(flag('at', '-1'))
const cell = Number(flag('cell', '150'))
const tag = flag('tag', 'qa').replace(/[^\w-]/g, '')
const clipArg = args.shift() ?? 'walk'
const whoArgs = args.length ? args : ['human']

const GROUPS: Record<string, (c: (typeof CLIPS)[number]) => boolean> = {
  all: () => true,
  core: (c) => c.tags.includes('core'),
  emote: (c) => c.tags.includes('emote'),
  locomotion: (c) => c.tags.includes('locomotion'),
  rest: (c) => c.tags.includes('rest'),
  combat: (c) => c.tags.includes('combat'),
  idle: (c) => c.tags.includes('idle') || c.name === 'idle',
}
const clipNames = GROUPS[clipArg] ? CLIPS.filter(GROUPS[clipArg]).map((c) => c.name) : clipArg.split(',')

const human = defaultDNA('humanoid', 7)
const body = (d: AvatarDNA, kv: [string, string, number][]) => kv.reduce((x, [s, k, v]) => setParam(x, s, k, v), d)
const HUMANS: Record<string, () => AvatarDNA> = {
  human: () => human,
  tall: () => body(human, [['body', 'height', 1], ['body', 'legs', 0.8]]),
  short: () => body(human, [['body', 'height', 0], ['body', 'legs', 0.3]]),
  heavy: () => body(human, [['body', 'build', 1], ['body', 'belly', 0.8], ['body', 'muscle', 0.3]]),
  chibi: () => body(human, [['body', 'headRatio', 1], ['body', 'height', 0.2]]),
  old: () => body(human, [['skin', 'age', 1]]),
  strong: () => body(human, [['body', 'muscle', 1], ['body', 'shoulders', 0.9]]),
  caped: () => addItem(setParam(setParam(human, 'hair', 'style', 'twintails'), 'hair', 'length', 0.9), 'cape'),
  pony: () => setParam(setParam(human, 'hair', 'style', 'high-pony'), 'hair', 'length', 0.9),
  winged: () => addItem(setParam(human, 'hair', 'style', 'long-wavy'), 'angel-wings'),
  skirt: () => addItem(addItem({ ...human, outfit: [] }, 'tshirt'), 'skirt'),
}
const PLANS = ['cat', 'horse', 'bunny', 'dragon', 'dino', 'penguin', 'owl', 'fish', 'snake', 'snail', 'bee', 'spider', 'slime', 'ghost', 'octopus', 'jelly', 'robot', 'bot-tv', 'drone', 'eastern-dragon']

function resolve(who: string): [string, AvatarDNA][] {
  if (who === 'plans') return PLANS.map((p) => [p, applySpecies(defaultDNA('creature', 7), p)])
  if (who === 'bodies') return Object.keys(HUMANS).map((k) => [k, HUMANS[k]()])
  if (HUMANS[who]) return [[who, HUMANS[who]()]]
  const r = /^([rc])(\d+)$/.exec(who)
  if (r) return [[who, randomDNA({ seed: Number(r[2]), kind: r[1] === 'r' ? 'humanoid' : 'creature' })]]
  return [[who, applySpecies(defaultDNA('creature', 7), who)]]
}

const avatars = whoArgs.flatMap(resolve)
const rows: string[] = []
const defs: string[] = []
let y = 0
let W = 0
const t0 = performance.now()
for (const [label, dna] of avatars) {
  const model = buildModel(dna, { view, quality: 'standard', background: false, frame: false })
  for (const name of clipNames) {
    const info = CLIPS.find((c) => c.name === name)
    if (!info || !info.kinds.includes(dna.kind)) continue
    const a = sampleAnim(model, name, { maxFrames: 48 })
    const box = a.box
    const side = Math.max(box.w, box.h) * 1.08
    const sq = { x: box.x + box.w / 2 - side / 2, y: box.y + box.h / 2 - side / 2, w: side, h: side }
    const k = cell / side
    const pick = onion
      ? a.frames
      : at >= 0
        ? [a.frames[Math.min(a.frames.length - 1, Math.round(at * (a.frames.length - 1)))]]
        : a.frames.filter((_, i) => a.frames.length <= frames || i % Math.ceil(a.frames.length / frames) === 0)
    const cols = onion ? 1 : pick.length
    let row = `<text x="6" y="${y + 14}" font-size="12" fill="#ddd" font-family="Arial">${label} · ${name} (${a.frames.length}f ${info.duration}s${info.loop ? ' loop' : ''}${a.clip?.travel ? ` travel ${Math.round(a.clip.travel)}` : ''})</text>`
    const cells = onion ? [pick] : pick.map((f) => [f])
    if (gridCols > 0) {
      for (const group of cells) {
        const f0 = group[0]
        const ground = `<line x1="${sq.x}" y1="0" x2="${sq.x + sq.w}" y2="0" stroke="#7fd1ff" stroke-width="${2 / k}" stroke-opacity="0.7"/>`
        const content = group.map((f, j) => (onion ? `<g opacity="${(0.25 + (0.75 * (j + 1)) / group.length).toFixed(2)}">${frameContent(f, sq)}</g>` : frameContent(f, sq))).join('')
        gridCells.push(`<rect width="${cell}" height="${cell}" fill="#2a2d38"/><g transform="scale(${k}) translate(${-sq.x} ${-sq.y})">${ground}${content}</g><text x="4" y="12" font-size="11" fill="#ddd" font-family="Arial">${label} · ${name} ${onion ? '' : f0.index}</text>`)
      }
      continue
    }
    cells.forEach((group, i) => {
      const x = i * (cell + 4)
      const ground = `<line x1="${sq.x}" y1="0" x2="${sq.x + sq.w}" y2="0" stroke="#7fd1ff" stroke-width="${2 / k}" stroke-opacity="0.7"/>`
      const content = group.map((f, j) => (onion ? `<g opacity="${(0.25 + (0.75 * (j + 1)) / group.length).toFixed(2)}">${frameContent(f, sq)}</g>` : frameContent(f, sq))).join('')
      row += `<g transform="translate(${x} ${y + 20})"><rect width="${cell}" height="${cell}" fill="#2a2d38"/><g transform="scale(${k}) translate(${-sq.x} ${-sq.y})">${ground}${content}</g><text x="4" y="${cell - 5}" font-size="10" fill="#9aa" font-family="Arial">${onion ? 'onion' : group[0].index}</text></g>`
    })
    W = Math.max(W, cols * (cell + 4))
    rows.push(row)
    y += cell + 26
  }
  // Defs fill up as frames are drawn: collect them after the model's last frame.
  defs.push(model.ctx.defs.toString())
}
if (gridCols > 0) {
  gridCells.forEach((c, i) => rows.push(`<g transform="translate(${(i % gridCols) * (cell + 4)} ${Math.floor(i / gridCols) * (cell + 4)})">${c}</g>`))
  W = Math.min(gridCells.length, gridCols) * (cell + 4)
  y = Math.ceil(gridCells.length / gridCols) * (cell + 4)
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(W, 300)}" height="${y}"><rect width="100%" height="100%" fill="#1b1d24"/>${defs.join('')}${rows.join('')}</svg>`
writeFileSync(join(outDir, `anim-qa-${tag}.svg`), svg)
const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng()
const file = join(outDir, `anim-qa-${tag}.png`)
writeFileSync(file, png)
console.log(`${rows.length} rows in ${Math.round(performance.now() - t0)} ms -> ${file}`)
