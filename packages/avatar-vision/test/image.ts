/* Node-only image helpers for tests and scripts (no DOM): a small PNG decoder (8-bit
 * grey/RGB/RGBA, non-interlaced, all filters), JPEG decoding through resvg (the fixture photos
 * are baseline JPEGs), an image diff and the Python pipeline's resampling (`softwareCrop`). */

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { Resvg } from '@resvg/resvg-js'
import type { PixelImage } from '../src/measure.ts'

export { softwareCrop } from './softwareCrop.ts'

export function decodePNG(buf: Uint8Array): PixelImage {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!sig.every((b, i) => buf[i] === b)) throw new Error('not a PNG')
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let o = 8
  let width = 0
  let height = 0
  let depth = 0
  let ctype = 0
  let interlace = 0
  const idat: Uint8Array[] = []
  while (o < buf.length) {
    const len = dv.getUint32(o)
    const type = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7])
    const data = buf.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      width = dv.getUint32(o + 8)
      height = dv.getUint32(o + 12)
      depth = data[8]
      ctype = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    o += 12 + len
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`)
  const ch = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 4 ? 2 : ctype === 6 ? 4 : 0
  if (!ch) throw new Error(`unsupported PNG colour type ${ctype}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * ch
  const px = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = src[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      row[x] = v & 255
    }
  }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * ch
    const g = ch <= 2
    data[i * 4] = px[s]
    data[i * 4 + 1] = g ? px[s] : px[s + 1]
    data[i * 4 + 2] = g ? px[s] : px[s + 2]
    data[i * 4 + 3] = ch === 4 ? px[s + 3] : ch === 2 ? px[s + 1] : 255
  }
  return { width, height, data }
}

/** Width and height from a JPEG's SOF marker. */
export function jpegSize(buf: Uint8Array): { width: number; height: number } {
  let o = 2
  while (o < buf.length) {
    if (buf[o] !== 0xff) throw new Error('bad JPEG marker')
    const m = buf[o + 1]
    const len = (buf[o + 2] << 8) | buf[o + 3]
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf))
      return { height: (buf[o + 5] << 8) | buf[o + 6], width: (buf[o + 7] << 8) | buf[o + 8] }
    o += 2 + len
  }
  throw new Error('no SOF in JPEG')
}

/** Decodes a JPEG or PNG file to RGBA (JPEG through resvg's decoder, drawn 1:1). */
export function decodeImageFile(file: string): PixelImage {
  const buf = readFileSync(file)
  if (buf[0] === 0x89) return decodePNG(buf)
  const { width, height } = jpegSize(buf)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" image-rendering="optimizeSpeed" href="data:image/jpeg;base64,${buf.toString('base64')}"/></svg>`
  const r = new Resvg(svg, { fitTo: { mode: 'original' } }).render()
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.pixels) }
}

/** Mean and 99th-percentile absolute difference over RGB, in 0..255 levels. */
export function imageDiff(a: PixelImage, b: PixelImage): { mean: number; p99: number; max: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch')
  const hist = new Uint32Array(256)
  let s = 0
  const n = a.width * a.height * 3
  for (let i = 0; i < a.width * a.height; i++)
    for (let c = 0; c < 3; c++) {
      const v = Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c])
      hist[v]++
      s += v
    }
  let max = 0
  let p99 = -1
  let seen = 0
  for (let v = 0; v < 256; v++) {
    if (!hist[v]) continue
    max = v
    seen += hist[v]
    if (p99 < 0 && seen > Math.floor(n * 0.99)) p99 = v
  }
  return { mean: s / n, p99, max }
}
