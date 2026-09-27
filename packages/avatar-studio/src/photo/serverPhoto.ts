/* "From photo" on the server (docs/studio.md, phase 3): the photo is analysed by
 * the avatar service, not in this browser. Before it leaves, it is drawn upright (EXIF
 * orientation applied) on a canvas no larger than PHOTO_MAX_SIDE and re-encoded as a JPEG, so what
 * is uploaded carries no EXIF data at all (no GPS, no camera details) and stays small. The JPEG is
 * kept in memory only while the dialog is open (for "Try again"), never stored. */

import { PHOTO_MAX_SIDE } from '@arkplay/avatar-client'

/** Why the service couldn't make avatars from the photo (maps to the dialog's messages). */
export type PhotoServerErrorCode = 'no_face' | 'too_small' | 'too_dark' | 'too_large' | 'busy' | 'unavailable' | 'offline' | 'failed'

export class PhotoServerError extends Error {
  readonly code: PhotoServerErrorCode
  readonly retryAfter?: number
  constructor(code: PhotoServerErrorCode, message: string, retryAfter?: number) {
    super(message)
    this.name = 'PhotoServerError'
    this.code = code
    this.retryAfter = retryAfter
  }
}

/** The photo as an upright JPEG, at most PHOTO_MAX_SIDE on its longest side, without EXIF. */
export async function prepareUpload(photo: Blob | HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  const src: ImageBitmap | HTMLCanvasElement = photo instanceof Blob ? await createImageBitmap(photo, { imageOrientation: 'from-image' }) : photo
  try {
    const w = src.width
    const h = src.height
    if (!(w > 0 && h > 0)) throw new PhotoServerError('failed', 'The photo has no pixels.')
    const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * k))
    c.height = Math.max(1, Math.round(h * k))
    const ctx = c.getContext('2d')
    if (!ctx) throw new PhotoServerError('failed', 'This browser cannot draw images.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, c.width, c.height)
    const jpeg = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', quality))
    // Wipe the copy on the canvas: nothing about the photo stays on the page.
    ctx.clearRect(0, 0, c.width, c.height)
    c.width = c.height = 0
    if (!jpeg) throw new PhotoServerError('failed', 'This browser cannot encode JPEG.')
    return jpeg
  } finally {
    if ('close' in src) src.close()
  }
}
