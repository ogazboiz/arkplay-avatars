/* Helpers for turning ParamSpecs into controls: which params show, how values read out,
 * and which choices get live thumbnails. Pure. */

import { isVisible, type AvatarDNA, type ChoiceSpec, type ParamSpec, type ParamValue, type Params, type RangeSpec, type TabId } from '@arkplay/avatar-engine'
import type { ThumbCrop } from '../render/job.ts'

export type Lookup = (section: string, key: string) => ParamValue | undefined

export const lookupIn =
  (dna: AvatarDNA): Lookup =>
  (section, key) =>
    dna.sections[section]?.[key]

/** Visible params split into the everyday ones and the folded "More options". */
export function visibleParams(specs: readonly ParamSpec[], params: Params, lookup?: Lookup): { basic: ParamSpec[]; advanced: ParamSpec[] } {
  const basic: ParamSpec[] = []
  const advanced: ParamSpec[] = []
  for (const s of specs) {
    if (!isVisible(s, params, lookup)) continue
    ;(s.advanced ? advanced : basic).push(s)
  }
  return { basic, advanced }
}

/** Values of other sections that decide visibility here (for memoizing section cards). */
export function crossSectionKey(specs: readonly ParamSpec[], lookup: Lookup): string {
  let out = ''
  for (const s of specs) {
    const vi = s.visibleIf
    if (vi?.section) out += `${vi.section}.${vi.key}=${String(lookup(vi.section, vi.key))};`
  }
  return out
}

const isUnit = (s: RangeSpec) => s.min === 0 && s.max === 1

/** The number shown next to a slider: 0–100 for unit ranges, integers for stepped ones. */
export function formatRange(spec: RangeSpec, v: number): string {
  if (isUnit(spec)) return String(Math.round(v * 100))
  if (spec.step >= 1) return String(Math.round(v))
  const decimals = Math.min(3, Math.max(0, Math.ceil(-Math.log10(spec.step))))
  return v.toFixed(decimals)
}

/** Screen-reader text for a slider value, with its end labels when it has them. */
export function rangeValueText(spec: RangeSpec, v: number): string {
  const shown = formatRange(spec, v)
  if (!spec.ends) return shown
  const t = (v - spec.min) / (spec.max - spec.min || 1)
  const near = t < 0.34 ? spec.ends[0] : t > 0.66 ? spec.ends[1] : `${spec.ends[0]}–${spec.ends[1]}`
  return `${shown} (${near})`
}

export const isDefault = (spec: ParamSpec, v: ParamValue | undefined): boolean => v === undefined || v === spec.default

/** How a choice renders: thumbnails (and of what) or plain chips. */
export interface ChoiceLook {
  crop: ThumbCrop
  /** Include the scene background and frame in the thumbnail. */
  scene: boolean
}

export function choiceLook(spec: ChoiceSpec, tab: TabId): ChoiceLook | null {
  if (spec.preview && spec.preview !== 'none') return { crop: spec.preview, scene: false }
  // Scene and art-style choices change the whole picture: show them on a portrait.
  if (spec.preview === undefined && (tab === 'scene' || tab === 'style')) return { crop: 'portrait', scene: true }
  return null
}
