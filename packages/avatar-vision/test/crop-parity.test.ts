/* Crop parity with the Python trainer. For each QA fixture, the sidecar holds the YuNet
 * 5-point landmarks the Python pipeline used, and crops/qa-XX.png is Python's aligned crop
 * (the trainer's `aligned_crop`). The TS alignment (`alignFromPoints`,
 * the same maths the browser uses) plus a software copy of the Python resampling must give
 * the same pixels. The reference crops were cut before the photo's q92 JPEG re-encode, so a
 * fraction of a level of difference is expected.
 *
 * The browser draws the crop with canvas smoothing and MediaPipe's landmarks instead;
 * docs/photo-avatars.md ("Crop parity") has those numbers, measured in the demo. */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alignFromPoints, type Pt } from '../src/crop.ts'
import { CROP } from '../src/taxonomy.ts'
import { decodeImageFile, decodePNG, imageDiff, softwareCrop } from './image.ts'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'photos')

interface Sidecar {
  file: string
  crop?: string
  face?: { eyeL: [number, number]; eyeR: [number, number]; mouthL: [number, number]; mouthR: [number, number] }
}

const fixtures: Sidecar[] = existsSync(path.join(DIR, 'manifest.json'))
  ? (JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')) as { files: Sidecar[] }).files.filter((f) => f.face && f.crop && existsSync(path.join(DIR, f.crop)))
  : []

const P = (a: readonly number[], d = 0): Pt => ({ x: a[0] + d, y: a[1] + d })

describe('crop parity with the Python reference crops', { skip: fixtures.length ? false : 'no QA fixtures' }, () => {
  const results: { file: string; mean: number; p99: number; shifted?: number }[] = []

  it('every fixture: TS alignment + Python-style resampling ≈ the reference crop', () => {
    fixtures.forEach((f, k) => {
      const img = decodeImageFile(path.join(DIR, f.file))
      const ref = decodePNG(readFileSync(path.join(DIR, f.crop!)))
      const fc = f.face!
      const al = alignFromPoints(P(fc.eyeL), P(fc.eyeR), P(fc.mouthL), P(fc.mouthR), CROP)
      const d = imageDiff(softwareCrop(img, al, CROP.pad), ref)
      const row: (typeof results)[number] = { file: f.file, mean: d.mean, p99: d.p99 }
      // Every fourth photo: a half-pixel convention error must be clearly worse.
      if (k % 4 === 0) {
        const off = alignFromPoints(P(fc.eyeL, 0.5), P(fc.eyeR, 0.5), P(fc.mouthL, 0.5), P(fc.mouthR, 0.5), CROP)
        row.shifted = imageDiff(softwareCrop(img, off, CROP.pad), ref).mean
      }
      results.push(row)
      assert.ok(d.mean <= 0.6, `${f.file}: mean |Δ| ${d.mean.toFixed(3)} levels`)
      assert.ok(d.p99 <= 3, `${f.file}: p99 |Δ| ${d.p99} levels`)
      if (row.shifted !== undefined) assert.ok(row.shifted > d.mean, `${f.file}: a half-pixel shift (${row.shifted.toFixed(3)}) should not match better than ours (${d.mean.toFixed(3)})`)
    })
    const mean = results.reduce((a, r) => a + r.mean, 0) / results.length
    assert.ok(mean <= 0.3, `mean over fixtures ${mean.toFixed(3)} levels`)
    const shifted = results.filter((r) => r.shifted !== undefined)
    const ratio = shifted.reduce((a, r) => a + r.shifted! / r.mean, 0) / shifted.length
    assert.ok(ratio > 2, `half-pixel shift only ${ratio.toFixed(2)}× worse on average`)
  })
})
