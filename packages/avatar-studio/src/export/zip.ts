/* Zipping export bundles with fflate. PNGs are already compressed, so they are stored. */

import { strToU8, zipSync, type Zippable } from 'fflate'

export type ZipEntry = { name: string; data: Blob | string | Uint8Array }

export async function zipFiles(entries: ZipEntry[]): Promise<Blob> {
  const files: Zippable = {}
  for (const e of entries) {
    const bytes = typeof e.data === 'string' ? strToU8(e.data) : e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer())
    const stored = /\.(png|webp|jpe?g|gif|webm|zip)$/i.test(e.name)
    files[e.name] = [bytes, { level: stored ? 0 : 6 }]
  }
  const out = zipSync(files)
  return new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}
