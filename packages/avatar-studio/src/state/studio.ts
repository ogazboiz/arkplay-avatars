/* The studio's document state: the avatar history, randomize locks and the per-kind
 * stash. Edits arrive as pure functions of the current avatar, so a burst of events never
 * applies an edit to a stale copy. Pure: no React, no DOM. */

import type { AvatarDNA, AvatarKind } from '@arkplay/avatar-engine'
import { commit, initHistory, jump, redo, seal, undo, type History } from './history.ts'

export interface StudioState {
  history: History<AvatarDNA>
  /** Section ids, `section.key` params, or 'outfit' / 'accessories'. */
  locks: string[]
  /** The last avatar of each kind, so switching kind and back keeps both avatars. */
  stash: Partial<Record<AvatarKind, AvatarDNA>>
}

export type StudioAction =
  | { type: 'edit'; label: string; fn: (dna: AvatarDNA) => AvatarDNA; group?: string }
  | { type: 'seal' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'jump'; index: number }
  /** Replaces the avatar as one undoable step. */
  | { type: 'load'; dna: AvatarDNA; label: string }
  | { type: 'toggleLock'; id: string }
  | { type: 'setLocks'; locks: string[] }
  | { type: 'setKind'; kind: AvatarKind; label: string; make: (kind: AvatarKind, from: AvatarDNA) => AvatarDNA }

export function initStudio(dna: AvatarDNA, label: string): StudioState {
  return { history: initHistory(dna, label), locks: [], stash: {} }
}

export function studioReducer(s: StudioState, a: StudioAction): StudioState {
  const h = s.history
  switch (a.type) {
    case 'edit': {
      const next = a.fn(h.present)
      const history = commit(h, next, a.label, { group: a.group })
      return history === h ? s : { ...s, history }
    }
    case 'seal': {
      const history = seal(h)
      return history === h ? s : { ...s, history }
    }
    case 'undo':
      return { ...s, history: undo(h) }
    case 'redo':
      return { ...s, history: redo(h) }
    case 'jump':
      return { ...s, history: jump(h, a.index) }
    case 'load':
      return { ...s, history: commit(seal(h), a.dna, a.label) }
    case 'toggleLock':
      return { ...s, locks: s.locks.includes(a.id) ? s.locks.filter((l) => l !== a.id) : [...s.locks, a.id] }
    case 'setLocks':
      return { ...s, locks: [...new Set(a.locks)] }
    case 'setKind': {
      const cur = h.present
      if (cur.kind === a.kind) return s
      const stash = { ...s.stash, [cur.kind]: cur }
      const next = s.stash[a.kind] ?? a.make(a.kind, cur)
      return { ...s, stash, history: commit(seal(h), next, a.label) }
    }
  }
}
