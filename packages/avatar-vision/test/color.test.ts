import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EXPOSURE_LIMITS, WB_LIMIT, deltaE, estimateCorrection, hexToLab, kmeans, labToHex, linToLab, robustColor, toLinear } from '../src/color.ts'

function labsOf(hexes: string[]): Float32Array {
  const out = new Float32Array(hexes.length * 3)
  hexes.forEach((h, i) => out.set(hexToLab(h), i * 3))
  return out
}

describe('colour statistics', () => {
  it('hex ↔ OKLab round-trips', () => {
    for (const h of ['#000000', '#ffffff', '#d69d78', '#3f2a1f', '#1e88e5', '#5b3a1e']) assert.equal(labToHex(hexToLab(h)), h)
  })

  it('robustColor ignores speculars and deep shadows', () => {
    const skin = Array.from({ length: 200 }, () => '#c98d68')
    const spec = Array.from({ length: 20 }, () => '#ffffff')
    const shadow = Array.from({ length: 40 }, () => '#20140e')
    const rc = robustColor(labsOf([...skin, ...spec, ...shadow]), 260, { lowPct: 0.2, highPct: 0.9, lPct: 0.5 })
    assert.ok(rc)
    assert.ok(deltaE(rc.lab, hexToLab('#c98d68')) < 0.01, labToHex(rc.lab))
  })

  it('k-means finds the two garment colours, largest first', () => {
    const labs = labsOf([...Array.from({ length: 300 }, () => '#283593'), ...Array.from({ length: 120 }, () => '#f5f2eb')])
    const cl = kmeans(labs, 420, 3)
    assert.ok(deltaE(cl[0].lab, hexToLab('#283593')) < 0.02)
    assert.ok(cl.some((c) => deltaE(c.lab, hexToLab('#f5f2eb')) < 0.02))
    assert.ok(Math.abs(cl[0].share - 300 / 420) < 0.02)
    // Deterministic.
    assert.deepEqual(kmeans(labs, 420, 3), cl)
  })

  it('white balance: a warm cast on grey is pulled back, within the clamp', () => {
    // Grey pixels under warm light: red boosted, blue cut.
    const n = 500
    const neutral = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) neutral.set([0.3 * 1.25, 0.3, 0.3 * 0.75], i * 3)
    const c = estimateCorrection(neutral, n, null, 0)
    assert.ok(c.gain[0] < 1 && c.gain[2] > 1, JSON.stringify(c))
    assert.ok(c.gain[0] >= 1 / WB_LIMIT - 1e-9 && c.gain[2] <= WB_LIMIT + 1e-9)
    const fixed = linToLab(0.3 * 1.25 * c.gain[0], 0.3 * c.gain[1], 0.3 * 0.75 * c.gain[2])
    const before = linToLab(0.3 * 1.25, 0.3, 0.3 * 0.75)
    assert.ok(Math.hypot(fixed[1], fixed[2]) < Math.hypot(before[1], before[2]), 'less colour cast after correction')
  })

  it('exposure comes from the sclera only, clamped', () => {
    const dim = estimateCorrection(new Float32Array(0), 0, 0.55, 200)
    assert.ok(dim.exposure > 1 && dim.exposure <= EXPOSURE_LIMITS[1])
    const none = estimateCorrection(new Float32Array(0), 0, null, 0)
    assert.deepEqual(none.gain, [1, 1, 1])
    const bright = estimateCorrection(new Float32Array(0), 0, 0.99, 200)
    assert.ok(bright.exposure < 1 && bright.exposure >= EXPOSURE_LIMITS[0])
    // Shaded but fine eye whites leave exposure alone.
    assert.equal(estimateCorrection(new Float32Array(0), 0, 0.72, 200).exposure, 1)
  })

  it('sRGB decoding table matches the formula', () => {
    assert.equal(toLinear(0), 0)
    assert.ok(Math.abs(toLinear(255) - 1) < 1e-6)
    assert.ok(Math.abs(toLinear(128) - 0.2158605) < 1e-5)
  })
})
