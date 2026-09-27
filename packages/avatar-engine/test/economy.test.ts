import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_ITEMS,
  FEATURES,
  PAID_ITEMS,
  PROMO,
  RARITY_THRESHOLDS,
  RARITY_TIERS,
  SLOTS,
  addItem,
  avatarRarity,
  baseItemId,
  defaultDNA,
  entitlementItemId,
  featureFreeNow,
  itemFeature,
  itemSpec,
  itemTier,
  makeItem,
  normalizeDNA,
  promoActive,
  randomDNA,
  rarityTierFor,
  temporarilyFreeFeatures,
  type AvatarDNA,
} from '../src/index.ts'
import { bare } from './helpers.ts'

const withItems = (d: AvatarDNA, ids: string[]): AvatarDNA => ids.reduce((acc, id) => addItem(acc, id), d)

test('the paid table names only real items and slots', () => {
  const slots = new Set(SLOTS.map((s) => s.id as string))
  for (const entry of PAID_ITEMS) {
    if (entry.startsWith('slot:')) assert.ok(slots.has(entry.slice(5)), entry)
    else assert.ok(itemSpec(entry), `unknown item ${entry}`)
  }
})

test('item tiers: default free, paid table, left-hand twins, premium in step', () => {
  assert.equal(itemTier('hoodie'), 'free')
  assert.equal(itemTier('no-such-item'), 'free')
  for (const id of ['crown', 'halo', 'angel-wings', 'jetpack', 'sword', 'sword-l', 'orb-l', 'pet', 'custom', 'glow', 'petals']) assert.equal(itemTier(id), 'paid', id)
  for (const it of ALL_ITEMS) {
    const tier = itemTier(it.id)
    assert.equal(it.premium === true, tier !== 'free', `${it.id}: premium matches tier ${tier}`)
    if (it.slot === 'aura' || it.slot === 'companion') assert.notEqual(tier, 'free', `${it.id} (${it.slot}) is not free`)
  }
  assert.equal(entitlementItemId('sword-l'), 'sword')
  assert.equal(entitlementItemId('founder-crown'), 'founder-crown')
})

test('limited launch items reuse existing art, never randomize, and keep fixed colours', () => {
  const limited = ALL_ITEMS.filter((i) => itemTier(i.id) === 'limited')
  assert.ok(limited.length >= 3 && limited.length <= 5, `${limited.length} launch items`)
  for (const it of limited) {
    assert.ok(it.art && itemSpec(it.art), `${it.id} draws with an existing item`)
    assert.equal(baseItemId(it.id), it.art)
    assert.equal(itemSpec(it.art!)!.slot, it.slot, `${it.id} sits in its art's slot`)
    assert.equal(it.weight, 0, `${it.id} is never picked at random`)
    assert.ok(it.limited?.until && Number.isFinite(Date.parse(it.limited.until)), `${it.id} has an end date`)
  }
  const crown = makeItem('founder-crown', { color: '#000000' })
  assert.equal(crown.params.color, itemSpec('founder-crown')!.params.find((p) => p.key === 'color')!.default)
  const d = normalizeDNA({ ...bare('humanoid'), accessories: [{ id: 'founder-crown', params: { color: '#123456', color2: 'nope' } }] })
  assert.deepEqual(d.accessories[0].params, makeItem('founder-crown').params)
  // No NFT-only items exist yet, but the mechanism is there.
  assert.equal(ALL_ITEMS.filter((i) => i.nftOnly).length, 0)
})

test('rarity: free avatars are Common, whatever they choose', () => {
  assert.deepEqual(avatarRarity(defaultDNA()), { tier: 'common', score: 0, contributions: [] })
  assert.equal(avatarRarity(defaultDNA('creature')).tier, 'common')
  for (let seed = 1; seed <= 60; seed++) {
    const kind = seed % 2 ? 'creature' : 'humanoid'
    const d = randomDNA({ seed, kind, freeOnly: true })
    assert.equal(avatarRarity(d).tier, 'common', `seed ${seed}`)
    for (const it of [...d.outfit, ...d.accessories]) assert.equal(itemTier(it.id), 'free', `${it.id} is free`)
  }
  // Every free item at once is still Common.
  const everything = normalizeDNA({ ...bare('humanoid'), accessories: ALL_ITEMS.filter((i) => itemTier(i.id) === 'free' && i.kinds.includes('humanoid')).map((i) => ({ id: i.id, params: {} })) })
  assert.equal(avatarRarity(everything).score, 0)
})

test('rarity: paid, limited and NFT items raise it; tiers follow the thresholds', () => {
  const base = bare('humanoid')
  const one = avatarRarity(withItems(base, ['crown']))
  assert.deepEqual(one, { tier: 'uncommon', score: 10, contributions: [{ itemId: 'crown', tier: 'paid', points: 10 }] })
  assert.equal(avatarRarity(withItems(base, ['crown', 'glow', 'pet'])).tier, 'rare')
  assert.equal(avatarRarity(withItems(base, ['founder-crown'])).score, 30)
  assert.equal(avatarRarity(withItems(base, ['founder-crown', 'founder-cape'])).tier, 'epic')
  assert.equal(avatarRarity(withItems(base, ['founder-crown', 'founder-cape', 'founder-sparkles', 'pet'])).tier, 'legendary')
  // NFT prebuilts: at least Epic; Legendary when they also wear limited items.
  assert.equal(avatarRarity(base, { nft: true }).tier, 'epic')
  assert.equal(avatarRarity(withItems(base, ['crown']), { nft: true }).tier, 'epic')
  assert.equal(avatarRarity(withItems(base, ['founder-halo']), { nft: true }).tier, 'legendary')

  assert.deepEqual([...RARITY_TIERS], ['common', 'uncommon', 'rare', 'epic', 'legendary'])
  const cases: [number, string][] = [[0, 'common'], [9, 'common'], [10, 'uncommon'], [29, 'uncommon'], [30, 'rare'], [59, 'rare'], [60, 'epic'], [99, 'epic'], [100, 'legendary'], [1000, 'legendary']]
  for (const [score, tier] of cases) assert.equal(rarityTierFor(score), tier, String(score))
  assert.equal(RARITY_THRESHOLDS.legendary, 100)
})

test('rarity is monotonic and deterministic', () => {
  const order = ['hoodie', 'crown', 'cap', 'glow', 'founder-cape', 'sword', 'sword-l', 'pet', 'round-glasses', 'founder-halo']
  for (const kind of ['humanoid', 'creature'] as const) {
    let d = bare(kind)
    let last = avatarRarity(d)
    for (const id of order) {
      if (!itemSpec(id)?.kinds.includes(kind)) continue
      const next = addItem(d, id)
      const r = avatarRarity(next)
      // Replacing an item in a full slot can drop it; only a pure addition must not lower the score.
      const added = [...next.outfit, ...next.accessories].length > [...d.outfit, ...d.accessories].length
      if (added) assert.ok(r.score >= last.score, `${kind}: adding ${id} lowered ${last.score} → ${r.score}`)
      assert.ok(RARITY_TIERS.indexOf(r.tier) >= RARITY_TIERS.indexOf(rarityTierFor(0)))
      d = next
      last = r
    }
    assert.deepEqual(avatarRarity(d), avatarRarity(structuredClone(d)))
  }
  for (let seed = 1; seed <= 20; seed++) {
    const d = randomDNA({ seed })
    assert.deepEqual(avatarRarity(d), avatarRarity(randomDNA({ seed })))
    assert.deepEqual(randomDNA({ seed, freeOnly: false }), d, 'freeOnly: false leaves randomDNA unchanged')
  }
})

test('features and the launch promo', () => {
  assert.equal(PROMO.until, '2026-10-07T23:59:59Z')
  assert.equal(PROMO.allFree, true)
  const during = Date.parse('2026-09-30T12:00:00Z')
  const lastSecond = Date.parse('2026-10-07T23:59:59Z')
  const after = Date.parse('2026-10-08T00:00:00Z')
  assert.equal(promoActive(during), true)
  assert.equal(promoActive(lastSecond), true)
  assert.equal(promoActive(after), false)
  const paid = FEATURES.filter((f) => f.tier === 'paid').map((f) => f.id)
  assert.ok(paid.includes('premium-items') && paid.includes('extra-saves') && paid.includes('animated-exports'))
  assert.deepEqual(temporarilyFreeFeatures(during), paid)
  assert.deepEqual(temporarilyFreeFeatures(after), [])
  assert.equal(featureFreeNow('premium-items', during), true)
  assert.equal(featureFreeNow('premium-items', after), false)
  assert.equal(featureFreeNow('creator', after), true)
  assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length, 'feature ids are unique')
  assert.equal(itemFeature('crown'), 'premium-items')
  assert.equal(itemFeature('custom'), 'custom-uploads')
  assert.equal(itemFeature('founder-crown'), undefined)
  assert.equal(itemFeature('hoodie'), undefined)
})
