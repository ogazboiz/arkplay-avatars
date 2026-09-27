/* Layer 3 runner: the trained attribute model (models/attributes.int8.onnx, falling back to
 * models/attributes.onnx, described by models/attributes.json; written by
 * the attribute-model trainer) on the aligned 224×224 crop, with onnxruntime-web.
 * When the model is absent (404) or fails, `predict` returns null and the pipeline uses
 * heuristics.ts instead.
 *
 * attributes.json (what the exporter writes; unknown keys are ignored):
 *   {
 *     "taxonomyVersion": 1, "modelVersion": "v0",
 *     "input": { "name": "image", "size": 224, "mean": [0.485, 0.456, 0.406],
 *                "std": [0.229, 0.224, 0.225], "layout": "NCHW" },
 *     "heads": [
 *       { "id": "hair_length", "output": "probs_hair_length", "classes": ["bald", …],
 *         "activation": "softmax" | "coral" | "sigmoid" | "probs" },
 *       …
 *     ],
 *     "files": { "int8": { "file": "attributes.int8.onnx", "bytes": …, "sha256": "…" },
 *                "fp32": { "file": "attributes.onnx", … } },
 *     "metrics": { "test": { "<head>": { "acc": …, "macro_f1": … } },
 *                  "majorityBaseline": { "<head>": … }, "int8": { "accDelta": { … } } }
 *   }
 * `classes` must equal the taxonomy's class list for that head, or a prefix of it (a model
 * trained before classes were appended); other heads are ignored. `activation` defaults to
 * softmax over logits (coral when an ordinal head has one output fewer than its classes).
 * Each .onnx must be a single file (no external-data sidecar).
 *
 * Per-head trust (`headTrust`) is computed from `metrics`: a head is used only when its test
 * accuracy (of the build actually loaded) beats the most-common-class baseline by
 * TRUST_MIN_MARGIN; the others stay with the heuristics. A better attributes.json (v1)
 * therefore trusts more heads without code changes. heuristics.ts `mergeAttributes` applies it.
 *
 * onnxruntime-web's ESM build is imported at runtime from `<modelBase>runtime/ort-<v>/`
 * (copied there by scripts/fetch-models.ts); only its types come from the npm package. */

import type { InferenceSession, Tensor } from 'onnxruntime-web'
import type { ProgressEvent } from './perception.ts'
import { TAXONOMY, flipProbs, headSpec } from './taxonomy.ts'
import type { AttributeSet } from './types.ts'
import { ORT_RUNTIME_DIR } from './versions.ts'

export interface AttributeHeadSpec {
  id: string
  output: string
  classes: string[]
  activation?: 'softmax' | 'coral' | 'sigmoid' | 'probs'
}

export interface HeadMetrics {
  n?: number
  acc?: number
  macro_f1?: number
  mae?: number
}

export interface ModelFileSpec {
  file: string
  bytes?: number
  sha256?: string
}

export interface AttributeModelSpec {
  taxonomyVersion?: number
  modelVersion?: string
  version?: string
  input: { name?: string; size?: number; mean?: number[]; std?: number[]; layout?: 'NCHW' | 'NHWC' }
  heads: AttributeHeadSpec[]
  /** Builds of the model by variant ("int8", "fp32"). */
  files?: Record<string, ModelFileSpec>
  metrics?: {
    test?: Record<string, HeadMetrics>
    majorityBaseline?: Record<string, number>
    int8?: { accDelta?: Record<string, number> }
  }
}

/* ---- Per-head trust ------------------------------------------------------------------------ */

/** How a head's model output is used: fully, for presence only (none vs any), or not at all. */
export type HeadUse = 'model' | 'presence' | 'heuristic'

export interface HeadTrust {
  use: HeadUse
  /** Test accuracy of the loaded build (fp32 + the int8 delta when int8 runs); null = unknown. */
  acc: number | null
  /** Most-common-class accuracy on the same split. */
  baseline: number | null
  /** acc − baseline. */
  margin: number | null
  /** 0..1: how far past the trust margin the model is (0 at the margin, 1 at +25 points more). */
  reliability: number
}

/** A head is trusted when it beats its most-common-class baseline by this much. */
export const TRUST_MIN_MARGIN = 0.05

/** Heads whose model output is only partly used, whatever the metrics say. hair_part: the
 *  generator rarely renders a visible parting, let alone on the requested side, so the
 *  model decides none vs parted and the measured `partX` decides where. */
export const HEAD_POLICY: Readonly<Record<string, HeadUse>> = { hair_part: 'presence' }

// Local (not perception.ts's): this module's pure helpers must not pull in the MediaPipe
// perception module.
const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`)

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The trust table for a model description and the build that runs (variant "int8" applies
 *  the int8 accuracy deltas). Without metrics every usable head is trusted (reliability 0.5). */
export function headTrust(spec: Pick<AttributeModelSpec, 'heads' | 'metrics'>, variant = 'fp32'): Record<string, HeadTrust> {
  const out: Record<string, HeadTrust> = {}
  const m = spec.metrics
  for (const h of spec.heads) {
    const policy = HEAD_POLICY[h.id] ?? 'model'
    const acc0 = m?.test?.[h.id]?.acc
    const base = m?.majorityBaseline?.[h.id]
    const delta = variant === 'int8' ? (m?.int8?.accDelta?.[h.id] ?? 0) : 0
    if (!fin(acc0) || !fin(base)) {
      out[h.id] = { use: policy, acc: null, baseline: null, margin: null, reliability: 0.5 }
      continue
    }
    const acc = acc0 + (fin(delta) ? delta : 0)
    const margin = acc - base
    const r = (v: number) => Math.round(v * 10000) / 10000
    out[h.id] = {
      use: margin >= TRUST_MIN_MARGIN - 1e-9 ? policy : 'heuristic',
      acc: r(acc),
      baseline: r(base),
      margin: r(margin),
      reliability: r(clamp01((margin - TRUST_MIN_MARGIN) / 0.25)),
    }
  }
  return out
}

/* ---- Model files --------------------------------------------------------------------------- */

const MODEL_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.onnx$/
const DEFAULT_FILES: Readonly<Record<string, string>> = { int8: 'attributes.int8.onnx', fp32: 'attributes.onnx' }

export interface ModelFile extends ModelFileSpec {
  variant: string
}

/** The model builds to try, in order (int8 first: 4× smaller, −0.4 points in v0). Only plain
 *  file names next to attributes.json are accepted. */
export function modelFiles(spec: Pick<AttributeModelSpec, 'files'>, prefer: readonly string[] = ['int8', 'fp32']): ModelFile[] {
  const out: ModelFile[] = []
  for (const variant of prefer) {
    const f = spec.files?.[variant]
    const file = f?.file ?? DEFAULT_FILES[variant]
    if (!file || !MODEL_FILE.test(file) || out.some((o) => o.file === file)) continue
    out.push({ variant, file, ...(fin(f?.bytes) ? { bytes: f.bytes } : {}), ...(f?.sha256 && /^[0-9a-f]{64}$/.test(f.sha256) ? { sha256: f.sha256 } : {}) })
  }
  return out
}

/* ---- Outputs → probabilities ------------------------------------------------------------------ */

const softmax = (v: ArrayLike<number>): number[] => {
  const arr = Array.from(v)
  const m = Math.max(...arr)
  const e = arr.map((x) => Math.exp(x - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / s)
}
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

/** Turns raw head outputs into class probabilities (exported for tests). */
export function headProbabilities(raw: ArrayLike<number>, head: AttributeHeadSpec, type: 'ordinal' | 'multiclass' | 'binary'): number[] | null {
  const k = head.classes.length
  const act = head.activation ?? (type === 'ordinal' && raw.length === k - 1 ? 'coral' : type === 'binary' && raw.length === 1 ? 'sigmoid' : 'softmax')
  let p: number[]
  if (act === 'coral') {
    if (raw.length !== k - 1) return null
    // P(y > j) for j = 0..K-2, made monotone, then class masses.
    const gt = Array.from(raw, sigmoid)
    for (let j = 1; j < gt.length; j++) gt[j] = Math.min(gt[j], gt[j - 1])
    p = Array.from({ length: k }, (_, i) => (i === 0 ? 1 - gt[0] : i === k - 1 ? gt[k - 2] : gt[i - 1] - gt[i]))
  } else if (act === 'sigmoid') {
    if (raw.length !== 1 || k !== 2) return null
    const y = sigmoid(raw[0])
    p = [1 - y, y]
  } else if (act === 'probs') {
    if (raw.length !== k) return null
    p = Array.from(raw, (v) => Math.max(0, v))
  } else {
    if (raw.length !== k) return null
    p = softmax(raw)
  }
  const s = p.reduce((a, b) => a + Math.max(0, b), 0)
  return s > 0 ? p.map((v) => Math.max(0, v) / s) : null
}

/** Maps a model head onto the taxonomy head (prefix-compatible), or null. */
export function toTaxonomy(head: AttributeHeadSpec, p: number[]): number[] | null {
  let spec
  try {
    spec = headSpec(head.id)
  } catch {
    return null
  }
  if (head.classes.length > spec.classes.length || head.classes.some((c, i) => spec.classes[i] !== c)) return null
  return spec.classes.map((_, i) => p[i] ?? 0)
}

/** 1 − normalized entropy: 0 for uniform, 1 for one-hot. */
export function certainty(p: readonly number[]): number {
  if (p.length < 2) return 1
  const h = -p.reduce((a, v) => a + (v > 0 ? v * Math.log(v) : 0), 0)
  return Math.max(0, Math.min(1, 1 - h / Math.log(p.length)))
}

/** Normalized input tensor data from RGBA pixels (exported for tests and the model check). */
export function inputTensorData(px: ArrayLike<number>, size: number, spec: AttributeModelSpec['input']): Float32Array {
  const mean = spec.mean ?? [0.485, 0.456, 0.406]
  const std = spec.std ?? [0.229, 0.224, 0.225]
  const n = size * size
  const data = new Float32Array(3 * n)
  const nhwc = spec.layout === 'NHWC'
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) {
      const v = (px[i * 4 + c] / 255 - mean[c]) / std[c]
      data[nhwc ? i * 3 + c : c * n + i] = v
    }
  return data
}

function pixelsOf(crop: HTMLCanvasElement | OffscreenCanvas, size: number, flip: boolean): Uint8ClampedArray {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (flip) ctx.setTransform(-1, 0, 0, 1, size, 0)
  ctx.drawImage(crop, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size).data
}

/* ---- The runner ---------------------------------------------------------------------------- */

export type AttributeProvider = 'webgpu' | 'wasm'

export interface AttributeRunnerOptions {
  modelBase: string
  onProgress?: (e: ProgressEvent) => void
  /** Average with a horizontally flipped crop (hair_part swapped): steadier, 2× the cost. */
  flipTTA?: boolean
  /** Execution provider: 'auto' (default: wasm, see AUTO_PROVIDER), or force one. WebGPU falls
   *  back to wasm when it can't start. */
  provider?: 'auto' | AttributeProvider
  /** Model builds to try, in order (default int8, then fp32). */
  variants?: readonly string[]
  /** Verbose onnxruntime logs (graph partitioning), for the demo's model check only. */
  debugLogs?: boolean
}

export interface AttributeModelInfo {
  modelVersion: string | null
  variant: string
  file: string
  bytes: number
  provider: AttributeProvider
  /** Download (or cache read) and hash check, ms. */
  fetchMs: number
  /** Runtime import + session creation, ms. */
  sessionMs: number
  /** Last inference (all passes), ms. */
  lastRunMs: number | null
  trust: Record<string, HeadTrust>
}

export interface AttributeRunner {
  /** Probabilities per head from the model (every head it has, untrusted ones included; the
   *  trust table is applied by `mergeAttributes`), or null when there is no usable model. */
  predict(crop: HTMLCanvasElement | OffscreenCanvas): Promise<AttributeSet | null>
  /** Raw outputs for already-normalized input (model checks); null without a model. */
  runTensor(data: Float32Array): Promise<Record<string, Float32Array> | null>
  /** Downloads and starts the model ahead of the first photo; true when it is usable. */
  load(): Promise<boolean>
  /** The execution provider in use, null before loading or without a model. */
  readonly provider: AttributeProvider | null
  /** What was loaded, how long it took, and the per-head trust table. */
  readonly info: AttributeModelInfo | null
  readonly trust: Record<string, HeadTrust> | null
  readonly spec: AttributeModelSpec | null
  /** Why the model isn't used (absent, failed to load), for warnings. */
  readonly problem: string | null
  dispose(): void
}

/** What 'auto' picks. The int8 build's DynamicQuantizeLinear/MatMulInteger nodes (88 of the
 *  graph's matmuls) have no WebGPU kernels, so a WebGPU session partitions them to the CPU and
 *  copies activations back and forth every block; measured in Chromium it is slower than plain
 *  wasm (docs/photo-avatars.md), and the plain wasm runtime is also the smaller download. */
export const AUTO_PROVIDER: Record<string, AttributeProvider> = { int8: 'wasm', fp32: 'webgpu' }

type Ort = typeof import('onnxruntime-web')

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  try {
    const d = await subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function createAttributeRunner(opts: AttributeRunnerOptions): AttributeRunner {
  const base = withSlash(opts.modelBase)
  let state: Promise<{ ort: Ort; session: InferenceSession; spec: AttributeModelSpec } | null> | null = null
  let provider: AttributeProvider | null = null
  let problem: string | null = null
  let info: AttributeModelInfo | null = null
  let spec: AttributeModelSpec | null = null

  async function fetchBytes(file: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const res = await fetch(base + file, { credentials: 'omit' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    if (!res.body || !opts.onProgress) return new Uint8Array(await res.arrayBuffer())
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      opts.onProgress({ stage: 'models', loaded, total, file })
    }
    const bytes = new Uint8Array(loaded)
    let o = 0
    for (const c of chunks) {
      bytes.set(c, o)
      o += c.length
    }
    return bytes
  }

  const load = () =>
    (state ??= (async () => {
      let desc: AttributeModelSpec
      try {
        const res = await fetch(base + 'attributes.json', { credentials: 'omit' })
        if (res.status === 404) {
          problem = 'No attribute model has been published yet.'
          return null
        }
        if (!res.ok) throw new Error(`attributes.json: HTTP ${res.status}`)
        desc = (await res.json()) as AttributeModelSpec
        if (!desc || !Array.isArray(desc.heads) || !desc.heads.length) throw new Error('attributes.json has no heads')
        if (desc.taxonomyVersion !== undefined && desc.taxonomyVersion !== TAXONOMY.version) throw new Error(`attributes.json is for taxonomy v${desc.taxonomyVersion}`)
      } catch (e) {
        problem = `The attribute model description could not be read (${String(e)}).`
        return null
      }
      spec = desc
      try {
        // The first build that exists and matches its recorded hash.
        let t0 = now()
        let picked: { file: ModelFile; bytes: Uint8Array<ArrayBuffer> } | null = null
        const skipped: string[] = []
        for (const f of modelFiles(desc, opts.variants)) {
          const bytes = await fetchBytes(f.file)
          if (!bytes) {
            skipped.push(`${f.file} missing`)
            continue
          }
          if (f.sha256) {
            const h = await sha256Hex(bytes)
            if (h && h !== f.sha256) {
              skipped.push(`${f.file} does not match attributes.json`)
              continue
            }
          }
          picked = { file: f, bytes }
          break
        }
        if (!picked) {
          problem = skipped.length ? `No usable attribute model file (${skipped.join('; ')}).` : 'No attribute model file is listed.'
          return null
        }
        const fetchMs = now() - t0
        t0 = now()

        const want = opts.provider && opts.provider !== 'auto' ? opts.provider : (AUTO_PROVIDER[picked.file.variant] ?? 'wasm')
        const gpu = want === 'webgpu' && typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu
        // onnxruntime-web is loaded from the versioned runtime folder next to its wasm (not
        // bundled into the app): the JS and the binaries can never drift apart, and apps
        // don't ship 40 MB of unused wasm assets. The WebGPU build carries the (bigger)
        // asyncify wasm, so it is only fetched when WebGPU is wanted.
        const runtime = new URL(base + ORT_RUNTIME_DIR, typeof location !== 'undefined' ? location.href : 'http://localhost/').href
        const ort = (await import(/* @vite-ignore */ runtime + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'))) as Ort
        ort.env.wasm.wasmPaths = runtime
        // Threads need cross-origin isolation (SharedArrayBuffer); otherwise run single-threaded.
        if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) ort.env.wasm.numThreads = 1
        ort.env.logLevel = opts.debugLogs ? 'verbose' : 'warning'
        const tries: AttributeProvider[] = gpu ? ['webgpu', 'wasm'] : ['wasm']
        let last: unknown
        for (const ep of tries) {
          try {
            const session = await ort.InferenceSession.create(picked.bytes, {
              executionProviders: [ep],
              graphOptimizationLevel: 'all',
              ...(opts.debugLogs ? { logSeverityLevel: 0 as const, logVerbosityLevel: 1 } : {}),
            })
            provider = ep
            info = {
              modelVersion: desc.modelVersion ?? desc.version ?? null,
              variant: picked.file.variant,
              file: picked.file.file,
              bytes: picked.bytes.length,
              provider: ep,
              fetchMs: Math.round(fetchMs),
              sessionMs: Math.round(now() - t0),
              lastRunMs: null,
              trust: headTrust(desc, picked.file.variant),
            }
            return { ort, session, spec: desc }
          } catch (e) {
            last = e
          }
        }
        throw last
      } catch (e) {
        problem = `The attribute model failed to load (${String(e)}).`
        return null
      }
    })())

  async function runData(s: { ort: Ort; session: InferenceSession; spec: AttributeModelSpec }, data: Float32Array): Promise<Record<string, Tensor>> {
    const size = s.spec.input.size ?? 224
    const nhwc = s.spec.input.layout === 'NHWC'
    const input = new s.ort.Tensor('float32', data, nhwc ? [1, size, size, 3] : [1, 3, size, size])
    const name = s.spec.input.name ?? s.session.inputNames[0]
    try {
      return (await s.session.run({ [name]: input })) as Record<string, Tensor>
    } finally {
      input.dispose?.()
    }
  }

  return {
    get provider() {
      return provider
    },
    get problem() {
      return problem
    },
    get info() {
      return info
    },
    get trust() {
      return info?.trust ?? null
    },
    get spec() {
      return spec
    },
    async load() {
      return !!(await load())
    },
    async runTensor(data) {
      const s = await load()
      if (!s) return null
      const out = await runData(s, data)
      const res: Record<string, Float32Array> = {}
      for (const [k, t] of Object.entries(out)) {
        res[k] = Float32Array.from(t.data as Float32Array)
        t.dispose?.()
      }
      return res
    },
    async predict(crop) {
      const s = await load()
      if (!s) return null
      try {
        const t0 = now()
        const passes = opts.flipTTA ? [false, true] : [false]
        const heads: Record<string, number[]> = {}
        const confidence: Record<string, number> = {}
        const acc: Record<string, number[][]> = {}
        const size = s.spec.input.size ?? 224
        for (const flip of passes) {
          const out = await runData(s, inputTensorData(pixelsOf(crop, size, flip), size, s.spec.input))
          for (const h of s.spec.heads) {
            const t = out[h.output]
            if (!t) continue
            let hs
            try {
              hs = headSpec(h.id)
            } catch {
              continue
            }
            const p = headProbabilities(t.data as Float32Array, h, hs.type)
            const mapped = p && toTaxonomy(h, p)
            if (!mapped) continue
            ;(acc[h.id] ??= []).push(flip ? flipProbs(h.id, mapped) : mapped)
          }
          for (const t of Object.values(out)) t.dispose?.()
        }
        for (const [id, list] of Object.entries(acc)) {
          const p = list[0].map((_, i) => list.reduce((a, q) => a + q[i], 0) / list.length)
          heads[id] = p
          confidence[id] = Math.round((0.5 + 0.5 * certainty(p)) * 100) / 100
        }
        if (info) info.lastRunMs = Math.round(now() - t0)
        if (!Object.keys(heads).length) {
          problem = 'The attribute model produced no usable heads.'
          return null
        }
        const headSource: Record<string, 'model'> = {}
        for (const k of Object.keys(heads)) headSource[k] = 'model'
        return { source: 'model', heads, confidence, headSource }
      } catch (e) {
        problem = `The attribute model failed on this photo (${String(e)}).`
        return null
      }
    },
    dispose() {
      void state?.then((s) => s?.session.release()).catch(() => undefined)
      state = null
      provider = null
      info = null
    },
  }
}
