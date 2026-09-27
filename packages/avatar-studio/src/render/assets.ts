/* Uploaded custom art that lives in the avatar service is referenced by id and resolved
 * to a URL by the host. Canvas exports and <img> thumbnails can't use such URLs (a
 * cross-origin image taints the canvas; an SVG loaded as an image never fetches), so the
 * art is fetched once and inlined as a data URL. */

import type { AvatarDNA } from '@arkplay/avatar-engine'

const cache = new Map<string, Promise<string | undefined>>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('Could not read the image.'))
    r.readAsDataURL(blob)
  })
}

/** A data URL for `url` (cached), or undefined when it can't be fetched. */
export function inlineUrl(url: string): Promise<string | undefined> {
  if (url.startsWith('data:')) return Promise.resolve(url)
  let p = cache.get(url)
  if (!p) {
    p = fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(blobToDataUrl)
      .catch(() => {
        cache.delete(url)
        return undefined
      })
    cache.set(url, p)
  }
  return p
}

/** Asset ids used by custom art in `dna` that have no inline copy. */
export const remoteAssetIds = (dna: AvatarDNA): string[] => [
  ...new Set(dna.accessories.filter((a) => a.id === 'custom' && a.asset?.id && !a.asset.src).map((a) => a.asset?.id as string)),
]

/** id → data URL for every remote asset in `dna`; unresolvable ones are left out. */
export async function inlineAssets(dna: AvatarDNA, assetUrl?: (id: string) => string | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!assetUrl) return out
  await Promise.all(
    remoteAssetIds(dna).map(async (id) => {
      const url = assetUrl(id)
      if (!url) return
      const data = await inlineUrl(url)
      if (data) out[id] = data
    }),
  )
  return out
}
