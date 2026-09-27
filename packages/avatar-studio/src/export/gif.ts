/// <reference path="../gifenc.d.ts" />
/* Animated GIF encoding with gifenc: one palette per frame (avatars change colour between
 * frames only a little, but shading and effects do), optional 1-bit transparency. */

import { GIFEncoder, applyPalette, quantize } from 'gifenc'

export interface GifWriter {
  add(rgba: Uint8ClampedArray, delayMs: number): void
  finish(): Uint8Array
}

export function createGif(width: number, height: number, transparent: boolean): GifWriter {
  const gif = GIFEncoder()
  let first = true
  return {
    add(rgba, delayMs) {
      const delay = Math.max(20, Math.round(delayMs / 10) * 10)
      if (transparent) {
        const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaThreshold: 110 })
        const index = applyPalette(rgba, palette, 'rgba4444')
        const t = palette.findIndex((c) => c[3] === 0)
        gif.writeFrame(index, width, height, { palette, delay, transparent: t >= 0, transparentIndex: Math.max(0, t), repeat: first ? 0 : undefined })
      } else {
        const palette = quantize(rgba, 256)
        const index = applyPalette(rgba, palette)
        gif.writeFrame(index, width, height, { palette, delay, repeat: first ? 0 : undefined })
      }
      first = false
    },
    finish() {
      gif.finish()
      return gif.bytes()
    },
  }
}
