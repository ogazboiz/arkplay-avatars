/* The aligned head-and-shoulders crop, exactly as `taxonomy.json` `crop` specifies it, so
 * the Python trainer and the browser feed the attribute model the same pixels.
 *
 *   eyeL, eyeR      eye centres; eyeL is the one on the IMAGE left (the subject's right eye)
 *   mouthL, mouthR  mouth corners (either order)
 *   u               unit vector eyeL → eyeR ("rotate so the eyes are level")
 *   down            u rotated +90° in image coordinates (y grows downward): (-u.y, u.x)
 *   d               |eyeMid − mouthMid|
 *   side            sizeD · d
 *   centre          eyeMid + centerD · d · down
 *
 * Output pixel (i, j) of an N×N crop samples the source at
 *   centre + ((i + 0.5)/N − 0.5) · side · u + ((j + 0.5)/N − 0.5) · side · down
 * Coordinates are continuous: source pixel k spans [k, k+1), its centre is k + 0.5 (the
 * canvas and MediaPipe convention). cv2.warpAffine puts pixel centres on integers, so the
 * Python side subtracts 0.5 from source coordinates (see `pythonEquivalent` below).
 * Pixels that fall outside the source image take the `pad` colour.
 *
 * The maths here is pure (unit-tested in Node); `drawAlignedCrop` is the only DOM code. */

export interface Pt {
  x: number
  y: number
}

/** 2D affine map: X = a·x + c·y + e, Y = b·x + d·y + f (the canvas `setTransform` order). */
export interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface CropSpec {
  sizeD: number
  centerD: number
  size: number
  pad: readonly [number, number, number]
}

export interface Alignment {
  /** Unit vector along the eye line (image left eye → image right eye). */
  u: Pt
  /** The face's down direction, perpendicular to `u`. */
  down: Pt
  /** Roll of the eye line in radians (positive = clockwise in the image). */
  angle: number
  eyeMid: Pt
  mouthMid: Pt
  /** Eye-mid to mouth-mid distance, source pixels. */
  dist: number
  centre: Pt
  /** Side of the square in source pixels. */
  side: number
  size: number
  /** Source → crop pixel coordinates. */
  toCrop: Affine
  /** Crop → source pixel coordinates. */
  fromCrop: Affine
}

export const apply = (m: Affine, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c
  if (Math.abs(det) < 1e-12) throw new Error('Affine is not invertible')
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) }
}

/** m2 ∘ m1 (apply m1 first). */
export function compose(m2: Affine, m1: Affine): Affine {
  return {
    a: m2.a * m1.a + m2.c * m1.b,
    b: m2.b * m1.a + m2.d * m1.b,
    c: m2.a * m1.c + m2.c * m1.d,
    d: m2.b * m1.c + m2.d * m1.d,
    e: m2.a * m1.e + m2.c * m1.f + m2.e,
    f: m2.b * m1.e + m2.d * m1.f + m2.f,
  }
}

const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })

/** The alignment for a crop spec from the four points. Throws on degenerate input. */
export function alignFromPoints(eyeL: Pt, eyeR: Pt, mouthL: Pt, mouthR: Pt, spec: Pick<CropSpec, 'sizeD' | 'centerD' | 'size'>): Alignment {
  const ex = eyeR.x - eyeL.x
  const ey = eyeR.y - eyeL.y
  const el = Math.hypot(ex, ey)
  if (!(el > 1e-6)) throw new Error('Eye points coincide')
  const u = { x: ex / el, y: ey / el }
  const down = { x: -u.y, y: u.x }
  const eyeMid = mid(eyeL, eyeR)
  const mouthMid = mid(mouthL, mouthR)
  const dist = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y)
  if (!(dist > 1e-6)) throw new Error('Eye and mouth points coincide')
  const centre = { x: eyeMid.x + spec.centerD * dist * down.x, y: eyeMid.y + spec.centerD * dist * down.y }
  const side = spec.sizeD * dist
  const s = side / spec.size
  const h = spec.size / 2
  // Crop → source: centre + (X − N/2)·s·u + (Y − N/2)·s·down.
  const fromCrop: Affine = {
    a: s * u.x,
    b: s * u.y,
    c: s * down.x,
    d: s * down.y,
    e: centre.x - h * s * (u.x + down.x),
    f: centre.y - h * s * (u.y + down.y),
  }
  // Source → crop: rows of the rotation over s (R is orthonormal, so R⁻¹ = Rᵀ).
  const toCrop: Affine = {
    a: u.x / s,
    b: down.x / s,
    c: u.y / s,
    d: down.y / s,
    e: h - (u.x * centre.x + u.y * centre.y) / s,
    f: h - (down.x * centre.x + down.y * centre.y) / s,
  }
  return { u, down, angle: Math.atan2(u.y, u.x), eyeMid, mouthMid, dist, centre, side, size: spec.size, toCrop, fromCrop }
}

/** Where output pixel (i, j)'s centre samples the source. */
export const sourceOfPixel = (al: Alignment, i: number, j: number): Pt => apply(al.fromCrop, { x: i + 0.5, y: j + 0.5 })

/** The 2×3 matrix M for `cv2.warpAffine(src, M, (N, N), flags=cv2.INTER_LINEAR,
 *  borderMode=cv2.BORDER_CONSTANT, borderValue=pad)` that produces the same crop. cv2 puts
 *  pixel centres on integers, so both sides shift by half a pixel. Rows: [[a, c, e], [b, d, f]]
 *  mapping source(cv2) → dest(cv2). When the crop shrinks the source a lot, blur or
 *  pre-resize first (the browser's high-quality smoothing filters on minification). */
export function pythonEquivalent(al: Alignment): [[number, number, number], [number, number, number]] {
  // dest_cv = toCrop(src_cv + 0.5) − 0.5
  const t = al.toCrop
  const e = t.a * 0.5 + t.c * 0.5 + t.e - 0.5
  const f = t.b * 0.5 + t.d * 0.5 + t.f - 0.5
  return [
    [t.a, t.c, e],
    [t.b, t.d, f],
  ]
}

/** Fraction of the crop square that lies inside the source image (1 = no padding). */
export function coverage(al: Alignment, width: number, height: number, samples = 24): number {
  let inside = 0
  for (let j = 0; j < samples; j++)
    for (let i = 0; i < samples; i++) {
      const p = apply(al.fromCrop, { x: ((i + 0.5) / samples) * al.size, y: ((j + 0.5) / samples) * al.size })
      if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height) inside++
    }
  return inside / (samples * samples)
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** A canvas of `size`×`size` (OffscreenCanvas when available). */
export function makeCanvas(w: number, h = w): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Draws the aligned crop of `source` into a new canvas: pad colour first, then the image
 *  through `toCrop`, with high-quality smoothing (matches INTER_AREA/LINEAR closely). */
export function drawAlignedCrop(
  source: CanvasImageSource,
  al: Alignment,
  pad: readonly [number, number, number],
  canvas: HTMLCanvasElement | OffscreenCanvas = makeCanvas(al.size),
): HTMLCanvasElement | OffscreenCanvas {
  canvas.width = al.size
  canvas.height = al.size
  const ctx = canvas.getContext('2d') as Canvas2D | null
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = `rgb(${pad[0]}, ${pad[1]}, ${pad[2]})`
  ctx.fillRect(0, 0, al.size, al.size)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const t = al.toCrop
  ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f)
  ctx.drawImage(source, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas
}
