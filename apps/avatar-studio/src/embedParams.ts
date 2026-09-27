/* Reading the embed URL (`?embed=1&origin=…&code=…&config=…`). The host's origin is the
 * only address the studio will ever post to, so it must be an exact http(s) origin. */

import { EMBED_PARAMS, type EmbedConfig } from '@arkplay/avatar-client'

/** The origin if `raw` is exactly an http(s) origin (a trailing slash is tolerated). */
export function validOrigin(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (raw !== u.origin && raw !== `${u.origin}/`) return null
    return u.origin
  } catch {
    return null
  }
}

/** Keeps only well-formed config fields; unknown fields are ignored (forward compatible). */
export function sanitizeConfig(input: unknown): EmbedConfig {
  if (!input || typeof input !== 'object') return {}
  const c = input as Record<string, unknown>
  const out: EmbedConfig = {}
  if (typeof c.saveLabel === 'string' && c.saveLabel.trim()) out.saveLabel = c.saveLabel.trim().slice(0, 40)
  if (typeof c.cancel === 'boolean') out.cancel = c.cancel
  if (typeof c.exports === 'boolean') out.exports = c.exports
  if (c.theme === 'dark' || c.theme === 'light') out.theme = c.theme
  if (typeof c.locale === 'string') out.locale = c.locale.slice(0, 35)
  if (Array.isArray(c.kinds)) {
    const kinds = c.kinds.filter((k): k is 'humanoid' | 'creature' => k === 'humanoid' || k === 'creature')
    if (kinds.length) out.kinds = [...new Set(kinds)]
  }
  return out
}

export interface EmbedParams {
  embed: boolean
  origin: string | null
  /** The raw origin parameter (for the error message). */
  rawOrigin: string | null
  code: string | null
  config: EmbedConfig
}

export function readParams(search: string, hash: string): EmbedParams {
  const q = new URLSearchParams(search)
  let config: EmbedConfig = {}
  const raw = q.get(EMBED_PARAMS.config)
  if (raw) {
    try {
      config = sanitizeConfig(JSON.parse(raw))
    } catch {
      config = {}
    }
  }
  const fromHash = /[#&]code=([A-Za-z0-9_-]+)/.exec(hash)?.[1] ?? null
  return {
    embed: q.get(EMBED_PARAMS.embed) === '1',
    origin: validOrigin(q.get(EMBED_PARAMS.origin)),
    rawOrigin: q.get(EMBED_PARAMS.origin),
    code: q.get(EMBED_PARAMS.code) || fromHash,
    config,
  }
}
