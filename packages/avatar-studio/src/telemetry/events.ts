/* Studio telemetry: what the studio reports through the optional `onTelemetry` prop.
 *
 * Every event is a feature name, an optional small key (a tab, a section or item id, an export
 * format…) and, for `session_end` only, a number (active seconds). Never an account, the
 * avatar, its DNA or anything the player typed. The host decides whether anything leaves the
 * page: the ArkPlay website sends events only after the visitor chose "Accept all". The
 * avatar service's telemetry allowlist must accept every name here.
 *
 * Pure: no React, no DOM. */

export const STUDIO_EVENTS = [
  /** The studio opened (key: the starting avatar's kind). */
  'session_start',
  /** The studio closed or the page went away (value: active seconds; hidden and idle time excluded). */
  'session_end',
  /** Key: tab id. */
  'tab_open',
  /** Key: share | export | photo. */
  'dialog_open',
  /** Key: section id (a slider drag counts once). */
  'param_edit',
  /** Key: item id. */
  'item_add',
  /** Key: slot id. */
  'item_remove',
  'item_edit',
  'item_move',
  /** A paid, limited or NFT item was put on. Key: item id. */
  'premium_preview',
  /** Key: section id, `section.param`, outfit or accessories. */
  'lock_toggle',
  /** Key: all, or the section id. */
  'randomize',
  /** Key: variation | crossover | morph. */
  'remix',
  /** Key: humanoid | creature. */
  'kind_switch',
  /** Key: species id. */
  'species_apply',
  /** Key: theme id. */
  'theme_apply',
  'name_edit',
  'outfit_wear',
  'seed_shuffle',
  'undo',
  'redo',
  'history_jump',
  /** Key: expression id, or none. */
  'expression_preview',
  /** Key: pose id, or none. */
  'pose_preview',
  /** Key: clip name, or none. */
  'clip_preview',
  /** Key: front | side | back. */
  'view_change',
  /** Key: full | fit | bust | head | portrait. */
  'crop_change',
  /** A finished in-browser export. Key: format id. */
  'export',
  'export_error',
  /** Key: code | link. */
  'share_copy',
  'import',
  'photo_apply',
  /** Key: ok | error. */
  'save',
] as const

export type StudioEventName = (typeof STUDIO_EVENTS)[number]

export interface StudioTelemetryEvent {
  name: StudioEventName
  key?: string
  /** Active seconds, on `session_end`. */
  value?: number
}

/** What a host passes as `onTelemetry`. */
export type StudioTelemetrySink = (event: StudioTelemetryEvent) => void

/** Keys the service accepts: short ids, never free text. */
export const TELEMETRY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,47}$/

const NAMES = new Set<string>(STUDIO_EVENTS)

/** The event as it may leave the studio: a known name, a well-formed key, a sane value. */
export function cleanEvent(name: string, key?: unknown, value?: unknown): StudioTelemetryEvent | null {
  if (!NAMES.has(name)) return null
  const e: StudioTelemetryEvent = { name: name as StudioEventName }
  if (typeof key === 'string' && TELEMETRY_KEY_RE.test(key)) e.key = key
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) e.value = Math.min(4 * 3600, Math.round(value))
  return e
}
