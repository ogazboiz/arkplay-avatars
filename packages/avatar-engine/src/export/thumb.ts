/* Picker thumbnails ("tiles"): one avatar, framed on the part a tile shows. The studio draws
 * them for its option, item, species, remix and saved-look pickers; with server rendering the
 * avatar service draws the same tiles (POST /studio/tiles), so both call this one function and
 * get byte-identical SVG for the same job. */

import type { AvatarDNA } from '../dna/types.ts'
import { cropBox, layoutFrame } from '../render/compose.ts'
import { buildModel } from '../render/model.ts'
import { renderModel, renderSVG, resolveFrame } from '../render/render.ts'
import type { Crop, RenderOptions, View } from '../render/types.ts'

/** Thumbnail framings: the schema's preview crops ('full' = the whole avatar, tight), a
 *  3:4 whole-body frame for humanoids ('tall': they are tall and thin, a square wastes
 *  half the tile), the engine's fixed world frame ('fixed'), and legs and feet. */
export type ThumbCrop = 'head' | 'face' | 'eyes' | 'bust' | 'full' | 'tall' | 'portrait' | 'legs' | 'feet' | 'fixed'

export const THUMB_CROPS: readonly ThumbCrop[] = ['head', 'face', 'eyes', 'bust', 'full', 'tall', 'portrait', 'legs', 'feet', 'fixed']

export interface ThumbJob {
  dna: AvatarDNA
  crop: ThumbCrop
  view?: View
  /** Scene background and frame (default false: thumbnails sit on the tile colour). */
  scene?: boolean
  expression?: string
  pose?: string
  /** Asset id → href for uploaded custom art (functions can't cross into a worker). */
  assets?: Record<string, string>
  /** Unique per rendered SVG when several end up in one page. */
  idPrefix: string
  size?: number
  /** Thumbnails are small and many: the engine's lighter look by default. */
  quality?: 'standard' | 'high'
  /** Art detail override (default: the avatar's own). */
  detail?: RenderOptions['detail']
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const square = (cx: number, cy: number, side: number): Box => ({ x: cx - side / 2, y: cy - side / 2, w: side, h: side })

export function renderThumb(job: ThumbJob): string {
  const assets = job.assets
  const opts: RenderOptions = {
    view: job.view ?? 'front',
    background: job.scene ?? false,
    frame: job.scene ?? false,
    expression: job.expression,
    pose: job.pose,
    idPrefix: job.idPrefix,
    size: job.size ?? 160,
    title: false,
    quality: job.quality ?? 'standard',
    detail: job.detail,
    assetUrl: assets ? (id) => assets[id] : undefined,
  }
  const engineCrop: Partial<Record<ThumbCrop, Crop>> = { head: 'head', bust: 'bust', portrait: 'portrait', full: 'fit', fixed: 'full' }
  const direct = engineCrop[job.crop]
  if (direct) return renderSVG(job.dna, { ...opts, crop: direct })

  const model = buildModel(job.dna, opts)
  let box: Box
  if (job.crop === 'face' || job.crop === 'eyes') {
    // Derived from the head box (which includes hair volume): the face sits a little below
    // its centre, the eyes close to it.
    const hb = model.boxes.head
    const cx = hb.x + hb.w / 2
    const cy = hb.y + hb.h / 2
    box = job.crop === 'face' ? square(cx, cy + hb.h * 0.1, hb.w * 0.56) : square(cx, cy - hb.h * 0.005, hb.w * 0.44)
  } else {
    // Tall, legs and feet: parts of the avatar's own bounds.
    const { parts, mats } = layoutFrame(model, resolveFrame(model, opts))
    const fit = cropBox(model, 'fit', parts, mats)
    if (job.crop === 'tall') {
      const w = fit.w * 0.75
      return renderModel(model, { ...opts, size: Math.round((opts.size ?? 160) * 0.75), viewBox: { x: fit.x + (fit.w - w) / 2, y: fit.y, w, h: fit.h } })
    }
    const h = fit.h / 1.1
    const bottom = fit.y + fit.h / 2 + h / 2
    const cx = fit.x + fit.w / 2
    box = job.crop === 'legs' ? square(cx, bottom - h * 0.27, h * 0.56) : square(cx, bottom - h * 0.1, h * 0.26)
  }
  return renderModel(model, { ...opts, viewBox: box })
}
