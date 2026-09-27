/* Cache keys for renders. `dnaHash` covers everything a share code carries; custom art
 * that lives only in this DNA (inline data URLs) is left out of share codes, so it is
 * hashed here separately — two avatars differing only in an uploaded sticker must not
 * share a thumbnail. */

import { dnaHash, hashString, type AvatarDNA } from '@arkplay/avatar-engine'

const srcHashes = new Map<string, string>()

function srcKey(src: string | undefined): string {
  if (!src) return ''
  let h = srcHashes.get(src)
  if (!h) {
    // Hashing a 700 kB data URL costs a few ms; do it once per image.
    h = `${hashString(src).toString(36)}.${src.length.toString(36)}`
    if (srcHashes.size > 64) srcHashes.clear()
    srcHashes.set(src, h)
  }
  return h
}

const keyCache = new WeakMap<AvatarDNA, string>()

export function dnaKey(dna: AvatarDNA): string {
  const hit = keyCache.get(dna)
  if (hit) return hit
  let key = dnaHash(dna)
  const custom = dna.accessories.filter((a) => a.id === 'custom')
  if (custom.length) {
    const parts = custom.map((c) => [c.params, c.asset?.id ?? '', srcKey(c.asset?.src), c.asset?.w, c.asset?.h, c.asset?.px, c.asset?.py])
    key += `:${hashString(JSON.stringify(parts)).toString(36)}`
  }
  keyCache.set(dna, key)
  return key
}
