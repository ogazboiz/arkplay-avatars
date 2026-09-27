import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HISTORY_LIMIT, canRedo, canUndo, commit, initHistory, jump, redo, seal, timeline, undo } from '../src/state/history.ts'

test('commit pushes, undo and redo walk back and forth with labels', () => {
  let h = initHistory(0, 'Start')
  h = commit(h, 1, 'one')
  h = commit(h, 2, 'two')
  assert.equal(h.present, 2)
  assert.equal(h.past.length, 2)
  h = undo(h)
  assert.equal(h.present, 1)
  assert.equal(h.presentLabel, 'one')
  assert.equal(h.future[0].label, 'two')
  h = redo(h)
  assert.equal(h.present, 2)
  assert.equal(h.presentLabel, 'two')
  assert.ok(!canRedo(h))
})

test('a new commit after undo drops the redo branch', () => {
  let h = commit(commit(initHistory('a', 'Start'), 'b', 'b'), 'c', 'c')
  h = undo(h)
  h = commit(h, 'd', 'd')
  assert.equal(h.future.length, 0)
  assert.deepEqual(timeline(h).entries.map((e) => e.value), ['a', 'b', 'd'])
})

test('commits in an open group coalesce into one step until sealed', () => {
  let h = initHistory(0, 'Start')
  for (let v = 1; v <= 30; v++) h = commit(h, v, 'Height', { group: 's:body.height' })
  assert.equal(h.past.length, 1, 'a whole drag is one step')
  assert.equal(h.present, 30)
  h = seal(h)
  h = commit(h, 31, 'Height', { group: 's:body.height' })
  assert.equal(h.past.length, 2, 'a new drag after release is a new step')
  h = undo(h)
  assert.equal(h.present, 30)
  h = undo(h)
  assert.equal(h.present, 0)
})

test('a different group or an ungrouped commit starts a new step', () => {
  let h = initHistory(0, 'Start')
  h = commit(h, 1, 'a', { group: 'x' })
  h = commit(h, 2, 'b', { group: 'y' })
  h = commit(h, 3, 'c')
  h = commit(h, 4, 'd')
  assert.equal(h.past.length, 4)
})

test('a no-op commit does not open a group (the next change still pushes)', () => {
  let h = initHistory(5, 'Start')
  h = commit(h, 5, 'noop', { group: 'g' })
  assert.equal(h.group, null)
  h = commit(h, 6, 'real', { group: 'g' })
  assert.equal(h.past.length, 1)
  assert.equal(undo(h).present, 5)
})

test('history is capped', () => {
  let h = initHistory(0, 'Start')
  for (let i = 1; i <= HISTORY_LIMIT + 25; i++) h = commit(h, i, `#${i}`)
  assert.equal(h.past.length, HISTORY_LIMIT)
  let steps = 0
  while (canUndo(h)) {
    h = undo(h)
    steps++
  }
  assert.equal(steps, HISTORY_LIMIT)
  assert.equal(h.present, 25)
})

test('undo with nothing to undo is harmless and seals', () => {
  let h = commit(initHistory(0, 'Start'), 1, 'x', { group: 'g' })
  h = undo(undo(h))
  assert.equal(h.present, 0)
  assert.equal(h.group, null)
  assert.equal(redo(redo(h)).present, 1)
})

test('jump moves anywhere on the timeline', () => {
  let h = initHistory('a', 'Start')
  for (const v of ['b', 'c', 'd']) h = commit(h, v, v)
  h = jump(h, 1)
  assert.equal(h.present, 'b')
  assert.equal(h.future.length, 2)
  h = jump(h, 3)
  assert.equal(h.present, 'd')
  h = jump(h, -5)
  assert.equal(h.present, 'a')
  assert.equal(timeline(h).index, 0)
})
