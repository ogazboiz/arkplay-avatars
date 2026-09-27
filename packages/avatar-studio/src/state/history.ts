/* Undo history. Pure and generic so it can be tested without React or the engine.
 *
 * Each state carries the label of the action that produced it, so undo can say what it
 * undid. Continuous edits (a slider drag, typing a name) share a `group`: while the group
 * stays open, commits replace the present instead of pushing, so a whole drag is one
 * step. `seal` closes the group (pointer up, key up, blur). */

export const HISTORY_LIMIT = 100

export interface HistoryEntry<T> {
  value: T
  label: string
}

export interface History<T> {
  past: HistoryEntry<T>[]
  present: T
  presentLabel: string
  /** Nearest redo first. */
  future: HistoryEntry<T>[]
  /** Open coalescing group, if any. */
  group: string | null
}

export function initHistory<T>(value: T, label: string): History<T> {
  return { past: [], present: value, presentLabel: label, future: [], group: null }
}

export interface CommitOptions {
  /** Consecutive commits with the same open group become one step. */
  group?: string
  limit?: number
}

export function commit<T>(h: History<T>, value: T, label: string, opts: CommitOptions = {}): History<T> {
  const group = opts.group ?? null
  // A no-op must not open a group: the next real change would then overwrite the present
  // without pushing it, and the state before the drag would be lost.
  if (value === h.present) return h
  if (group !== null && group === h.group) return { ...h, present: value, presentLabel: label, future: [] }
  const limit = Math.max(1, opts.limit ?? HISTORY_LIMIT)
  const past = [...h.past, { value: h.present, label: h.presentLabel }]
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: value,
    presentLabel: label,
    future: [],
    group,
  }
}

export function seal<T>(h: History<T>): History<T> {
  return h.group === null ? h : { ...h, group: null }
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  if (!prev) return seal(h)
  return {
    past: h.past.slice(0, -1),
    present: prev.value,
    presentLabel: prev.label,
    future: [{ value: h.present, label: h.presentLabel }, ...h.future],
    group: null,
  }
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0]
  if (!next) return seal(h)
  return {
    past: [...h.past, { value: h.present, label: h.presentLabel }],
    present: next.value,
    presentLabel: next.label,
    future: h.future.slice(1),
    group: null,
  }
}

/** Every state from oldest to newest, and which one is current. */
export function timeline<T>(h: History<T>): { entries: HistoryEntry<T>[]; index: number } {
  return { entries: [...h.past, { value: h.present, label: h.presentLabel }, ...h.future], index: h.past.length }
}

/** Moves to a state on the timeline (like pressing undo/redo several times). */
export function jump<T>(h: History<T>, index: number): History<T> {
  const { entries } = timeline(h)
  const i = Math.max(0, Math.min(entries.length - 1, Math.floor(index)))
  if (i === h.past.length) return seal(h)
  return {
    past: entries.slice(0, i),
    present: entries[i].value,
    presentLabel: entries[i].label,
    future: entries.slice(i + 1),
    group: null,
  }
}
