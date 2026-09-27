/* Renders the showcase images in docs/images/ from code, so every picture in the README is
 * reproducible: `npm run examples`. Free content only (paid items need the premium art). */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import {
  animatedSVG,
  applySpecies,
  defaultDNA,
  encodeShareCode,
  randomDNA,
  renderSVG,
  setParam,
  spriteSheet,
  type AvatarDNA,
  type RenderOptions,
} from '@arkplay/avatar-engine'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/images')
mkdirSync(OUT, { recursive: true })

let ids = 0
/** One avatar as a nested <svg> cell of a grid. */
function cell(dna: AvatarDNA, x: number, y: number, w: number, opts: RenderOptions = {}): string {
  const svg = renderSVG(dna, { crop: 'portrait', ...opts, idPrefix: `ex${ids++}`, title: false })
  return svg.replace(/^<svg\b[^>]*>/, (open) => open.replace(/\s(width|height)="[^"]*"/g, '').replace(/^<svg\b/, `<svg x="${x}" y="${y}" width="${w}" height="${w}"`))
}

function grid(cells: string[], cols: number, w: number, gap = 12): { svg: string; width: number } {
  const rows = Math.ceil(cells.length / cols)
  const width = cols * w + (cols + 1) * gap
  const height = rows * w + (rows + 1) * gap
  const body = cells.map((c, i) => c.replace(/x="0" y="0"/, `x="${gap + (i % cols) * (w + gap)}" y="${gap + Math.floor(i / cols) * (w + gap)}"`)).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`, width }
}

function png(name: string, svg: string, width: number): void {
  const out = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng()
  writeFileSync(path.join(OUT, name), out)
  console.log(`docs/images/${name}  ${(out.length / 1024).toFixed(0)} KB`)
}

const creature = (species: string, seed: number): AvatarDNA => randomDNA({ seed, kind: 'creature', species, freeOnly: true })
const human = (seed: number, theme?: string): AvatarDNA => randomDNA({ seed, kind: 'humanoid', theme, freeOnly: true })

// 1. Hero: a mix of humanoids and creatures.
{
  const avatars = [human(11, 'casual'), creature('fox', 2), human(23, 'fantasy'), creature('dragon', 4), human(35, 'scifi'), creature('slime', 6), human(47, 'sporty'), creature('robot', 8)]
  const { svg, width } = grid(avatars.map((d) => cell(d, 0, 0, 180, { crop: d.kind === 'creature' ? 'fit' : 'portrait' })), 4, 180)
  png('hero.png', svg, width)
}

// 2. Themes: one seed per theme.
{
  const themes = ['casual', 'formal', 'wizard', 'knight', 'pirate', 'punk', 'ninja', 'winter']
  const { svg, width } = grid(themes.map((t, i) => cell(human(100 + i, t), 0, 0, 150)), 8, 150)
  png('themes.png', svg, width)
}

// 3. Species: creature presets.
{
  const species = ['cat', 'bunny', 'owl', 'penguin', 'axolotl', 'octopus', 'ghost', 'bot-tv']
  const { svg, width } = grid(species.map((s, i) => cell(creature(s, 200 + i), 0, 0, 150, { crop: 'fit' })), 8, 150)
  png('species.png', svg, width)
}

// 4. Expressions on one avatar.
{
  // A clean face (no eyewear or facial hair) so every expression reads.
  const dna = setParam(setParam(defaultDNA('humanoid', 7), 'hair', 'style', 'bob'), 'hair', 'color', '#d2691e')
  const exprs = ['neutral', 'happy', 'laugh', 'wink', 'surprised', 'sad', 'angry', 'sleepy']
  const { svg, width } = grid(exprs.map((e) => cell(dna, 0, 0, 150, { crop: 'head', expression: e, background: false })), 8, 150)
  png('expressions.png', svg, width)
}

// 5. Views and crops of one avatar.
{
  const dna = human(31, 'sporty')
  const cells = [
    cell(dna, 0, 0, 200, { crop: 'fit', view: 'front' }),
    cell(dna, 0, 0, 200, { crop: 'fit', view: 'side' }),
    cell(dna, 0, 0, 200, { crop: 'fit', view: 'back' }),
    cell(dna, 0, 0, 200, { crop: 'bust' }),
    cell(dna, 0, 0, 200, { crop: 'head' }),
  ]
  const { svg, width } = grid(cells, 5, 200)
  png('views.png', svg, width)
}

// 6. A sprite sheet: walk and wave on one row each.
{
  const sheet = spriteSheet(creature('fox', 2), { anims: ['walk', 'wave'], cell: 128, fps: 8, view: 'side' })
  png('spritesheet.png', sheet.svg, sheet.width)
  writeFileSync(path.join(OUT, 'spritesheet.json'), JSON.stringify(sheet.meta, null, 2) + '\n')
}

// 7. An animated SVG (plays in browsers, including in the README).
{
  const svg = animatedSVG(human(11, 'casual'), { anim: 'wave', crop: 'fit', fps: 12, maxFrames: 24, size: 240 })
  writeFileSync(path.join(OUT, 'wave.svg'), svg)
  console.log(`docs/images/wave.svg  ${(svg.length / 1024).toFixed(0)} KB`)
}

// 8. Editing: the default avatar, then the same avatar with a few params changed.
{
  const base = defaultDNA('humanoid', 7)
  let edited = setParam(base, 'hair', 'style', 'bob')
  edited = setParam(edited, 'hair', 'color', '#d2691e')
  const fox = applySpecies(defaultDNA('creature', 7), 'fox')
  const { svg, width } = grid([cell(base, 0, 0, 160), cell(edited, 0, 0, 160), cell(fox, 0, 0, 160, { crop: 'fit' })], 3, 160)
  png('editing.png', svg, width)
  console.log('share code of the edited avatar:', encodeShareCode(edited))
}
