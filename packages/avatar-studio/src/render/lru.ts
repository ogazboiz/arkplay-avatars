/* A least-recently-used cache with pinning. Pinned entries (thumbnails on screen right
 * now) are never evicted, so an <img> never loses the object URL it is showing. Pure. */

export interface Lru<V> {
  get(key: string): V | undefined
  has(key: string): boolean
  set(key: string, value: V): void
  delete(key: string): void
  pin(key: string): void
  unpin(key: string): void
  readonly size: number
  keys(): string[]
  clear(): void
}

export function createLru<V>(max: number, onEvict?: (key: string, value: V) => void): Lru<V> {
  // Map iteration order is insertion order: re-inserting on access keeps the oldest first.
  const map = new Map<string, V>()
  const pins = new Map<string, number>()

  // `keep` is the entry just stored: it is about to be used, so it is never the victim (the
  // cache runs over capacity instead when everything older is pinned).
  const evict = (keep?: string) => {
    if (map.size <= max) return
    for (const key of map.keys()) {
      if (map.size <= max) break
      if (pins.get(key) || key === keep) continue
      const v = map.get(key) as V
      map.delete(key)
      onEvict?.(key, v)
    }
  }

  return {
    get(key) {
      if (!map.has(key)) return undefined
      const v = map.get(key) as V
      map.delete(key)
      map.set(key, v)
      return v
    },
    has: (key) => map.has(key),
    set(key, value) {
      const old = map.get(key)
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      if (old !== undefined && old !== value) onEvict?.(key, old)
      evict(key)
    },
    delete(key) {
      if (!map.has(key)) return
      const v = map.get(key) as V
      map.delete(key)
      pins.delete(key)
      onEvict?.(key, v)
    },
    pin(key) {
      pins.set(key, (pins.get(key) ?? 0) + 1)
    },
    unpin(key) {
      const n = (pins.get(key) ?? 0) - 1
      if (n > 0) pins.set(key, n)
      else pins.delete(key)
      evict()
    },
    get size() {
      return map.size
    },
    keys: () => [...map.keys()],
    clear() {
      for (const [k, v] of map) onEvict?.(k, v)
      map.clear()
      pins.clear()
    },
  }
}
