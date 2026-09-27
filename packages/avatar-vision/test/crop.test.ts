import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alignFromPoints, apply, compose, coverage, invert, pythonEquivalent, sourceOfPixel } from '../src/crop.ts'
import { CROP } from '../src/taxonomy.ts'

const close = (a: number, b: number, eps = 1e-9, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b}`)

describe('aligned crop maths (taxonomy.json crop)', () => {
  it('uses the taxonomy spec', () => {
    assert.deepEqual([CROP.sizeD, CROP.centerD, CROP.size], [8, 1, 224])
    assert.deepEqual([...CROP.pad], [128, 128, 128])
  })

  it('level eyes: the square is centred d below the eye midpoint with side sizeD·d', () => {
    const al = alignFromPoints({ x: 100, y: 200 }, { x: 160, y: 200 }, { x: 110, y: 270 }, { x: 150, y: 270 }, CROP)
    close(al.dist, 70)
    close(al.side, 560)
    close(al.centre.x, 130)
    close(al.centre.y, 270)
    close(al.angle, 0)
    // The centre maps to the middle of the crop, corners to the crop corners.
    const c = apply(al.toCrop, al.centre)
    close(c.x, 112)
    close(c.y, 112)
    const tl = apply(al.fromCrop, { x: 0, y: 0 })
    close(tl.x, 130 - 280)
    close(tl.y, 270 - 280)
    // Pixel centres sample at half-pixel offsets.
    const p = sourceOfPixel(al, 0, 0)
    close(p.x, 130 - 280 + 560 / 224 / 2)
  })

  it('rolled faces come out level, with the face pointing down', () => {
    const a = (30 * Math.PI) / 180
    const rot = (x: number, y: number) => ({ x: 400 + x * Math.cos(a) - y * Math.sin(a), y: 300 + x * Math.sin(a) + y * Math.cos(a) })
    const al = alignFromPoints(rot(-30, 0), rot(30, 0), rot(-20, 65), rot(20, 65), CROP)
    close(al.angle, a, 1e-9)
    const eL = apply(al.toCrop, rot(-30, 0))
    const eR = apply(al.toCrop, rot(30, 0))
    close(eL.y, eR.y, 1e-9, 'eyes level in the crop')
    assert.ok(eR.x > eL.x, 'image-left eye stays on the left')
    const m = apply(al.toCrop, rot(0, 65))
    assert.ok(m.y > eL.y, 'mouth below the eyes')
    close(m.x, 112, 1e-9)
    // Scale: the eye distance in the crop is 60 / side · size.
    close(eR.x - eL.x, (60 / al.side) * 224, 1e-9)
  })

  it('toCrop and fromCrop are inverses, and invert/compose agree', () => {
    const al = alignFromPoints({ x: 12.5, y: 40 }, { x: 70, y: 33 }, { x: 25, y: 110 }, { x: 64, y: 104 }, CROP)
    const id = compose(al.toCrop, al.fromCrop)
    close(id.a, 1, 1e-12)
    close(id.d, 1, 1e-12)
    close(id.b, 0, 1e-12)
    close(id.c, 0, 1e-12)
    close(id.e, 0, 1e-9)
    close(id.f, 0, 1e-9)
    const inv = invert(al.toCrop)
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) close(inv[k], al.fromCrop[k], 1e-9)
  })

  it('the cv2 matrix maps integer-centred source pixels to integer-centred crop pixels', () => {
    const al = alignFromPoints({ x: 100, y: 200 }, { x: 160, y: 190 }, { x: 110, y: 270 }, { x: 150, y: 262 }, CROP)
    const M = pythonEquivalent(al)
    // Source pixel (i, j) has its centre at (i + 0.5, j + 0.5) in our continuous space.
    const i = 131
    const j = 244
    const ours = apply(al.toCrop, { x: i + 0.5, y: j + 0.5 })
    const cv = { x: M[0][0] * i + M[0][1] * j + M[0][2], y: M[1][0] * i + M[1][1] * j + M[1][2] }
    close(cv.x, ours.x - 0.5, 1e-9)
    close(cv.y, ours.y - 0.5, 1e-9)
  })

  it('coverage reports padding for faces near the edge', () => {
    const al = alignFromPoints({ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 28, y: 70 }, { x: 52, y: 70 }, CROP)
    const c = coverage(al, 640, 480)
    assert.ok(c > 0 && c < 0.5, `coverage ${c}`)
    const centred = alignFromPoints({ x: 300, y: 200 }, { x: 340, y: 200 }, { x: 308, y: 240 }, { x: 332, y: 240 }, CROP)
    assert.equal(coverage(centred, 1280, 960), 1)
  })

  it('rejects degenerate points', () => {
    assert.throws(() => alignFromPoints({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 5 }, { x: 2, y: 5 }, CROP))
    assert.throws(() => alignFromPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, CROP))
  })
})
