/* postMessage protocol between a host page and the embedded studio iframe
 * (apps/avatar-studio in `?embed=1` mode).
 *
 * Security rules, on both sides:
 *   - The host passes its own origin as `?origin=` in the iframe URL. The studio posts only
 *     to that origin and ignores messages from any other origin or window.
 *   - The host accepts messages only when `event.origin` is the studio origin AND
 *     `event.source` is the iframe's `contentWindow`.
 *   - Every message is an envelope `{ source: 'arkplay-avatar', v: 1, type, … }`; anything
 *     else is ignored. Unknown `type`s are ignored (forward compatibility).
 *
 * Version 1 is frozen: add optional fields or new message types, never change existing ones. */

import type { AvatarDNA } from '@arkplay/avatar-engine'

export const PROTOCOL_SOURCE = 'arkplay-avatar'
export const PROTOCOL_VERSION = 1

export type StudioTheme = 'dark' | 'light'

/** Options the host passes in the iframe URL (and may update with a `config` message). */
export interface EmbedConfig {
  /** Label of the primary button (default "Save"). */
  saveLabel?: string
  /** Show a Cancel button that sends `cancel` (default true). */
  cancel?: boolean
  /** Restrict the kinds the user can create. */
  kinds?: ('humanoid' | 'creature')[]
  /** Hide the export dialog (a game may only want the DNA back). */
  exports?: boolean
  theme?: StudioTheme
  /** BCP-47 language tag for the UI strings. */
  locale?: string
}

/** Host → studio. */
export type HostMessage =
  | { type: 'load'; dna?: AvatarDNA; code?: string }
  | { type: 'config'; config: EmbedConfig }
  | { type: 'theme'; theme: StudioTheme }
  /** Ask the studio to save now (as if the user pressed Save). */
  | { type: 'requestSave' }

/** Studio → host. */
export type StudioMessage =
  | { type: 'ready'; engineVersion: string }
  /** Debounced (≥250 ms) while the user edits. */
  | { type: 'change'; dna: AvatarDNA; code: string }
  | { type: 'save'; dna: AvatarDNA; code: string; name: string }
  | { type: 'cancel' }
  /** Preferred content height in CSS px, so the host can size the iframe. */
  | { type: 'resize'; height: number }
  | { type: 'error'; code: string; message: string }

export type Envelope<M> = M & { source: typeof PROTOCOL_SOURCE; v: typeof PROTOCOL_VERSION }

export function envelope<M extends { type: string }>(msg: M): Envelope<M> {
  return { ...msg, source: PROTOCOL_SOURCE, v: PROTOCOL_VERSION }
}

/** Narrows an incoming `MessageEvent.data` to a protocol envelope (or null). */
export function readEnvelope<M extends { type: string }>(data: unknown): Envelope<M> | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.source !== PROTOCOL_SOURCE || d.v !== PROTOCOL_VERSION || typeof d.type !== 'string') return null
  return d as Envelope<M>
}

/** Query-string keys of the embed URL. */
export const EMBED_PARAMS = {
  embed: 'embed',
  origin: 'origin',
  code: 'code',
  config: 'config',
} as const
