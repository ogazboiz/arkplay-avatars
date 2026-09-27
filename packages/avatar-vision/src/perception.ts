/* Layer 1, perception: MediaPipe FaceLandmarker (478 landmarks + blendshapes) and
 * ImageSegmenter (selfie_multiclass_256x256), created lazily from self-hosted files under
 * `modelBase` (default /avatar/v1/vision/models/). Nothing is fetched from a CDN.
 *
 * - GPU delegate first, CPU fallback (at creation, and once more if a GPU run fails).
 * - IMAGE mode; numFaces 2 so we can pick the most prominent face and warn about others.
 * - Photos are oriented from EXIF (createImageBitmap imageOrientation 'from-image') and
 *   downscaled so the longest side is ≤ 1280 px.
 * Everything stays in memory; `dispose()` frees the wasm graphs. */

import type { FaceLandmarker, FaceLandmarkerResult, ImageSegmenter } from '@mediapipe/tasks-vision'
import { makeCanvas } from './crop.ts'
import { PhotoAvatarError, type Point3 } from './types.ts'
import { MEDIAPIPE_RUNTIME_DIR } from './versions.ts'

export const DEFAULT_MODEL_BASE = '/avatar/v1/vision/models/'
export const MAX_SIDE = 1280

export { SEG, SEG_CLASSES } from './landmarks.ts'

export type Delegate = 'GPU' | 'CPU'

export interface ProgressEvent {
  stage: 'models' | 'faces' | 'segmentation' | 'measure' | 'attributes' | 'done'
  /** Bytes (models) or 0..1 progress. */
  loaded?: number
  total?: number
  file?: string
}

export interface PerceptionOptions {
  modelBase?: string
  delegate?: 'auto' | Delegate
  onProgress?: (e: ProgressEvent) => void
}

export type PhotoSource = Blob | HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas

export interface PreparedImage {
  bitmap: ImageBitmap
  width: number
  height: number
  pixels: ImageData
  /** Scale from the original photo to the analysed image (≤ 1). */
  scale: number
}

export interface RawFace {
  landmarks: Point3[]
  blendshapes: Record<string, number>
}

export interface SegResult {
  size: number
  category: Uint8Array
  /** Six confidence masks (one per class), each size×size. */
  confidence: Float32Array[]
}

export const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`)

function context2d(c: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx
}

/** Decodes, orients (EXIF) and downscales a photo; returns the bitmap and its pixels. */
export async function prepareImage(src: PhotoSource, maxSide = MAX_SIDE): Promise<PreparedImage> {
  let bmp: ImageBitmap
  if (src instanceof Blob) bmp = await createImageBitmap(src, { imageOrientation: 'from-image' })
  else if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    if (!src.complete) await src.decode()
    bmp = await createImageBitmap(src, { imageOrientation: 'from-image' })
  } else bmp = await createImageBitmap(src as ImageBitmap | HTMLCanvasElement | OffscreenCanvas)
  const long = Math.max(bmp.width, bmp.height)
  const scale = long > maxSide ? maxSide / long : 1
  if (scale < 1) {
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const small = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    bmp.close()
    bmp = small
  }
  const canvas = makeCanvas(bmp.width, bmp.height)
  const ctx = context2d(canvas)
  ctx.drawImage(bmp, 0, 0)
  const pixels = ctx.getImageData(0, 0, bmp.width, bmp.height)
  return { bitmap: bmp, width: bmp.width, height: bmp.height, pixels, scale }
}

/** Fetches a model file with progress; throws models_unavailable on failure. */
async function fetchModel(url: string, file: string, onProgress?: (e: ProgressEvent) => void): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetch(url, { credentials: 'omit' })
  } catch (e) {
    throw new PhotoAvatarError('models_unavailable', `Could not download ${file}.`, { cause: e })
  }
  if (!res.ok) throw new PhotoAvatarError('models_unavailable', `Could not download ${file} (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress({ stage: 'models', loaded, total, file })
  }
  const out = new Uint8Array(loaded)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export interface Perception {
  /** Loads both tasks now (optional; `detect`/`segment` load lazily). */
  warmUp(): Promise<void>
  detectFaces(image: ImageBitmap): Promise<RawFace[]>
  segment(image: HTMLCanvasElement | OffscreenCanvas): Promise<SegResult>
  readonly delegate: Delegate | null
  dispose(): void
}

type Vision = typeof import('@mediapipe/tasks-vision')

export function createPerception(opts: PerceptionOptions = {}): Perception {
  const base = withSlash(opts.modelBase ?? DEFAULT_MODEL_BASE)
  const want = opts.delegate ?? 'auto'
  let vision: Promise<{ mod: Vision; fileset: Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>> }> | null = null
  let faceModel: Promise<Uint8Array> | null = null
  let segModel: Promise<Uint8Array> | null = null
  let landmarker: Promise<FaceLandmarker> | null = null
  let segmenter: Promise<ImageSegmenter> | null = null
  let delegate: Delegate | null = null
  let disposed = false

  const loadVision = () =>
    (vision ??= (async () => {
      try {
        const mod = await import('@mediapipe/tasks-vision')
        const fileset = await mod.FilesetResolver.forVisionTasks((base + MEDIAPIPE_RUNTIME_DIR).replace(/\/$/, ''))
        return { mod, fileset }
      } catch (e) {
        vision = null
        throw e instanceof PhotoAvatarError ? e : new PhotoAvatarError('models_unavailable', 'Could not load the vision runtime.', { cause: e })
      }
    })())

  const delegates = (): Delegate[] => (want === 'auto' ? ['GPU', 'CPU'] : [want])

  async function create<T>(make: (d: Delegate) => Promise<T>): Promise<{ task: T; delegate: Delegate }> {
    let last: unknown
    for (const d of delegates()) {
      try {
        return { task: await make(d), delegate: d }
      } catch (e) {
        last = e
      }
    }
    throw new PhotoAvatarError('models_unavailable', 'Could not start the vision models on this device.', { cause: last })
  }

  const getLandmarker = (force?: Delegate) =>
    (landmarker ??= (async () => {
      const { mod, fileset } = await loadVision()
      faceModel ??= fetchModel(base + 'face_landmarker.task', 'face_landmarker.task', opts.onProgress)
      const buf = await faceModel.catch((e) => {
        faceModel = null
        throw e
      })
      const { task, delegate: d } = await create((dl) =>
        mod.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: buf.slice(), delegate: force ?? dl },
          runningMode: 'IMAGE',
          numFaces: 2,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        }),
      )
      delegate = d
      return task
    })().catch((e) => {
      landmarker = null
      throw e
    }))

  const getSegmenter = (force?: Delegate) =>
    (segmenter ??= (async () => {
      const { mod, fileset } = await loadVision()
      segModel ??= fetchModel(base + 'selfie_multiclass_256x256.tflite', 'selfie_multiclass_256x256.tflite', opts.onProgress)
      const buf = await segModel.catch((e) => {
        segModel = null
        throw e
      })
      const { task } = await create((dl) =>
        mod.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: buf.slice(), delegate: force ?? dl },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        }),
      )
      return task
    })().catch((e) => {
      segmenter = null
      throw e
    }))

  function toFaces(r: FaceLandmarkerResult, w: number, h: number): RawFace[] {
    return r.faceLandmarks.map((lms, i) => {
      const bs: Record<string, number> = {}
      for (const c of r.faceBlendshapes[i]?.categories ?? []) bs[c.categoryName] = c.score
      return { landmarks: lms.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z * w })), blendshapes: bs }
    })
  }

  return {
    get delegate() {
      return delegate
    },
    async warmUp() {
      await Promise.all([getLandmarker(), getSegmenter()])
    },
    async detectFaces(image) {
      if (disposed) throw new Error('Perception was disposed')
      const lm = await getLandmarker()
      try {
        return toFaces(lm.detect(image), image.width, image.height)
      } catch (e) {
        if (delegate !== 'GPU' || want !== 'auto') throw e
        // A GPU delegate that loads but fails to run: retry once on the CPU.
        lm.close()
        landmarker = null
        const cpu = await getLandmarker('CPU')
        delegate = 'CPU'
        return toFaces(cpu.detect(image), image.width, image.height)
      }
    },
    async segment(image) {
      if (disposed) throw new Error('Perception was disposed')
      const run = (s: ImageSegmenter): SegResult => {
        const r = s.segment(image)
        try {
          const cat = r.categoryMask
          const conf = r.confidenceMasks ?? []
          if (!cat) throw new Error('Segmenter returned no category mask')
          return {
            size: cat.width,
            category: cat.getAsUint8Array().slice(),
            confidence: conf.map((m) => m.getAsFloat32Array().slice()),
          }
        } finally {
          r.close()
        }
      }
      const seg = await getSegmenter()
      try {
        return run(seg)
      } catch (e) {
        if (want !== 'auto') throw e
        seg.close()
        segmenter = null
        return run(await getSegmenter('CPU'))
      }
    },
    dispose() {
      disposed = true
      void landmarker?.then((l) => l.close()).catch(() => undefined)
      void segmenter?.then((s) => s.close()).catch(() => undefined)
      landmarker = null
      segmenter = null
      faceModel = null
      segModel = null
    },
  }
}
