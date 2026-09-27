/* The data model shared by perception → measurement → attributes → DNA mapping.
 *
 * Privacy: every value here stays in memory in the browser. Nothing is uploaded, stored or
 * logged. There is deliberately no field for gender, ethnicity, age, body size, health
 * or identity, and none may be added. */

import type { Lab } from './color.ts'

export type ColorKey = 'skin' | 'hair' | 'iris' | 'lips' | 'brows' | 'top' | 'topSecondary' | 'background'

/** Optional colours beyond the taxonomy's measured list. */
export type ExtraColorKey = 'headwear' | 'beard' | 'hairSecondary' | 'lidShadow' | 'eyewear' | 'headphones'

export type GeometryKey =
  | 'faceWidthRatio'
  | 'jawRatio'
  | 'chinRatio'
  | 'foreheadRatio'
  | 'cheekFullness'
  | 'eyeSize'
  | 'eyeSpacing'
  | 'eyeTilt'
  | 'browThickness'
  | 'browArch'
  | 'noseWidth'
  | 'noseLength'
  | 'mouthWidth'
  | 'lipFullness'
  | 'earVisibility'

export type HairKey = 'hairArea' | 'hairTopHeight' | 'hairWidth' | 'hairBottom' | 'foreheadCoverage' | 'partX'

export type ExpressionKey = 'smile' | 'mouthOpen' | 'browRaise' | 'eyeOpen'

export interface MeasuredColor {
  /** White-balanced, exposure-corrected colour (#rrggbb). */
  hex: string
  lab: Lab
  /** 0..1: how much trustworthy evidence there was (pixel count, spread, mask quality). */
  confidence: number
  /** Pixels used after trimming. */
  n: number
}

/**
 * Extra measurements the heuristics use. Every cue is a plain number (NaN = not measured)
 * so fixtures can be hand-written JSON.
 */
export interface Cues {
  /** Fraction of the lower face (chin, jaw, lower cheeks) that is dark, hair-like texture. */
  beardCoverage: number
  /** Mean lightness drop of the lower face against the cheek skin (OKLab L; 0 = none). */
  beardDarkening: number
  /** Beard coverage on the chin alone vs on the jaw sides (0..1 each). */
  beardChin: number
  beardSides: number
  /** How far facial hair hangs below the chin, in face heights. */
  beardBelowChin: number
  /** Upper-lip (moustache) coverage 0..1. */
  mustacheCoverage: number
  /** Glasses evidence 0..1: frame edges above/below the eyes and across the bridge. */
  glassesEdges: number
  /** Dark, textureless lenses (sunglasses) 0..1. */
  darkLenses: number
  /** Fraction of the head top covered by clothing/accessory classes (hats, wraps, hoods). */
  headCover: number
  /** Fraction of the ear-to-jaw sides covered by clothing/accessory classes (hijab, hood). */
  sideCover: number
  /** Accessory-class pixels at the ear lobes (earrings) 0..1. */
  earAccessory: number
  /** Accessory-class pixels over the ears and the head band (headphones) 0..1. */
  headphoneBand: number
  /** Accessory-class pixels at the neck (necklaces) 0..1. */
  neckAccessory: number
  /** Small dark spots per unit cheek area (freckles) 0..1. */
  spotDensity: number
  /** Upper-lid darkening (liner) and lid colour shift (shadow) 0..1. */
  linerScore: number
  lidShadowScore: number
  /** Hair texture: structure-tensor coherence (1 = straight parallel strands, 0 = isotropic curls). */
  hairCoherence: number
  /** Silhouette roughness of the hair outline (0 smooth … 1 very spiky/frizzy). */
  hairRoughness: number
  /** Width of the hair mass on top of the head vs the head (bun/knot bulges < 0.6). */
  hairTopWidth: number
  /** Hair beside the face at ear level, relative to the top (undercut/mohawk < 0.3). */
  hairSideRatio: number
  /** Asymmetry of forehead coverage: + = more cover on the image right. */
  bangsAsymmetry: number
  /** Coverage of the forehead centre vs its sides (curtain bangs have low centre cover). */
  bangsCentre: number
  /** How clearly a part line was seen (0..1); partX is NaN when there is none. */
  partStrength: number
  /** Skin top (hairline) above the brows, in face heights (receding hairline = large). */
  hairlineHeight: number
  /** Hair lighter at the ends than at the roots (ombré), OKLab ΔL. */
  hairTipLift: number
  /** Share and ΔE of a second hair colour cluster (highlights, two-tone). */
  hairSecondShare: number
  hairSecondDelta: number
  /** Hair reaches the bottom of the analysed region (length is at least what is seen). */
  hairClipped: number
  /** Body skin visible on the shoulders (tank tops) 0..1. */
  shoulderSkin: number
  /** Clothing coverage up the neck (turtlenecks, hoods) 0..1. */
  neckCover: number
  /** Clothes share visible in the region (0 when the top is out of frame). */
  clothesShare: number
  /** Forehead width relative to face width (face-shape classification). */
  templeRatio: number
  /** Eye opening height / width, averaged over both eyes (round vs narrow eye shapes). */
  eyeAspect: number
}

export interface Lighting {
  /** Linear-light gains applied to every measured colour (white balance × exposure). */
  gain: [number, number, number]
  exposure: number
  confidence: number
  sources: string[]
  /** Mean luminance of the analysed image, 0..1 (sRGB). */
  brightness: number
}

export interface Measured {
  colors: Partial<Record<ColorKey | ExtraColorKey, MeasuredColor>>
  /** Raw ratios, roll/yaw-normalized (see measure.ts); NaN = not measured. */
  geometry: Record<GeometryKey, number>
  /** Hair silhouette, in face widths/heights (see measure.ts); NaN = not measured. */
  hair: Record<HairKey, number>
  /** 0..1 from the blendshapes. */
  expression: Record<ExpressionKey, number>
  cues: Cues
  /** Optional: absent from hand-written fixtures. */
  lighting?: Lighting
  /** Head pose in degrees (estimated), for confidence. */
  pose?: { yaw: number; pitch: number; roll: number }
}

export type AttributeSource = 'model' | 'heuristic'

/** Where one head's probabilities came from: the model, the heuristics, or a blend of both
 *  (a trusted head the heuristics strongly disagreed with, or hair_part's presence-only use). */
export type HeadSource = AttributeSource | 'blend'

/** Per-head class probabilities in taxonomy class order (same shape from model and heuristics). */
export interface AttributeSet {
  /** 'model' when the model filled or blended at least one head. */
  source: AttributeSource
  heads: Record<string, number[]>
  /** 0..1 per head: how much to trust it (heuristics are honest and low). */
  confidence: Record<string, number>
  /** Which source filled each head (see heuristics.ts `mergeAttributes`). */
  headSource?: Record<string, HeadSource>
}

export interface FaceBox {
  x: number
  y: number
  w: number
  h: number
}

export interface FaceSummary {
  box: FaceBox
  /** Area share of the image, 0..1. */
  area: number
  /** Distance of the face centre from the image centre, 0 (centre) .. ~0.7 (corner). */
  offCentre: number
  chosen: boolean
}

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface ChosenFace extends FaceSummary {
  /** 478 landmarks in analysed-image pixels (z in the same pixel scale). */
  landmarks: Point3[]
  blendshapes: Record<string, number>
}

export type WarningCode = 'multiple_faces' | 'dim_light' | 'strong_cast' | 'turned_head' | 'partial_face' | 'small_face' | 'attribute_model_failed'

export interface AnalysisWarning {
  code: WarningCode
  message: string
}

export type PhotoErrorCode = 'no_face' | 'too_small' | 'too_dark' | 'models_unavailable'

export class PhotoAvatarError extends Error {
  readonly code: PhotoErrorCode
  constructor(code: PhotoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.code = code
    this.name = 'PhotoAvatarError'
  }
}

/** What `photoToAvatars` needs (a PhotoAnalysis has it; fixtures can be hand-written). */
export interface AvatarInput {
  measured: Measured
  attributes: AttributeSet
  /** The photo is a mirror image (e.g. a front-camera selfie saved mirrored): swap sides. */
  mirrored?: boolean
}

export interface SegmentationDebug {
  size: number
  /** Category per pixel: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 others. */
  category: Uint8Array
  /** Maps analysed-image pixels → segmentation pixels. */
  toSeg: { a: number; b: number; c: number; d: number; e: number; f: number }
  /** The rotated region the segmenter saw (for overlays). */
  image: ImageBitmap | HTMLCanvasElement | OffscreenCanvas
}

export interface PhotoAnalysis extends AvatarInput {
  /** Size of the analysed (oriented, downscaled) image. */
  image: { width: number; height: number; bitmap: ImageBitmap }
  faces: FaceSummary[]
  face: ChosenFace
  /** The aligned 224×224 crop fed to the attribute model. */
  crop: HTMLCanvasElement | OffscreenCanvas
  /** The crop's four points (analysed-image pixels; eyeL/mouthL = image-left). */
  cropPoints: { eyeL: { x: number; y: number }; eyeR: { x: number; y: number }; mouthL: { x: number; y: number }; mouthR: { x: number; y: number } }
  /** The two inputs of `attributes` before merging (QA and "why" displays). */
  attributeParts: { model: AttributeSet | null; heuristic: AttributeSet }
  /** Sample counts and intermediate numbers of the measurement (QA). */
  measureDebug: { counts: Record<string, number>; stats: Record<string, number> }
  warnings: AnalysisWarning[]
  segmentation: SegmentationDebug
  timings: Record<string, number>
}
