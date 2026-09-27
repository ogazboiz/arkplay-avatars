/* Game assets from a share code: a sprite sheet (PNG + TexturePacker JSON), a rig (atlas PNG +
 * rig.json) and an animated SVG.
 *
 *   node examples/node/game-assets.ts [shareCode]
 *
 * Output goes to examples/out/ (gitignored). */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { animatedSVG, applySpecies, clipsForAvatar, decodeShareCode, defaultDNA, encodeShareCode, rigBundle, spriteSheet } from '@arkplay/avatar-engine'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out')
mkdirSync(OUT, { recursive: true })

const code = process.argv[2] ?? encodeShareCode(applySpecies(defaultDNA('creature', 3), 'dragon'))
const dna = decodeShareCode(code)
console.log('clips that suit this body:', clipsForAvatar(dna).map((c) => c.name).join(', '))

const raster = (svg: string, width: number): Uint8Array => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()

// Sprite sheet: one row per clip, one shared pivot, so characters never jitter between clips.
const sheet = spriteSheet(dna, { anims: ['idle', 'walk', 'run', 'jump'], view: 'side', cell: 192, fps: 12 })
writeFileSync(path.join(OUT, 'sheet.png'), raster(sheet.svg, sheet.width))
writeFileSync(path.join(OUT, 'sheet.json'), JSON.stringify(sheet.meta, null, 2))
console.log(`sheet.png ${sheet.width}×${sheet.height}, pivot`, sheet.meta.arkplay.pivot)

// Rig: bones, atlas regions, slots and sampled clips, for cut-out animation in any engine.
const { bundle, atlasSvg } = rigBundle(dna, { clips: ['idle', 'walk'] })
writeFileSync(path.join(OUT, 'atlas.png'), raster(atlasSvg, bundle.atlas.width))
writeFileSync(path.join(OUT, 'rig.json'), JSON.stringify(bundle, null, 2))
console.log(`rig: ${bundle.bones.length} bones, ${bundle.slots.length} slots, ${bundle.clips.length} clips`)

// Animated SVG: self-contained CSS animation for web pages and chat.
writeFileSync(path.join(OUT, 'dance.svg'), animatedSVG(dna, { anim: 'dance', crop: 'fit', size: 256 }))
console.log('wrote examples/out/sheet.png, sheet.json, atlas.png, rig.json, dance.svg')
