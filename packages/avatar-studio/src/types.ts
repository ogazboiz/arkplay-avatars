/* Public props and host-facing contracts of the studio. The ArkPlay website and the
 * studio app depend on these names; add optional fields, never rename. */

import type { ReactNode, Ref } from 'react'
import type { AvatarDNA, AvatarKind, CustomAsset, Outfit } from '@arkplay/avatar-engine'
import type { StudioStrings } from './strings.ts'
import type { StudioTelemetryEvent } from './telemetry/events.ts'
import type { PreviewFetch } from './render/premium.ts' // premium core (G)

/** Where saved looks (outfits) live. The default keeps them in localStorage. */
export interface OutfitStore {
  list(): Promise<(Outfit & { id: string })[]>
  save(o: Outfit): Promise<Outfit & { id: string }>
  remove(id: string): Promise<void>
}

export interface SaveResult {
  dna: AvatarDNA
  code: string
  name: string
}

/** Imperative controls, for hosts that drive the studio (the iframe embed does). */
export interface AvatarStudioHandle {
  /** The current avatar. */
  getDNA(): AvatarDNA
  /** Loads DNA or a share code as a new undoable step. Returns an error message on failure. */
  load(avatar: AvatarDNA | string): string | null
  /** Runs the same flow as the Save button (no-op without `onSave`). */
  save(): Promise<void>
  undo(): void
  redo(): void
  randomize(): void
}

export interface AvatarStudioProps {
  /**
   * "From photo" (@arkplay/avatar-vision: on this device, or on the service with `serverPhoto`). Default on whenever humanoids are
   * allowed; `false` hides it; `{ modelBase }` points at where the vision models are served
   * (default /avatar/v1/vision/models/).
   */
  photo?: boolean | { modelBase?: string }
  /** DNA or share code; default: a random humanoid (or the local draft if autosave is on).
   *  Read on mount; later changes load the new avatar as an undoable step. */
  initial?: AvatarDNA | string
  /** After every committed edit (slider drags report once, on release). */
  onChange?: (dna: AvatarDNA) => void
  /** Shows a Save button. The studio shows a busy state while the promise runs and the
   *  error message inline if it rejects. */
  onSave?: (r: SaveResult) => void | Promise<void>
  /** Shows a Cancel button. */
  onCancel?: () => void
  saveLabel?: string
  /** Kinds the user may create (default both). */
  kinds?: AvatarKind[]
  /** Show the export dialog (default true). */
  exports?: boolean
  /** Stores uploaded art in the host (the avatar service). Default: an inline data URL,
   *  local to this device, with a warning. */
  uploadAsset?: (file: File) => Promise<CustomAsset>
  /**
   * The Custom art slot and its uploader (default true). `false` hides both. Use it when the
   * host can't store uploads and wouldn't accept inline art either: the avatar service
   * refuses to save inline art, and a lite deployment takes no uploads.
   */
  customArt?: boolean
  /** Resolves an uploaded asset id to an image URL. */
  assetUrl?: (id: string) => string | undefined
  /**
   * Premium looks (premium core, docs/studio.md). The art of paid, limited and NFT
   * items is not in the browser engine, which draws a neutral placeholder for them; the avatar
   * service draws them. The avatar API base (e.g. `/avatar/v1`, same origin as the page): the
   * stage then shows the service's render whenever the avatar wears premium items
   * (`POST {previewBase}/studio/preview`), premium picker tiles come from
   * `{previewBase}/catalog/items/{id}.svg`, and exports of premium looks use the service.
   * Without it premium items stay placeholders and the studio says so.
   */
  previewBase?: string
  /** The `fetch` for those service calls, e.g. to add the player's bearer token (their own
   *  preview bucket). Default: `fetch` with same-origin credentials. */
  previewFetch?: PreviewFetch
  /**
   * Server exports (docs/studio.md): every download is made by the avatar
   * service (`POST {previewBase}/studio/export`), which also checks paid formats. Needs
   * `previewBase`. Default false: the browser makes free looks' files, as before.
   */
  serverExports?: boolean
  /**
   * Server rendering of the whole studio (docs/studio.md): the stage, clip
   * playback and every picker tile are drawn by the avatar service (`POST {previewBase}/studio/preview`
   * and `/studio/tiles`); nothing is drawn in the browser. Needs `previewBase`. Default false.
   */
  serverStudio?: boolean
  /**
   * "From photo" on the server (docs/studio.md, phase 3): the avatar service
   * analyses the photo (`POST {previewBase}/vision/avatar`) instead of this browser; the consent
   * screen says so. Needs `previewBase`. Default false.
   */
  serverPhoto?: boolean
  outfitStore?: OutfitStore
  /** localStorage autosave key (default 'arkplay-avatar-draft'); false disables autosave. */
  draftKey?: string | false
  theme?: 'dark' | 'light'
  strings?: Partial<StudioStrings>
  /** Builds the "Copy link" URL (default: this page + '#code=' + code). */
  shareUrl?: (code: string) => string
  /** Host slot at the end of the toolbar (a "Saved avatars" menu, for example). */
  toolbarExtra?: ReactNode
  className?: string
  ref?: Ref<AvatarStudioHandle>
  /**
   * Studio telemetry (F, src/telemetry): anonymous feature-use events (tabs, edits by section,
   * exports by format, session start/end with active seconds). Never an account, DNA or text.
   * Omit it (the default) and nothing is reported; hosts pass it only with the visitor's consent.
   */
  onTelemetry?: (event: StudioTelemetryEvent) => void
}
