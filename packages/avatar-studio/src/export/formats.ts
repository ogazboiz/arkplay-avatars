/* Export formats and the arithmetic around them (sizes, frame counts, sheet layout, file
 * names). Pure, so it is tested without a browser; exportAvatar.ts does the drawing. */

import type { Crop, View } from '@arkplay/avatar-engine'
import type { PremiumService } from '../render/premium.ts'

export type ExportFormat = 'svg' | 'png' | 'webp' | 'jpeg' | 'pixel' | 'gif' | 'webm' | 'animated-svg' | 'spritesheet' | 'rig' | 'stickers'

/** Options a format uses; the export dialog shows exactly these. */
export type ExportOptionKey = 'size' | 'view' | 'crop' | 'transparent' | 'motion' | 'quality' | 'clip' | 'clips' | 'fps' | 'seconds' | 'cell' | 'scale' | 'pixelGrid'

export interface ExportFormatInfo {
  id: ExportFormat
  ext: string
  mime: string
  /** Plays an animation clip. */
  animated: boolean
  /** Drawn through a canvas (browser only). */
  raster: boolean
  /** Several files in a zip. */
  bundle: boolean
  options: readonly ExportOptionKey[]
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { id: 'png', ext: 'png', mime: 'image/png', animated: false, raster: true, bundle: false, options: ['size', 'view', 'crop', 'transparent'] },
  { id: 'svg', ext: 'svg', mime: 'image/svg+xml', animated: false, raster: false, bundle: false, options: ['view', 'crop', 'transparent', 'motion'] },
  { id: 'webp', ext: 'webp', mime: 'image/webp', animated: false, raster: true, bundle: false, options: ['size', 'view', 'crop', 'transparent', 'quality'] },
  { id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', animated: false, raster: true, bundle: false, options: ['size', 'view', 'crop', 'quality'] },
  { id: 'pixel', ext: 'png', mime: 'image/png', animated: false, raster: true, bundle: false, options: ['pixelGrid', 'size', 'view', 'crop', 'transparent'] },
  { id: 'gif', ext: 'gif', mime: 'image/gif', animated: true, raster: true, bundle: false, options: ['clip', 'fps', 'size', 'view', 'crop', 'transparent'] },
  { id: 'webm', ext: 'webm', mime: 'video/webm', animated: true, raster: true, bundle: false, options: ['clip', 'fps', 'seconds', 'size', 'view', 'crop'] },
  { id: 'animated-svg', ext: 'svg', mime: 'image/svg+xml', animated: true, raster: false, bundle: false, options: ['clip', 'fps', 'view', 'crop', 'transparent'] },
  { id: 'spritesheet', ext: 'zip', mime: 'application/zip', animated: true, raster: true, bundle: true, options: ['clips', 'fps', 'cell', 'view'] },
  { id: 'rig', ext: 'zip', mime: 'application/zip', animated: true, raster: true, bundle: true, options: ['clips', 'scale', 'view'] },
  { id: 'stickers', ext: 'zip', mime: 'application/zip', animated: false, raster: true, bundle: true, options: ['size'] },
]

export const formatInfo = (id: ExportFormat): ExportFormatInfo => EXPORT_FORMATS.find((f) => f.id === id) ?? EXPORT_FORMATS[0]

export interface ExportOptions {
  format: ExportFormat
  /** Output width in px (raster formats). */
  size?: number
  view?: View
  crop?: Crop
  /** Include the scene background (default true). False gives transparency where the format has it. */
  background?: boolean
  expression?: string
  pose?: string
  /** Clip for GIF, WebM and animated SVG. */
  anim?: string
  /** Clips for sprite sheets and rig bundles. */
  anims?: string[]
  fps?: number
  /** WebM length in seconds. */
  seconds?: number
  /** Sprite-sheet cell size in px. */
  cell?: number
  /** Rig atlas pixels per world unit. */
  scale?: number
  /** Pixel-art grid (the tiny render's width in pixels). */
  pixelGrid?: number
  /** 0..1 for JPEG and WebP. */
  quality?: number
  /** SVG only: keep the looping aura/effect/particle animation (default: the engine's, on).
   *  Raster formats always draw the base frame. */
  motion?: boolean
  /** Resolves uploaded custom-art ids (they are fetched and inlined before drawing). */
  assetUrl?: (id: string) => string | undefined
  /** The avatar service, for avatars that wear premium items (premium core): their exports come
   *  from its drawing, because the browser has no premium art. */
  premium?: PremiumService
  /** Server exports (docs/studio.md): the service makes the file, whatever the
   *  look, and checks paid formats. Set when the host turns `serverExports` on. */
  server?: PremiumService
  signal?: AbortSignal
  /** 0..1 */
  onProgress?: (fraction: number) => void
  /** File name without extension (default: from the avatar's name). */
  fileName?: string
}

export interface ExportResult {
  blob: Blob
  filename: string
  mime: string
}

export const SIZE_PRESETS = [128, 256, 512, 1024, 2048] as const
export const ANIM_SIZES = [128, 256, 384, 512, 768] as const
export const CELL_SIZES = [64, 128, 256, 512] as const
export const PIXEL_GRIDS = [24, 32, 48, 64, 96] as const
export const FPS_CHOICES = [8, 12, 15, 24, 30] as const
export const RIG_SCALES = [0.5, 1, 2] as const
export const SECONDS_CHOICES = [2, 3, 5, 8] as const

export const MAX_ANIM_FRAMES = 60

export const clampSize = (n: number, min = 16, max = 4096): number => Math.round(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)))

/** Height for a raster of `width` px showing a `w` × `h` box. */
export const heightFor = (width: number, w: number, h: number): number => Math.max(1, Math.round((width * h) / Math.max(1e-9, w)))

/** Frames sampled from a clip: loops sample [0, duration), one-shots include the last pose. */
export function frameTimes(duration: number, fps: number, loop: boolean, max = MAX_ANIM_FRAMES): number[] {
  if (!(duration > 0) || !(fps > 0)) return [0]
  const n = Math.max(1, Math.min(max, Math.round(duration * fps)))
  if (loop) return Array.from({ length: n }, (_, i) => (i / n) * duration)
  if (n === 1) return [0]
  return Array.from({ length: n }, (_, i) => (i / (n - 1)) * duration)
}

/** Width and height attributes of an engine SVG document. */
export function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const w = Number(/\swidth="([\d.]+)"/.exec(tag)?.[1])
  const h = Number(/\sheight="([\d.]+)"/.exec(tag)?.[1])
  return { width: Number.isFinite(w) && w > 0 ? w : 512, height: Number.isFinite(h) && h > 0 ? h : 512 }
}

/** Integer upscale so pixel art stays crisp: the largest whole factor that fits `size`. */
export const pixelScale = (grid: number, size: number): number => Math.max(1, Math.floor(size / Math.max(1, grid)))

/** Loops of a clip that fill at least `seconds` (WebM). */
export const loopsFor = (duration: number, seconds: number): number => Math.max(1, Math.ceil(Math.max(0.1, seconds) / Math.max(0.05, duration)))

export interface SheetPlan {
  cell: number
  columns: number
  width: number
  height: number
}

/**
 * Sprite-sheet layout: one row per animation (wrapping at `maxColumns`), shrinking the
 * cell until the sheet fits what every browser can put on one canvas (Safari caps a canvas
 * at ~16.7 megapixels).
 */
export function planSheet(frameCounts: readonly number[], cell: number, maxColumns = 16, maxSide = 8192, maxArea = 16_000_000): SheetPlan {
  const counts = frameCounts.length ? frameCounts.map((n) => Math.max(1, Math.round(n))) : [1]
  const columns = Math.max(1, Math.min(maxColumns, Math.max(...counts)))
  const rows = counts.reduce((sum, n) => sum + Math.ceil(n / columns), 0)
  let c = clampSize(cell, 16, 1024)
  while (c > 16 && (columns * c > maxSide || rows * c > maxSide || columns * c * rows * c > maxArea)) c = Math.max(16, Math.floor(c * 0.85))
  return { cell: c, columns, width: columns * c, height: rows * c }
}

/** A file-system-safe name from the avatar's name. */
export function slugify(name: string, fallback = 'avatar'): string {
  const s = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return s || fallback
}

const SUFFIX: Partial<Record<ExportFormat, string>> = {
  pixel: '-pixel',
  'animated-svg': '-animated',
  spritesheet: '-spritesheet',
  rig: '-rig',
  stickers: '-stickers',
}

export function exportFileName(base: string, format: ExportFormat, extra = ''): string {
  const info = formatInfo(format)
  return `${slugify(base)}${SUFFIX[format] ?? ''}${extra ? `-${slugify(extra, '')}` : ''}.${info.ext}`
}
