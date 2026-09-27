/* Contact sheets for stickers, comics, effects and props (visual QA; READ the PNG).
 *
 *   node scripts/stickers-sheet.ts stickers [template ids…]   → out/stickers-stickers.png
 *   node scripts/stickers-sheet.ts friends                    → friendmoji only
 *   node scripts/stickers-sheet.ts comics [script ids…]       → one PNG per comic
 *   node scripts/stickers-sheet.ts effects                    → every effect on one avatar
 *   node scripts/stickers-sheet.ts props                      → every prop
 *
 * Env: SHEET_TAG=name (own filenames), SHEET_KIND=humanoid|creature|both (default both),
 *      SHEET_SIZE=px per cell (default 256), SHEET_LAYOUT=landscape|square|vertical (comics). */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySpecies, defaultDNA, randomDNA, type AvatarDNA } from '../src/index.ts'
import { renderSticker, STICKER_TEMPLATES } from '../src/export/stickers.ts'
import { EFFECTS, applyEffect } from '../src/export/effects.ts'
import { COMIC_SCRIPTS, renderComic } from '../src/export/comics.ts'
import { PROP_IDS, drawProp } from '../src/comics/props.ts'
import { renderSVG } from '../src/render/render.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'out')
mkdirSync(outDir, { recursive: true })
const mode = process.argv[2] ?? 'stickers'
const args = process.argv.slice(3)
const tag = process.env.SHEET_TAG ? `-${process.env.SHEET_TAG.replace(/[^\w-]/g, '')}` : ''
const cell = Number(process.env.SHEET_SIZE) || 256
const kinds = process.env.SHEET_KIND === 'humanoid' ? ['humanoid'] : process.env.SHEET_KIND === 'creature' ? ['creature'] : ['humanoid', 'creature']

const human: AvatarDNA = randomDNA({ seed: 15, kind: 'humanoid' })
const friend: AvatarDNA = randomDNA({ seed: 21, kind: 'humanoid' })
const creature: AvatarDNA = applySpecies(defaultDNA('creature'), 'fox')
const cast = (k: string): AvatarDNA => (k === 'creature' ? creature : human)

async function sheet(cells: { title: string; svg: string; w?: number; h?: number }[], file: string, cols = 6, bg = '#ece8f2') {
  const cw = (cells[0]?.w ?? cell) + 8
  const ch = (cells[0]?.h ?? cell) + 26
  const rows = Math.ceil(cells.length / cols)
  const nested = cells
    .map((c, i) => {
      const x = (i % cols) * cw
      const y = Math.floor(i / cols) * ch
      const w = c.w ?? cell
      const h = c.h ?? cell
      const inner = c.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1').replace('<svg ', `<svg x="${x + 4}" y="${y + 4}" width="${w}" height="${h}" `)
      return `${inner}<text x="${x + 6}" y="${y + h + 20}" font-size="13" fill="#333" font-family="Arial">${c.title.replace(/[<&]/g, '')}</text>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="${bg}"/>${nested}</svg>`
  const { Resvg } = await import('@resvg/resvg-js')
  const t0 = performance.now()
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng()
  const path = join(outDir, file)
  writeFileSync(path, png)
  console.log(`${cells.length} cells, resvg ${Math.round(performance.now() - t0)} ms -> ${path}`)
}

const t0 = performance.now()
if (mode === 'stickers' || mode === 'friends') {
  const ids = args.length ? args : STICKER_TEMPLATES.filter((t) => (mode === 'friends' ? t.actors.length > 1 : true)).map((t) => t.id)
  const cells: { title: string; svg: string }[] = []
  let bytes = 0
  for (const id of ids)
    for (const k of kinds) {
      const svg = renderSticker(id, [cast(k), friend], { size: cell, idPrefix: `c${cells.length}` })
      bytes += svg.length
      cells.push({ title: `${id} (${k[0]})`, svg })
    }
  console.log(`${cells.length} stickers in ${Math.round(performance.now() - t0)} ms, avg ${Math.round(bytes / cells.length / 1024)} KB`)
  await sheet(cells, `stickers-${mode}${tag}.png`, kinds.length > 1 ? 8 : 6)
} else if (mode === 'effects') {
  const cells: { title: string; svg: string }[] = []
  for (const e of EFFECTS)
    for (const k of kinds) {
      cells.push({ title: `${e.id} sticker`, svg: renderSticker('hello', [cast(k)], { size: cell, effect: e.id, idPrefix: `e${cells.length}` }) })
    }
  for (const e of EFFECTS) {
    const base = renderSVG(human, { crop: 'portrait', size: cell, idPrefix: `q${cells.length}` })
    cells.push({ title: `${e.id} avatar`, svg: applyEffect(base, e.id, { prefix: `f${cells.length}` }) })
  }
  await sheet(cells, `stickers-effects${tag}.png`, 8)
} else if (mode === 'props') {
  const cells = PROP_IDS.map((id) => ({
    title: id,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="${cell / 2}" height="${cell / 2}"><rect width="160" height="160" fill="#ffffff"/>${drawProp(id, { x: 80, y: 80, s: 120 })}</svg>`,
    w: cell / 2,
    h: cell / 2,
  }))
  await sheet(cells, `stickers-props${tag}.png`, 10)
} else if (mode === 'comics') {
  const ids = args.length ? args : COMIC_SCRIPTS.map((s) => s.id)
  const layout = (process.env.SHEET_LAYOUT as 'landscape' | 'square' | 'vertical' | undefined) ?? 'landscape'
  for (const id of ids)
    for (const k of kinds) {
      const t1 = performance.now()
      const svg = renderComic(id, [cast(k), friend], { layout, idPrefix: 'cm' })
      const w = Number(/width="(\d+)"/.exec(svg)?.[1])
      const h = Number(/height="(\d+)"/.exec(svg)?.[1])
      console.log(`${id} (${k}): ${Math.round(performance.now() - t1)} ms, ${Math.round(svg.length / 1024)} KB, ${w}x${h}`)
      await sheet([{ title: `${id} (${k})`, svg, w, h }], `comic-${id}-${k[0]}${tag}.png`, 1, '#ffffff')
    }
}
