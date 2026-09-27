/* Server exports (docs/studio.md, phase 1): with the host's `serverExports` on,
 * every download is one `POST /studio/export`, whatever the look, and the service's refusals
 * (paid formats, busy, offline) come back as typed errors the export dialog words for players. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addItem, defaultDNA, type AvatarDNA } from '@arkplay/avatar-engine'
import { exportBody, exportOnServer } from '../src/export/serverExport.ts'
import { PremiumPreviewError, premiumService, type PreviewFetch } from '../src/render/premium.ts'

const plain = (): AvatarDNA => ({ ...defaultDNA('humanoid', 7), accessories: [], name: 'Noah Ark' })

function fake(answer: (url: string, init: RequestInit) => Response): { fetch: PreviewFetch; calls: { url: string; body: Record<string, unknown> }[] } {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return answer(url, init)
    },
  }
}

test('exportBody: only the options the format uses', () => {
  const dna = plain()
  assert.deepEqual(exportBody(dna, { format: 'png', size: 512, view: 'side', crop: 'bust', background: false, anim: 'wave', fps: 12, quality: 0.8 }), {
    dna,
    format: 'png',
    size: 512,
    view: 'side',
    crop: 'bust',
    background: false,
  })
  assert.deepEqual(exportBody(dna, { format: 'webm', size: 384, anim: 'wave', fps: 12, seconds: 3, cell: 128 }), { dna, format: 'webm', size: 384, anim: 'wave', fps: 12, seconds: 3 })
  assert.deepEqual(exportBody(dna, { format: 'rig', anims: ['idle', 'walk'], scale: 1, size: 999 }), { dna, format: 'rig', anims: ['idle', 'walk'], scale: 1 })
  assert.deepEqual(exportBody(dna, { format: 'pixel', pixelGrid: 32, size: 256 }), { dna, format: 'pixel', size: 256, pixelGrid: 32 })
})

test('exportOnServer: one POST, the studio’s file name, premium looks included', async () => {
  const f = fake(() => new Response(new Uint8Array([0x47, 0x49, 0x46]), { status: 200, headers: { 'Content-Type': 'image/gif', 'Content-Disposition': 'attachment; filename="x.gif"' } }))
  const server = premiumService('/avatar/v1/', f.fetch)
  const progress: number[] = []
  const r = await exportOnServer(addItem(plain(), 'crown'), { format: 'gif', anim: 'wave', size: 256, fps: 12, onProgress: (p) => progress.push(p) }, server)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, '/avatar/v1/studio/export')
  assert.equal(f.calls[0].body.format, 'gif')
  assert.equal(r.filename, 'noah-ark-wave.gif')
  assert.equal(r.mime, 'image/gif')
  assert.equal(progress.at(-1), 1)
})

test('refusals become typed errors: locked (with what unlocks it), busy, unavailable', async () => {
  const locked = premiumService('/avatar/v1', fake(() => Response.json({ code: 'entitlement_required', message: 'x', details: ['feature:animated-exports'] }, { status: 403 })).fetch)
  await assert.rejects(exportOnServer(plain(), { format: 'gif' }, locked), (e: unknown) => e instanceof PremiumPreviewError && e.kind === 'locked' && e.needs?.[0] === 'feature:animated-exports')
  const busy = premiumService('/avatar/v1', fake(() => Response.json({ code: 'overloaded', message: 'x' }, { status: 503, headers: { 'Retry-After': '2' } })).fetch)
  await assert.rejects(exportOnServer(plain(), { format: 'png' }, busy), (e: unknown) => e instanceof PremiumPreviewError && e.kind === 'busy' && e.retryAfter === 2)
  const lite = premiumService('/avatar/v1', fake(() => Response.json({ code: 'feature_unavailable', message: 'x' }, { status: 503 })).fetch)
  await assert.rejects(exportOnServer(plain(), { format: 'png' }, lite), (e: unknown) => e instanceof PremiumPreviewError && e.kind === 'unavailable')
})
