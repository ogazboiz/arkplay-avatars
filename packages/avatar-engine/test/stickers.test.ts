/* Stickers, comics and effects: every template and script renders for both kinds, output is
 * deterministic, content references exist, and samples rasterize with resvg (the service's
 * rasterizer, which panics on off-canvas layers and group opacity). */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'
import {
  COMIC_LAYOUTS,
  COMIC_SCRIPTS,
  EFFECTS,
  EXPRESSION_PRESETS,
  POSE_DEFS,
  SCENE_PRESETS,
  STICKER_CATEGORIES,
  STICKER_TEMPLATES,
  applyEffect,
  applySpecies,
  clipsFor,
  comicCatalogue,
  dailyComic,
  dayNumber,
  defaultDNA,
  effectLayers,
  randomDNA,
  renderComic,
  renderSVG,
  renderSticker,
  renderWithEffect,
  stickerCatalogue,
  stickerSet,
} from '../src/index.ts'
import { normalizeText } from '../src/comics/font.ts'
import { PROPS } from '../src/comics/props.ts'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47]
const raster = (svg: string, width = 128) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng()
const human = randomDNA({ seed: 15, kind: 'humanoid' })
const friend = randomDNA({ seed: 21, kind: 'humanoid' })
const creature = applySpecies(defaultDNA('creature'), 'fox')
const blob = applySpecies(defaultDNA('creature'), 'slime')

/** Well-formed enough: one root, no NaN/undefined leaking into attributes, no group opacity. */
function svgOk(svg: string, what: string) {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, what)
  assert.ok(svg.endsWith('</svg>'), what)
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/, what)
  assert.doesNotMatch(svg, /\sopacity="/, `${what}: group opacity is not resvg-safe`)
  assert.doesNotMatch(svg, /<script|href="(https?:|\/\/)/i, what)
}

test('sticker catalogue: 40+ templates in every category, unique ids, friendmoji', () => {
  const { templates, categories } = stickerCatalogue()
  assert.ok(templates.length >= 40, `${templates.length} templates`)
  assert.equal(new Set(templates.map((t) => t.id)).size, templates.length)
  for (const c of categories) assert.ok(templates.some((t) => t.category === c.id), `category ${c.id} has templates`)
  assert.ok(templates.filter((t) => t.cast === 2).length >= 4, 'friendmoji')
  for (const t of templates) assert.match(t.id, /^[a-z0-9-]{2,40}$/)
  JSON.parse(JSON.stringify(templates))
})

test('sticker templates reference real poses, faces, clips, props and effects', () => {
  const clipNames = { humanoid: new Set(clipsFor('humanoid').map((c) => c.name)), creature: new Set(clipsFor('creature').map((c) => c.name)) }
  for (const t of STICKER_TEMPLATES) {
    assert.ok(STICKER_CATEGORIES.some((c) => c.id === t.category), t.id)
    assert.ok(t.actors.length === 1 || t.actors.length === 2, t.id)
    for (const a of t.actors) {
      if (a.pose) assert.ok(POSE_DEFS[a.pose], `${t.id}: pose ${a.pose}`)
      if (a.expression) assert.ok(EXPRESSION_PRESETS[a.expression], `${t.id}: expression ${a.expression}`)
      if (a.clip) assert.ok(clipNames.humanoid.has(a.clip), `${t.id}: clip ${a.clip}`)
      if (a.creature?.clip) assert.ok(clipNames.creature.has(a.creature.clip), `${t.id}: creature clip ${a.creature.clip}`)
      if (a.creature?.expression) assert.ok(EXPRESSION_PRESETS[a.creature.expression], `${t.id}: ${a.creature.expression}`)
    }
    for (const p of t.props ?? []) assert.ok(PROPS[p.id], `${t.id}: prop ${p.id}`)
    if (t.effect) assert.ok(EFFECTS.some((e) => e.id === t.effect), `${t.id}: effect`)
    if (t.caption) {
      const shown = normalizeText(t.caption.text)
      assert.equal(shown.replace(/\s/g, ''), t.caption.text.toUpperCase().replace(/…/g, '...').replace(/\s/g, ''), `${t.id}: every caption character is drawable`)
    }
  }
})

test('every sticker renders for a humanoid and a creature (and friendmoji pairs)', () => {
  for (const t of STICKER_TEMPLATES)
    for (const [label, cast] of [['humanoid', [human, friend]], ['creature', [creature, friend]], ['blob', [blob]]] as const) {
      const svg = renderSticker(t.id, [...cast], { size: 128 })
      svgOk(svg, `${t.id} ${label}`)
      assert.ok(svg.length < 600_000, `${t.id} ${label}: ${svg.length} bytes`)
      if (t.caption) assert.match(svg, /stroke-linecap="round"/, `${t.id}: caption lettering`)
    }
})

test('stickers are deterministic and their ids are scoped', () => {
  const a = renderSticker('happy-birthday', [human], { size: 256 })
  const b = renderSticker('happy-birthday', [human], { size: 256 })
  assert.equal(a, b)
  const c = renderSticker('hug', [creature, friend], { idPrefix: 'zz' })
  assert.equal(c, renderSticker('hug', [creature, friend], { idPrefix: 'zz' }))
  const ids = [...c.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  assert.ok(ids.length > 0)
  for (const id of ids) assert.ok(id.startsWith('zz'), `id ${id} is scoped`)
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids')
  // The effect override changes the art; motion off removes every keyframe.
  assert.notEqual(renderSticker('hello', [human], { effect: 'snow' }), renderSticker('hello', [human]))
  assert.doesNotMatch(renderSticker('yay', [human], { motion: false }), /@keyframes/)
  assert.match(renderSticker('yay', [human]), /prefers-reduced-motion/)
  assert.throws(() => renderSticker('no-such-template', [human]))
})

test('the original sticker set is unchanged in shape', () => {
  assert.equal(stickerSet(human).length, 16)
  assert.equal(stickerSet(creature).length, 12)
})

test('resvg-safe: sample stickers rasterize', () => {
  const sample = STICKER_TEMPLATES.filter((_, i) => i % 4 === 0 || STICKER_TEMPLATES[i].actors.length > 1)
  for (const t of sample)
    for (const cast of [[human, friend], [creature, friend]]) {
      const png = raster(renderSticker(t.id, cast, { size: 128 }), 128)
      assert.deepEqual([...png.subarray(0, 4)], PNG_SIG, t.id)
    }
})

test('comic scripts: 20+ strips of 3-4 panels with valid scenes, speakers and props', () => {
  const { scripts, categories } = comicCatalogue()
  assert.ok(scripts.length >= 20, `${scripts.length} scripts`)
  assert.equal(new Set(scripts.map((s) => s.id)).size, scripts.length)
  assert.ok(scripts.some((s) => s.bcu), 'Bible Comic Universe tie-ins')
  for (const c of categories) assert.ok(scripts.some((s) => s.category === c.id), c.id)
  const scenes = new Set(SCENE_PRESETS.map((o) => o.id))
  for (const s of COMIC_SCRIPTS) {
    assert.ok(s.panels.length >= 3 && s.panels.length <= 4, s.id)
    assert.ok(scenes.has(s.scene), `${s.id}: scene ${s.scene}`)
    for (const p of s.panels) {
      if (p.scene) assert.ok(scenes.has(p.scene), `${s.id}: scene ${p.scene}`)
      for (const a of p.actors) {
        assert.ok(a.who >= 0 && a.who < s.cast, `${s.id}: actor ${a.who}`)
        if (a.pose) assert.ok(POSE_DEFS[a.pose], `${s.id}: pose ${a.pose}`)
        if (a.expression) assert.ok(EXPRESSION_PRESETS[a.expression], `${s.id}: ${a.expression}`)
        if (a.hold) assert.ok(PROPS[a.hold.id], `${s.id}: prop ${a.hold.id}`)
      }
      for (const l of p.lines ?? []) {
        if (l.who >= 0) assert.ok(p.actors.some((a) => a.who === l.who), `${s.id}: speaker ${l.who} is in the panel`)
        else assert.ok(l.from, `${s.id}: off-panel lines aim somewhere`)
      }
      for (const pr of p.props ?? []) assert.ok(PROPS[pr.id], `${s.id}: prop ${pr.id}`)
    }
  }
})

test('every comic renders (landscape), with creatures, in every layout; deterministic', () => {
  for (const s of COMIC_SCRIPTS) {
    const svg = renderComic(s.id, [human, friend], { width: 600 })
    svgOk(svg, s.id)
    assert.ok(svg.length < 3_000_000, `${s.id}: ${svg.length} bytes`)
    assert.match(svg, /width="600"/)
  }
  for (const s of COMIC_SCRIPTS.filter((_, i) => i % 3 === 0)) svgOk(renderComic(s.id, [creature, blob]), `${s.id} creatures`)
  for (const layout of COMIC_LAYOUTS) {
    const svg = renderComic('ark-helpers', [human], { layout })
    svgOk(svg, layout)
    assert.equal(svg, renderComic('ark-helpers', [human], { layout }))
  }
  assert.throws(() => renderComic('no-such-script', [human]))
})

test('resvg-safe: sample comics rasterize', () => {
  for (const [id, cast, layout] of [['ark-helpers', [human, friend], 'landscape'], ['boss-battle', [creature, friend], 'square'], ['brave-like-daniel', [blob], 'vertical']] as const) {
    const png = raster(renderComic(id, [...cast], { layout }), 400)
    assert.deepEqual([...png.subarray(0, 4)], PNG_SIG, id)
  }
})

test('the daily comic: deterministic by date and seed, seasonal in season, no repeats in a cycle', () => {
  assert.equal(dailyComic('2026-09-25', 'ap_1').id, dailyComic('2026-09-25', 'ap_1').id)
  assert.ok(Number.isNaN(dayNumber('2026-02-30')))
  assert.throws(() => dailyComic('not-a-date'))
  const evergreen = COMIC_SCRIPTS.filter((s) => !s.season).length
  const start = dayNumber('2026-06-01')
  const cycle = Math.floor(start / evergreen) * evergreen
  const seen = new Set<string>()
  for (let d = cycle; d < cycle + evergreen; d++) {
    const date = new Date(d * 86_400_000).toISOString().slice(0, 10)
    seen.add(dailyComic(date, 'ap_1').id)
  }
  assert.equal(seen.size, evergreen, 'a whole cycle shows every evergreen strip once')
  const december: string[] = []
  for (let day = 1; day <= 24; day++) december.push(dailyComic(`2026-12-${String(day).padStart(2, '0')}`, 'x').id)
  assert.ok(december.some((id) => COMIC_SCRIPTS.find((s) => s.id === id)?.season), 'seasonal strips appear in December')
  const july = Array.from({ length: 28 }, (_, i) => dailyComic(`2026-07-${String(i + 1).padStart(2, '0')}`, 'x').id)
  assert.ok(!july.some((id) => COMIC_SCRIPTS.find((s) => s.id === id)?.season), 'no Christmas strips in July')
})

test('effects: every effect draws, loops with scoped CSS, stills without motion, rasterizes', () => {
  const base = renderSVG(human, { crop: 'portrait', size: 128, idPrefix: 'pp' })
  for (const e of EFFECTS) {
    const L = effectLayers(e.id, { x: 0, y: 0, w: 512, h: 512 }, { prefix: 'qq', seed: 1 })
    assert.ok(L.back.length + L.front.length > 0, e.id)
    const svg = applyEffect(base, e.id, { prefix: 'qq' })
    svgOk(svg, e.id)
    for (const k of svg.matchAll(/@keyframes ([\w-]+)/g)) assert.ok(k[1].startsWith('pp') || k[1].startsWith('qq'), `${e.id}: ${k[1]} scoped`)
    assert.doesNotMatch(applyEffect(renderSVG(human, { crop: 'portrait', motion: false }), e.id, { motion: false }), /@keyframes/, `${e.id}: still`)
    const png = raster(svg, 96)
    assert.deepEqual([...png.subarray(0, 4)], PNG_SIG, e.id)
  }
  const fx = renderWithEffect(creature, 'halo', { crop: 'portrait', background: false, idPrefix: 'rw' })
  svgOk(fx, 'renderWithEffect')
  assert.equal(fx, renderWithEffect(creature, 'halo', { crop: 'portrait', background: false, idPrefix: 'rw' }))
  assert.equal(applyEffect(base, 'no-such-effect'), base)
})
