/* Premium core in the studio (docs/studio.md): the browser engine has no premium art
 * (these tests run like a browser: nothing registers it), so premium looks come from the avatar
 * service. The preview client, its cache and errors, and the export path, against a fake service. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_VERSION, addItem, decodeShareCode, defaultDNA, dnaHash, needsPremiumArt, premiumArtRegistered, type AvatarDNA } from '@arkplay/avatar-engine'
import { exportPremium } from '../src/export/premiumExport.ts'
import { PremiumExportError, PremiumPreviewError, SERVICE_ID_PREFIX, premiumService, previewBody, previewKey, renameIds, type PreviewFetch } from '../src/render/premium.ts'

const plain = (): AvatarDNA => ({ ...defaultDNA('humanoid', 7), accessories: [] })
const crowned = (): AvatarDNA => addItem(addItem(plain(), 'crown'), 'angel-wings')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="${SERVICE_ID_PREFIX}-g1"/></defs><style>.${SERVICE_ID_PREFIX}-m-fx{animation:${SERVICE_ID_PREFIX}-m-fx 2s}</style><path fill="url(#${SERVICE_ID_PREFIX}-g1)" d="M0 0h10v10z"/></svg>`

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(answer: (c: Call) => Response | Promise<Response>): { fetch: PreviewFetch; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (url, init) => {
      const c = { url, init }
      calls.push(c)
      return answer(c)
    },
  }
}

const svgResponse = (svg = SVG) => new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'X-Avatar-Id-Prefix': SERVICE_ID_PREFIX } })

test('the studio runs like a browser: no premium art, so premium looks need the service', () => {
  assert.equal(premiumArtRegistered(), false)
  assert.equal(needsPremiumArt(plain()), false)
  assert.equal(needsPremiumArt(crowned()), true)
})

test('no studio source imports the engine’s server-only premium entry', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const offenders = readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /avatar-engine\/premium|avatar-engine\/src\/premium|registerPremiumArt/.test(readFileSync(join(root, f), 'utf8')))
  assert.deepEqual(offenders, [])
})

test('renameIds, previewKey and previewBody', () => {
  assert.equal(renameIds(SVG, SERVICE_ID_PREFIX, 'apsX1').includes(SERVICE_ID_PREFIX), false)
  assert.ok(renameIds(SVG, SERVICE_ID_PREFIX, 'apsX1').includes('url(#apsX1-g1)'))
  const d = crowned()
  assert.notEqual(previewKey({ dna: d }), previewKey({ dna: d, view: 'side' }))
  assert.equal(previewKey({ dna: d }), previewKey({ dna: structuredClone(d), view: 'front', crop: 'fit', size: 720 }))
  assert.deepEqual(previewBody({ dna: d }), { dna: d, size: 720 })
  assert.deepEqual(previewBody({ dna: d, view: 'back', crop: 'head', size: 256, expression: 'wink', pose: 'wave', detail: 'low', background: false, motion: false }), {
    dna: d,
    size: 256,
    view: 'back',
    crop: 'head',
    expression: 'wink',
    pose: 'wave',
    detail: 'low',
    background: false,
    motion: false,
  })
})

test('preview: POSTs the look once, renames its ids per use, caches it and shares requests in flight', async () => {
  const f = fakeFetch(() => svgResponse())
  const svc = premiumService('/avatar/v1/', f.fetch)
  const req = { dna: crowned(), view: 'side' as const }
  const [a, b] = await Promise.all([svc.preview(req, 'apsA'), svc.preview(req, 'apsB')])
  assert.equal(f.calls.length, 1, 'one request for two callers')
  assert.equal(f.calls[0].url, '/avatar/v1/studio/preview')
  assert.equal(f.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), JSON.parse(JSON.stringify(previewBody(req))))
  assert.ok(a.includes('url(#apsA-g1)') && b.includes('url(#apsB-g1)') && !a.includes(SERVICE_ID_PREFIX))
  assert.ok(svc.peek(req, 'apsC')?.includes('apsC-m-fx'))
  assert.equal(svc.peek({ ...req, view: 'back' }, 'apsC'), undefined)
  await svc.preview(req, 'apsD')
  assert.equal(f.calls.length, 1, 'cached')
})

test('preview: an abandoned request still fills the cache', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const f = fakeFetch(async () => {
    await gate
    return svgResponse()
  })
  const svc = premiumService('/avatar/v1', f.fetch)
  const req = { dna: crowned() }
  const controller = new AbortController()
  const p = svc.preview(req, 'apsA', controller.signal)
  controller.abort()
  await assert.rejects(p, { name: 'AbortError' })
  release()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(svc.peek(req, 'apsB'))
  assert.equal(f.calls.length, 1)
})

test('preview: service answers become typed errors the stage explains', async () => {
  const cases: [Response | Error, string, number?][] = [
    [new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }), 'busy', 7],
    [new Response('{}', { status: 503, headers: { 'Retry-After': '2' } }), 'busy', 2],
    [new Response('{}', { status: 503 }), 'unavailable'],
    [new Response('{}', { status: 404 }), 'unavailable'],
    [new Response('{}', { status: 413 }), 'too-large'],
    [new Response('{}', { status: 500 }), 'failed'],
    [new Response('not svg', { status: 200 }), 'failed'],
    [new Response('<svg onload="alert(1)"></svg>', { status: 200 }), 'failed'],
    [new TypeError('fetch failed'), 'offline'],
  ]
  for (const [answer, kind, retryAfter] of cases) {
    const svc = premiumService('/avatar/v1', async () => {
      if (answer instanceof Error) throw answer
      return answer
    })
    const e = await svc.preview({ dna: crowned() }, 'apsA').then(
      () => null,
      (err: unknown) => err,
    )
    assert.ok(e instanceof PremiumPreviewError, `${kind}: a PremiumPreviewError`)
    assert.equal(e.kind, kind)
    if (retryAfter) assert.equal(e.retryAfter, retryAfter)
    assert.equal(svc.peek({ dna: crowned() }, 'apsA'), undefined, 'failures are not cached')
  }
})

test('preview: a service without the route is asked once per session', async () => {
  const f = fakeFetch(() => new Response('{}', { status: 404 }))
  const svc = premiumService('/avatar/v1', f.fetch)
  for (const seed of [1, 2, 3]) {
    const e = await svc.preview({ dna: { ...crowned(), seed } }, 'apsA').catch((err: unknown) => err)
    assert.ok(e instanceof PremiumPreviewError && e.kind === 'unavailable')
  }
  assert.equal(f.calls.length, 1)
})

test('picker and export URLs', () => {
  const svc = premiumService('https://avatars.example.com/avatar/v1/')
  assert.equal(svc.itemThumbUrl('founder-crown', 'creature'), `https://avatars.example.com/avatar/v1/catalog/items/founder-crown.svg?kind=creature&size=160&v=${ENGINE_VERSION}`)
  const d = crowned()
  const anim = svc.codeUrl(d, 'anim.svg', { anim: 'wave', size: 256, bg: false, fps: undefined })
  const m = /\/render\/(A2[\w-]+)\.anim\.svg\?anim=wave&size=256&bg=0$/.exec(anim)
  assert.ok(m, anim)
  assert.equal(dnaHash(decodeShareCode(m[1])), dnaHash(d))
  assert.match(svc.codeUrl(d, 'rig.zip', { clips: 'idle,walk' }), /\/render\/A2[\w-]+\/rig\.zip\?clips=idle%2Cwalk$/)
})

test('exports of premium looks come from the service, or say why they cannot', async () => {
  const d = crowned()
  await assert.rejects(exportPremium(d, { format: 'svg' }, () => {}), (e: unknown) => e instanceof PremiumExportError && e.reason === 'service')
  const f = fakeFetch((c) => (c.url.endsWith('/studio/preview') ? svgResponse() : c.url.includes('.anim.svg') ? new Response('<svg>anim</svg>', { status: 200 }) : new Response('{}', { status: 503 })))
  const premium = premiumService('/avatar/v1', f.fetch)
  const progress: number[] = []
  const svg = await exportPremium(d, { format: 'svg', premium, size: 300, background: false, motion: false, fileName: 'Crowned' }, (p) => progress.push(p))
  assert.equal(svg.filename, 'crowned.svg')
  assert.equal(await svg.blob.text(), SVG, 'the service drawing, as served')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { dna: d, size: 300, background: false, motion: false })
  assert.equal(progress.at(-1), 1)
  const anim = await exportPremium(d, { format: 'animated-svg', premium, anim: 'wave' }, () => {})
  assert.equal(await anim.blob.text(), '<svg>anim</svg>')
  assert.match(f.calls[1].url, /\.anim\.svg\?anim=wave&view=front&crop=fit&size=512&bg=1$/)
  // Lite mode answers GIFs 503 feature_unavailable: the format can't have premium items right now.
  await assert.rejects(exportPremium(d, { format: 'gif', premium }, () => {}), (e: unknown) => e instanceof PremiumExportError && e.reason === 'format')
  // WebM and sticker packs are made in the browser, which can't draw premium items.
  for (const format of ['webm', 'stickers'] as const) await assert.rejects(exportPremium(d, { format, premium }, () => {}), (e: unknown) => e instanceof PremiumExportError && e.reason === 'format')
})
