/* The pipeline's decisions (face choice, crop points, errors and warnings), kept apart from
 * the browser runtime (index.ts) so they stay testable in Node.
 * Pure: no DOM, no Node APIs. */

import { alignFromPoints, type Alignment, type Pt } from './crop.ts'
import { CROP_POINTS } from './calibration.ts'
import { LM } from './landmarks.ts'
import { SEG_ROI } from './measure.ts'
import type { RawFace } from './perception.ts'
import { CROP } from './taxonomy.ts'
import { PhotoAvatarError, type AnalysisWarning, type FaceSummary, type Measured } from './types.ts'

/** Minimum inter-ocular distance (analysed-image pixels) to measure a face. */
export const MIN_IOD = 24

export function summarize(f: RawFace, w: number, h: number): FaceSummary {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of f.landmarks) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const cx = (x0 + x1) / 2 / w - 0.5
  const cy = (y0 + y1) / 2 / h - 0.5
  return { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, area: ((x1 - x0) * (y1 - y0)) / (w * h), offCentre: Math.hypot(cx, cy), chosen: false }
}

/** No face: too_dark when the photo is very dark, otherwise no_face. */
export function noFaceError(brightness: number): PhotoAvatarError {
  if (brightness < 0.12) return new PhotoAvatarError('too_dark', 'The photo is too dark to find a face. Try brighter light.')
  return new PhotoAvatarError('no_face', 'No face was found. Use a photo where your face is clearly visible and facing the camera.')
}

/** The most prominent face (big and central); summaries get `chosen`; multiple_faces warns. */
export function chooseFace(raw: readonly RawFace[], w: number, h: number, warnings: AnalysisWarning[]): { index: number; summaries: FaceSummary[] } {
  const summaries = raw.map((f) => summarize(f, w, h))
  let bi = 0
  summaries.forEach((s, i) => {
    const score = s.area * (1 - 0.6 * s.offCentre)
    const best = summaries[bi].area * (1 - 0.6 * summaries[bi].offCentre)
    if (score > best) bi = i
  })
  summaries[bi].chosen = true
  if (raw.length > 1) warnings.push({ code: 'multiple_faces', message: 'More than one face is in the photo; the largest, most central one was used.' })
  return { index: bi, summaries }
}

export interface CropPoints {
  eyeL: Pt
  eyeR: Pt
  mouthL: Pt
  mouthR: Pt
}

const pt = (f: RawFace, i: number): Pt => ({ x: f.landmarks[i].x, y: f.landmarks[i].y })

/** Eyes (iris centres) and mouth corners, image-left first (the taxonomy crop convention);
 *  throws too_small, warns small_face. */
export function cropPointsOf(f: RawFace, warnings: AnalysisWarning[]): CropPoints {
  let eyeL = pt(f, LM.irisR)
  let eyeR = pt(f, LM.irisL)
  if (eyeL.x > eyeR.x) [eyeL, eyeR] = [eyeR, eyeL]
  let mouthL = pt(f, LM.mouthR)
  let mouthR = pt(f, LM.mouthL)
  if (mouthL.x > mouthR.x) [mouthL, mouthR] = [mouthR, mouthL]
  const iod = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y)
  if (iod < MIN_IOD) throw new PhotoAvatarError('too_small', 'The face is too small in this photo. Move closer or crop the photo around your face.')
  if (iod < 45) warnings.push({ code: 'small_face', message: 'The face is small in this photo, so details like eye colour are less reliable.' })
  return { eyeL, eyeR, mouthL, mouthR }
}

/** The attribute model's crop alignment (taxonomy crop, shrunk to match the trainer's YuNet points). */
export const attributeAlignment = (p: CropPoints): Alignment => alignFromPoints(p.eyeL, p.eyeR, p.mouthL, p.mouthR, { ...CROP, sizeD: CROP.sizeD * CROP_POINTS.sideScale })

/** The segmentation region (SEG_ROI) alignment. */
export const segmentationAlignment = (p: CropPoints): Alignment => alignFromPoints(p.eyeL, p.eyeR, p.mouthL, p.mouthR, { sizeD: SEG_ROI.sizeD, centerD: SEG_ROI.centerD, size: SEG_ROI.size })

export const PARTIAL_FACE: AnalysisWarning = { code: 'partial_face', message: 'The head is cut off by the edge of the photo, so hair length may be underestimated.' }

/** After measuring: too_dark (throws), dim_light, strong_cast, turned_head. */
export function lightingChecks(measured: Measured, brightness: number, warnings: AnalysisWarning[]): void {
  const skinL = measured.colors.skin?.lab[0]
  if (brightness < 0.1 && (skinL === undefined || skinL < 0.2)) throw new PhotoAvatarError('too_dark', 'The photo is too dark to read colours. Try brighter light.')
  if (brightness < 0.22) warnings.push({ code: 'dim_light', message: 'The photo is dim, so colours may be off. Daylight works best.' })
  if (measured.lighting && measured.lighting.sources.includes('neutral') && Math.max(...measured.lighting.gain) / Math.min(...measured.lighting.gain) > 1.15)
    warnings.push({ code: 'strong_cast', message: 'The light was strongly coloured; colours were balanced, but check them.' })
  if (measured.pose && (Math.abs(measured.pose.yaw) > 25 || Math.abs(measured.pose.pitch) > 25))
    warnings.push({ code: 'turned_head', message: 'The head is turned; a straight-on photo gives a closer match.' })
}
