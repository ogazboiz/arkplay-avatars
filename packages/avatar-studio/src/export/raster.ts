/* SVG → canvas → image bytes, in the browser. */

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError')
}

/** Lets the page breathe between heavy steps (and makes cancelling responsive). */
export const yieldToPage = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface DrawOptions {
  /** Paint this colour first (JPEG and video have no transparency). */
  fill?: string
  smoothing?: boolean
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(width))
  c.height = Math.max(1, Math.round(height))
  return c
}

export function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser cannot draw images (no 2D canvas).')
  return ctx
}

export async function rasterize(svg: string, width: number, height: number, o: DrawOptions = {}): Promise<HTMLCanvasElement> {
  const img = await loadSvgImage(svg)
  const c = makeCanvas(width, height)
  const ctx = context2d(c)
  if (o.fill) {
    ctx.fillStyle = o.fill
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.imageSmoothingEnabled = o.smoothing !== false
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error(`This browser can't encode ${type}.`))), type, quality)
  })
}

/** Snaps alpha to fully on or off: pixel art has no half-transparent edges. */
export function hardenAlpha(c: HTMLCanvasElement, threshold = 110): void {
  const ctx = context2d(c)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > threshold ? 255 : 0
  ctx.putImageData(img, 0, 0)
}

/** Nearest-neighbour upscale by a whole factor. */
export function upscale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = makeCanvas(src.width * factor, src.height * factor)
  const ctx = context2d(c)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}
