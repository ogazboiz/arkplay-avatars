import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDNA, setParam, type AvatarDNA, type AvatarKind } from '@arkplay/avatar-engine'
import { initStudio, studioReducer, type StudioState } from '../src/state/studio.ts'

const start = (): StudioState => initStudio(defaultDNA('humanoid', 7), 'Start')

test('edit applies a function of the current avatar', () => {
  let s = start()
  s = studioReducer(s, { type: 'edit', label: 'Height', fn: (d) => setParam(d, 'body', 'height', 0.9) })
  assert.equal(s.history.present.sections.body.height, 0.9)
  assert.equal(s.history.presentLabel, 'Height')
})

test('an edit that changes nothing returns the same state (no re-render)', () => {
  const s = start()
  assert.equal(studioReducer(s, { type: 'edit', label: 'noop', fn: (d) => d }), s)
  assert.equal(studioReducer(s, { type: 'seal' }), s)
})

test('slider drags coalesce; seal ends the step', () => {
  let s = start()
  for (const v of [0.6, 0.7, 0.8]) s = studioReducer(s, { type: 'edit', label: 'Height', group: 's:body.height', fn: (d) => setParam(d, 'body', 'height', v) })
  s = studioReducer(s, { type: 'seal' })
  assert.equal(s.history.past.length, 1)
  s = studioReducer(s, { type: 'undo' })
  assert.equal(s.history.present.sections.body.height, 0.5)
})

test('load is one undoable step', () => {
  let s = start()
  const other = defaultDNA('creature', 3)
  s = studioReducer(s, { type: 'load', dna: other, label: 'Load' })
  assert.equal(s.history.present.kind, 'creature')
  s = studioReducer(s, { type: 'undo' })
  assert.equal(s.history.present.kind, 'humanoid')
})

test('locks toggle and dedupe', () => {
  let s = start()
  s = studioReducer(s, { type: 'toggleLock', id: 'hair' })
  s = studioReducer(s, { type: 'toggleLock', id: 'outfit' })
  assert.deepEqual(s.locks, ['hair', 'outfit'])
  s = studioReducer(s, { type: 'toggleLock', id: 'hair' })
  assert.deepEqual(s.locks, ['outfit'])
  s = studioReducer(s, { type: 'setLocks', locks: ['a', 'a', 'b'] })
  assert.deepEqual(s.locks, ['a', 'b'])
})

test('switching kind stashes the old avatar and brings it back', () => {
  let made = 0
  const make = (k: AvatarKind, from: AvatarDNA): AvatarDNA => {
    made++
    return { ...defaultDNA(k, 99), name: from.name }
  }
  let s = start()
  s = studioReducer(s, { type: 'edit', label: 'Name', fn: (d) => ({ ...d, name: 'Ada' }) })
  const human = s.history.present
  s = studioReducer(s, { type: 'setKind', kind: 'creature', label: 'Creature', make })
  assert.equal(s.history.present.kind, 'creature')
  assert.equal(s.history.present.name, 'Ada')
  s = studioReducer(s, { type: 'setKind', kind: 'humanoid', label: 'Humanoid', make })
  assert.equal(s.history.present, human, 'the humanoid comes back exactly')
  s = studioReducer(s, { type: 'setKind', kind: 'creature', label: 'Creature', make })
  assert.equal(made, 1, 'the stashed creature is reused')
  assert.equal(studioReducer(s, { type: 'setKind', kind: 'creature', label: 'x', make }), s)
})
