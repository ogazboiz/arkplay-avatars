/* Sprite sheets: every frame of one or more animations laid out in a grid inside ONE SVG
 * (so a rasterizer renders the whole sheet in a single pass), plus metadata that game
 * engines understand.
 *
 * The JSON is a superset of the TexturePacker "JSON (Hash)" format — `frames` and `meta`
 * load directly in PixiJS, Phaser and Unity's TexturePacker importer — with PixiJS-style
 * `animations` (name → frame names) and an `arkplay` block carrying what those formats
 * lack: fps, looping, events, travel distance, pivot and pixels-per-unit. */

import { ENGINE_VERSION_STRING } from '../version.ts'
import { dnaHash } from '../dna/codec.ts'
import type { AvatarDNA } from '../dna/types.ts'
import { f } from '../core/path.ts'
import { el } from '../core/svg.ts'
import type { View } from '../render/types.ts'
import { frameContent, sampleAnims, type SampleOptions } from './frames.ts'
import { unionBox, type Box } from '../core/math.ts'

export interface SpriteSheetOptions extends SampleOptions {
  anims: string[]
  view?: View
  /** Cell size in pixels (square). Default 256. */
  cell?: number
  /** Frames per row; default: the longest animation's frame count (one row per animation). */
  columns?: number
  /** Padding around the union box, fraction of its size. Default 0.04. */
  pad?: number
}

export interface SheetFrame {
  frame: { x: number; y: number; w: number; h: number }
  rotated: false
  trimmed: false
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  pivot: { x: number; y: number }
  duration: number
}

export interface SheetAnimation {
  name: string
  view: View
  fps: number
  loop: boolean
  duration: number
  frames: string[]
  events: { frame: number; name: string }[]
  /** World units travelled per loop (move the character this far per cycle). */
  travel: number
}

export interface SpriteSheetMeta {
  frames: Record<string, SheetFrame>
  animations: Record<string, string[]>
  meta: {
    app: string
    version: string
    image: string
    format: 'RGBA8888'
    size: { w: number; h: number }
    scale: '1'
  }
  arkplay: {
    format: 'arkplay-spritesheet'
    version: 1
    engine: string
    dna: string
    cell: { w: number; h: number }
    /** Pivot inside a cell (0..1, origin top-left): where the avatar's feet touch the ground. */
    pivot: { x: number; y: number }
    /** Pixels per world unit; ~200 world units ≈ 1 m. Unity PPU = pixelsPerUnit * 200. */
    pixelsPerUnit: number
    /** Suggested Unity "Pixels Per Unit": a default-height avatar (740 world units) is ~1.8 units tall. */
    unityPPU: number
    animations: SheetAnimation[]
  }
}

export interface SpriteSheet {
  svg: string
  width: number
  height: number
  meta: SpriteSheetMeta
}

export function spriteSheet(dna: AvatarDNA, o: SpriteSheetOptions): SpriteSheet {
  const view = o.view ?? 'side'
  const cell = Math.max(16, Math.min(1024, Math.round(o.cell ?? 256)))
  const { model, anims } = sampleAnims(dna, o.anims.length ? o.anims : ['idle'], view, { ...o, background: false, frame: false })
  // One box for every animation keeps the pivot identical across the whole sheet.
  let box: Box = anims[0].box
  for (const a of anims) box = unionBox(box, a.box)
  const pad = o.pad ?? 0.04
  const side = Math.max(box.w, box.h) * (1 + pad * 2)
  const sq: Box = { x: box.x + box.w / 2 - side / 2, y: box.y + box.h / 2 - side / 2, w: side, h: side }
  const k = cell / side
  const maxFrames = Math.max(...anims.map((a) => a.frames.length))
  const columns = Math.max(1, Math.min(o.columns ?? maxFrames, 64))
  let rows = 0
  for (const a of anims) rows += Math.ceil(a.frames.length / columns)
  const W = columns * cell
  const H = rows * cell

  const frames: Record<string, SheetFrame> = {}
  const animations: Record<string, string[]> = {}
  const sheetAnims: SheetAnimation[] = []
  const pivot = { x: (0 - sq.x) / sq.w, y: (0 - sq.y) / sq.h }
  const cells: string[] = []
  let row = 0
  const clipCell = model.ctx.defs.add('sheetcell', (id) => el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, el('rect', { x: f(sq.x), y: f(sq.y), width: f(sq.w), height: f(sq.h) })))
  for (const a of anims) {
    const names: string[] = []
    a.frames.forEach((fr, i) => {
      const col = i % columns
      const r = row + Math.floor(i / columns)
      const x = col * cell
      const y = r * cell
      const name = `${a.name}_${String(i).padStart(3, '0')}`
      names.push(name)
      frames[name] = {
        frame: { x, y, w: cell, h: cell },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell, h: cell },
        sourceSize: { w: cell, h: cell },
        pivot,
        duration: Math.round(1000 / a.fps),
      }
      cells.push(`<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)}) translate(${f(-sq.x)} ${f(-sq.y)})"><g clip-path="url(#${clipCell})">${frameContent(fr, sq)}</g></g>`)
    })
    row += Math.ceil(a.frames.length / columns)
    animations[a.name] = names
    sheetAnims.push({
      name: a.name,
      view,
      fps: a.fps,
      loop: a.loop,
      duration: a.duration,
      frames: names,
      events: (a.clip?.events ?? []).map((e) => ({ frame: Math.min(a.frames.length - 1, Math.round(e.t * (a.frames.length - (a.loop ? 0 : 1)))), name: e.name })),
      travel: a.clip?.travel ?? 0,
    })
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    model.ctx.defs.toString() +
    cells.join('') +
    '</svg>'
  const ppu = k
  return {
    svg,
    width: W,
    height: H,
    meta: {
      frames,
      animations,
      meta: { app: 'arkplay-avatar', version: ENGINE_VERSION_STRING, image: 'spritesheet.png', format: 'RGBA8888', size: { w: W, h: H }, scale: '1' },
      arkplay: {
        format: 'arkplay-spritesheet',
        version: 1,
        engine: ENGINE_VERSION_STRING,
        dna: dnaHash(dna),
        cell: { w: cell, h: cell },
        pivot,
        pixelsPerUnit: ppu,
        unityPPU: Math.round(ppu * 411),
        animations: sheetAnims,
      },
    },
  }
}
