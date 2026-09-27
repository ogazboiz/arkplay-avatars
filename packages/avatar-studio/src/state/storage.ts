/* Local persistence: the autosaved draft and the default outfit store. Storage can be
 * missing, blocked (private windows, sandboxed iframes) or full, so every access is
 * wrapped and failure only means "not saved". */

import { normalizeDNA, type AvatarDNA, type Outfit } from '@arkplay/avatar-engine'
import type { OutfitStore } from '../types.ts'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function browserStorage(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage
    return s ?? null
  } catch {
    return null
  }
}

export const DEFAULT_DRAFT_KEY = 'arkplay-avatar-draft'
export const OUTFITS_KEY = 'arkplay-avatar-outfits'

interface DraftRecord {
  v: 1
  dna: unknown
  savedAt: number
}

export function loadDraft(store: KeyValueStore | null, key: string): AvatarDNA | null {
  if (!store) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const rec = JSON.parse(raw) as Partial<DraftRecord>
    if (!rec || typeof rec !== 'object' || !rec.dna || typeof rec.dna !== 'object') return null
    return normalizeDNA(rec.dna)
  } catch {
    return null
  }
}

/** Saves the draft; when inline art overflows the quota, retries without it. */
export function saveDraft(store: KeyValueStore | null, key: string, dna: AvatarDNA, now = Date.now()): boolean {
  if (!store) return false
  const write = (d: AvatarDNA) => {
    try {
      store.setItem(key, JSON.stringify({ v: 1, dna: d, savedAt: now } satisfies DraftRecord))
      return true
    } catch {
      return false
    }
  }
  if (write(dna)) return true
  return write({ ...dna, accessories: dna.accessories.filter((a) => a.id !== 'custom' || a.asset?.id) })
}

type StoredOutfit = Outfit & { id: string; savedAt?: number }

function readOutfits(store: KeyValueStore | null, key: string): StoredOutfit[] {
  if (!store) return []
  try {
    const raw = store.getItem(key)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (o): o is StoredOutfit =>
        !!o && typeof o === 'object' && typeof (o as StoredOutfit).id === 'string' && Array.isArray((o as StoredOutfit).outfit) && Array.isArray((o as StoredOutfit).accessories),
    )
  } catch {
    return []
  }
}

let idCounter = 0
const newId = (now: number) => `o_${now.toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

/** The default OutfitStore: localStorage, newest first, capped so it can't fill the quota. */
export function localOutfitStore(store: KeyValueStore | null = browserStorage(), key = OUTFITS_KEY, max = 60): OutfitStore {
  const write = (list: StoredOutfit[]) => {
    if (!store) throw new Error('Storage is not available.')
    store.setItem(key, JSON.stringify(list.slice(0, max)))
  }
  return {
    async list() {
      return readOutfits(store, key).map(({ id, name, outfit, accessories }) => ({ id, name, outfit, accessories }))
    },
    async save(o) {
      const now = Date.now()
      const rec: StoredOutfit = { id: newId(now), name: o.name, outfit: o.outfit, accessories: o.accessories, savedAt: now }
      write([rec, ...readOutfits(store, key)])
      return { id: rec.id, name: rec.name, outfit: rec.outfit, accessories: rec.accessories }
    },
    async remove(id) {
      write(readOutfits(store, key).filter((o) => o.id !== id))
    },
  }
}
