/* @arkplay/avatar-vision: avatar from a photo, entirely in the browser.
 *
 *   const pa = createPhotoAvatar({ modelBase: '/avatar/v1/vision/models/' })
 *   const analysis = await pa.analyze(file)          // Blob | <img> | ImageBitmap | <canvas>
 *   const { best, candidates, notes } = photoToAvatars(analysis)
 *   …
 *   releaseAnalysis(analysis); pa.dispose()
 *
 * The photo and everything derived from it stay in memory on this device: nothing is
 * uploaded, stored or logged. No gender, ethnicity, age, body size, health or identity is
 * estimated. See packages/avatar-vision/README.md. */

import { createAttributeRunner, type AttributeModelInfo, type AttributeProvider } from './attributes.ts'
import { coverage, drawAlignedCrop, makeCanvas } from './crop.ts'
import { heuristicAttributes, mergeAttributes } from './heuristics.ts'
import { SEG_ROI, measure, meanBrightness } from './measure.ts'
import { DEFAULT_MODEL_BASE, createPerception, prepareImage, type Delegate, type PhotoSource, type ProgressEvent } from './perception.ts'
import { PARTIAL_FACE, attributeAlignment, chooseFace, cropPointsOf, lightingChecks, noFaceError, segmentationAlignment } from './pipeline.ts'
import { CROP } from './taxonomy.ts'
import type { AnalysisWarning, ChosenFace, PhotoAnalysis } from './types.ts'

export { photoToAvatars, rankHairStyles, rankEyeStyles, HAIR_SIGNATURES, percentile, type Candidate, type PhotoAvatars, type PhotoToAvatarsOptions, type StyleScore } from './toDNA.ts'
export { heuristicAttributes, mergeAttributes, blendTrusted, presenceOnly, BLEND_MAX } from './heuristics.ts'
export { measure, SEG_ROI, type MeasureInput, type PixelImage } from './measure.ts'
export { alignFromPoints, drawAlignedCrop, coverage, apply as applyAffine, invert as invertAffine, pythonEquivalent, type Affine, type Alignment, type CropSpec, type Pt } from './crop.ts'
export { TAXONOMY, CROP, HEAD_IDS, headSpec, classIndex, flipProbs, type HeadSpec, type Taxonomy } from './taxonomy.ts'
export { CROP_POINTS, GEOMETRY, HAIR_LENGTH, HAIR_TEXTURE, STYLIZE } from './calibration.ts'
export { SEG, SEG_CLASSES, LM, FACE_OVAL, LIPS_OUTER, EYE_L, EYE_R, BROW_L, BROW_R } from './landmarks.ts'
export { DEFAULT_MODEL_BASE, type ProgressEvent, type PhotoSource, type Delegate } from './perception.ts'
export {
  AUTO_PROVIDER,
  HEAD_POLICY,
  TRUST_MIN_MARGIN,
  createAttributeRunner,
  headProbabilities,
  headTrust,
  inputTensorData,
  modelFiles,
  type AttributeModelInfo,
  type AttributeModelSpec,
  type AttributeProvider,
  type AttributeRunner,
  type HeadTrust,
  type HeadUse,
} from './attributes.ts'
export { MEDIAPIPE_VERSION, ORT_VERSION } from './versions.ts'
export { MIN_IOD, chooseFace, cropPointsOf, lightingChecks, noFaceError, summarize, type CropPoints } from './pipeline.ts'
export * from './types.ts'

export interface PhotoAvatarOptions {
  /** Where the model files are served (default /avatar/v1/vision/models/). */
  modelBase?: string
  onProgress?: (e: ProgressEvent) => void
  /** MediaPipe delegate: 'auto' (GPU, then CPU), or force one. */
  delegate?: 'auto' | Delegate
  /** Use the trained attribute model when published (default true). */
  attributeModel?: boolean
  /** Average the attribute model over a flipped crop too (default false). */
  flipTTA?: boolean
  /** Attribute model execution provider (default 'auto': see attributes.ts AUTO_PROVIDER). */
  attributeProvider?: 'auto' | AttributeProvider
}

export interface AnalyzeOptions {
  /** The photo is a mirror image (e.g. a front-camera selfie saved mirrored). */
  mirrored?: boolean
}

export interface PhotoAvatar {
  analyze(image: PhotoSource, opts?: AnalyzeOptions): Promise<PhotoAnalysis>
  /** Downloads and starts the models ahead of the first photo (optional). */
  warmUp(): Promise<void>
  /** 'GPU' or 'CPU' once MediaPipe runs; the attribute model's provider once it loads. */
  readonly backends: { mediapipe: Delegate | null; attributes: AttributeProvider | null }
  /** The loaded attribute model (build, provider, timings, per-head trust), or null. */
  readonly attributeModel: AttributeModelInfo | null
  dispose(): void
}

function pixelsOf(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function createPhotoAvatar(opts: PhotoAvatarOptions = {}): PhotoAvatar {
  const modelBase = opts.modelBase ?? DEFAULT_MODEL_BASE
  const progress = (e: ProgressEvent) => opts.onProgress?.(e)
  const perception = createPerception({ modelBase, delegate: opts.delegate, onProgress: opts.onProgress })
  const attributes = createAttributeRunner({ modelBase, onProgress: opts.onProgress, flipTTA: opts.flipTTA, provider: opts.attributeProvider })

  return {
    get backends() {
      return { mediapipe: perception.delegate, attributes: attributes.provider }
    },
    get attributeModel() {
      return attributes.info
    },
    async warmUp() {
      await Promise.all([perception.warmUp(), opts.attributeModel !== false ? attributes.load() : Promise.resolve(false)])
    },
    async analyze(image, aopts = {}) {
      const timings: Record<string, number> = {}
      let t = performance.now()
      const lap = (k: string) => {
        const now = performance.now()
        timings[k] = Math.round(now - t)
        t = now
      }
      const warnings: AnalysisWarning[] = []
      const prep = await prepareImage(image)
      lap('decode')
      const W = prep.width
      const H = prep.height
      const brightness = meanBrightness(prep.pixels)

      progress({ stage: 'faces' })
      const raw = await perception.detectFaces(prep.bitmap)
      lap('faces')
      if (!raw.length) {
        prep.bitmap.close()
        throw noFaceError(brightness)
      }
      // The most prominent face: big and central.
      const { index: bi, summaries } = chooseFace(raw, W, H, warnings)
      const f = raw[bi]
      const face: ChosenFace = { ...summaries[bi], landmarks: f.landmarks, blendshapes: f.blendshapes }

      // Eyes and mouth corners, image-left first (the taxonomy crop convention).
      let points
      try {
        points = cropPointsOf(f, warnings)
      } catch (e) {
        prep.bitmap.close()
        throw e
      }
      const { eyeL, eyeR, mouthL, mouthR } = points

      const al = attributeAlignment(points)
      const crop = drawAlignedCrop(prep.bitmap, al, CROP.pad)
      if (coverage(al, W, H) < 0.7) warnings.push({ ...PARTIAL_FACE })

      const segAl = segmentationAlignment(points)
      const roiCanvas = drawAlignedCrop(prep.bitmap, segAl, [128, 128, 128], makeCanvas(SEG_ROI.size))
      progress({ stage: 'segmentation' })
      const seg = await perception.segment(roiCanvas)
      lap('segmentation')
      if (seg.size !== SEG_ROI.size) throw new Error(`Unexpected mask size ${seg.size}`)

      progress({ stage: 'measure' })
      const { measured, debug } = measure({
        image: prep.pixels,
        roi: pixelsOf(roiCanvas),
        landmarks: f.landmarks,
        blendshapes: f.blendshapes,
        seg: { category: seg.category, confidence: seg.confidence },
        toSeg: segAl.toCrop,
      })
      lap('measure')
      try {
        lightingChecks(measured, brightness, warnings)
      } catch (e) {
        prep.bitmap.close()
        throw e
      }

      progress({ stage: 'attributes' })
      const heur = heuristicAttributes(measured)
      let model = null
      if (opts.attributeModel !== false) {
        model = await attributes.predict(crop)
        const problem = attributes.problem
        if (!model && problem && !problem.startsWith('No attribute model')) warnings.push({ code: 'attribute_model_failed', message: problem })
      }
      lap('attributes')
      progress({ stage: 'done' })

      return {
        measured,
        attributes: mergeAttributes(model, heur, attributes.trust),
        attributeParts: { model, heuristic: heur },
        measureDebug: { counts: debug.counts, stats: debug.stats },
        cropPoints: { eyeL, eyeR, mouthL, mouthR },
        mirrored: !!aopts.mirrored,
        image: { width: W, height: H, bitmap: prep.bitmap },
        faces: summaries,
        face,
        crop,
        warnings,
        segmentation: { size: seg.size, category: seg.category, toSeg: segAl.toCrop, image: roiCanvas },
        timings,
      }
    },
    dispose() {
      perception.dispose()
      attributes.dispose()
    },
  }
}

/** Frees the analysis's image memory (the bitmap); the data fields stay usable. */
export function releaseAnalysis(a: PhotoAnalysis): void {
  try {
    a.image.bitmap.close()
  } catch {
    /* already closed */
  }
}
