import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HAIR_STYLES, dnaHash, encodeShareCode, decodeShareCode, normalizeDNA, renderSVG, validateDNA, type AvatarDNA } from '@arkplay/avatar-engine'
import { deltaE, hexToLab } from '../src/color.ts'
import { heuristicAttributes, mergeAttributes } from '../src/heuristics.ts'
import { HAIR_SIGNATURES, percentile, photoToAvatars, rankHairStyles } from '../src/toDNA.ts'
import { GEOMETRY } from '../src/calibration.ts'
import { TAXONOMY, headSpec } from '../src/taxonomy.ts'
import { FIXTURES, argmaxClass, loadFixture } from './helpers.ts'
import type { AvatarInput } from '../src/types.ts'

const ids = (dna: AvatarDNA) => [...dna.outfit, ...dna.accessories].map((i) => i.id)
const hair = (dna: AvatarDNA) => dna.sections.hair
const near = (a: string, b: string, max: number) => assert.ok(deltaE(hexToLab(a), hexToLab(b)) <= max, `${a} vs ${b}`)

describe('photoToAvatars', () => {
  it('has a signature for every HAIR_STYLES option', () => {
    for (const o of HAIR_STYLES) assert.ok(HAIR_SIGNATURES[o.id], `missing signature for ${o.id}`)
    for (const id of Object.keys(HAIR_SIGNATURES)) assert.ok(HAIR_STYLES.some((o) => o.id === id), `stale signature ${id}`)
    const arr = headSpec('hair_arrangement').classes
    for (const [id, s] of Object.entries(HAIR_SIGNATURES)) assert.ok(arr.includes(s.arr), `${id}: ${s.arr}`)
  })

  for (const name of FIXTURES) {
    it(`${name}: valid, normalized, deterministic, round-trips`, () => {
      const input = loadFixture(name)
      const out = photoToAvatars(input)
      assert.equal(out.candidates.length, 4)
      assert.equal(out.best, out.candidates[0].dna)
      for (const c of out.candidates) {
        assert.deepEqual(validateDNA(c.dna), [], `${name} / ${c.label}`)
        assert.deepEqual(normalizeDNA(c.dna), c.dna)
        assert.equal(dnaHash(decodeShareCode(encodeShareCode(c.dna))), dnaHash(c.dna))
        assert.ok(c.confidence >= 0 && c.confidence <= 1)
        assert.ok(c.label.length > 0)
      }
      // Candidates differ from one another.
      assert.equal(new Set(out.candidates.map((c) => dnaHash(c.dna))).size, out.candidates.length)
      // Same analysis → same result (deep-equal, including the seed).
      assert.deepEqual(photoToAvatars(loadFixture(name)), out)
      assert.ok(out.notes.length >= 2)
      // Body params untouched.
      const def = normalizeDNA({ kind: 'humanoid' })
      assert.deepEqual(out.best.sections.body, def.sections.body)
      assert.equal(out.best.sections.skin.age, def.sections.skin.age)
      // Renders.
      assert.match(renderSVG(out.best, { crop: 'portrait', idPrefix: 't' }), /^<svg/)
    })
  }

  it('long straight brown hair with a centre part', () => {
    const input = loadFixture('long-straight-brown')
    const { best } = photoToAvatars(input)
    assert.ok(['long', 'long-wavy', 'lob'].includes(hair(best).style as string), String(hair(best).style))
    near(hair(best).color as string, input.measured.colors.hair!.hex, 0.06)
    near(best.sections.skin.tone as string, input.measured.colors.skin!.hex, 0.04)
    near(best.sections.eyes.iris as string, input.measured.colors.iris!.hex, 0.1)
    assert.equal(best.sections.facialHair.beard, 'none')
    assert.ok(!ids(best).some((id) => id.includes('glasses')))
    const top = best.outfit.find((i) => i.id === 'tshirt' || i.id === 'hoodie' || i.id === 'sweater' || i.id === 'shirt' || i.id === 'longsleeve')
    assert.ok(top, ids(best).join(','))
    near(top.params.color as string, '#c62828', 0.08)
    // Narrow face → narrower than default.
    assert.ok((best.sections.head.width as number) < 0.5)
  })

  it('short hair, full beard and glasses', () => {
    const { best, candidates } = photoToAvatars(loadFixture('short-beard-glasses'))
    assert.ok(['crew', 'short-messy', 'curly-top', 'buzz', 'side-part', 'quiff', 'spiky'].includes(hair(best).style as string), String(hair(best).style))
    assert.ok(['full', 'short'].includes(best.sections.facialHair.beard as string), String(best.sections.facialHair.beard))
    assert.equal(best.sections.facialHair.mustache, 'chevron')
    assert.ok(ids(best).includes('square-glasses'), ids(best).join(','))
    assert.ok(candidates.some((c) => !ids(c.dna).includes('square-glasses')), 'a candidate without glasses')
    assert.ok((best.sections.head.jaw as number) > 0.5, 'strong jaw')
  })

  it('afro, bald and bob with bangs pick the matching styles', () => {
    assert.equal(hair(photoToAvatars(loadFixture('afro')).best).style, 'afro')
    const bald = photoToAvatars(loadFixture('bald')).best
    assert.equal(hair(bald).style, 'bald')
    const bob = photoToAvatars(loadFixture('bob-bangs')).best
    assert.equal(hair(bob).style, 'bob')
    assert.ok(hair(bob).bangs === 'auto' || hair(bob).bangs === 'straight')
  })

  it('a hijab is worn and the hidden hair is not read as bald', () => {
    const { best } = photoToAvatars(loadFixture('hijab'))
    assert.ok(ids(best).includes('hijab'), ids(best).join(','))
    assert.notEqual(hair(best).style, 'bald')
    const hijab = best.accessories.find((i) => i.id === 'hijab')!
    near(hijab.params.color as string, '#5e35b1', 0.08)
  })

  it('model attributes drive arrangement, bangs, part, earrings and makeup', () => {
    const input = loadFixture('model-ponytail')
    assert.equal(input.attributes.source, 'model')
    const { best, notes } = photoToAvatars(input)
    assert.equal(hair(best).style, 'ponytail')
    assert.ok(ids(best).includes('hoops'))
    assert.equal(best.sections.eyes.liner, 0.5)
    assert.ok((best.sections.skin.freckles as number) > 0)
    assert.ok(best.outfit.some((i) => i.id === 'blouse'))
    assert.ok(notes.some((n) => n.includes('attribute model')))
  })

  it('part sides: image right = the subject’s left; mirrored photos swap', () => {
    const input = loadFixture('long-straight-brown')
    const withPart = (x: number, mirrored = false): AvatarInput => {
      const measured = { ...input.measured, hair: { ...input.measured.hair, partX: x }, cues: { ...input.measured.cues, partStrength: 0.8 } }
      return { measured, attributes: heuristicAttributes(measured), mirrored }
    }
    const right = withPart(0.55)
    assert.equal(argmaxClass(headSpec('hair_part').classes, right.attributes.heads.hair_part), 'left')
    const a = photoToAvatars(right).best
    const style = hair(a).style as string
    const def = HAIR_SIGNATURES[style].part
    assert.equal(def === 'left' ? 'auto' : hair(a).part, def === 'left' ? hair(a).part : 'left')
    const m = photoToAvatars(withPart(0.55, true)).best
    assert.equal(hair(m).style, style)
    assert.equal(hair(m).part, HAIR_SIGNATURES[style].part === 'right' ? 'auto' : 'right')
    const centre = photoToAvatars(withPart(0.02)).best
    assert.ok(hair(centre).part === 'center' || HAIR_SIGNATURES[hair(centre).style as string].part === 'center')
  })

  it('seed option and count', () => {
    const input = loadFixture('afro')
    const a = photoToAvatars(input, { seed: 42, count: 2 })
    assert.equal(a.candidates.length, 2)
    assert.equal(a.best.seed, 42)
    assert.notEqual(photoToAvatars(input).best.seed, 42)
  })

  it('heuristics output every taxonomy head as a distribution with low confidence', () => {
    const attrs = loadFixture('bob-bangs').attributes
    for (const h of TAXONOMY.heads) {
      const p = attrs.heads[h.id]
      assert.equal(p.length, h.classes.length, h.id)
      assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9, h.id)
      assert.ok(attrs.confidence[h.id] <= 0.6, h.id)
    }
    const merged = mergeAttributes({ source: 'model', heads: { beard: [1, 0, 0, 0, 0, 0, 0] }, confidence: { beard: 0.9 } }, attrs)
    assert.equal(merged.source, 'model')
    assert.equal(merged.headSource?.beard, 'model')
    assert.equal(merged.headSource?.bangs, 'heuristic')
  })

  it('percentile curves are monotonic and centred', () => {
    for (const [k, c] of Object.entries(GEOMETRY)) {
      assert.ok(c.p05 < c.p50 && c.p50 < c.p95, k)
      assert.ok(Math.abs(percentile(c.p50, c) - 0.5) < 1e-6, k)
      assert.ok(Math.abs(percentile(c.p95, c) - 0.95) < 0.01, k)
      assert.ok(Math.abs(percentile(c.p05, c) - 0.05) < 0.01, k)
    }
    assert.equal(percentile(NaN, GEOMETRY.eyeSize), 0.5)
  })

  it('style ranking is a distribution', () => {
    const r = rankHairStyles(loadFixture('afro'))
    assert.equal(r.length, HAIR_STYLES.length)
    assert.ok(Math.abs(r.reduce((a, s) => a + s.p, 0) - 1) < 0.02)
  })
})
