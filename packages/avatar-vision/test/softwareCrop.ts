/* The aligned crop in software, the way the Python reference cuts it (cv2 sampling). Tests use
 * it to prove the browser crop maths against the trainer's reference crops. */

import type { Alignment } from '../src/crop.ts'
import type { PixelImage } from '../src/measure.ts'

/** Bilinear sample with cv2's BORDER_CONSTANT semantics: taps outside the image take `pad`.
 *  (x, y) are continuous source coordinates (pixel k spans [k, k+1)). */
function bilinearPad(img: PixelImage, x: number, y: number, pad: readonly number[], out: number[]): void {
  const fx = x - 0.5
  const fy = y - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const ax = fx - x0
  const ay = fy - y0
  const W = img.width
  const H = img.height
  const d = img.data
  let r = 0
  let g = 0
  let b = 0
  for (let dy = 0; dy < 2; dy++) {
    const wy = dy ? ay : 1 - ay
    const yi = y0 + dy
    for (let dx = 0; dx < 2; dx++) {
      const w = (dx ? ax : 1 - ax) * wy
      if (w === 0) continue
      const xi = x0 + dx
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) {
        r += w * pad[0]
        g += w * pad[1]
        b += w * pad[2]
      } else {
        const o = (yi * W + xi) * 4
        r += w * d[o]
        g += w * d[o + 1]
        b += w * d[o + 2]
      }
    }
  }
  out[0] = r
  out[1] = g
  out[2] = b
}

/** Area (box) downsample of a float RGB square N→n, like cv2.INTER_AREA. */
function areaDown(src: Float32Array, N: number, n: number): Float32Array {
  const out = new Float32Array(n * n * 3)
  const s = N / n
  for (let j = 0; j < n; j++) {
    const y0 = j * s
    const y1 = y0 + s
    for (let i = 0; i < n; i++) {
      const x0 = i * s
      const x1 = x0 + s
      let r = 0
      let g = 0
      let b = 0
      let wsum = 0
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0)
        if (wy <= 0) continue
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0)
          if (wx <= 0) continue
          const w = wx * wy
          const o = (y * N + x) * 3
          r += src[o] * w
          g += src[o + 1] * w
          b += src[o + 2] * w
          wsum += w
        }
      }
      const o = (j * n + i) * 3
      out[o] = r / wsum
      out[o + 1] = g / wsum
      out[o + 2] = b / wsum
    }
  }
  return out
}

/**
 * The aligned crop in software, the way the Python reference does it (the trainer's
 * `aligned_crop`): sample the rotated square bilinearly at `inter` =
 * clamp(round(side), size, 4·size) pixels (about the source resolution), then area-downsample
 * to `size`. Uses only the TS alignment (`fromCrop`). test/crop-parity.test.ts checks it
 * against the trainer's reference crops.
 */
export function softwareCrop(img: PixelImage, al: Alignment, pad: readonly number[]): PixelImage {
  const n = al.size
  const inter = Math.min(Math.max(n, Math.round(al.side)), n * 4)
  const k = n / inter
  const big = new Float32Array(inter * inter * 3)
  const px = [0, 0, 0]
  const m = al.fromCrop
  for (let j = 0; j < inter; j++) {
    const cy = (j + 0.5) * k
    for (let i = 0; i < inter; i++) {
      // Intermediate pixel (i, j) centre in crop coordinates → source (the `apply` maths, inlined).
      const cx = (i + 0.5) * k
      bilinearPad(img, m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f, pad, px)
      const o = (j * inter + i) * 3
      big[o] = px[0]
      big[o + 1] = px[1]
      big[o + 2] = px[2]
    }
  }
  const small = inter === n ? big : areaDown(big, inter, n)
  const data = new Uint8ClampedArray(n * n * 4)
  for (let q = 0; q < n * n; q++) {
    data[q * 4] = Math.round(small[q * 3])
    data[q * 4 + 1] = Math.round(small[q * 3 + 1])
    data[q * 4 + 2] = Math.round(small[q * 3 + 2])
    data[q * 4 + 3] = 255
  }
  return { width: n, height: n, data }
}
