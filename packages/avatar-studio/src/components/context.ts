/* React contexts shared by the studio's components.
 *
 * Actions are stable for the studio's lifetime (they read the latest state through refs),
 * so memoized section cards don't re-render when an unrelated part of the avatar changes.
 * Thumbnail inputs live in their own context and change only after edits settle. */

import { createContext, useContext } from 'react'
import type { AvatarDNA, AvatarKind, CustomAsset, Outfit, ParamValue, Params } from '@arkplay/avatar-engine'
import type { Lookup } from '../state/params.ts'
import type { PremiumService } from '../render/premium.ts'
import type { ThumbService } from '../render/thumbs.ts'
import { STRINGS, type StudioStrings } from '../strings.ts'
import type { OutfitStore } from '../types.ts'

export type ItemList = 'outfit' | 'accessories'

export interface ToastAction {
  label: string
  run: () => void
}

export interface StudioActions {
  edit(label: string, fn: (dna: AvatarDNA) => AvatarDNA, group?: string): void
  /** Closes the open coalescing group: the next edit starts a new undo step. */
  seal(): void
  setParam(section: string, key: string, value: ParamValue, label: string, group?: string): void
  setItemParam(list: ItemList, index: number, key: string, value: ParamValue, label: string, group?: string): void
  addItem(id: string, params?: Params, asset?: CustomAsset): void
  removeItem(list: ItemList, index: number): void
  removeSlot(list: ItemList, slot: string): void
  moveItem(list: ItemList, index: number, delta: number): void
  load(dna: AvatarDNA, label?: string): void
  undo(): void
  redo(): void
  jump(index: number): void
  randomize(): void
  randomizeSection(id: string, label: string): void
  toggleLock(id: string): void
  setLocks(ids: string[]): void
  setKind(kind: AvatarKind): void
  applySpecies(id: string): void
  setName(name: string): void
  wearOutfit(o: Outfit): void
  shuffleSeed(): void
  announce(text: string): void
  toast(text: string, action?: ToastAction): void
  /** Reads another section's value (visibleIf across sections). */
  lookup: Lookup
  current(): AvatarDNA
}

export interface StudioEnv {
  assetUrl?: (id: string) => string | undefined
  uploadAsset?: (file: File) => Promise<CustomAsset>
  outfitStore: OutfitStore
  shareUrl: (code: string) => string
  /** The avatar service's drawings of premium looks (premium core), when the host gave `previewBase`. */
  premium?: PremiumService
  /** Downloads come from the service (host prop `serverExports`, with `previewBase`). */
  serverExports?: boolean
  /** The service draws the stage and the tiles (host prop `serverStudio`, with `previewBase`). */
  serverStudio?: boolean
  /** The service analyses photos for "From photo" (host prop `serverPhoto`, with `previewBase`). */
  serverPhoto?: boolean
  /** Where picker tiles come from: the service's (server rendering), else the shared browser pool. */
  thumbs?: ThumbService
}

/** What thumbnails render from: the avatar once edits settle, and its cache key. */
export interface ThumbBase {
  dna: AvatarDNA
  key: string
  assets?: Record<string, string>
}

export const ActionsContext = createContext<StudioActions | null>(null)
export const StringsContext = createContext<StudioStrings>(STRINGS)
export const EnvContext = createContext<StudioEnv | null>(null)
export const ThumbContext = createContext<ThumbBase | null>(null)

export function useActions(): StudioActions {
  const a = useContext(ActionsContext)
  if (!a) throw new Error('Studio components must be rendered inside <AvatarStudio>.')
  return a
}

export const useStrings = (): StudioStrings => useContext(StringsContext)

export function useEnv(): StudioEnv {
  const e = useContext(EnvContext)
  if (!e) throw new Error('Studio components must be rendered inside <AvatarStudio>.')
  return e
}

export function useThumbBase(): ThumbBase {
  const t = useContext(ThumbContext)
  if (!t) throw new Error('Studio components must be rendered inside <AvatarStudio>.')
  return t
}
