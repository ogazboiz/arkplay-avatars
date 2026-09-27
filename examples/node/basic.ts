/* The engine in Node: make an avatar, edit it, share it, and write an SVG and a PNG.
 *
 *   node examples/node/basic.ts [seed]
 *
 * Output goes to examples/out/ (gitignored). */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import {
  ENGINE_VERSION_STRING,
  addItem,
  decodeShareCode,
  describeDNA,
  dnaHash,
  encodeShareCode,
  normalizeDNA,
  randomDNA,
  renderSVG,
  setParam,
  validateDNA,
} from '@arkplay/avatar-engine'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out')
mkdirSync(OUT, { recursive: true })

const seed = Number(process.argv[2] ?? 42)

// 1. Roll an avatar. Same seed, same avatar, on every machine.
let dna = randomDNA({ seed, kind: 'humanoid', theme: 'casual', freeOnly: true })
console.log(ENGINE_VERSION_STRING)
console.log('rolled:', describeDNA(dna))

// 2. Edit it. Every edit returns new, valid DNA.
dna = setParam(dna, 'hair', 'color', '#2e7d32')
dna = addItem(dna, 'hoodie')
dna = { ...dna, name: 'Ada' }

// 3. Share it. The code is short enough for a URL or a chat message.
const code = encodeShareCode(dna)
console.log(`share code (${code.length} chars):`, code)
const back = decodeShareCode(code)
console.log('round trip keeps the avatar:', dnaHash(back) === dnaHash(normalizeDNA(dna)))

// 4. Untrusted input: normalizeDNA always returns valid DNA (defaults filled in, values clamped).
const loose = normalizeDNA({ kind: 'creature', name: 'Pip', sections: { body: { size: 99 } } })
console.log('normalized:', loose.kind, loose.name, 'problems now:', validateDNA(loose).length)

// 5. Render. SVG is the native output; rasterize with resvg (or a canvas in browsers).
const svg = renderSVG(dna, { crop: 'portrait', size: 512 })
writeFileSync(path.join(OUT, 'avatar.svg'), svg)
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
writeFileSync(path.join(OUT, 'avatar.png'), png)
console.log(`wrote examples/out/avatar.svg (${(svg.length / 1024).toFixed(0)} KB) and avatar.png (${(png.length / 1024).toFixed(0)} KB)`)
