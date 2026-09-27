/* The Partners picker's logic: loading and caching the public catalog (one request per URL,
 * failures not cached, malformed items dropped), grouping by brand, worn detection by asset
 * id, URL resolution and the tier badges (PRO / LIMITED during the launch promo). */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDNA, type AvatarDNA } from '@arkplay/avatar-engine'
import { clearPartnerCatalogCache, groupByBrand, loadPartnerCatalog, partnerBadge, resolveUrl, serviceBase, wornIndex } from '../src/partners/catalog.ts'
import type { StudioPartnerCatalog, StudioPartnerItem } from '../src/partners/types.ts'
import { STRINGS } from '../src/strings.ts'

const item = (id: string, partnerId: string, brand: string, assetId: string, tier: StudioPartnerItem['tier'] = 'free', until: string | null = null): StudioPartnerItem => ({
  id,
  partnerId,
  brand,
  name: `Item ${id}`,
  slot: 'hat',
  tier,
  limited: tier === 'limited' ? { until, edition: null } : null,
  item: { id: 'custom', params: { anchor: 'head', layer: 'front', x: 0.5, y: 0.5, scale: 0.3, rotation: 0.5 }, asset: { id: assetId, w: 200, h: 120, name: `${brand} · Item ${id}`, px: 0.5, py: 0.78 } },
  previewUrl: `/avatar/v1/partners/items/${id}/preview.svg`,
  artUrl: `/avatar/v1/assets/${assetId}`,
})

const CATALOG: StudioPartnerCatalog = {
  revision: 'r1',
  partners: [
    { id: 'pt_b', name: 'Beta', slug: 'beta', items: 1 },
    { id: 'pt_a', name: 'Alpha', slug: 'alpha', items: 2 },
    { id: 'pt_empty', name: 'Empty', slug: 'empty', items: 0 },
  ],
  items: [item('pi_1', 'pt_a', 'Alpha', 'as_aaaaaaaaaaaa'), item('pi_2', 'pt_b', 'Beta', 'as_bbbbbbbbbbbb', 'paid'), item('pi_3', 'pt_a', 'Alpha', 'as_cccccccccccc', 'limited', '2026-12-24T23:59:59Z')],
}

function fakeFetch(bodies: unknown[]): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url)
    const body = bodies.shift()
    if (body instanceof Error) throw body
    if (body === 404) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetch: f, calls }
}

test('the catalog is fetched once per URL, failures are retried, bad items are dropped', async () => {
  clearPartnerCatalogCache()
  const bad = { ...CATALOG, items: [...CATALOG.items, { ...item('pi_x', 'pt_a', 'Alpha', 'nope'), item: { id: 'hat', params: {} } } as unknown as StudioPartnerItem] }
  const { fetch, calls } = fakeFetch([404, bad])
  const o = { catalogUrl: 'https://game.example/avatar/v1/partners/catalog', fetch }
  await assert.rejects(loadPartnerCatalog(o, 0))
  const c = await loadPartnerCatalog(o, 1)
  assert.deepEqual(
    c.items.map((i) => i.id),
    ['pi_1', 'pi_2', 'pi_3'],
  )
  await loadPartnerCatalog(o, 2)
  assert.equal(calls.length, 2, 'cached after the first success')
  clearPartnerCatalogCache()
})

test('groups follow the catalog brand order and skip empty brands', () => {
  const groups = groupByBrand(CATALOG)
  assert.deepEqual(
    groups.map((g) => [g.name, g.items.map((i) => i.id)]),
    [
      ['Beta', ['pi_2']],
      ['Alpha', ['pi_1', 'pi_3']],
    ],
  )
})

test('worn detection goes by the published asset id', () => {
  const dna: AvatarDNA = defaultDNA('humanoid', 3)
  const cap = CATALOG.items[0]
  assert.equal(wornIndex(dna, cap), -1)
  dna.accessories.push({ id: 'glasses', params: {} }, cap.item)
  assert.equal(wornIndex(dna, cap), 1)
  assert.equal(wornIndex(dna, CATALOG.items[1]), -1)
})

test('service-relative URLs resolve against the catalog origin or an explicit base', () => {
  assert.equal(serviceBase({}), '')
  assert.equal(serviceBase({ catalogUrl: 'https://game.example/avatar/v1/partners/catalog' }), 'https://game.example')
  assert.equal(serviceBase({ catalogUrl: '/x', baseUrl: 'https://cdn.example/' }), 'https://cdn.example')
  assert.equal(resolveUrl('https://game.example', '/avatar/v1/assets/as_1'), 'https://game.example/avatar/v1/assets/as_1')
  assert.equal(resolveUrl('', 'https://elsewhere.example/x.svg'), 'https://elsewhere.example/x.svg')
})

test('badges: free has none; paid is PRO and free during the promo; limited shows its own date', () => {
  const during = Date.parse('2026-09-30T12:00:00Z')
  const after = Date.parse('2026-10-20T12:00:00Z')
  assert.equal(partnerBadge(CATALOG.items[0], STRINGS, during), null)
  assert.equal(partnerBadge(CATALOG.items[1], STRINGS, during)?.full, 'PRO · Free until 7 Oct')
  assert.equal(partnerBadge(CATALOG.items[1], STRINGS, after)?.full, 'PRO')
  assert.equal(partnerBadge(CATALOG.items[2], STRINGS, during)?.full, 'LIMITED · until 24 Dec')
  assert.equal(partnerBadge(item('pi_9', 'pt_a', 'Alpha', 'as_dddddddddddd', 'limited'), STRINGS, during)?.full, 'LIMITED')
})
