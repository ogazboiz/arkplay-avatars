/* Renders a contact sheet of avatars to out/gallery.html for eyeballing the art.
 *
 *   node scripts/gallery.ts [mode]
 *
 * mode: default | random | themes | items <slot> [view] | portraits | creatures | views |
 *       expressions | poses | pets | anim [clip] [view] [species]
 *
 * Env: GALLERY_TAG=name writes out/gallery-<mode>-<name>.* (so parallel runs don't clobber
 *      each other); GALLERY_QUALITY=standard renders the animation-frame look instead of the
 *      baked still look; GALLERY_SIZE=px sets the SVG size in the HTML (default 240);
 *      GALLERY_ZOOM=1..4 renders the PNG contact sheet larger for close inspection. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultDNA, renderSVG, EXPRESSIONS, POSES, SPECIES, applySpecies, type AvatarDNA, type RenderOptions } from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'out')
mkdirSync(outDir, { recursive: true })

const mode = process.argv[2] ?? 'default'
const tag = process.env.GALLERY_TAG ? `-${process.env.GALLERY_TAG.replace(/[^\w-]/g, '')}` : ''
const quality = process.env.GALLERY_QUALITY === 'standard' ? 'standard' : undefined
const cellSize = Number(process.env.GALLERY_SIZE) || 240
const cells: { title: string; svg: string }[] = []
const t0 = performance.now()

async function randomDNA(seed: number, kind: 'humanoid' | 'creature' = 'humanoid'): Promise<AvatarDNA> {
  try {
    const mod = (await import('../src/generate/random.ts')) as { randomDNA: (o: { seed: number; kind?: string }) => AvatarDNA }
    return mod.randomDNA({ seed, kind })
  } catch {
    return defaultDNA(kind, seed)
  }
}

const add = (title: string, dna: unknown, opts: RenderOptions = {}) => {
  try {
    cells.push({ title, svg: renderSVG(dna, { size: cellSize, quality, ...opts }) })
  } catch (e) {
    cells.push({ title: `${title} — ERROR`, svg: `<pre style="color:#f66;white-space:pre-wrap;font-size:10px">${String((e as Error).stack).replace(/</g, '&lt;')}</pre>` })
  }
}

if (mode === 'default') {
  const d = defaultDNA()
  add('default full', d, { crop: 'fit' })
  add('default portrait', d, { crop: 'portrait' })
  add('default head', d, { crop: 'head' })
  add('default side', d, { view: 'side' })
  add('default back', d, { view: 'back' })
  add('default bust', d, { crop: 'bust' })
} else if (mode === 'random') {
  for (let i = 1; i <= 24; i++) add(`seed ${i}`, await randomDNA(i * 7919), { crop: 'fit' })
} else if (mode === 'themes') {
  const { THEMES } = await import('../src/generate/themes.ts')
  const { randomDNA: rnd } = await import('../src/generate/random.ts')
  for (const th of THEMES.slice(1)) for (let i = 0; i < 2; i++) add(`${th.id} ${i}`, rnd({ seed: i * 977 + th.id.length * 31, kind: 'humanoid', theme: th.id }), { crop: 'fit' })
} else if (mode === 'items') {
  const { ALL_ITEMS } = await import('../src/dna/schema/index.ts')
  const { addItem } = await import('../src/dna/edit.ts')
  const slot = process.argv[3] ?? 'head'
  // Garment slots (top, bottom, full, outer, shoes, socks) and accessory slots alike; garments
  // show the whole figure, head and face pieces a bust.
  const wide = new Set(['handR', 'handL', 'back', 'aura', 'waist', 'wrist', 'companion', 'tailAcc', 'top', 'bottom', 'full', 'outer', 'shoes', 'socks'])
  for (const it of ALL_ITEMS.filter((a) => a.slot === slot && a.kinds.includes('humanoid')))
    add(it.label, addItem({ ...defaultDNA(), outfit: it.slot === 'top' || it.slot === 'bottom' || it.slot === 'full' || it.slot === 'outer' || it.slot === 'shoes' || it.slot === 'socks' ? [] : defaultDNA().outfit }, it.id), {
      crop: wide.has(slot) ? 'fit' : 'bust',
      view: (process.argv[4] ?? 'front') as 'front',
    })
} else if (mode === 'portraits') {
  for (let i = 1; i <= 24; i++) add(`seed ${i}`, await randomDNA(i * 104729), { crop: 'portrait' })
} else if (mode === 'creatures') {
  for (const sp of SPECIES) add(sp.label, applySpecies(defaultDNA('creature'), sp.id), { crop: 'fit' })
} else if (mode === 'views') {
  for (let i = 1; i <= 6; i++) {
    const d = await randomDNA(i * 31337)
    for (const v of ['front', 'side', 'back'] as const) add(`${i} ${v}`, d, { view: v, crop: 'full' })
  }
} else if (mode === 'expressions') {
  const d = defaultDNA()
  for (const e of EXPRESSIONS) add(e.label, d, { expression: e.id, crop: 'head' })
} else if (mode === 'poses') {
  const d = defaultDNA()
  for (const p of POSES) add(p.label, d, { pose: p.id, crop: 'full' })
  for (const p of POSES) add(`${p.label} (side)`, d, { pose: p.id, crop: 'full', view: 'side' })
} else if (mode === 'pets') {
  const { addItem } = await import('../src/dna/edit.ts')
  const places = ['ground', 'float', 'shoulder']
  const pet = (d: AvatarDNA, species: string, place: string) => addItem(d, 'pet', { species, place })
  ;['cat', 'dog', 'dragon', 'slime', 'owl', 'robot'].forEach((sp, i) => add(`${sp} ${places[i % 3]}`, pet(defaultDNA(), sp, places[i % 3]), { crop: 'fit' }))
  for (const place of places) add(`side ${place}`, pet(defaultDNA(), 'cat', place), { crop: 'fit', view: 'side' })
  for (const place of places) add(`fox + ${place}`, pet(defaultDNA('creature'), 'bunny', place), { crop: 'fit' })
  for (const place of places) add(`slime + ${place}`, pet(applySpecies(defaultDNA('creature'), 'slime'), 'bee', place), { crop: 'fit' })
} else if (mode === 'anim') {
  const anim = process.argv[3] ?? 'walk'
  const view = (process.argv[4] ?? 'side') as 'front' | 'side' | 'back'
  const species = process.argv[5]
  const d = species ? applySpecies(defaultDNA('creature'), species) : defaultDNA()
  const { clipFor, buildModel } = await import('../src/index.ts')
  const clip = clipFor(buildModel(d, { view }), anim)
  const dur = clip?.duration ?? 1
  for (let i = 0; i < 12; i++) add(`${anim} ${i}`, d, { anim, time: (i / 12) * dur, view, crop: 'full' })
}

const ms = Math.round(performance.now() - t0)
const html = `<!doctype html><meta charset="utf-8"><title>Avatar gallery — ${mode}</title>
<style>body{margin:0;padding:16px;background:#1b1d24;color:#ddd;font:12px system-ui}h1{font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.c{background:#2a2d38;border-radius:8px;padding:6px}.c svg{display:block;width:100%;height:auto;background:repeating-conic-gradient(#3a3d48 0 25%,#30333d 0 50%) 0 0/16px 16px}
.t{padding:4px 2px 0;opacity:.8}</style>
<h1>${mode} — ${cells.length} renders in ${ms} ms</h1><div class="grid">${cells.map((c) => `<div class="c">${c.svg}<div class="t">${c.title}</div></div>`).join('')}</div>`
const file = join(outDir, `gallery-${mode}${tag}.html`)
writeFileSync(file, html)
console.log(`${cells.length} renders in ${ms} ms -> ${file}`)

// Contact sheet as PNG (rendered by resvg, the same renderer the avatar service uses).
const cols = Math.min(6, cells.length)
const rows = Math.ceil(cells.length / cols)
const cw = 240
const ch = 262
const nested = cells
  .map((c, i) => {
    const x = (i % cols) * cw
    const y = Math.floor(i / cols) * ch
    const inner = c.svg.startsWith('<svg')
      ? c.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1').replace('<svg ', `<svg x="${x + 4}" y="${y + 4}" width="232" height="232" `)
      : ''
    return `<rect x="${x + 2}" y="${y + 2}" width="236" height="258" rx="6" fill="#2a2d38"/>${inner}<text x="${x + 8}" y="${y + 254}" font-size="12" fill="#ddd" font-family="Arial">${c.title.replace(/[<&]/g, '')}</text>`
  })
  .join('')
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="#1b1d24"/>${nested}</svg>`
try {
  const { Resvg } = await import('@resvg/resvg-js')
  const zoom = Math.max(1, Math.min(4, Number(process.env.GALLERY_ZOOM) || 1))
  const png = new Resvg(sheet, { fitTo: { mode: 'zoom', value: zoom }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng()
  const pngFile = join(outDir, `gallery-${mode}${tag}.png`)
  writeFileSync(pngFile, png)
  console.log(`contact sheet -> ${pngFile}`)
} catch (e) {
  console.log('PNG contact sheet skipped:', (e as Error).message)
}
