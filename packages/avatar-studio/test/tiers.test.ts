/* Free, PRO, limited and NFT badges: text before and after the launch promo, which items and
 * export formats get one, and that the feature lists follow the engine's table. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_ITEMS, FEATURES, PROMO, itemTier } from '@arkplay/avatar-engine'
import { STRINGS } from '../src/strings.ts'
import { EXPORT_FEATURE, featureBadge, freeFeatures, hiresSize, itemBadge, itemTierHint, paidFeatures, promoDate, shortDate, tierBadge } from '../src/state/tiers.ts'

const DURING = Date.parse('2026-09-30T12:00:00Z')
const AFTER = Date.parse('2026-10-08T00:00:01Z')

test('the promo date reads "7 Oct"', () => {
  assert.equal(promoDate(), '7 Oct')
  assert.equal(shortDate('2026-10-07T23:59:59Z'), '7 Oct')
  assert.equal(shortDate('not a date'), 'not a date')
})

test('paid badge: "PRO · Free until 7 Oct" during the promo, "PRO" after', () => {
  const during = tierBadge('paid', STRINGS, DURING)
  assert.deepEqual(during, { tier: 'paid', short: 'PRO', note: 'Free until 7 Oct', full: 'PRO · Free until 7 Oct' })
  const after = tierBadge('paid', STRINGS, AFTER)
  assert.deepEqual(after, { tier: 'paid', short: 'PRO', note: '', full: 'PRO' })
})

test('limited badge: "LIMITED · until 7 Oct" while on sale', () => {
  assert.equal(tierBadge('limited', STRINGS, DURING)?.full, 'LIMITED · until 7 Oct')
  assert.equal(tierBadge('limited', STRINGS, DURING)?.note, 'Until 7 Oct')
  assert.equal(tierBadge('limited', STRINGS, AFTER)?.full, 'LIMITED')
  // A limited item's own end date wins over the promo's.
  assert.equal(tierBadge('limited', STRINGS, DURING, '2026-12-25T00:00:00Z')?.full, 'LIMITED · until 25 Dec')
})

test('free items have no badge; NFT items say NFT', () => {
  assert.equal(tierBadge('free', STRINGS, DURING), null)
  assert.deepEqual(tierBadge('nft', STRINGS, DURING), { tier: 'nft', short: 'NFT', note: '', full: 'NFT' })
})

test('every catalogue item gets the badge of its engine tier', () => {
  let paid = 0
  let limited = 0
  for (const it of ALL_ITEMS) {
    const tier = itemTier(it.id)
    const badge = itemBadge(it.id, STRINGS, DURING)
    if (tier === 'free') assert.equal(badge, null, it.id)
    else assert.equal(badge?.tier, tier, it.id)
    if (tier === 'paid') paid++
    if (tier === 'limited') limited++
  }
  assert.ok(paid > 0, 'some items are PRO')
  assert.ok(limited > 0, 'some items are limited')
  const founder = ALL_ITEMS.find((i) => itemTier(i.id) === 'limited')
  if (founder) assert.match(itemTierHint(founder.id, founder.label, STRINGS, DURING), /limited edition, available until 7 Oct/)
  const pro = ALL_ITEMS.find((i) => itemTier(i.id) === 'paid')
  if (pro) assert.match(itemTierHint(pro.id, pro.label, STRINGS, DURING), /PRO item, free for everyone until 7 Oct/)
})

test('feature lists split the engine table and badge only paid features', () => {
  assert.deepEqual([...paidFeatures(), ...freeFeatures()].map((f) => f.id).sort(), FEATURES.map((f) => f.id).sort())
  for (const f of paidFeatures()) assert.equal(featureBadge(f.id, STRINGS, DURING)?.full, 'PRO · Free until 7 Oct')
  for (const f of freeFeatures()) assert.equal(featureBadge(f.id, STRINGS, DURING), null)
  assert.equal(featureBadge('no-such-feature', STRINGS, DURING), null)
  assert.equal(featureBadge(undefined, STRINGS, DURING), null)
})

test('export formats map to real paid features', () => {
  for (const id of Object.values(EXPORT_FEATURE)) assert.equal(FEATURES.find((f) => f.id === id)?.tier, 'paid', id)
  assert.equal(EXPORT_FEATURE.png, undefined)
  assert.ok(hiresSize('png', 1024))
  assert.ok(!hiresSize('png', 512))
  assert.ok(!hiresSize('svg', 2048))
})

test('the promo in the engine is the one the badges describe', () => {
  assert.equal(PROMO.until, '2026-10-07T23:59:59Z')
})
