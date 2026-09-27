/* Avatar Vision QA page. Pick, drop or capture a photo (or click a QA fixture) to see the
 * landmarks, segmentation, aligned crop, measured colours, attribute bars and the rendered
 * candidate avatars. "Run all" analyses every fixture; "Calibrate" prints the geometry
 * percentiles to paste into src/calibration.ts. Everything stays in this tab's memory. */

import { renderSVG } from '@arkplay/avatar-engine'
import {
  BROW_L,
  BROW_R,
  CROP,
  CROP_POINTS,
  DEFAULT_MODEL_BASE,
  EYE_L,
  EYE_R,
  FACE_OVAL,
  GEOMETRY,
  LIPS_OUTER,
  PhotoAvatarError,
  TAXONOMY,
  alignFromPoints,
  applyAffine,
  createAttributeRunner,
  createPhotoAvatar,
  drawAlignedCrop,
  headProbabilities,
  headSpec,
  inputTensorData,
  invertAffine,
  percentile,
  photoToAvatars,
  releaseAnalysis,
  type AttributeProvider,
  type PhotoAnalysis,
  type PhotoAvatar,
  type PhotoAvatars,
  type ProgressEvent,
} from '@arkplay/avatar-vision'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  for (const k of kids) e.append(k)
  return e
}
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '–')

/** A QA fixture's sidecar (written by the fixture generator). */
interface Sidecar {
  crop?: string
  width?: number
  height?: number
  labels?: Record<string, string | null>
  face?: { eyeL: [number, number]; eyeR: [number, number]; mouthL: [number, number]; mouthR: [number, number] }
}

interface Fixture {
  file: string
  url: string
  labels: (Record<string, unknown> & Sidecar) | null
}

let pa: PhotoAvatar | null = null
let current: PhotoAnalysis | null = null
let fixtures: Fixture[] = []
const status = $('status')

function setStatus(msg: string, error = false) {
  status.textContent = msg
  status.className = `status ${error ? 'error' : 'muted'}`
}

function onProgress(e: ProgressEvent) {
  if (e.stage === 'models' && e.total) setStatus(`Downloading ${e.file} … ${Math.round(((e.loaded ?? 0) / e.total) * 100)}%`)
  else if (e.stage !== 'models') setStatus(`Analysing: ${e.stage} …`)
}

const photoAvatar = () => (pa ??= createPhotoAvatar({ onProgress }))

/* ---- Rendering the analysis ---------------------------------------------------------------- */

function drawPhoto(a: PhotoAnalysis) {
  const c = $<HTMLCanvasElement>('photo')
  c.width = a.image.width
  c.height = a.image.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(a.image.bitmap, 0, 0)
  if (!$<HTMLInputElement>('showLm').checked) return
  const s = Math.max(1, a.image.width / 700)
  // Other faces.
  for (const f of a.faces) {
    ctx.strokeStyle = f.chosen ? 'rgba(80,220,120,.9)' : 'rgba(255,80,80,.9)'
    ctx.lineWidth = 2 * s
    ctx.strokeRect(f.box.x, f.box.y, f.box.w, f.box.h)
  }
  const L = a.face.landmarks
  ctx.fillStyle = 'rgba(0,255,200,.55)'
  for (const p of L) ctx.fillRect(p.x - 0.8 * s, p.y - 0.8 * s, 1.6 * s, 1.6 * s)
  const poly = (idx: readonly number[], color: string) => {
    ctx.beginPath()
    idx.forEach((i, k) => (k ? ctx.lineTo(L[i].x, L[i].y) : ctx.moveTo(L[i].x, L[i].y)))
    ctx.closePath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
  }
  poly(FACE_OVAL, 'rgba(255,255,255,.8)')
  poly(EYE_L, '#4fc3f7')
  poly(EYE_R, '#4fc3f7')
  poly(BROW_L, '#ffb74d')
  poly(BROW_R, '#ffb74d')
  poly(LIPS_OUTER, '#f06292')
  for (const [c0, r0] of [
    [468, 469],
    [473, 474],
  ]) {
    ctx.beginPath()
    ctx.arc(L[c0].x, L[c0].y, Math.hypot(L[r0].x - L[c0].x, L[r0].y - L[c0].y), 0, Math.PI * 2)
    ctx.strokeStyle = '#fff176'
    ctx.stroke()
  }
  // Key measurement points (nose wings, jaw, temples) with their indices.
  ctx.font = `${10 * s}px sans-serif`
  for (const i of [129, 358, 172, 397, 54, 284, 234, 454, 10, 152, 168, 2]) {
    ctx.fillStyle = '#ff5252'
    ctx.beginPath()
    ctx.arc(L[i].x, L[i].y, 2.5 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.fillText(String(i), L[i].x + 3 * s, L[i].y - 3 * s)
  }
  // The segmentation region (rotated square).
  const inv = invertAffine(a.segmentation.toSeg)
  const n = a.segmentation.size
  ctx.beginPath()
  ;[
    [0, 0],
    [n, 0],
    [n, n],
    [0, n],
  ].forEach(([x, y], k) => {
    const p = applyAffine(inv, { x, y })
    if (k) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
  })
  ctx.closePath()
  ctx.setLineDash([6 * s, 4 * s])
  ctx.strokeStyle = 'rgba(255,255,255,.6)'
  ctx.stroke()
  ctx.setLineDash([])
}

const SEG_COLORS: [number, number, number][] = [
  [0, 0, 0],
  [255, 183, 77],
  [129, 199, 132],
  [244, 143, 177],
  [100, 181, 246],
  [186, 104, 200],
]

function drawSeg(a: PhotoAnalysis) {
  const s = a.segmentation
  const c = $<HTMLCanvasElement>('seg')
  c.width = s.size
  c.height = s.size
  const ctx = c.getContext('2d')!
  ctx.drawImage(s.image as CanvasImageSource, 0, 0)
  const img = ctx.getImageData(0, 0, s.size, s.size)
  for (let k = 0; k < s.size * s.size; k++) {
    const cls = s.category[k]
    if (!cls) continue
    const [r, g, b] = SEG_COLORS[cls] ?? [255, 255, 255]
    img.data[k * 4] = img.data[k * 4] * 0.45 + r * 0.55
    img.data[k * 4 + 1] = img.data[k * 4 + 1] * 0.45 + g * 0.55
    img.data[k * 4 + 2] = img.data[k * 4 + 2] * 0.45 + b * 0.55
  }
  ctx.putImageData(img, 0, 0)
}

function drawCrop(a: PhotoAnalysis) {
  const ctx = $<HTMLCanvasElement>('crop').getContext('2d')!
  ctx.clearRect(0, 0, 224, 224)
  ctx.drawImage(a.crop as CanvasImageSource, 0, 0, 224, 224)
}

function drawSwatches(a: PhotoAnalysis) {
  const box = $('swatches')
  box.replaceChildren()
  for (const [k, c] of Object.entries(a.measured.colors)) {
    if (!c) continue
    box.append(el('div', { class: 'swatch' }, el('div', { class: 'chip', style: `background:${c.hex}` }), el('div', {}, el('strong', {}, k)), el('div', { class: 'muted' }, `${c.hex} · ${Math.round(c.confidence * 100)}%`)))
  }
}

function drawMeasures(a: PhotoAnalysis) {
  const t = $('measures')
  t.replaceChildren()
  const group = (name: string) => t.append(el('tr', {}, el('td', { class: 'group', colspan: '3' }, name)))
  const row = (k: string, v: number, extra = '') => t.append(el('tr', {}, el('td', {}, k), el('td', {}, fmt(v)), el('td', { class: 'muted' }, extra)))
  const m = a.measured
  group('Geometry (value · population percentile)')
  for (const [k, v] of Object.entries(m.geometry)) row(k, v, GEOMETRY[k] ? `p${Math.round(percentile(v, GEOMETRY[k]) * 100)}` : '')
  group('Hair silhouette')
  for (const [k, v] of Object.entries(m.hair)) row(k, v)
  group('Expression')
  for (const [k, v] of Object.entries(m.expression)) row(k, v)
  group('Cues')
  for (const [k, v] of Object.entries(m.cues)) row(k, v)
  if (m.lighting) {
    group('Lighting')
    row('gain R', m.lighting.gain[0])
    row('gain G', m.lighting.gain[1])
    row('gain B', m.lighting.gain[2])
    row('exposure', m.lighting.exposure, m.lighting.sources.join(', '))
    row('brightness', m.lighting.brightness)
  }
  if (m.pose) {
    group('Pose (deg)')
    row('yaw', m.pose.yaw)
    row('pitch', m.pose.pitch)
    row('roll', m.pose.roll)
  }
}

function expectedOf(labels: Record<string, unknown> | null, head: string): string | null {
  if (!labels) return null
  const src = (labels.labels && typeof labels.labels === 'object' ? labels.labels : labels) as Record<string, unknown>
  const v = src[head]
  return typeof v === 'string' ? v : null
}

/* ---- Crop parity (fixtures with a Python reference crop) -------------------------------------- */

function imageDataOf(src: CanvasImageSource, w: number, h = w): ImageData {
  const c = el('canvas', { width: String(w), height: String(h) })
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

async function imageDataOfUrl(url: string): Promise<ImageData> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob())
  try {
    return imageDataOf(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

function diffStats(a: ImageData, b: ImageData): { mean: number; p99: number } {
  const hist = new Uint32Array(256)
  let s = 0
  const n = a.width * a.height * 3
  for (let i = 0; i < a.width * a.height; i++)
    for (let c = 0; c < 3; c++) {
      const v = Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c])
      hist[v]++
      s += v
    }
  let seen = 0
  let p99 = 0
  for (let v = 0; v < 256; v++) {
    seen += hist[v]
    if (seen > n * 0.99) {
      p99 = v
      break
    }
  }
  return { mean: Math.round((s / n) * 100) / 100, p99 }
}

interface Parity {
  /** Browser canvas crop from the sidecar's YuNet points vs the Python crop (same points). */
  yunet: { mean: number; p99: number }
  /** The pipeline's crop (MediaPipe points) vs the Python crop. */
  mediapipe: { mean: number; p99: number }
  /** MediaPipe-points alignment relative to the YuNet one: centre offset (in d, along the
   *  eye line / down the face), side ratio and roll difference (degrees). */
  centre: { x: number; y: number }
  side: number
  angle: number
}

async function cropParity(a: PhotoAnalysis, side: Sidecar): Promise<{ parity: Parity; ref: ImageData; yunet: ImageData; mp: ImageData } | null> {
  if (!side.crop || !side.face || !side.width) return null
  const k = a.image.width / side.width
  const P = (p: [number, number]) => ({ x: p[0] * k, y: p[1] * k })
  const f = side.face
  const alY = alignFromPoints(P(f.eyeL), P(f.eyeR), P(f.mouthL), P(f.mouthR), CROP)
  const cp = a.cropPoints
  const alM = alignFromPoints(cp.eyeL, cp.eyeR, cp.mouthL, cp.mouthR, { ...CROP, sizeD: CROP.sizeD * CROP_POINTS.sideScale })
  const ref = await imageDataOfUrl(`/fixtures/photos/${side.crop}`)
  const yunet = imageDataOf(drawAlignedCrop(a.image.bitmap, alY, CROP.pad) as CanvasImageSource, CROP.size)
  const mp = imageDataOf(a.crop as CanvasImageSource, CROP.size)
  const dx = alM.centre.x - alY.centre.x
  const dy = alM.centre.y - alY.centre.y
  const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d
  return {
    ref,
    yunet,
    mp,
    parity: {
      yunet: diffStats(yunet, ref),
      mediapipe: diffStats(mp, ref),
      centre: { x: r((dx * alY.u.x + dy * alY.u.y) / alY.dist), y: r((dx * alY.down.x + dy * alY.down.y) / alY.dist) },
      side: r(alM.side / alY.side),
      angle: r(((alM.angle - alY.angle) * 180) / Math.PI, 2),
    },
  }
}

async function drawParity(a: PhotoAnalysis, side: Sidecar | null) {
  const box = $('parity')
  const res = side ? await cropParity(a, side).catch(() => null) : null
  box.hidden = !res
  if (!res) return
  $<HTMLCanvasElement>('refCrop').getContext('2d')!.putImageData(res.ref, 0, 0)
  $<HTMLCanvasElement>('yunetCrop').getContext('2d')!.putImageData(res.yunet, 0, 0)
  const d = new ImageData(CROP.size, CROP.size)
  for (let i = 0; i < CROP.size * CROP.size; i++) {
    let m = 0
    for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(res.mp.data[i * 4 + c] - res.ref.data[i * 4 + c]))
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = Math.min(255, m * 8)
    d.data[i * 4 + 3] = 255
  }
  $<HTMLCanvasElement>('diffCrop').getContext('2d')!.putImageData(d, 0, 0)
  const p = res.parity
  $('parityText').textContent =
    `Same points (YuNet), browser canvas vs Python: mean |Δ| ${p.yunet.mean} levels, p99 ${p.yunet.p99}. ` +
    `Pipeline crop (MediaPipe points) vs Python: mean |Δ| ${p.mediapipe.mean}, p99 ${p.mediapipe.p99}. ` +
    `MediaPipe vs YuNet alignment: centre (${p.centre.x}, ${p.centre.y})·d, side ×${p.side}, roll ${p.angle}°.`
}

function drawAttrs(a: PhotoAnalysis, labels: Record<string, unknown> | null) {
  const box = $('attrs')
  box.replaceChildren()
  const info = photoAvatar().attributeModel
  $('attrSource').textContent = a.attributes.source === 'model' ? `model ${info?.modelVersion ?? ''} ${info?.variant ?? ''} on ${info?.provider ?? '?'} + heuristics` : 'heuristics (no model)'
  for (const h of TAXONOMY.heads) {
    const p = a.attributes.heads[h.id] ?? []
    const exp = expectedOf(labels, h.id)
    const top = h.classes
      .map((c, i) => ({ c, p: p[i] ?? 0 }))
      .sort((x, y) => y.p - x.p)
      .slice(0, 3)
    if (exp && !top.some((t) => t.c === exp)) top.push({ c: exp, p: p[h.classes.indexOf(exp)] ?? 0 })
    const bars = el('div', { class: 'bars' })
    for (const t of top)
      bars.append(
        el(
          'div',
          { class: `bar${t.c === exp ? ' expected' : ''}` },
          el('span', { class: 'label' }, t.c + (t.c === exp ? ' ✓' : '')),
          el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${Math.round(t.p * 100)}%` })),
          el('span', {}, `${Math.round(t.p * 100)}%`),
        ),
      )
    const src = a.attributes.headSource?.[h.id] ?? a.attributes.source
    const t = info?.trust[h.id]
    const trust = t ? ` · ${t.use}${t.margin !== null ? ` (${t.margin >= 0 ? '+' : ''}${Math.round(t.margin * 100)} pts vs baseline)` : ''}` : ''
    const raw = a.attributeParts.model?.heads[h.id]
    const rawTop = raw ? ` · model says ${h.classes[raw.indexOf(Math.max(...raw))]} ${Math.round(Math.max(...raw) * 100)}%` : ''
    box.append(el('div', { class: 'attr' }, el('div', { class: 'name' }, h.id, el('small', { class: src }, `${src} · conf ${Math.round((a.attributes.confidence[h.id] ?? 0) * 100)}%${trust}${src !== 'model' ? rawTop : ''}`)), bars))
  }
}

/** renderSVG, but a failing render (e.g. engine work in progress) shows an error box instead
 *  of aborting the page or a batch. */
function safeRender(dna: Parameters<typeof renderSVG>[0], o: NonNullable<Parameters<typeof renderSVG>[1]>): string {
  try {
    return renderSVG(dna, o)
  } catch (e) {
    const size = o.size ?? 120
    const msg = String(e instanceof Error ? e.message : e).replace(/[<&]/g, '')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fde"/><text x="6" y="20" font-size="11" fill="#c62828">render failed</text><text x="6" y="36" font-size="9" fill="#c62828">${msg.slice(0, 40)}</text></svg>`
  }
}

function drawCandidates(out: PhotoAvatars) {
  const box = $('candidates')
  box.replaceChildren()
  out.candidates.forEach((c, i) => {
    const portrait = el('div')
    portrait.innerHTML = safeRender(c.dna, { crop: 'portrait', size: 200, idPrefix: `c${i}p` })
    const full = el('div')
    full.innerHTML = safeRender(c.dna, { crop: 'full', size: 110, idPrefix: `c${i}f`, background: false })
    const h = c.dna.sections.hair
    const copy = el('button', { class: 'button ghost' }, 'Copy DNA')
    copy.addEventListener('click', () => void navigator.clipboard?.writeText(JSON.stringify(c.dna)))
    box.append(
      el(
        'div',
        { class: 'cand' },
        el('div', { class: 'pics' }, portrait, full),
        el('div', { class: 'label' }, c.label),
        el('div', { class: 'meta' }, `confidence ${Math.round(c.confidence * 100)}% · hair ${h.style} (len ${h.length}, vol ${h.volume}, curl ${h.curl}, bangs ${h.bangs}, part ${h.part})`),
        el('div', { class: 'meta' }, `face ${c.dna.sections.head.shape} · eyes ${c.dna.sections.eyes.style} · brows ${c.dna.sections.brows.style} · nose ${c.dna.sections.nose.style} · mouth ${c.dna.sections.mouth.style}`),
        el('div', { class: 'meta' }, [...c.dna.outfit, ...c.dna.accessories].map((x) => x.id).join(', ')),
        copy,
      ),
    )
  })
  const notes = $('notes')
  notes.replaceChildren(...out.notes.map((n) => el('li', {}, n)))
}

async function analyze(src: Blob | HTMLCanvasElement, labels: Record<string, unknown> | null = null) {
  $('batch').hidden = true
  try {
    setStatus('Analysing …')
    const t0 = performance.now()
    const a = await photoAvatar().analyze(src, { mirrored: $<HTMLInputElement>('mirrored').checked })
    const out = photoToAvatars(a)
    if (current) releaseAnalysis(current)
    current = a
    ;(window as unknown as { __vision: unknown }).__vision = { analysis: a, avatars: out }
    $('result').hidden = false
    drawPhoto(a)
    drawSeg(a)
    drawCrop(a)
    drawSwatches(a)
    drawMeasures(a)
    drawAttrs(a, labels)
    drawCandidates(out)
    await drawParity(a, labels as Sidecar | null)
    const b = photoAvatar().backends
    const warn = a.warnings.map((w) => w.message).join(' ')
    const mi = photoAvatar().attributeModel
    const model = mi ? ` (${mi.file} on ${mi.provider}: load ${mi.fetchMs}+${mi.sessionMs} ms, run ${mi.lastRunMs} ms)` : ''
    setStatus(`Done in ${Math.round(performance.now() - t0)} ms (${Object.entries(a.timings).map(([k, v]) => `${k} ${v}`).join(', ')}) · MediaPipe ${b.mediapipe ?? '?'} · attributes ${a.attributes.source}${model}${warn ? ` · ⚠ ${warn}` : ''}`)
  } catch (e) {
    const code = e instanceof PhotoAvatarError ? `[${e.code}] ` : ''
    setStatus(`${code}${e instanceof Error ? e.message : String(e)}`, true)
    console.error(e)
  }
}

/* ---- Inputs ------------------------------------------------------------------------------ */

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void analyze(f)
})
const drop = $('drop')
drop.addEventListener('dragover', (e) => {
  e.preventDefault()
  drop.classList.add('over')
})
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  drop.classList.remove('over')
  const f = e.dataTransfer?.files?.[0]
  if (f && f.type.startsWith('image/')) void analyze(f)
})
$<HTMLInputElement>('showLm').addEventListener('change', () => current && drawPhoto(current))

let stream: MediaStream | null = null
$('camera').addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } } })
    const v = $<HTMLVideoElement>('video')
    v.srcObject = stream
    await v.play()
    $('cam').hidden = false
  } catch (e) {
    setStatus(`Camera unavailable: ${String(e)}`, true)
  }
})
const stopCamera = () => {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  $('cam').hidden = true
}
$('camStop').addEventListener('click', stopCamera)
$('snap').addEventListener('click', () => {
  const v = $<HTMLVideoElement>('video')
  const c = el('canvas', { width: String(v.videoWidth), height: String(v.videoHeight) })
  c.getContext('2d')!.drawImage(v, 0, 0)
  stopCamera()
  // getUserMedia frames are not mirrored (only the preview is), so this is a true image.
  void analyze(c)
})

/* ---- Fixtures, batch QA and calibration ----------------------------------------------------- */

async function loadFixtures() {
  const list = $('fixtureList')
  try {
    const m = (await (await fetch('/fixtures/photos/manifest.json')).json()) as { dir: string; photos: Fixture[] }
    fixtures = m.photos
    list.replaceChildren()
    if (!fixtures.length) {
      list.append(el('p', { class: 'muted' }, `No QA photos yet. The trainer writes synthetic, licence-clean photos to ${m.dir}; they appear here (reload).`))
      return
    }
    $<HTMLButtonElement>('runAll').disabled = false
    $<HTMLButtonElement>('calibrate').disabled = false
    $<HTMLButtonElement>('modelCheck').disabled = false
    for (const f of fixtures) {
      const b = el('button', { title: f.file }, el('img', { src: f.url, alt: f.file, loading: 'lazy' }))
      b.addEventListener('click', async () => {
        list.querySelectorAll('button').forEach((x) => x.classList.remove('active'))
        b.classList.add('active')
        await analyze(await (await fetch(f.url)).blob(), f.labels)
      })
      list.append(b)
    }
  } catch (e) {
    list.replaceChildren(el('p', { class: 'muted' }, `Could not list QA photos: ${String(e)}`))
  }
}

interface BatchRow {
  file: string
  analysis?: PhotoAnalysis
  out?: PhotoAvatars
  error?: string
  parity?: Parity | null
}

/** Saves a QA report about the fixtures to packages/avatar-vision/out/ (dev server only). */
async function saveReport(name: string, data: unknown): Promise<string> {
  try {
    const res = await fetch(`/__qa/out/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    return res.ok ? ` Saved out/${name}.` : ` (could not save out/${name}: HTTP ${res.status})`
  } catch {
    return ` (could not save out/${name})`
  }
}

async function runAll(): Promise<BatchRow[]> {
  $('result').hidden = true
  $('batch').hidden = false
  const grid = $('batchGrid')
  grid.replaceChildren()
  const rows: BatchRow[] = []
  let i = 0
  for (const f of fixtures) {
    i++
    setStatus(`Batch ${i}/${fixtures.length}: ${f.file}`)
    const row: BatchRow = { file: f.file }
    try {
      row.analysis = await photoAvatar().analyze(await (await fetch(f.url)).blob())
      row.out = photoToAvatars(row.analysis)
      row.parity = f.labels ? ((await cropParity(row.analysis, f.labels).catch(() => null))?.parity ?? null) : null
    } catch (e) {
      row.error = e instanceof PhotoAvatarError ? `[${e.code}] ${e.message}` : String(e)
    }
    rows.push(row)
    const info = el('div')
    if (row.out && row.analysis) {
      const avatars = el('div', { class: 'avatars' })
      row.out.candidates.slice(0, 2).forEach((c, k) => {
        const d = el('div')
        d.innerHTML = safeRender(c.dna, { crop: 'portrait', size: 88, idPrefix: `b${i}_${k}` })
        avatars.append(d)
      })
      const h = row.out.best.sections.hair
      const heads = row.analysis.attributes.heads
      const top = (id: string) => {
        const spec = TAXONOMY.heads.find((x) => x.id === id)!
        const p = heads[id]
        const k = p.indexOf(Math.max(...p))
        const exp = expectedOf(f.labels, id)
        return `${id}: ${spec.classes[k]}${exp ? (exp === spec.classes[k] ? ' ✓' : ` (≠ ${exp})`) : ''}`
      }
      info.append(
        avatars,
        el('div', {}, `hair ${h.style} · ${row.out.best.sections.facialHair.beard} · ${[...row.out.best.accessories].map((x) => x.id).join(', ') || 'no accessories'}`),
        ...['hair_length', 'hair_texture', 'bangs', 'beard', 'eyewear', 'headwear'].map((id) => el('div', { class: 'muted' }, top(id))),
      )
      releaseAnalysis(row.analysis)
    } else info.append(el('div', { class: 'warn' }, row.error ?? 'failed'))
    grid.append(el('div', { class: 'batch-item' }, el('img', { src: f.url, alt: f.file }), info))
  }
  // The QA report for scripts/qa-report.ts (fixtures only; NaN becomes null in JSON).
  const report = {
    generated: new Date().toISOString(),
    backends: photoAvatar().backends,
    attributeModel: photoAvatar().attributeModel,
    rows: rows.map((r) => ({
      file: r.file,
      error: r.error,
      warnings: r.analysis?.warnings.map((w) => w.code),
      timings: r.analysis?.timings,
      image: r.analysis ? { width: r.analysis.image.width, height: r.analysis.image.height } : undefined,
      measured: r.analysis?.measured,
      attributes: r.analysis?.attributes,
      parts: r.analysis?.attributeParts,
      measureDebug: r.analysis?.measureDebug,
      cropPoints: r.analysis?.cropPoints,
      parity: r.parity,
      best: r.out?.best,
      candidates: r.out?.candidates.map((c) => ({ label: c.label, confidence: c.confidence })),
    })),
  }
  ;(window as unknown as { __batch: unknown }).__batch = report
  const saved = await saveReport('qa-batch.json', report)
  setStatus(`Batch done: ${rows.filter((r) => r.out).length}/${rows.length} analysed.${saved}`)
  return rows
}

$('runAll').addEventListener('click', () => void runAll())

/* ---- Model check: the attribute model on each execution provider ------------------------------- */

/**
 * Runs the attribute model on the Python reference crops (so the input is identical to the
 * trainer's) on WebGPU and on wasm, and compares the providers' probabilities. Timings:
 * load (download/cache + session), first run, and the median of the other runs.
 */
async function modelCheck() {
  const out = $('checkOut')
  out.hidden = false
  const crops = fixtures.filter((f) => f.labels?.crop)
  if (!crops.length) {
    out.textContent = 'No fixtures with reference crops.'
    return
  }
  setStatus('Model check: decoding reference crops …')
  const inputs = await Promise.all(crops.map(async (f) => ({ file: f.file, px: (await imageDataOfUrl(`/fixtures/photos/${f.labels!.crop}`)).data })))
  const results: Record<string, { provider: string | null; variant?: string; file?: string; loadMs: number; sessionMs?: number; fetchMs?: number; firstMs: number; medianMs: number; problem: string | null; probs: Record<string, Record<string, number[]>> }> = {}
  const log: string[] = []
  for (const ep of ['webgpu', 'wasm'] as AttributeProvider[]) {
    setStatus(`Model check: ${ep} …`)
    const r = createAttributeRunner({ modelBase: DEFAULT_MODEL_BASE, provider: ep })
    const t0 = performance.now()
    const ok = await r.load()
    const loadMs = Math.round(performance.now() - t0)
    const probs: Record<string, Record<string, number[]>> = {}
    const times: number[] = []
    if (ok && r.spec) {
      for (const inp of inputs) {
        const data = inputTensorData(inp.px, r.spec.input.size ?? 224, r.spec.input)
        const t = performance.now()
        const raw = await r.runTensor(data)
        times.push(performance.now() - t)
        if (!raw) continue
        probs[inp.file] = {}
        for (const h of r.spec.heads) {
          const v = raw[h.output]
          const p = v ? headProbabilities(v, h, headSpec(h.id).type) : null
          if (p) probs[inp.file][h.id] = p.map((x) => Math.round(x * 1e6) / 1e6)
        }
      }
    }
    const rest = times.slice(1).sort((a, b) => a - b)
    const i = r.info
    results[ep] = {
      provider: r.provider,
      variant: i?.variant,
      file: i?.file,
      loadMs,
      sessionMs: i?.sessionMs,
      fetchMs: i?.fetchMs,
      firstMs: Math.round(times[0] ?? NaN),
      medianMs: Math.round(rest[Math.floor(rest.length / 2)] ?? NaN),
      problem: r.problem,
      probs,
    }
    log.push(`${ep}: provider ${r.provider ?? 'none'} · ${i?.file ?? '-'} · load ${loadMs} ms (fetch ${i?.fetchMs} ms, session ${i?.sessionMs} ms) · first run ${results[ep].firstMs} ms · median ${results[ep].medianMs} ms${r.problem ? ` · ${r.problem}` : ''}`)
    r.dispose()
  }
  // Provider agreement.
  const g = results.webgpu.probs
  const w = results.wasm.probs
  let maxDiff = 0
  let agree = 0
  let total = 0
  for (const [file, heads] of Object.entries(g))
    for (const [h, p] of Object.entries(heads)) {
      const q = w[file]?.[h]
      if (!q) continue
      total++
      for (let k = 0; k < p.length; k++) maxDiff = Math.max(maxDiff, Math.abs(p[k] - q[k]))
      if (p.indexOf(Math.max(...p)) === q.indexOf(Math.max(...q))) agree++
    }
  log.push(`webgpu vs wasm over ${Object.keys(g).length} crops × heads: top-1 agreement ${total ? ((agree / total) * 100).toFixed(1) : '-'} % (${agree}/${total}), max |Δp| ${maxDiff.toExponential(2)}`)
  const saved = await saveReport('model-check.json', { generated: new Date().toISOString(), userAgent: navigator.userAgent, crossOriginIsolated, results, agreement: { agree, total, maxDiff } })
  out.textContent = log.join('\n')
  setStatus(`Model check done.${saved}`)
}
$('modelCheck').addEventListener('click', () => void modelCheck())
$('calibrate').addEventListener('click', async () => {
  const rows = (await runAll()).filter((r) => r.analysis)
  const q = (xs: number[], p: number) => {
    const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
    if (!s.length) return NaN
    const pos = p * (s.length - 1)
    const lo = Math.floor(pos)
    return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo)
  }
  const out: Record<string, { p05: number; p50: number; p95: number; n: number }> = {}
  const put = (k: string, xs: number[]) => (out[k] = { p05: +fmt(q(xs, 0.05), 4), p50: +fmt(q(xs, 0.5), 4), p95: +fmt(q(xs, 0.95), 4), n: xs.filter(Number.isFinite).length })
  const first = rows[0].analysis!.measured
  for (const k of Object.keys(first.geometry)) put(k, rows.map((r) => (r.analysis!.measured.geometry as unknown as Record<string, number>)[k]))
  for (const k of ['templeRatio', 'eyeAspect', 'hairCoherence', 'hairRoughness', 'hairlineHeight']) put(k, rows.map((r) => (r.analysis!.measured.cues as unknown as Record<string, number>)[k]))
  for (const k of Object.keys(first.hair)) put(`hair.${k}`, rows.map((r) => (r.analysis!.measured.hair as unknown as Record<string, number>)[k]))
  const ta = $<HTMLTextAreaElement>('calibOut')
  ta.hidden = false
  ta.value = JSON.stringify(out, null, 2)
  console.log('calibration', out)
})

void loadFixtures()

/** Dev hook for automated QA (e.g. feed an engine-rendered avatar as a smoke test). */
;(window as unknown as { __demo: unknown }).__demo = {
  analyze,
  renderSVG,
  modelCheck,
  /** Loads the attribute model on one provider with verbose onnxruntime logs (the console then
   *  shows which nodes run on which execution provider); returns the load info. */
  async loadModel(provider: AttributeProvider, debugLogs = true) {
    const r = createAttributeRunner({ modelBase: DEFAULT_MODEL_BASE, provider, debugLogs })
    await r.load()
    const info = { provider: r.provider, info: r.info && { ...r.info, trust: undefined }, problem: r.problem }
    r.dispose()
    return info
  },
  async analyzeSVG(svg: string, size = 900) {
    const img = new Image()
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    await img.decode()
    const c = el('canvas', { width: String(size), height: String(Math.round((size * img.naturalHeight) / img.naturalWidth)) })
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#d8d4cc'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(img.src)
    await analyze(c)
  },
}
