import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTO_PROVIDER, TRUST_MIN_MARGIN, certainty, headProbabilities, headTrust, inputTensorData, modelFiles, toTaxonomy, type AttributeModelSpec } from '../src/attributes.ts'
import { BLEND_MAX, blendTrusted, heuristicAttributes, mergeAttributes, presenceOnly } from '../src/heuristics.ts'
import { inPolygon, polygonArea } from '../src/measure.ts'
import { TAXONOMY } from '../src/taxonomy.ts'
import { loadFixture } from './helpers.ts'

const MODELS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models')

describe('per-head trust (attributes.json metrics)', () => {
  const specFile = path.join(MODELS, 'attributes.json')
  const shipped = existsSync(specFile) ? (JSON.parse(readFileSync(specFile, 'utf8')) as AttributeModelSpec) : null

  it('v0: trusts the heads that beat their baseline by ≥ 5 points (int8 accuracy)', { skip: !shipped && 'no attributes.json' }, () => {
    const t = headTrust(shipped!, 'int8')
    const by = (use: string) =>
      Object.entries(t)
        .filter(([, v]) => v.use === use)
        .map(([k]) => k)
        .sort()
    if (shipped!.modelVersion !== 'v0') return // a newer model: only the invariants below apply
    assert.deepEqual(by('model'), ['beard', 'eyewear', 'hair_arrangement', 'hair_length', 'hair_sides', 'hair_texture', 'hair_top', 'headphones', 'headwear', 'mustache', 'necklace', 'top'])
    assert.deepEqual(by('presence'), ['hair_part'])
    assert.deepEqual(by('heuristic'), ['bangs', 'earrings', 'eye_makeup', 'freckles', 'hair_color_style', 'hairline'])
    assert.ok(t.hair_length.reliability === 1 && t.beard.reliability < 0.2)
  })

  it('every shipped head has an entry, and the margin rule holds', { skip: !shipped && 'no attributes.json' }, () => {
    const t = headTrust(shipped!, 'int8')
    for (const h of TAXONOMY.heads) {
      const e = t[h.id]
      assert.ok(e, h.id)
      if (e.margin !== null) assert.equal(e.use === 'heuristic', e.margin < TRUST_MIN_MARGIN, h.id)
    }
  })

  it('is data-driven: better metrics trust more heads; no metrics trusts all but the policy', () => {
    const heads = [
      { id: 'bangs', output: 'logits_bangs', classes: ['none', 'straight', 'side', 'curtain', 'wispy'] },
      { id: 'hair_part', output: 'logits_hair_part', classes: ['none', 'left', 'center', 'right'] },
    ]
    const v1 = headTrust({ heads, metrics: { test: { bangs: { acc: 0.97 }, hair_part: { acc: 0.9 } }, majorityBaseline: { bangs: 0.9, hair_part: 0.6 } } })
    assert.equal(v1.bangs.use, 'model')
    assert.equal(v1.hair_part.use, 'presence', 'the side never comes from the model')
    const int8 = headTrust({ heads, metrics: { test: { bangs: { acc: 0.97 } }, majorityBaseline: { bangs: 0.9 }, int8: { accDelta: { bangs: -0.03 } } } }, 'int8')
    assert.equal(int8.bangs.use, 'heuristic', 'the int8 delta counts')
    const none = headTrust({ heads })
    assert.equal(none.bangs.use, 'model')
    assert.equal(none.bangs.reliability, 0.5)
  })

  it('model files: int8 first, fp32 as the fallback, plain names only', () => {
    assert.deepEqual(
      modelFiles({}).map((f) => f.file),
      ['attributes.int8.onnx', 'attributes.onnx'],
    )
    const f = modelFiles({ files: { fp32: { file: 'attributes.onnx', sha256: 'a'.repeat(64) }, int8: { file: '../evil.onnx' } } })
    assert.deepEqual(
      f.map((x) => x.file),
      ['attributes.onnx'],
    )
    assert.equal(f[0].sha256, 'a'.repeat(64))
    assert.equal(AUTO_PROVIDER.int8, 'wasm')
  })

  it('input tensor: NCHW, mean/std normalized', () => {
    const px = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255])
    const d = inputTensorData(px, 1, { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] })
    assert.deepEqual(Array.from(d.slice(0, 3)).map((v) => Math.round(v * 100) / 100), [1, -1, 0])
  })
})

describe('merging the model with the heuristics', () => {
  it('trusted heads: the model when the heuristic agrees or is unsure', () => {
    assert.equal(blendTrusted([0.1, 0.8, 0.1], [0.2, 0.7, 0.1], 0.5, 0).alpha, 0)
    assert.equal(blendTrusted([0.8, 0.1, 0.1], [0.3, 0.4, 0.3], 0.2, 0).alpha, 0, 'a weak disagreement is ignored')
  })

  it('trusted heads: a strong, confident disagreement blends (never a hard switch)', () => {
    const { p, alpha } = blendTrusted([0.9, 0.1], [0.05, 0.95], 0.45, 0)
    assert.ok(alpha > 0.3 && alpha <= BLEND_MAX, String(alpha))
    assert.ok(p[1] > 0.1 && p[1] < 0.95, String(p))
    assert.ok(Math.abs(p[0] + p[1] - 1) < 1e-9)
    // A more reliable head resists the heuristic more.
    assert.ok(blendTrusted([0.9, 0.1], [0.05, 0.95], 0.45, 1).alpha < alpha)
  })

  it('presence only: p(none) from the model, the split from the heuristic', () => {
    const p = presenceOnly('hair_part', [0.2, 0.7, 0.05, 0.05], [0.1, 0.05, 0.05, 0.8])
    assert.equal(p[0], 0.2)
    assert.ok(p[3] > p[1] && p[3] > p[2], 'side from the measurement')
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9)
  })

  it('headSource records what was used', () => {
    const heur = heuristicAttributes(loadFixture('long-straight-brown').measured)
    const model = {
      source: 'model' as const,
      heads: { hair_length: [0, 0, 0, 0, 0, 0.1, 0.8, 0.1], bangs: [0, 1, 0, 0, 0], hair_part: [0.3, 0.6, 0.05, 0.05] },
      confidence: { hair_length: 0.8, bangs: 0.9, hair_part: 0.7 },
    }
    const trust = { hair_length: { use: 'model' as const, reliability: 1 }, bangs: { use: 'heuristic' as const, reliability: 0 }, hair_part: { use: 'presence' as const, reliability: 0 } }
    const m = mergeAttributes(model, heur, trust)
    assert.equal(m.source, 'model')
    assert.equal(m.headSource?.hair_length, 'model')
    assert.equal(m.headSource?.bangs, 'heuristic')
    assert.deepEqual(m.heads.bangs, heur.heads.bangs, 'untrusted heads keep the heuristic')
    assert.equal(m.headSource?.hair_part, 'blend')
    assert.equal(m.headSource?.beard, 'heuristic', 'heads the model lacks')
    assert.equal(m.heads.hair_part[0], 0.3)
    // Only untrusted heads: the overall source stays the heuristics'.
    assert.equal(mergeAttributes({ ...model, heads: { bangs: [1, 0, 0, 0, 0] } }, heur, trust).source, 'heuristic')
  })
})

const sum = (p: number[]) => p.reduce((a, b) => a + b, 0)

describe('attribute model outputs', () => {
  it('softmax logits → probabilities', () => {
    const p = headProbabilities([2, 0, 0, 0], { id: 'hair_texture', output: 'hair_texture', classes: ['straight', 'wavy', 'curly', 'coily'] }, 'ordinal')!
    assert.ok(Math.abs(sum(p) - 1) < 1e-9)
    assert.ok(p[0] > 0.7)
  })

  it('CORAL cumulative logits (K−1 outputs) → class masses, monotone', () => {
    const head = { id: 'hairline', output: 'hairline', classes: ['receding', 'normal', 'low'] }
    // P(y>0) high, P(y>1) low → "normal".
    const p = headProbabilities([3, -3], head, 'ordinal')!
    assert.deepEqual(p.map((v) => Math.round(v * 10) / 10), [0, 0.9, 0])
    assert.ok(Math.abs(sum(p) - 1) < 1e-9)
    // Non-monotone logits are repaired, never negative.
    const q = headProbabilities([-2, 2], head, 'ordinal')!
    assert.ok(q.every((v) => v >= 0) && Math.abs(sum(q) - 1) < 1e-9)
  })

  it('binary sigmoid, explicit probs, and shape mismatches', () => {
    const hp = { id: 'headphones', output: 'headphones', classes: ['no', 'yes'] }
    const p = headProbabilities([0], hp, 'binary')!
    assert.deepEqual(p, [0.5, 0.5])
    assert.deepEqual(headProbabilities([0.2, 0.6], { ...hp, activation: 'probs' }, 'binary')!.map((v) => Math.round(v * 1000) / 1000), [0.25, 0.75])
    assert.equal(headProbabilities([1, 2, 3], hp, 'binary'), null)
  })

  it('maps model classes onto the taxonomy only when they are a prefix', () => {
    const full = toTaxonomy({ id: 'earrings', output: 'e', classes: ['none', 'studs', 'hoops', 'drops'] }, [0.1, 0.2, 0.3, 0.4])
    assert.deepEqual(full, [0.1, 0.2, 0.3, 0.4])
    // An older model trained before "drops" was appended: padded with 0.
    assert.deepEqual(toTaxonomy({ id: 'earrings', output: 'e', classes: ['none', 'studs', 'hoops'] }, [0.2, 0.3, 0.5]), [0.2, 0.3, 0.5, 0])
    assert.equal(toTaxonomy({ id: 'earrings', output: 'e', classes: ['studs', 'none'] }, [0.5, 0.5]), null)
    assert.equal(toTaxonomy({ id: 'gender', output: 'g', classes: ['a', 'b'] }, [0.5, 0.5]), null, 'unknown heads are ignored')
  })

  it('certainty is 0 for uniform and 1 for one-hot', () => {
    assert.equal(certainty([0.25, 0.25, 0.25, 0.25]), 0)
    assert.equal(certainty([1, 0, 0]), 1)
  })

  it('polygon helpers', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]
    assert.equal(polygonArea(sq), 4)
    assert.equal(inPolygon(sq, 1, 1), true)
    assert.equal(inPolygon(sq, 3, 1), false)
  })
})
