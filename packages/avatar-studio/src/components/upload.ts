/* Turning a user's image file into a CustomAsset the engine accepts inline: a base64 data
 * URL of PNG, SVG, JPEG or WebP, within the engine's size limit. Large rasters are scaled
 * down (1024 px) and re-encoded rather than rejected. */

import { LIMITS, type CustomAsset } from '@arkplay/avatar-engine'

export const ACCEPT = 'image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp'
const MAX_SIDE = 1024

export class AssetTooLargeError extends Error {}
export class AssetTypeError extends Error {}

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

export function assetMime(file: File): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? ''
  const t = file.type || MIME_BY_EXT[ext] || ''
  return Object.values(MIME_BY_EXT).includes(t) ? t : null
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'))
    r.readAsDataURL(blob)
  })
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  return img
}

function encode(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, quality))
}

export async function fileToAsset(file: File, maxChars: number = LIMITS.inlineAssetChars): Promise<CustomAsset> {
  const mime = assetMime(file)
  if (!mime) throw new AssetTypeError('Unsupported image type.')
  let src = await readDataUrl(file)
  // Some systems report no MIME type for SVGs: rebuild the prefix the engine checks for.
  src = src.replace(/^data:[^;,]*;base64,/, `data:${mime};base64,`)
  const img = await loadImage(src)
  let w = img.naturalWidth || 256
  let h = img.naturalHeight || 256
  const name = file.name.slice(0, 60)
  const svg = mime === 'image/svg+xml'
  if (svg) {
    if (src.length > maxChars) throw new AssetTooLargeError('SVG too large.')
    return { src, w, h, name }
  }
  if (src.length <= maxChars && Math.max(w, h) <= MAX_SIDE) return { src, w, h, name }

  // Scale down and re-encode (WebP where the browser can, else PNG) until it fits.
  let side = Math.min(MAX_SIDE, Math.max(w, h))
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = side / Math.max(w, h)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * k))
    c.height = Math.max(1, Math.round(h * k))
    const ctx = c.getContext('2d')
    if (!ctx) break
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, c.width, c.height)
    let blob = await encode(c, 'image/webp', 0.9)
    if (!blob || blob.type !== 'image/webp') blob = await encode(c, 'image/png')
    if (blob) {
      const out = await readDataUrl(blob)
      if (out.length <= maxChars) {
        w = c.width
        h = c.height
        return { src: out, w, h, name }
      }
    }
    side = Math.round(side * 0.72)
  }
  throw new AssetTooLargeError('Image too large.')
}
