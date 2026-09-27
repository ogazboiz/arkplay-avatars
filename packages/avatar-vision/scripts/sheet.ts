/* Contact sheet of the candidates for the hand-written fixture analyses (test/fixtures), for
 * eyeballing the measurement → DNA mapping without a browser:
 *
 *   node scripts/sheet.ts [out.png]      (default: out/fixtures-sheet.png, gitignored)
 *
 * Each row: the fixture's measured colours as swatches, then its 4 candidates (portrait). */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { renderSVG } from '@arkplay/avatar-engine'
import { photoToAvatars } from '../src/toDNA.ts'
import { FIXTURES, loadFixture } from '../test/helpers.ts'


const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] ?? path.join(PKG, 'out', 'fixtures-sheet.png')
const CELL = 180
const SW = 120
const rows = FIXTURES.map((name) => ({ name, input: loadFixture(name) }))
const W = SW + CELL * 4
const H = rows.length * (CELL + 22)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
let body = `<rect width="${W}" height="${H}" fill="#f6f4f0"/>`
rows.forEach(({ name, input }, r) => {
  const y = r * (CELL + 22)
  const res = photoToAvatars(input)
  body += `<text x="4" y="${y + 14}" font-family="sans-serif" font-size="12" fill="#222">${esc(name)}</text>`
  const cols = Object.entries(input.measured.colors)
  cols.forEach(([k, c], i) => {
    const sy = y + 20 + i * 18
    body += `<rect x="4" y="${sy}" width="16" height="14" fill="${c!.hex}" stroke="#999"/><text x="24" y="${sy + 11}" font-family="sans-serif" font-size="10" fill="#444">${k}</text>`
  })
  res.candidates.forEach((c, i) => {
    const svg = renderSVG(c.dna, { crop: 'portrait', size: CELL - 8, idPrefix: `r${r}c${i}` })
    const inner = svg.replace(/^<svg/, `<svg x="${SW + i * CELL + 4}" y="${y + 4}"`)
    body += inner
    body += `<text x="${SW + i * CELL + 6}" y="${y + CELL + 14}" font-family="sans-serif" font-size="10" fill="#333">${esc(c.label.slice(0, 34))}</text>`
  })
})
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`
const png = new Resvg(sheet, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng()
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`wrote ${out}`)
