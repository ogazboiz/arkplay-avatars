/* Telemetry at the studio's feature entry points, without touching the components: the studio
 * root passes its actions through `instrumentActions`, and every component that edits the
 * avatar (sections, wardrobe, species, remix, history…) reports through the same calls.
 *
 * - A slider drag reports once (its coalescing `group`), and so does typing a name.
 * - `load` is classified by its history label: photo, import, remix variation or crossover.
 * - Undo, redo and history jumps are read from history changes instead (`historyStep`), so
 *   the keyboard shortcuts and the toast's Undo count too.
 *
 * Pure (no React): test/telemetry.test.ts drives it with fake actions. */

import { itemSpec, itemTier } from '@arkplay/avatar-engine'
import type { StudioActions } from '../components/context.ts'
import type { History } from '../state/history.ts'
import type { StudioStrings } from '../strings.ts'
import type { StudioEventName } from './events.ts'

export type Emit = (name: StudioEventName, key?: string, value?: number) => void

export type LabelStrings = Pick<StudioStrings, 'h_fromPhoto' | 'h_load' | 'h_variation' | 'h_child' | 'h_morph'>

/** Typing a name counts once per this many ms of typing. */
export const NAME_QUIET_MS = 10_000

export function instrumentActions(a: StudioActions, emit: Emit, s: LabelStrings, now: () => number = Date.now): StudioActions {
  let lastGroup: string | null = null
  let nameAt = -Infinity
  const slotOf = (list: 'outfit' | 'accessories', index: number): string | undefined => itemSpec(a.current()[list][index]?.id ?? '')?.slot
  /** True for the first commit of a coalescing group (a drag), and for every ungrouped one. */
  const fresh = (group?: string): boolean => {
    const first = !group || group !== lastGroup
    lastGroup = group ?? null
    return first
  }
  return {
    ...a,
    seal() {
      lastGroup = null
      a.seal()
    },
    setParam(section, key, value, label, group) {
      if (fresh(group)) emit('param_edit', section)
      a.setParam(section, key, value, label, group)
    },
    setItemParam(list, index, key, value, label, group) {
      if (fresh(group)) emit('item_edit', slotOf(list, index))
      a.setItemParam(list, index, key, value, label, group)
    },
    addItem(id, params, asset) {
      emit('item_add', id)
      if (itemTier(id) !== 'free') emit('premium_preview', id)
      a.addItem(id, params, asset)
    },
    removeItem(list, index) {
      emit('item_remove', slotOf(list, index))
      a.removeItem(list, index)
    },
    removeSlot(list, slot) {
      emit('item_remove', slot)
      a.removeSlot(list, slot)
    },
    moveItem(list, index, delta) {
      emit('item_move', slotOf(list, index))
      a.moveItem(list, index, delta)
    },
    load(dna, label) {
      if (label === s.h_fromPhoto) emit('photo_apply')
      else if (label === s.h_variation) emit('remix', 'variation')
      else if (label === s.h_child) emit('remix', 'crossover')
      else if (label === s.h_load) emit('import')
      a.load(dna, label)
    },
    edit(label, fn, group) {
      if (fresh(group) && label === s.h_morph) emit('remix', 'morph')
      a.edit(label, fn, group)
    },
    randomize() {
      emit('randomize', 'all')
      a.randomize()
    },
    randomizeSection(id, label) {
      emit('randomize', id)
      a.randomizeSection(id, label)
    },
    toggleLock(id) {
      emit('lock_toggle', id)
      a.toggleLock(id)
    },
    setKind(kind) {
      if (kind !== a.current().kind) emit('kind_switch', kind)
      a.setKind(kind)
    },
    applySpecies(id) {
      emit('species_apply', id)
      a.applySpecies(id)
    },
    setName(name) {
      const t = now()
      if (t - nameAt > NAME_QUIET_MS) emit('name_edit')
      nameAt = t
      a.setName(name)
    },
    wearOutfit(o) {
      emit('outfit_wear')
      a.wearOutfit(o)
    },
    shuffleSeed() {
      emit('seed_shuffle')
      a.shuffleSeed()
    },
  }
}

/** What moved the history from `prev` to `next`: an undo, a redo, a jump along the timeline
 *  (About's history list), or null (an edit or nothing). A one-step jump reads as undo/redo. */
export function historyStep<T>(prev: History<T>, next: History<T>): 'undo' | 'redo' | 'jump' | null {
  if (prev === next || prev.present === next.present) return null
  const before = prev.past[prev.past.length - 1]
  if (before && next.present === before.value && next.future[0]?.value === prev.present) return 'undo'
  const after = prev.future[0]
  if (after && next.present === after.value && next.past[next.past.length - 1]?.value === prev.present) return 'redo'
  if (prev.past.some((e) => e.value === next.present) || prev.future.some((e) => e.value === next.present)) return 'jump'
  return null
}
