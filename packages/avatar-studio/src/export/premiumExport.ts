/* Exports of avatars that wear premium items (premium core, docs/studio.md).
 *
 * This bundle has no art for premium items, so their exports come from the avatar service's
 * drawing: stills (SVG, PNG, WebP, JPEG, pixel art) from its preview, animated SVG, GIF,
 * sprite sheets and rigs from its public render routes by share code. WebM and sticker packs,
 * which only the browser makes frame by frame, can't include them: PremiumExportError says so,
 * and so does a missing or unreachable service. Nothing here draws avatar art itself. */

import type { AvatarDNA } from '@arkplay/avatar-engine'
import { PremiumExportError, PremiumPreviewError, SERVICE_ID_PREFIX, type PremiumPreviewRequest } from '../render/premium.ts'
import { clipInfo, pickClips } from './clips.ts'
import { clampSize, exportFileName, formatInfo, pixelScale, svgSize, type ExportOptions, type ExportResult } from './formats.ts'
import { canvasToBlob, hardenAlpha, rasterize, throwIfAborted, upscale } from './raster.ts'

const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml' })

/** A premium look, exported from the avatar service's drawing. */
export async function exportPremium(dna: AvatarDNA, o: ExportOptions, progress: (f: number) => void): Promise<ExportResult> {
  const svc = o.premium
  if (!svc) throw new PremiumExportError('service', 'Premium items render on ArkPlay, and this studio has no ArkPlay service to ask.')
  const signal = o.signal
  const info = formatInfo(o.format)
  const view = o.view ?? 'front'
  const crop = o.crop ?? 'fit'
  const bg = o.background !== false
  const done = (blob: Blob, extra = ''): ExportResult => {
    progress(1)
    return { blob, filename: exportFileName(o.fileName ?? dna.name, o.format, extra), mime: blob.type || info.mime }
  }
  // Service failures become the dialog's explanation: unreachable or busy, or a format it can't make.
  const ask = async <T>(p: Promise<T>): Promise<T> => {
    try {
      return await p
    } catch (e) {
      if (e instanceof PremiumPreviewError) throw new PremiumExportError(e.kind === 'unavailable' || e.kind === 'too-large' ? 'format' : 'service', e.message)
      throw e
    }
  }
  const still = (size: number, extra: Partial<PremiumPreviewRequest> = {}) =>
    ask(svc.preview({ dna, view, crop, size, expression: o.expression, pose: o.pose, background: bg, ...extra }, SERVICE_ID_PREFIX, signal))
  const fetchAs = async (url: string, type: string) => new Blob([await (await ask(svc.download(url, signal))).arrayBuffer()], { type })
  progress(0.1)

  switch (o.format) {
    case 'svg':
      return done(svgBlob(await still(clampSize(o.size ?? 512, 16, 2048), { motion: o.motion })))

    case 'png':
    case 'webp':
    case 'jpeg': {
      const svg = await still(clampSize(o.size ?? 1024, 16, 2048), { motion: false })
      const { width, height } = svgSize(svg)
      const jpeg = o.format === 'jpeg'
      const canvas = await rasterize(svg, width, height, { fill: jpeg ? '#ffffff' : undefined })
      throwIfAborted(signal)
      const blob = await canvasToBlob(canvas, info.mime, o.format === 'png' ? undefined : (o.quality ?? 0.92))
      if (blob.type && blob.type !== info.mime) throw new Error(`This browser can’t save ${info.id.toUpperCase()} images. Try PNG.`)
      return done(blob)
    }

    case 'pixel': {
      const grid = clampSize(o.pixelGrid ?? 48, 16, 256)
      const svg = await still(grid, { detail: 'low', motion: false })
      const { width, height } = svgSize(svg)
      const small = await rasterize(svg, width, height)
      hardenAlpha(small)
      return done(await canvasToBlob(upscale(small, pixelScale(grid, clampSize(o.size ?? 512))), 'image/png'))
    }

    case 'animated-svg': {
      const clip = clipInfo(dna, o.anim)
      const url = svc.codeUrl(dna, 'anim.svg', { anim: clip.name, view, crop, size: clampSize(o.size ?? 512, 16, 2048), bg, fps: o.fps })
      return done(await fetchAs(url, 'image/svg+xml'), clip.name)
    }

    case 'gif': {
      const clip = clipInfo(dna, o.anim)
      const url = svc.codeUrl(dna, 'gif', { anim: clip.name, view, crop, size: clampSize(o.size ?? 384, 16, 512), bg, fps: o.fps ? Math.min(15, o.fps) : undefined })
      return done(await fetchAs(url, 'image/gif'), clip.name)
    }

    case 'spritesheet': {
      const anims = pickClips(dna, o.anims).map((c) => c.name)
      const url = svc.codeUrl(dna, 'spritesheet.zip', { anims: anims.join(','), view: o.view ?? 'side', cell: o.cell, fps: o.fps })
      return done(await fetchAs(url, 'application/zip'))
    }

    case 'rig': {
      const clips = pickClips(dna, o.anims).map((c) => c.name)
      const url = svc.codeUrl(dna, 'rig.zip', { clips: clips.join(','), view: o.view ?? 'side', scale: o.scale })
      return done(await fetchAs(url, 'application/zip'))
    }

    default:
      // WebM and sticker packs are made frame by frame in the browser, which can't draw premium items.
      throw new PremiumExportError('format', 'Premium items render on ArkPlay, which doesn’t make this format.')
  }
}
