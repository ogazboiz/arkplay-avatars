/* Studio downloads made by the avatar service (docs/studio.md, phase 1): one
 * `POST {base}/studio/export` with the look and the export options, and the file comes back. The
 * service draws premium items for real, checks paid formats, and resolves uploaded custom art by
 * id itself; inline art travels inside the DNA, as with previews. Nothing is drawn here. */

import { normalizeDNA, type AvatarDNA } from '@arkplay/avatar-engine'
import type { PremiumService } from '../render/premium.ts'
import { exportFileName, formatInfo, type ExportOptions, type ExportResult } from './formats.ts'

/** The JSON body of `POST /studio/export` for these options (only what the format uses). */
export function exportBody(dna: AvatarDNA, o: ExportOptions): Record<string, unknown> {
  const info = formatInfo(o.format)
  const has = (k: (typeof info.options)[number]) => info.options.includes(k)
  const b: Record<string, unknown> = { dna, format: o.format }
  if (o.fileName) b.fileName = o.fileName
  if (o.view) b.view = o.view
  if (o.crop && has('crop')) b.crop = o.crop
  if (o.expression) b.expression = o.expression
  if (o.pose) b.pose = o.pose
  if (o.background === false) b.background = false
  if (o.size !== undefined && has('size')) b.size = Math.round(o.size)
  if (o.motion !== undefined && has('motion')) b.motion = o.motion
  if (o.quality !== undefined && has('quality')) b.quality = o.quality
  if (o.anim && has('clip')) b.anim = o.anim
  if (o.anims && has('clips')) b.anims = o.anims
  if (o.fps !== undefined && has('fps')) b.fps = Math.round(o.fps)
  if (o.seconds !== undefined && has('seconds')) b.seconds = o.seconds
  if (o.cell !== undefined && has('cell')) b.cell = Math.round(o.cell)
  if (o.scale !== undefined && has('scale')) b.scale = o.scale
  if (o.pixelGrid !== undefined && has('pixelGrid')) b.pixelGrid = Math.round(o.pixelGrid)
  return b
}

export async function exportOnServer(input: AvatarDNA, o: ExportOptions, service: PremiumService): Promise<ExportResult> {
  const dna = normalizeDNA(input)
  const info = formatInfo(o.format)
  o.onProgress?.(0.05)
  // The service answers the finished file; progress is only "working", then done.
  const { blob } = await service.exportFile(exportBody(dna, o), o.signal)
  o.onProgress?.(1)
  // The studio's own file names (as the browser exports had them), not the service's.
  const clip = o.format === 'gif' || o.format === 'webm' || o.format === 'animated-svg' ? (o.anim ?? 'idle') : ''
  return { blob, filename: exportFileName(o.fileName ?? dna.name, o.format, clip), mime: blob.type || info.mime }
}
