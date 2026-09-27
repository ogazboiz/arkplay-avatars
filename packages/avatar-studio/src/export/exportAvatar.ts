/* Exports: every format the studio offers, as a Blob and a file name. With `options.server` the
 * avatar service makes the file (serverExport.ts); otherwise it is drawn here, as below.
 *
 * Vector formats come straight from the engine. Raster formats draw the engine's SVG into
 * a canvas; custom art stored in the avatar service is fetched and inlined first, because
 * a cross-origin image would taint the canvas and an SVG drawn as an image never fetches
 * external URLs. Long exports report progress, yield to the page between frames and stop
 * at the next frame when their AbortSignal fires.
 *
 * Premium items (premium core, docs/studio.md) are never drawn here: this bundle has
 * no art for them. An avatar that wears them is exported from the avatar service's drawing
 * instead (`options.premium`): stills from its preview, animated SVG, GIF, sprite sheets and rigs
 * from its public render routes. WebM and sticker packs, which only the browser makes, explain
 * that premium items render on ArkPlay (PremiumExportError). */

import {
  animatedSVG,
  buildModel,
  needsPremiumArt,
  normalizeDNA,
  renderModel,
  renderSVG,
  rigBundle,
  sampleAnim,
  spriteSheet,
  stickerSet,
  type AvatarDNA,
  type RenderOptions,
} from '@arkplay/avatar-engine'
import { inlineAssets } from '../render/assets.ts'
import { nextIdPrefix } from '../render/ids.ts'
import {
  MAX_ANIM_FRAMES,
  clampSize,
  exportFileName,
  formatInfo,
  frameTimes,
  heightFor,
  loopsFor,
  pixelScale,
  planSheet,
  svgSize,
  type ExportOptions,
  type ExportResult,
} from './formats.ts'
import { clipInfo, pickClips } from './clips.ts'
import { createGif } from './gif.ts'
import { exportPremium } from './premiumExport.ts'
import { exportOnServer } from './serverExport.ts'
import { canvasToBlob, context2d, hardenAlpha, rasterize, throwIfAborted, upscale, yieldToPage } from './raster.ts'
import { recordWebm } from './webm.ts'
import { zipFiles, type ZipEntry } from './zip.ts'

/** The engine's own default frame cap for sprite sheets (keeps our layout plan in step). */
const SHEET_MAX_FRAMES = 48

const squareOf = (b: { x: number; y: number; w: number; h: number }, pad: number) => {
  const side = Math.max(b.w, b.h) * (1 + pad * 2)
  return { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, w: side, h: side }
}

/** A copy whose remote custom art carries inline data (for exports without an assetUrl hook). */
function withInlineArt(dna: AvatarDNA, assets: Record<string, string>): AvatarDNA {
  if (!Object.keys(assets).length) return dna
  return {
    ...dna,
    accessories: dna.accessories.map((a) => (a.id === 'custom' && a.asset?.id && !a.asset.src && assets[a.asset.id] ? { ...a, asset: { ...a.asset, src: assets[a.asset.id] } } : a)),
  }
}

const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml' })
const hasSceneBackground = (dna: AvatarDNA) => dna.sections.scene?.background !== 'none'

export async function exportAvatar(input: AvatarDNA, options: ExportOptions): Promise<ExportResult> {
  // Server exports: the avatar service makes every format (serverExport.ts).
  if (options.server) return exportOnServer(input, options, options.server)
  const o = options
  const signal = o.signal
  const info = formatInfo(o.format)
  const progress = (f: number) => o.onProgress?.(Math.max(0, Math.min(1, f)))
  const dna = normalizeDNA(input)
  progress(0)
  // premium core (G): premium items come from the avatar service's drawing, never this bundle.
  if (needsPremiumArt(dna)) return exportPremium(dna, o, progress)

  const assets = await inlineAssets(dna, o.assetUrl)
  throwIfAborted(signal)
  // Only inlined art reaches a canvas; a raw service URL would taint it.
  const assetUrl = (id: string) => assets[id]
  const base = o.fileName ?? dna.name
  const view = o.view ?? 'front'
  const crop = o.crop ?? 'fit'
  const bg = o.background !== false
  // Stills get the engine's baked 'high' look; anything drawn many times (GIF/WebM frames,
  // sprite sheets, rigs, animated SVG) uses 'standard'.
  const common: RenderOptions = { view, crop, background: bg, frame: bg, expression: o.expression, pose: o.pose, assetUrl, idPrefix: nextIdPrefix('x'), quality: 'high' }
  const moving: RenderOptions = { ...common, quality: 'standard' }
  // Rasters capture one moment, so they get the base frame without ambient effect motion.
  const still: RenderOptions = { ...common, motion: false }
  const done = (blob: Blob, extra = ''): ExportResult => {
    progress(1)
    return { blob, filename: exportFileName(base, o.format, extra), mime: blob.type || info.mime }
  }

  switch (o.format) {
    case 'svg':
      return done(svgBlob(renderSVG(dna, { ...common, motion: o.motion, size: clampSize(o.size ?? 512) })))

    case 'png':
    case 'webp':
    case 'jpeg': {
      const svg = renderSVG(dna, { ...still, size: clampSize(o.size ?? 1024) })
      const { width, height } = svgSize(svg)
      const jpeg = o.format === 'jpeg'
      const canvas = await rasterize(svg, width, height, { fill: jpeg ? '#ffffff' : undefined })
      throwIfAborted(signal)
      const blob = await canvasToBlob(canvas, info.mime, o.format === 'png' ? undefined : (o.quality ?? 0.92))
      if (blob.type && blob.type !== info.mime) throw new Error(`This browser can’t save ${info.id.toUpperCase()} images. Try PNG.`)
      return done(blob)
    }

    case 'pixel': {
      const grid = clampSize(o.pixelGrid ?? 48, 8, 256)
      const svg = renderSVG(dna, { ...still, size: grid, detail: 'low' })
      const { width, height } = svgSize(svg)
      const small = await rasterize(svg, width, height)
      hardenAlpha(small)
      const big = upscale(small, pixelScale(grid, clampSize(o.size ?? 512)))
      return done(await canvasToBlob(big, 'image/png'))
    }

    case 'animated-svg': {
      const clip = clipInfo(dna, o.anim)
      const svg = animatedSVG(dna, { ...moving, anim: clip.name, fps: o.fps, size: clampSize(o.size ?? 512), maxFrames: 36 })
      return done(svgBlob(svg), clip.name)
    }

    case 'gif':
    case 'webm': {
      const clip = clipInfo(dna, o.anim)
      const fps = Math.max(1, Math.min(60, o.fps ?? Math.min(24, clip.fps * 2)))
      const width = clampSize(o.size ?? 384, 32, o.format === 'gif' ? 1024 : 1920)
      const times = frameTimes(clip.duration, fps, clip.loop, MAX_ANIM_FRAMES)
      const model = buildModel(dna, moving)
      // One framing for every frame: `fit` per frame would re-centre and make loops jitter.
      const viewBox = crop === 'fit' ? squareOf(sampleAnim(model, clip.name, { fps, maxFrames: MAX_ANIM_FRAMES }).box, 0.06) : undefined
      const video = o.format === 'webm'
      // Video has no alpha: a transparent scene is drawn on the studio's dark backdrop.
      const fill = video && (!bg || !hasSceneBackground(dna)) ? '#101014' : undefined
      const transparent = !video && (!bg || !hasSceneBackground(dna))
      const frames: HTMLCanvasElement[] = []
      let height = width
      let writer: ReturnType<typeof createGif> | null = null
      for (let i = 0; i < times.length; i++) {
        throwIfAborted(signal)
        const svg = renderModel(model, { ...moving, viewBox, anim: clip.name, time: times[i], size: width, title: false })
        const size = svgSize(svg)
        height = heightFor(width, size.width, size.height)
        const canvas = await rasterize(svg, width, height, { fill })
        if (video) frames.push(canvas)
        else {
          writer ??= createGif(width, height, transparent)
          writer.add(context2d(canvas).getImageData(0, 0, width, height).data, 1000 / fps)
        }
        progress(((i + 1) / times.length) * (video ? 0.5 : 0.95))
        await yieldToPage()
      }
      throwIfAborted(signal)
      if (!video) {
        const bytes = (writer ?? createGif(width, height, transparent)).finish()
        return done(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }), clip.name)
      }
      const loops = loopsFor(clip.duration, o.seconds ?? 3)
      const blob = await recordWebm(frames, width, height, { fps, loops, signal, onProgress: (f) => progress(0.5 + f * 0.5) })
      return done(blob, clip.name)
    }

    case 'spritesheet': {
      const anims = pickClips(dna, o.anims)
      const counts = anims.map((c) => frameTimes(c.duration, o.fps ?? c.fps, c.loop, SHEET_MAX_FRAMES).length)
      const plan = planSheet(counts, o.cell ?? 256)
      const sheet = spriteSheet(dna, {
        anims: anims.map((c) => c.name),
        view: o.view ?? 'side',
        cell: plan.cell,
        columns: plan.columns,
        fps: o.fps,
        maxFrames: SHEET_MAX_FRAMES,
        assetUrl,
        idPrefix: nextIdPrefix('s'),
        quality: 'standard',
      })
      progress(0.3)
      await yieldToPage()
      const canvas = await rasterize(sheet.svg, sheet.width, sheet.height)
      throwIfAborted(signal)
      progress(0.8)
      const png = await canvasToBlob(canvas, 'image/png')
      const files: ZipEntry[] = [
        { name: sheet.meta.meta.image, data: png },
        { name: 'spritesheet.json', data: JSON.stringify(sheet.meta, null, 2) },
      ]
      return done(await zipFiles(files))
    }

    case 'rig': {
      const anims = pickClips(dna, o.anims)
      const { bundle, atlasSvg } = rigBundle(withInlineArt(dna, assets), { view: o.view ?? 'side', clips: anims.map((c) => c.name), scale: o.scale ?? 1 })
      progress(0.3)
      await yieldToPage()
      const canvas = await rasterize(atlasSvg, bundle.atlas.width, bundle.atlas.height)
      throwIfAborted(signal)
      progress(0.8)
      const png = await canvasToBlob(canvas, 'image/png')
      return done(
        await zipFiles([
          { name: bundle.atlas.image, data: png },
          { name: 'rig.json', data: JSON.stringify(bundle, null, 2) },
        ]),
      )
    }

    case 'stickers': {
      const size = clampSize(o.size ?? 512, 64, 1024)
      const stickers = stickerSet(dna, { size, assetUrl, idPrefix: nextIdPrefix('k'), quality: 'high', motion: false })
      const files: ZipEntry[] = []
      for (let i = 0; i < stickers.length; i++) {
        throwIfAborted(signal)
        const s = stickers[i]
        const { width, height } = svgSize(s.svg)
        const canvas = await rasterize(s.svg, width, height)
        files.push({ name: `${s.name}.png`, data: await canvasToBlob(canvas, 'image/png') })
        progress(((i + 1) / stickers.length) * 0.95)
        await yieldToPage()
      }
      files.push({ name: 'stickers.json', data: JSON.stringify(stickers.map((s) => ({ name: s.name, label: s.label, file: `${s.name}.png` })), null, 2) })
      return done(await zipFiles(files))
    }
  }
}
