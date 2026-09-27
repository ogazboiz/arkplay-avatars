/* The editor's tabs, derived from the schema: every section and item slot declares its
 * tab, so a new section or slot shows up in the studio without UI changes. The studio adds
 * two tabs of its own at the end (Remix, About). */

import { SLOTS, sectionsFor, type AvatarKind, type SectionSpec, type SlotSpec, type TabId } from '@arkplay/avatar-engine'

export type StudioTabId = TabId | 'remix' | 'about'

export const TAB_ORDER: readonly TabId[] = [
  'species',
  'body',
  'face',
  'skin',
  'hair',
  'outfit',
  'accessories',
  'limbs',
  'coat',
  'expression',
  'scene',
  'style',
]

export interface TabModel {
  id: StudioTabId
  sections: SectionSpec[]
  /** Item slots edited on this tab (outfit: garments, accessories: accessories). */
  slots: SlotSpec[]
  /** Shows the species preset picker (creatures). */
  species: boolean
}

export function slotsFor(kind: AvatarKind, tab: TabId): SlotSpec[] {
  if (tab !== 'outfit' && tab !== 'accessories') return []
  const want = tab === 'outfit' ? 'garment' : 'accessory'
  return SLOTS.filter((s) => s.kind === want && s.kinds.includes(kind))
}

export function tabsFor(kind: AvatarKind): TabModel[] {
  const sections = sectionsFor(kind)
  const out: TabModel[] = []
  for (const id of TAB_ORDER) {
    const secs = sections.filter((s) => s.tab === id)
    const slots = slotsFor(kind, id)
    const species = id === 'species' && kind === 'creature'
    if (secs.length || slots.length || species) out.push({ id, sections: secs, slots, species })
  }
  out.push({ id: 'remix', sections: [], slots: [], species: false }, { id: 'about', sections: [], slots: [], species: false })
  return out
}

/** Which item list a slot's items live in. */
export const listForSlot = (slot: SlotSpec): 'outfit' | 'accessories' => (slot.kind === 'garment' ? 'outfit' : 'accessories')
