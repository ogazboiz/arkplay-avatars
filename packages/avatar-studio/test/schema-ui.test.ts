/* The editor is built from the schema: tabs, visibility and choice thumbnails. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDNA, sectionSpec, sectionsFor, type AvatarDNA, type ChoiceSpec, type RangeSpec } from '@arkplay/avatar-engine'
import { choiceLook, crossSectionKey, formatRange, lookupIn, rangeValueText, visibleParams } from '../src/state/params.ts'
import { TAB_ORDER, tabsFor } from '../src/state/tabs.ts'

test('humanoid tabs follow TabId order, only with content, studio tabs last', () => {
  const ids = tabsFor('humanoid').map((t) => t.id)
  assert.deepEqual(ids, ['body', 'face', 'skin', 'hair', 'outfit', 'accessories', 'expression', 'scene', 'style', 'remix', 'about'])
})

test('creature tabs include species (with the picker) and no outfit', () => {
  const tabs = tabsFor('creature')
  const ids = tabs.map((t) => t.id)
  assert.equal(ids[0], 'species')
  assert.ok(tabs[0].species)
  assert.ok(!ids.includes('outfit'))
  assert.ok(ids.includes('coat') && ids.includes('limbs'))
  const acc = tabs.find((t) => t.id === 'accessories')
  assert.ok(acc?.slots.some((s) => s.id === 'custom'))
  assert.ok(acc?.slots.every((s) => s.kinds.includes('creature')))
})

test('every section of each kind lands on exactly one tab', () => {
  for (const kind of ['humanoid', 'creature'] as const) {
    const onTabs = tabsFor(kind).flatMap((t) => t.sections.map((s) => s.id))
    assert.deepEqual([...onTabs].sort(), sectionsFor(kind).map((s) => s.id).sort())
    for (const t of tabsFor(kind)) if (t.id !== 'remix' && t.id !== 'about') assert.ok(TAB_ORDER.includes(t.id))
  }
})

test('visibleIf hides dependent params; advanced ones fold', () => {
  const dna = defaultDNA('humanoid')
  const body = sectionSpec('body')!
  const { basic, advanced } = visibleParams(body.params, dna.sections.body, lookupIn(dna))
  assert.ok(!basic.some((p) => p.key === 'prosthetic'), 'prosthetic style hidden without a limb difference')
  assert.ok(advanced.some((p) => p.key === 'arms'))
  const withLimb = { ...dna.sections.body, limbDiff: 'arm-l' }
  assert.ok(visibleParams(body.params, withLimb).basic.some((p) => p.key === 'prosthetic'))
})

test('cross-section visibility (creature chassis follows the body plan)', () => {
  const dna = defaultDNA('creature')
  const form = sectionSpec('form')!
  const lookup = lookupIn(dna)
  assert.ok(!visibleParams(form.params, dna.sections.form, lookup).basic.some((p) => p.key === 'build'))
  const robot: AvatarDNA = { ...dna, sections: { ...dna.sections, species: { ...dna.sections.species, plan: 'robot' } } }
  assert.ok(visibleParams(form.params, robot.sections.form, lookupIn(robot)).basic.some((p) => p.key === 'build'))
  assert.notEqual(crossSectionKey(form.params, lookup), crossSectionKey(form.params, lookupIn(robot)))
})

test('slider readouts', () => {
  const unit: RangeSpec = { type: 'range', key: 'k', label: 'K', min: 0, max: 1, step: 0.01, default: 0.5, ends: ['Slim', 'Heavy'] }
  assert.equal(formatRange(unit, 0.456), '46')
  assert.equal(rangeValueText(unit, 0.1), '10 (Slim)')
  assert.equal(rangeValueText(unit, 0.9), '90 (Heavy)')
  const count: RangeSpec = { type: 'range', key: 'c', label: 'C', min: 0, max: 8, step: 1, default: 0 }
  assert.equal(formatRange(count, 3), '3')
})

test('choices with a preview get thumbnails; scene and style choices too', () => {
  const hair = sectionSpec('hair')!.params.find((p) => p.key === 'style') as ChoiceSpec
  assert.deepEqual(choiceLook(hair, 'hair'), { crop: 'head', scene: false })
  const bangs = sectionSpec('hair')!.params.find((p) => p.key === 'bangs') as ChoiceSpec
  assert.equal(choiceLook(bangs, 'hair'), null)
  const bg = sectionSpec('scene')!.params.find((p) => p.key === 'background') as ChoiceSpec
  assert.deepEqual(choiceLook(bg, 'scene'), { crop: 'portrait', scene: true })
})
