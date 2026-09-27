/* Studio telemetry (src/telemetry): event cleaning, the batching tracker, active time, the
 * instrumented actions and the undo/redo classifier. Pure logic, no React or DOM. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_ITEMS, defaultDNA, itemTier, setParam, type AvatarDNA } from '@arkplay/avatar-engine'
import type { StudioActions } from '../src/components/context.ts'
import { commit, initHistory, jump, redo, undo } from '../src/state/history.ts'
import { STRINGS } from '../src/strings.ts'
import { STUDIO_EVENTS, cleanEvent, type StudioTelemetryEvent } from '../src/telemetry/events.ts'
import { historyStep, instrumentActions, NAME_QUIET_MS } from '../src/telemetry/instrument.ts'
import { ActiveTimer } from '../src/telemetry/session.ts'
import { MAX_EVENTS, createTelemetryTracker, randomSid, type TelemetryBatch } from '../src/telemetry/tracker.ts'

test('cleanEvent keeps known names, short keys and sane values only', () => {
  assert.equal(cleanEvent('nope'), null)
  assert.deepEqual(cleanEvent('tab_open', 'hair'), { name: 'tab_open', key: 'hair' })
  assert.deepEqual(cleanEvent('tab_open', 'has spaces'), { name: 'tab_open' })
  assert.deepEqual(cleanEvent('tab_open', 'x'.repeat(49)), { name: 'tab_open' })
  assert.deepEqual(cleanEvent('session_end', undefined, 12.6), { name: 'session_end', value: 13 })
  assert.deepEqual(cleanEvent('session_end', undefined, -1), { name: 'session_end' })
  assert.equal(cleanEvent('session_end', undefined, 99_999)?.value, 4 * 3600)
  assert.equal(new Set(STUDIO_EVENTS).size, STUDIO_EVENTS.length)
})

function fakeTimers() {
  const timers: { fn: () => void; ms: number; on: boolean }[] = []
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms, on: true }
      timers.push(t)
      return t
    },
    clearTimer: (t: unknown) => {
      ;(t as { on: boolean }).on = false
    },
    fire() {
      for (const t of timers.splice(0)) if (t.on) t.fn()
    },
  }
}

test('the tracker batches, flushes on a full queue, on a timer and at session_end (final)', () => {
  const sent: { batch: TelemetryBatch; final: boolean }[] = []
  const clock = fakeTimers()
  const t = createTelemetryTracker({ send: (batch, final) => sent.push({ batch, final }), src: 'web', setTimer: clock.setTimer, clearTimer: clock.clearTimer })
  assert.match(t.sid, /^[A-Za-z0-9_-]{8,64}$/)
  t.track({ name: 'tab_open', key: 'hair' })
  t.track({ name: 'bogus' } as unknown as StudioTelemetryEvent)
  assert.equal(t.pending, 1)
  assert.equal(sent.length, 0)
  clock.fire()
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], { batch: { v: 1, sid: t.sid, src: 'web', events: [{ name: 'tab_open', key: 'hair' }] }, final: false })

  for (let i = 0; i < MAX_EVENTS; i++) t.track({ name: 'randomize', key: 'all' })
  assert.equal(sent.length, 2)
  assert.equal(sent[1].batch.events.length, MAX_EVENTS)
  assert.equal(t.pending, 0)

  t.track({ name: 'undo' })
  t.track({ name: 'session_end', value: 42 })
  assert.equal(sent.length, 3)
  assert.equal(sent[2].final, true)
  assert.deepEqual(sent[2].batch.events, [{ name: 'undo' }, { name: 'session_end', value: 42 }])
})

test('the tracker keeps batches under the byte cap and never throws on a failing transport', () => {
  const sizes: number[] = []
  const t = createTelemetryTracker({ send: (b) => sizes.push(JSON.stringify(b).length), maxBytes: 400, setTimer: () => 0, clearTimer: () => {} })
  for (let i = 0; i < 30; i++) t.track({ name: 'item_add', key: `item-${String(i).padStart(30, '0')}` })
  t.flush()
  assert.ok(sizes.length > 1)
  for (const n of sizes) assert.ok(n <= 500, `batch of ${n} bytes`)
  const bad = createTelemetryTracker({
    send: () => {
      throw new Error('offline')
    },
  })
  assert.doesNotThrow(() => bad.track({ name: 'session_end', value: 1 }))
  const ids = new Set(Array.from({ length: 50 }, randomSid))
  assert.equal(ids.size, 50)
})

test('active time: inputs keep a minute alive, hidden and idle time never count', () => {
  let now = 0
  const t = new ActiveTimer(() => now, 60_000)
  now = 30_000
  assert.equal(t.total(), 30_000) // reading right after opening counts
  now = 50_000
  t.activity()
  now = 200_000 // idle long after the last input: only the minute after it counts
  assert.equal(t.total(), 110_000)
  t.activity() // back after idling: counts from now
  now = 210_000
  t.hidden()
  now = 900_000 // hidden for a long time
  assert.equal(t.total(), 120_000)
  t.visible()
  now = 905_000
  assert.equal(t.total(), 125_000)
  t.reset()
  assert.equal(t.total(), 0)
})

function fakeActions(dna: AvatarDNA) {
  const calls: string[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}:${args.filter((a) => typeof a === 'string' || typeof a === 'number').join(',')}`)
    }
  const a = {
    edit: rec('edit'),
    seal: rec('seal'),
    setParam: rec('setParam'),
    setItemParam: rec('setItemParam'),
    addItem: rec('addItem'),
    removeItem: rec('removeItem'),
    removeSlot: rec('removeSlot'),
    moveItem: rec('moveItem'),
    load: rec('load'),
    undo: rec('undo'),
    redo: rec('redo'),
    jump: rec('jump'),
    randomize: rec('randomize'),
    randomizeSection: rec('randomizeSection'),
    toggleLock: rec('toggleLock'),
    setLocks: rec('setLocks'),
    setKind: rec('setKind'),
    applySpecies: rec('applySpecies'),
    setName: rec('setName'),
    wearOutfit: rec('wearOutfit'),
    shuffleSeed: rec('shuffleSeed'),
    announce: rec('announce'),
    toast: rec('toast'),
    lookup: () => undefined,
    current: () => dna,
  } as unknown as StudioActions
  return { a, calls }
}

test('instrumented actions report each feature once and still run it', () => {
  const dna = defaultDNA('humanoid', 3)
  const { a, calls } = fakeActions(dna)
  const events: string[] = []
  let now = 0
  const w = instrumentActions(a, (name, key) => events.push(key ? `${name}:${key}` : name), STRINGS, () => now)

  // A drag (one group) reports once; after seal, a new drag reports again.
  for (const v of [0.1, 0.2, 0.3]) w.setParam('body', 'height', v, 'Height', 's:body.height')
  w.seal()
  w.setParam('body', 'height', 0.4, 'Height', 's:body.height')
  w.setParam('hair', 'style', 'bob', 'Hairstyle')
  const paid = ALL_ITEMS.find((i) => itemTier(i.id) !== 'free')
  const free = ALL_ITEMS.find((i) => itemTier(i.id) === 'free' && i.kinds.includes('humanoid'))
  assert.ok(paid && free)
  w.addItem(free.id)
  w.addItem(paid.id)
  w.load(dna, STRINGS.h_fromPhoto)
  w.load(dna, STRINGS.h_load)
  w.load(dna, STRINGS.h_variation)
  w.load(dna, STRINGS.h_child)
  w.edit(STRINGS.h_morph, (d) => d, 'morph')
  w.edit(STRINGS.h_morph, (d) => d, 'morph')
  w.randomize()
  w.randomizeSection('hair', 'Hair')
  w.setKind('humanoid') // already humanoid: nothing to report
  w.setKind('creature')
  w.setName('A')
  now += 1000
  w.setName('Al')
  now += NAME_QUIET_MS + 1
  w.setName('Ali')
  w.toggleLock('hair')
  w.shuffleSeed()

  assert.deepEqual(events, [
    'param_edit:body',
    'param_edit:body',
    'param_edit:hair',
    `item_add:${free.id}`,
    `item_add:${paid.id}`,
    `premium_preview:${paid.id}`,
    'photo_apply',
    'import',
    'remix:variation',
    'remix:crossover',
    'remix:morph',
    'randomize:all',
    'randomize:hair',
    'kind_switch:creature',
    'name_edit',
    'name_edit',
    'lock_toggle:hair',
    'seed_shuffle',
  ])
  // Every call still reached the studio, in order.
  assert.equal(calls.filter((c) => c.startsWith('setParam')).length, 5)
  assert.ok(calls.includes('randomize:'))
  assert.ok(calls.includes('setKind:creature'))
  // Actions the telemetry does not know pass through untouched.
  assert.equal(w.announce, a.announce)
  assert.equal(w.current, a.current)
})

test('historyStep tells undo, redo and timeline jumps from edits', () => {
  const d0 = defaultDNA('humanoid', 1)
  const d1 = setParam(d0, 'body', 'height', 0.9)
  const d2 = setParam(d1, 'body', 'build', 0.9)
  let h = initHistory(d0, 'Start')
  h = commit(h, d1, 'Height')
  const h2 = commit(h, d2, 'Build')
  assert.equal(historyStep(h, h2), null) // an edit
  const u = undo(h2)
  assert.equal(historyStep(h2, u), 'undo')
  const r = redo(u)
  assert.equal(historyStep(u, r), 'redo')
  const j = jump(h2, 0)
  assert.equal(historyStep(h2, j), 'jump')
  assert.equal(historyStep(h2, h2), null)
})
