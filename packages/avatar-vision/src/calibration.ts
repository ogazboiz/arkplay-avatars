/* Every calibration constant of the measurement → DNA mapping, in one place.
 *
 * GEOMETRY maps a raw ratio from measure.ts to a population percentile with a
 * piecewise-normal curve: p05 → 5 %, p50 → 50 %, p95 → 95 % (z = ±1.645), then to a DNA
 * slider as  0.5 + (percentile − 0.5) · spread, clamped to [lo, hi]. `spread` < 1 keeps
 * avatars from going to the extremes of a slider on a single noisy measurement.
 *
 * How the numbers were set (2026-09-24): p50 is the median over the 32 QA fixtures
 * (fixtures/photos, SSD-1B portraits balanced across skin tones and adult ages); p05/p95 are the
 * QA percentiles, widened to at least half the earlier anthropometric spread (face measures vary
 * ~5-8 % CV) because 32 synthetic faces under-represent real variation. The first guesses were
 * off by up to 3 spreads (brow arch, temple, nose and mouth width), which pushed every avatar
 * to arched brows and wide noses. Recalibrate with the demo's "Calibrate" button (or
 * scripts/qa-report.ts on a "Run all" export) when the measurements or the QA set change. */

export interface Curve {
  p05: number
  p50: number
  p95: number
}

export interface SliderMap extends Curve {
  /** DNA section and key the percentile drives (or null: used only for style choices). */
  section: string | null
  key: string | null
  spread: number
  lo: number
  hi: number
  /** Flip the direction (a larger ratio means a lower slider value). */
  invert?: boolean
}

export const GEOMETRY: Record<string, SliderMap> = {
  // Face width / face height (cheekbone line vs mesh top to chin).
  faceWidthRatio: { p05: 0.76, p50: 0.817, p95: 0.868, section: 'head', key: 'width', spread: 0.8, lo: 0.12, hi: 0.88 },
  // Jaw-angle width / face width.
  jawRatio: { p05: 0.762, p50: 0.81, p95: 0.857, section: 'head', key: 'jaw', spread: 0.8, lo: 0.12, hi: 0.88 },
  // Lower lip → chin / face height.
  chinRatio: { p05: 0.177, p50: 0.209, p95: 0.243, section: 'head', key: 'chin', spread: 0.75, lo: 0.15, hi: 0.85 },
  // Brows → hairline (or mesh top) / face height.
  foreheadRatio: { p05: 0.164, p50: 0.331, p95: 0.397, section: 'head', key: 'forehead', spread: 0.7, lo: 0.15, hi: 0.85 },
  // Face width at the mouth corners / face width.
  cheekFullness: { p05: 0.863, p50: 0.906, p95: 0.942, section: 'head', key: 'cheeks', spread: 0.7, lo: 0.15, hi: 0.85 },
  // Eye width / face width.
  eyeSize: { p05: 0.17, p50: 0.202, p95: 0.217, section: 'eyes', key: 'size', spread: 0.7, lo: 0.2, hi: 0.8 },
  // Inner-corner distance / face width.
  eyeSpacing: { p05: 0.235, p50: 0.253, p95: 0.27, section: 'eyes', key: 'spacing', spread: 0.7, lo: 0.2, hi: 0.8 },
  // Canthal tilt in degrees (outer corner up = positive).
  eyeTilt: { p05: 1.1, p50: 4.6, p95: 8.1, section: 'eyes', key: 'tilt', spread: 0.6, lo: 0.25, hi: 0.75 },
  // Visible brow thickness / face height.
  browThickness: { p05: 0.027, p50: 0.034, p95: 0.044, section: 'brows', key: 'thickness', spread: 0.8, lo: 0.15, hi: 0.9 },
  // Brow arch height / brow length.
  browArch: { p05: 0.136, p50: 0.182, p95: 0.237, section: null, key: null, spread: 1, lo: 0, hi: 1 },
  // Alar width / face width.
  noseWidth: { p05: 0.289, p50: 0.32, p95: 0.351, section: 'nose', key: 'width', spread: 0.75, lo: 0.15, hi: 0.85 },
  // Nasion → subnasale / face height.
  noseLength: { p05: 0.278, p50: 0.297, p95: 0.317, section: 'nose', key: 'size', spread: 0.7, lo: 0.2, hi: 0.8 },
  // Mouth-corner distance / face width (smile-compensated).
  mouthWidth: { p05: 0.35, p50: 0.421, p95: 0.487, section: 'mouth', key: 'width', spread: 0.75, lo: 0.15, hi: 0.85 },
  // Vermilion height (both lips) / mouth width.
  lipFullness: { p05: 0.178, p50: 0.262, p95: 0.448, section: 'mouth', key: 'lips', spread: 0.75, lo: 0.12, hi: 0.88 },
  // Forehead (temple) width / face width: only used for the face-shape choice.
  templeRatio: { p05: 0.816, p50: 0.863, p95: 0.91, section: null, key: null, spread: 1, lo: 0, hi: 1 },
  // Eye opening height / width (expression-compensated): eye-shape choice only.
  eyeAspect: { p05: 0.205, p50: 0.311, p95: 0.353, section: null, key: null, spread: 1, lo: 0, hi: 1 },
}

/** Hair silhouette → hair_length (heuristics). `hairBottom` is the lowest hair beside the
 *  face relative to the chin, in face heights (negative = above the chin). */
export const HAIR_LENGTH = {
  /** Centres of short … waist on the hairBottom axis. */
  centres: { short: -0.55, ear: -0.25, chin: 0.05, shoulder: 0.45, chest: 0.95, waist: 1.6 },
  sigma: 0.2,
  /** hairArea (hair pixels / face-oval area) below which the head reads as bald. */
  baldArea: 0.12,
  /** hairArea below which (with little height) hair reads as a buzz cut. */
  buzzArea: 0.4,
  /** hairTopHeight (brows → top of hair, face heights) of a close-cropped skull. */
  buzzTop: 0.66,
}

/** Hair texture from structure-tensor coherence (straight strands are coherent). QA set
 *  (32 SSD-1B portraits, 384 px segmentation ROI): coily/curly 0.40–0.64, wavy 0.57–0.82,
 *  straight 0.83–0.92. */
export const HAIR_TEXTURE = {
  /** Coherence at which hair reads straight / coily. */
  straightCoherence: 0.86,
  coilyCoherence: 0.45,
  /** Curl centres on a 0..1 axis for straight, wavy, curly, coily. */
  centres: [0.08, 0.4, 0.68, 0.92],
  sigma: 0.18,
}

/** Colour stylization toward the art style: chroma multiplier and lightness limits (OKLab). */
export const STYLIZE = {
  skin: { chroma: 1.06, minL: 0.3, maxL: 0.93 },
  hair: { chroma: 1.15, minL: 0.22, maxL: 0.92 },
  iris: { chroma: 1.35, minL: 0.26, maxL: 0.78 },
  lips: { chroma: 1.15, minL: 0.3, maxL: 0.85 },
  brows: { chroma: 1.05, minL: 0.18, maxL: 0.85 },
  top: { chroma: 1.1, minL: 0.14, maxL: 0.97 },
  /** Measured colours below this confidence are left at the schema default/auto. */
  minConfidence: { skin: 0.15, hair: 0.15, iris: 0.2, lips: 0.2, brows: 0.25, top: 0.1 },
  /** Lips closer than this to the skin (OKLab ΔE) keep the engine's automatic lip colour. */
  lipSkinMinDelta: 0.05,
}

/** Freckle spots (measure.ts): ring radius in IODs (freckle scale), how much darker than all
 *  but one ring neighbour a spot must be, and the spots per IOD² of cheek at spotDensity 1.
 *  Plain skin already reads 25–510 on the QA set (pores and texture; more on darker skin), so
 *  heuristics.ts only leaves the "none" prior above spotDensity 0.6. */
export const FRECKLES = { ringIod: 0.028, contrast: 0.1, fullDensity: 1000 }

/** Eye makeup cues (measure.ts): lightness drop past the outer eye corner (OKLab L below the
 *  skin) and lid chroma shift vs the skin. Lashes and lid shadow alone reach 0.43 and 0.045 on
 *  the QA set without glasses (frames darken the corner further: heuristics.ts discounts them). */
export const MAKEUP = { linerDrop: 0.45, lidShift: 0.06 }

/** Mapping a head's probabilities to an item: include it when p ≥ threshold. */
export const ITEM_THRESHOLD = 0.5

/** The model's crop from MediaPipe points. The trainer cut its crops from YuNet's 5 points;
 *  MediaPipe's iris centres and mouth corners (61/291) give a 3 % longer eye-mouth distance
 *  (median side ratio 1.03, p10–p90 0.99–1.07, centre offset ≈ 0 over the 32 QA photos), so
 *  the square shrinks by that much to frame the head like the training crops. */
export const CROP_POINTS = { sideScale: 0.971 }
