/* QA report over the demo's "Run all" export (out/qa-batch.json, written by the demo's dev
 * server for the synthetic QA fixtures):
 *   - per-head agreement with the fixtures' sidecar labels for the merged attributes (model +
 *     heuristics under the trust table, what the runtime does), heuristics only and model only
 *   - what the best candidate's DNA shows (hair length, eyewear, headwear, beard, mustache)
 *   - crop parity (browser vs Python crops) and the attribute model's timings
 *   - a contact sheet photo → best candidate for every fixture (default out/calibration-v0.png)
 *
 *   node scripts/qa-report.ts [--batch out/qa-batch.json] [--sheet out/calibration-v0.png] [--parts] [--json]
 *
 * Heuristics, merging and photoToAvatars are re-run here from the saved measurements and raw
 * model outputs, so edits to heuristics.ts, toDNA.ts and calibration.ts show up without the
 * browser; measure.ts or perception changes need a new "Run all". */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { renderSVG, type AvatarDNA } from '@arkplay/avatar-engine'
import { headTrust, type AttributeModelSpec, type HeadTrust } from '../src/attributes.ts'
import { heuristicAttributes, mergeAttributes } from '../src/heuristics.ts'
import { HAIR_SIGNATURES, photoToAvatars } from '../src/toDNA.ts'
import { TAXONOMY, headSpec } from '../src/taxonomy.ts'
import type { AttributeSet, Measured } from '../src/types.ts'


const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHOTOS = path.join(PKG, 'fixtures', 'photos')
const argv = process.argv.slice(2)
const arg = (k: string, d: string) => {
  const i = argv.indexOf(k)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const BATCH = path.resolve(PKG, arg('--batch', 'out/qa-batch.json'))
const SHEET = path.resolve(PKG, arg('--sheet', 'out/calibration-v0.png'))
const PARTS = argv.includes('--parts')

interface Row {
  file: string
  error?: string
  warnings?: string[]
  timings?: Record<string, number>
  measured?: Measured
  parts?: { model: AttributeSet | null; heuristic: AttributeSet }
  parity?: { yunet: { mean: number; p99: number }; mediapipe: { mean: number; p99: number }; centre: { x: number; y: number }; side: number; angle: number } | null
}
interface Batch {
  generated: string
  backends: { mediapipe: string | null; attributes: string | null }
  attributeModel: { file: string; provider: string; fetchMs: number; sessionMs: number; lastRunMs: number | null } | null
  rows: Row[]
}

const batch = JSON.parse(readFileSync(BATCH, 'utf8')) as Batch
const spec = JSON.parse(readFileSync(path.join(PKG, 'models', 'attributes.json'), 'utf8')) as AttributeModelSpec
const variant = batch.attributeModel?.file?.includes('int8') ? 'int8' : 'fp32'
const trust: Record<string, HeadTrust> = headTrust(spec, variant)

const nanify = (o: Record<string, unknown> | undefined): Record<string, number> => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, typeof v === 'number' ? v : NaN]))
function revive(m: Measured): Measured {
  return {
    ...m,
    geometry: nanify(m.geometry) as Measured['geometry'],
    hair: nanify(m.hair) as Measured['hair'],
    expression: nanify(m.expression) as Measured['expression'],
    cues: nanify(m.cues as unknown as Record<string, unknown>) as unknown as Measured['cues'],
  }
}

interface Sidecar {
  labels: Record<string, string | null>
  width: number
  height: number
}
const sidecar = (file: string): Sidecar => JSON.parse(readFileSync(path.join(PHOTOS, file.replace(/\.[^.]+$/, '.json')), 'utf8')) as Sidecar
const top = (head: string, p: readonly number[] | undefined): string | null => (p ? headSpec(head).classes[p.reduce((bi, v, i) => (v > p[bi] ? i : bi), 0)] : null)

/* ---- Per-photo evaluation ---------------------------------------------------------------------- */

interface Eval {
  file: string
  labels: Record<string, string | null>
  merged: AttributeSet
  heuristic: AttributeSet
  model: AttributeSet | null
  best: AvatarDNA
  dna: Record<string, { want: string; got: string; ok: boolean }>
}

const LEN = headSpec('hair_length').classes
const hairLenOk = (style: string, want: string): boolean => {
  const sig = HAIR_SIGNATURES[style]
  const i = LEN.indexOf(want)
  return !!sig && i >= 0 && i >= sig.len[0] && i <= sig.len[1]
}
const EYEWEAR_DNA: Record<string, string> = { 'round-glasses': 'round-glasses', 'rect-glasses': 'square-glasses', 'cateye-glasses': 'cateye-glasses', 'half-rims': 'half-rims', sunglasses: 'shades', aviators: 'aviators' }

function evaluate(r: Row): Eval | null {
  if (!r.measured || !r.parts) return null
  const measured = revive(r.measured)
  const heuristic = heuristicAttributes(measured)
  const model = r.parts.model
  const merged = mergeAttributes(model, heuristic, trust)
  const out = photoToAvatars({ measured, attributes: merged })
  const best = out.best
  const labels = sidecar(r.file).labels
  const items = [...best.outfit, ...best.accessories].map((i) => i.id)
  const dna: Eval['dna'] = {}
  const style = String(best.sections.hair.style)
  if (labels.hair_length) dna.hair_length = { want: labels.hair_length, got: style, ok: hairLenOk(style, labels.hair_length) }
  if (labels.eyewear) {
    const want = labels.eyewear === 'none' ? 'none' : EYEWEAR_DNA[labels.eyewear]
    const got = items.find((i) => Object.values(EYEWEAR_DNA).includes(i)) ?? 'none'
    dna.eyewear = { want, got, ok: want === got }
    dna.eyewear_any = { want: want === 'none' ? 'none' : 'glasses', got: got === 'none' ? 'none' : 'glasses', ok: (want === 'none') === (got === 'none') }
  }
  if (labels.headwear) {
    const hw = headSpec('headwear').classes.filter((c) => c !== 'none')
    const hood = best.outfit.some((i) => i.id === 'hoodie' && i.params.hoodUp === true)
    const got = items.find((i) => hw.includes(i)) ?? (hood ? 'hood' : 'none')
    dna.headwear = { want: labels.headwear, got, ok: labels.headwear === got }
    dna.headwear_any = { want: labels.headwear === 'none' ? 'none' : 'hat', got: got === 'none' ? 'none' : 'hat', ok: (labels.headwear === 'none') === (got === 'none') }
  }
  if (labels.beard) {
    const got = String(best.sections.facialHair.beard ?? 'none')
    dna.beard = { want: labels.beard, got, ok: labels.beard === got }
    dna.beard_any = { want: labels.beard === 'none' ? 'none' : 'beard', got: got === 'none' ? 'none' : 'beard', ok: (labels.beard === 'none') === (got === 'none') }
  }
  if (labels.mustache) {
    const got = String(best.sections.facialHair.mustache ?? 'none')
    dna.mustache_any = { want: labels.mustache === 'none' ? 'none' : 'mustache', got: got === 'none' ? 'none' : 'mustache', ok: (labels.mustache === 'none') === (got === 'none') }
  }
  return { file: r.file, labels, merged, heuristic, model, best, dna }
}

const evals = batch.rows.map(evaluate).filter((e): e is Eval => !!e)

/* ---- Tables ------------------------------------------------------------------------------------ */

const pct = (a: number, n: number) => (n ? `${Math.round((a / n) * 100)}%` : '–')
const lines: string[] = []
lines.push(`QA report · ${evals.length}/${batch.rows.length} photos analysed · batch ${batch.generated}`)
if (batch.attributeModel) lines.push(`model ${batch.attributeModel.file} on ${batch.attributeModel.provider}: fetch ${batch.attributeModel.fetchMs} ms, session ${batch.attributeModel.sessionMs} ms · MediaPipe ${batch.backends.mediapipe}`)
const runMs = batch.rows.map((r) => r.timings?.attributes).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
if (runMs.length) lines.push(`attributes stage per photo: median ${runMs[Math.floor(runMs.length / 2)]} ms (min ${runMs[0]}, max ${runMs[runMs.length - 1]}; the first includes loading)`)
lines.push('')
lines.push('| head | trust (margin) | n | model+heuristics | heuristics only | model only | source used |')
lines.push('|---|---|---:|---:|---:|---:|---|')
const totals = { trusted: { n: 0, merged: 0, heur: 0, model: 0 }, other: { n: 0, merged: 0, heur: 0, model: 0 } }
const perHead: Record<string, { n: number; merged: number; heur: number; model: number }> = {}
for (const h of TAXONOMY.heads) {
  let n = 0
  let a = 0
  let b = 0
  let c = 0
  const src: Record<string, number> = {}
  for (const e of evals) {
    const want = e.labels[h.id]
    if (!want) continue
    n++
    if (top(h.id, e.merged.heads[h.id]) === want) a++
    if (top(h.id, e.heuristic.heads[h.id]) === want) b++
    if (top(h.id, e.model?.heads[h.id]) === want) c++
    const s = e.merged.headSource?.[h.id] ?? '?'
    src[s] = (src[s] ?? 0) + 1
  }
  if (!n) continue
  perHead[h.id] = { n, merged: a, heur: b, model: c }
  const t = trust[h.id]
  const g = t && t.use !== 'heuristic' ? totals.trusted : totals.other
  g.n += n
  g.merged += a
  g.heur += b
  g.model += c
  const margin = t?.margin !== null && t?.margin !== undefined ? `${t.margin >= 0 ? '+' : ''}${Math.round(t.margin * 100)}` : '?'
  lines.push(`| ${h.id} | ${t?.use ?? '-'} (${margin}) | ${n} | ${pct(a, n)} | ${pct(b, n)} | ${pct(c, n)} | ${Object.entries(src).map(([k, v]) => `${k} ${v}`).join(', ')} |`)
}
lines.push(`| **trusted heads** | | ${totals.trusted.n} | **${pct(totals.trusted.merged, totals.trusted.n)}** | ${pct(totals.trusted.heur, totals.trusted.n)} | ${pct(totals.trusted.model, totals.trusted.n)} | |`)
lines.push(`| other heads | | ${totals.other.n} | ${pct(totals.other.merged, totals.other.n)} | ${pct(totals.other.heur, totals.other.n)} | ${pct(totals.other.model, totals.other.n)} | |`)
lines.push('')

// What the avatars show.
const dnaKeys = ['hair_length', 'eyewear_any', 'eyewear', 'headwear_any', 'headwear', 'beard_any', 'beard', 'mustache_any']
lines.push('| DNA check (best candidate) | n | ok |')
lines.push('|---|---:|---:|')
for (const k of dnaKeys) {
  const xs = evals.map((e) => e.dna[k]).filter(Boolean)
  if (xs.length) lines.push(`| ${k} | ${xs.length} | ${pct(xs.filter((x) => x.ok).length, xs.length)} |`)
}
lines.push('')

// Crop parity.
const par = batch.rows.map((r) => r.parity).filter((p): p is NonNullable<Row['parity']> => !!p)
if (par.length) {
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = (xs: number[]) => Math.sqrt(m(xs.map((x) => (x - m(xs)) ** 2)))
  const f = (xs: number[], d = 3) => `${m(xs).toFixed(d)} ± ${sd(xs).toFixed(d)}`
  lines.push(`crop parity over ${par.length} photos: browser canvas crop from the YuNet points vs Python: mean |Δ| ${f(par.map((p) => p.yunet.mean), 2)} levels (p99 ${f(par.map((p) => p.yunet.p99), 1)}); pipeline crop (MediaPipe points) vs Python: ${f(par.map((p) => p.mediapipe.mean), 2)} levels`)
  lines.push(`MediaPipe vs YuNet alignment: centre x ${f(par.map((p) => p.centre.x))}·d, y ${f(par.map((p) => p.centre.y))}·d, side ×${f(par.map((p) => p.side))}, roll ${f(par.map((p) => p.angle), 2)}°`)
  lines.push('')
}

// Per photo: the misses on trusted heads.
lines.push('Per photo (trusted-head misses: label → merged [source]):')
for (const e of evals) {
  const miss = TAXONOMY.heads
    .filter((h) => trust[h.id]?.use !== 'heuristic' && e.labels[h.id] && top(h.id, e.merged.heads[h.id]) !== e.labels[h.id])
    .map((h) => `${h.id} ${e.labels[h.id]}→${top(h.id, e.merged.heads[h.id])} [${e.merged.headSource?.[h.id]}]`)
  const dnaMiss = Object.entries(e.dna)
    .filter(([k, v]) => !v.ok && !k.endsWith('_any'))
    .map(([k, v]) => `${k} ${v.want}→${v.got}`)
  lines.push(`  ${e.file}  hair ${e.best.sections.hair.style} · ${miss.join('; ') || 'ok'}${dnaMiss.length ? `  | DNA: ${dnaMiss.join('; ')}` : ''}`)
}
console.log(lines.join('\n'))
if (argv.includes('--json')) writeFileSync(path.join(PKG, 'out', 'qa-report.json'), JSON.stringify({ perHead, totals, trust }, null, 2))

/* ---- Contact sheet ----------------------------------------------------------------------------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function sheet(items: Eval[], cols: number, cell: number, file: string): void {
  const pw = Math.round(cell * (832 / 1024))
  const cw = pw + cell + 16
  const ch = cell + 40
  const W = cols * cw + 8
  const H = Math.ceil(items.length / cols) * ch + 8
  let body = `<rect width="${W}" height="${H}" fill="#f6f4f0"/>`
  items.forEach((e, k) => {
    const x = 8 + (k % cols) * cw
    const y = 8 + Math.floor(k / cols) * ch
    const jpg = readFileSync(path.join(PHOTOS, e.file)).toString('base64')
    body += `<image x="${x}" y="${y}" width="${pw}" height="${cell}" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,${jpg}"/>`
    const svg = renderSVG(e.best, { crop: 'portrait', size: cell, idPrefix: `q${k}` })
    body += svg.replace(/^<svg/, `<svg x="${x + pw + 2}" y="${y}"`)
    const h = e.best.sections.hair
    const fh = e.best.sections.facialHair
    const acc = [...e.best.accessories].map((i) => i.id).join(', ')
    const ok = Object.entries(e.dna).filter(([k2]) => !k2.endsWith('_any'))
    const good = ok.filter(([, v]) => v.ok).length
    const fs = Math.max(9, Math.round(cell / 17))
    body += `<text x="${x}" y="${y + cell + fs + 2}" font-family="sans-serif" font-size="${fs}" fill="#222">${esc(`${e.file.replace('.jpg', '')} · ${h.style} · ${fh.beard !== 'none' ? `beard ${fh.beard}` : 'no beard'}${acc ? ` · ${acc}` : ''}`.slice(0, 64))}</text>`
    body += `<text x="${x}" y="${y + cell + 2 * fs + 5}" font-family="sans-serif" font-size="${fs}" fill="${good === ok.length ? '#2e7d32' : '#c62828'}">${esc(`labels ${good}/${ok.length}: ${ok.map(([k2, v]) => `${k2.replace('hair_', '')} ${v.ok ? '✓' : `✗ ${v.want}`}`).join(' ')}`.slice(0, 70))}</text>`
  })
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`
  const png = new Resvg(doc, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, png)
  console.log(`wrote ${path.relative(PKG, file)}`)
}

sheet(evals, 4, 190, SHEET)
if (PARTS) for (let p = 0; p < Math.ceil(evals.length / 8); p++) sheet(evals.slice(p * 8, p * 8 + 8), 4, 260, SHEET.replace(/\.png$/, `-part${p + 1}.png`))
