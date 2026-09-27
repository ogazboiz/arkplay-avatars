/* MediaPipe Face Mesh landmark indices (478 points: 468 mesh + 10 iris). "R" is the
 * SUBJECT's right, which is the IMAGE left in a non-mirrored photo; "L" is the subject's
 * left (image right). Contours run around each feature so they can be used as polygons. */

export const LM = {
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
  noseBridge: 6,
  nasion: 168,
  subnasale: 2,
  /** Outer nose wings (alae). */
  alaR: 129,
  alaL: 358,
  /** Face-oval points at the cheekbones (the widest face line near the eyes). */
  cheekR: 234,
  cheekL: 454,
  /** Temples (forehead width). */
  templeR: 54,
  templeL: 284,
  /** Jaw angles. */
  jawR: 172,
  jawL: 397,
  mouthR: 61,
  mouthL: 291,
  upperLipTop: 0,
  upperLipBottom: 13,
  lowerLipTop: 14,
  lowerLipBottom: 17,
  eyeROuter: 33,
  eyeRInner: 133,
  eyeRTop: 159,
  eyeRBottom: 145,
  eyeLOuter: 263,
  eyeLInner: 362,
  eyeLTop: 386,
  eyeLBottom: 374,
  irisR: 468,
  irisL: 473,
} as const

export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
export const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]

/** Upper brow edge, outer → inner. */
export const BROW_R_UPPER = [70, 63, 105, 66, 107]
export const BROW_L_UPPER = [300, 293, 334, 296, 336]
/** Lower brow edge, outer → inner. */
export const BROW_R_LOWER = [46, 53, 52, 65, 55]
export const BROW_L_LOWER = [276, 283, 282, 295, 285]
/** Closed brow polygons: upper outer→inner, then lower inner→outer. */
export const BROW_R = [...BROW_R_UPPER, ...BROW_R_LOWER.slice().reverse()]
export const BROW_L = [...BROW_L_UPPER, ...BROW_L_LOWER.slice().reverse()]

export const IRIS_R_RING = [469, 470, 471, 472]
export const IRIS_L_RING = [474, 475, 476, 477]

/** Blendshape names used for expression (MediaPipe's 52 ARKit-style categories). */
export const BLENDSHAPES = {
  smile: ['mouthSmileLeft', 'mouthSmileRight'],
  mouthOpen: ['jawOpen'],
  browRaise: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'],
  blink: ['eyeBlinkLeft', 'eyeBlinkRight'],
  squint: ['eyeSquintLeft', 'eyeSquintRight'],
  wide: ['eyeWideLeft', 'eyeWideRight'],
} as const

/** selfie_multiclass_256x256 categories (the ImageSegmenter's category mask values). */
export const SEG_CLASSES = ['background', 'hair', 'body-skin', 'face-skin', 'clothes', 'others'] as const
export const SEG = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const
