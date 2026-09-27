/* Reading avatars that users paste or open: share codes, share links and JSON files
 * (bare DNA or `{ dna }` wrappers such as the service's avatar records). Pure. */

import { decodeShareCode, normalizeDNA, ShareCodeError, validateDNA, type AvatarDNA, type NormalizeReport } from '@arkplay/avatar-engine'

export type ParseError = 'empty' | 'notAvatar' | 'badCode' | 'badJson'

export type ParseResult =
  | { ok: true; dna: AvatarDNA; warnings: string[] }
  | { ok: false; error: ParseError; message: string }

const CODE_RE = /(?:^|[#?&])code=([A-Za-z0-9_-]+)/
/** A bare share code: A2 (current) or A1 (older, still valid). Line breaks inside a pasted
 *  code are ignored, as `decodeShareCode` does. */
const BARE_CODE_RE = /^A[12][A-Za-z0-9_-]+$/

/** Pulls a share code out of a link (`#code=` or `?code=`), if there is one. */
export function codeFromUrl(text: string): string | null {
  const m = CODE_RE.exec(text.trim())
  return m ? m[1] : null
}

function fromObject(obj: unknown): ParseResult {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'notAvatar', message: 'Not an avatar.' }
  const o = obj as Record<string, unknown>
  // Accept wrappers: { dna: {...} } (service records, exports) and { code: 'A2…' }.
  if (o.dna && typeof o.dna === 'object') return fromObject(o.dna)
  if (typeof o.code === 'string' && !('sections' in o)) return fromCode(o.code)
  if (!('sections' in o) && !('kind' in o)) return { ok: false, error: 'notAvatar', message: 'Not an avatar.' }
  const warnings = validateDNA(o)
  return { ok: true, dna: normalizeDNA(o), warnings }
}

function fromCode(code: string): ParseResult {
  const report: NormalizeReport = { warnings: [] }
  try {
    const dna = decodeShareCode(code, report)
    return { ok: true, dna, warnings: report.warnings }
  } catch (e) {
    const message = e instanceof ShareCodeError ? e.message : 'That avatar code could not be read.'
    return { ok: false, error: 'badCode', message }
  }
}

export function parseAvatarInput(input: string): ParseResult {
  const text = input.trim()
  if (!text) return { ok: false, error: 'empty', message: 'Nothing to load.' }
  if (text.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return { ok: false, error: 'badJson', message: e instanceof Error ? e.message : String(e) }
    }
    return fromObject(parsed)
  }
  const fromLink = codeFromUrl(text)
  if (fromLink) return fromCode(fromLink)
  if (BARE_CODE_RE.test(text.replace(/\s+/g, ''))) return fromCode(text)
  return { ok: false, error: 'notAvatar', message: 'Not an avatar code, link or JSON.' }
}

/** Accepts what the `initial` prop allows: DNA (normalized) or a share code / link. */
export function resolveAvatar(input: AvatarDNA | string): ParseResult {
  if (typeof input === 'string') return parseAvatarInput(input)
  return fromObject(input)
}

/** Custom art that exists only inside this DNA (no uploaded asset id): share codes drop it. */
export const hasLocalArt = (dna: AvatarDNA): boolean => dna.accessories.some((a) => a.id === 'custom' && !a.asset?.id)
