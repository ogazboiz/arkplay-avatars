/* The stage: renders cast members into sticker and comic compositions.
 *
 * One model is built per cast member and view, then reused for every shot of that member
 * (a sticker, or every panel of a comic): only the pose and the face change between shots,
 * exactly like animation frames. Each shot is the engine's own document (parts, contact
 * shadows, finishing filter) with its <defs> hoisted: the defs of every model are written
 * once at the top of the composition, so ids never repeat. Shots are placed with a plain
 * `<g transform>` from world units into canvas px; flipped actors mirror in that transform.
 *
 * resvg safety: every shot is culled against its own window (partsSVG), and windows are
 * always inside the canvas, so no layer ends up off-canvas. */

import { clipsFor } from '../anim/clips.ts'
import { expressionState } from '../anim/expression.ts'
import { finalizePose } from '../anim/evaluate.ts'
import { humanPose } from '../anim/poses.ts'
import { sampleFrame } from '../anim/sample.ts'
import { applyM, boundsOf, type Box, type Mat, type P } from '../core/math.ts'
import { normalizeDNA } from '../dna/normalize.ts'
import type { AvatarDNA } from '../dna/types.ts'
import { createCtx, type Ctx } from '../render/context.ts'
import { documentSVG, layoutFrame, partExtent, partsSVG, type Frame } from '../render/compose.ts'
import { buildModel, type Model } from '../render/model.ts'
import type { HandShape, Part, Side, View } from '../render/types.ts'
import { Skeleton } from '../rig/skeleton.ts'
import { drawBackground } from '../parts/shared/scene.ts'
import { n1 } from './pen.ts'

/** Humanoid poses → the creature clip frame that reads the same (creatures have no arms). */
const CREATURE_FOR_POSE: Record<string, [string, number]> = {
  wave: ['hop', 0.35],
  cheer: ['jump', 0.4],
  jump: ['jump', 0.4],
  'sticker-praise': ['jump', 0.4],
  'sticker-lift': ['jump', 0.45],
  'sticker-high-five-l': ['jump', 0.4],
  'sticker-high-five-r': ['jump', 0.45],
  'sticker-dance': ['dance', 0.3],
  run: ['run', 0.2],
  sit: ['sit', 1],
  shrug: ['shake-head', 0.25],
  'thumbs-up': ['nod', 0.2],
  heart: ['love', 0.3],
  'sticker-hug-l': ['love', 0.3],
  'sticker-hug-r': ['love', 0.5],
}

/** The creature version of a humanoid actor: its own variant, else a matching clip frame. */
export function creatureVariant(a: ActorPose & { creature?: ActorPose }): ActorPose {
  const c = a.creature ?? {}
  const own = a.clip && clipsFor('creature').some((x) => x.name === a.clip) ? ([a.clip, a.t ?? 0] as [string, number]) : undefined
  const fb = own ?? (a.pose ? CREATURE_FOR_POSE[a.pose] : undefined)
  return {
    expression: c.expression ?? a.expression,
    intensity: c.intensity ?? a.intensity,
    look: c.look ?? a.look,
    tilt: c.tilt,
    clip: c.clip ?? fb?.[0],
    t: c.clip ? c.t : fb?.[1],
    view: c.view ?? (a.view === 'back' ? 'front' : a.view),
  }
}

/** How one actor stands in one shot. */
export interface ActorPose {
  /** Humanoid pose preset (POSE_DEFS). Ignored for creatures. */
  pose?: string
  /** A clip frame instead of a static pose (humanoids and creatures). */
  clip?: string
  /** Time into the clip, seconds. */
  t?: number
  /** Expression preset (EXPRESSION_PRESETS). */
  expression?: string
  /** 0..1.2, default 1 (stickers are expressive). */
  intensity?: number
  /** Gaze, -1..1 each. */
  look?: [number, number]
  /** Extra head tilt, degrees. */
  tilt?: number
  view?: View
}

export interface StageOptions {
  /** Id prefix for everything this stage renders (defs never collide across documents). */
  prefix: string
  quality?: 'standard' | 'high'
  detail?: 'low' | 'medium' | 'high'
  motion?: boolean
  assetUrl?: (id: string) => string | undefined
}

export class CastMember {
  readonly dna: AvatarDNA
  readonly kind: AvatarDNA['kind']
  private readonly models = new Map<View, Model>()
  private readonly o: StageOptions
  private readonly tag: string

  constructor(dna: AvatarDNA | unknown, o: StageOptions, tag: string) {
    this.dna = normalizeDNA(dna)
    this.kind = this.dna.kind
    this.o = o
    this.tag = tag
  }

  model(view: View = 'front'): Model {
    let m = this.models.get(view)
    if (!m) {
      m = buildModel(this.dna, {
        view,
        idPrefix: `${this.o.prefix}${this.tag}${view[0]}`,
        quality: this.o.quality ?? 'high',
        detail: this.o.detail,
        motion: this.o.motion ?? false,
        assetUrl: this.o.assetUrl,
      })
      this.models.set(view, m)
    }
    return m
  }

  /** Every def the shots of this member registered (write once per composition). */
  defs(): string {
    let out = ''
    for (const m of this.models.values()) out += defsBody(m.ctx)
    return out
  }
}

const defsBody = (ctx: Ctx): string => {
  const s = ctx.defs.toString()
  return s ? s.slice(6, -7) : ''
}

/** One posed actor, ready to be framed and drawn. */
export interface Shot {
  member: CastMember
  model: Model
  frame: Frame
  parts: Part[]
  mats: Map<string, Mat>
  /** World bounds of the posed figure. */
  bounds: Box
}

export function shoot(member: CastMember, a: ActorPose): Shot {
  const base = member.model(a.view ?? 'front')
  const expr = expressionState(a.expression ?? 'happy', a.intensity ?? 1, { lookX: a.look?.[0] ?? 0, lookY: a.look?.[1] ?? 0, tilt: a.tilt ?? 0 })
  let restPose = base.restPose
  let restHands = base.restHands
  const hr = base.ctx.hr
  if (hr && a.pose) {
    const r = humanPose(a.pose, hr)
    const hold = member.dna.sections.pose?.hold
    for (const s of ['L', 'R'] as Side[]) {
      if (typeof hold === 'string' && hold !== 'auto' && r.hands[s] === 'relaxed') r.hands[s] = hold as HandShape
      if (base.ctx.holding(s)) r.hands[s] = 'hold'
    }
    restPose = r.pose
    restHands = r.hands
  }
  const model: Model = { ...base, baseExpr: expr, restPose, restHands }
  const frame: Frame = a.clip ? sampleFrame(model, a.clip, a.t ?? 0) : { pose: finalizePose(model, restPose, expr), state: { expr, hands: { ...restHands }, t: 0, phase: 0 } }
  const { parts, mats } = layoutFrame(model, frame)
  return { member, model, frame, parts, mats, bounds: figureBounds(parts, mats) }
}

/**
 * World bounds of what a figure really paints: `partExtent` counts only the swept part of
 * arcs (the crop's `partBounds` counts whole ellipses, so one long hair arc can make a
 * figure look twice its size). Scene-wide layers (z ≤ -900) are left out.
 */
export function figureBounds(parts: Part[], mats: Map<string, Mat>): Box {
  const pts: P[] = []
  for (const p of parts) {
    if (p.bone === 'world' && p.z <= -900) continue
    const b = partExtent(p)
    if (!b.w && !b.h) continue
    const m = p.bone === 'world' ? null : mats.get(p.bone)
    for (const c of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as P[]) pts.push(m ? applyM(m, c) : c)
  }
  return boundsOf(pts)
}

/** World position of a skeleton anchor ('face', 'headTop', 'handR', 'chest'…) in a shot. */
export function anchorOf(shot: Shot, name: string): [number, number] | null {
  const a = shot.model.ctx.skel.anchors[name]
  if (!a) return null
  const m = shot.mats.get(a.bone)
  if (!m) return null
  return applyM(m, [a.x, a.y])
}

/** Rotation (degrees) of a bone in a shot: hats and glasses follow the head. */
export function boneAngle(shot: Shot, bone: string): number {
  const m = shot.mats.get(bone)
  return m ? (Math.atan2(m[1], m[0]) * 180) / Math.PI : 0
}

/** Size of the actor's head in world units (props and bubbles scale with it). */
export function headSize(shot: Shot): number {
  const c = shot.model.ctx
  if (c.hr) return c.hr.m.headH
  if (c.cr) return c.cr.m.frontFacing ? c.cr.m.bodyR * 1.6 : c.cr.m.headR * 2
  return 200
}

/** Where to aim a speech-bubble tail: the mouth region. */
export function mouthOf(shot: Shot): [number, number] {
  return anchorOf(shot, 'face') ?? [shot.bounds.x + shot.bounds.w / 2, shot.bounds.y + shot.bounds.h * 0.2]
}

/** Top of the head (hats, halos, party hats). */
export function headTopOf(shot: Shot): [number, number] {
  return anchorOf(shot, 'headTop') ?? [shot.bounds.x + shot.bounds.w / 2, shot.bounds.y]
}

/** A world → canvas placement: canvas = (world × k) + (tx, ty), mirrored when `flip`. */
export interface Placement {
  k: number
  tx: number
  ty: number
  flip: boolean
}

export const toCanvas = (pl: Placement, p: [number, number]): [number, number] => [pl.tx + (pl.flip ? -1 : 1) * p[0] * pl.k, pl.ty + p[1] * pl.k]

/** The actor's local world window that lands in the canvas rect (for culling). */
export function localWindow(pl: Placement, rect: Box): Box {
  const x0 = (rect.x - pl.tx) / pl.k
  const x1 = (rect.x + rect.w - pl.tx) / pl.k
  const y0 = (rect.y - pl.ty) / pl.k
  return { x: pl.flip ? -x1 : x0, y: y0, w: Math.abs(x1 - x0), h: rect.h / pl.k }
}

/**
 * The shot drawn into the canvas: the engine's document for the shot (culled to the part of
 * the world that shows in `rect`), defs hoisted, placed by `pl`. `outPx` is how many output
 * pixels the canvas rect spans (sets the finishing detail).
 */
export function drawShot(shot: Shot, pl: Placement, rect: Box, o: { shadow?: boolean; outScale?: number } = {}): string {
  const box = localWindow(pl, rect)
  const avatar = partsSVG(shot.parts, shot.mats, box)
  const doc = documentSVG(shot.model, avatar, { box, background: false, frame: false, shadow: o.shadow ?? false, title: false, size: Math.max(16, Math.round(rect.w * (o.outScale ?? 1))) })
  const body = bodyOf(doc)
  if (!body) return ''
  const a = pl.flip ? -pl.k : pl.k
  return `<g transform="matrix(${+a.toFixed(5)} 0 0 ${+pl.k.toFixed(5)} ${n1(pl.tx)} ${n1(pl.ty)})">${body}</g>`
}

/** The drawing inside an engine document: without the root element, title, CSS and defs. */
export function bodyOf(doc: string): string {
  let i = doc.indexOf('>') + 1
  if (doc.startsWith('<title>', i)) i = doc.indexOf('</title>', i) + 8
  if (doc.startsWith('<style>', i)) i = doc.indexOf('</style>', i) + 8
  if (doc.startsWith('<defs>', i)) i = doc.indexOf('</defs>', i) + 7
  return doc.slice(i, doc.length - 6)
}

/* ---- Scenery ------------------------------------------------------------- */

/** Scene presets as comic backdrops, drawn by the engine's own scene art. */
export class Scenery {
  private readonly ctxs = new Map<string, Ctx>()
  private readonly o: StageOptions
  private readonly style: AvatarDNA['sections']['style'] | undefined

  constructor(o: StageOptions, styleFrom?: AvatarDNA) {
    this.o = o
    this.style = styleFrom?.sections.style
  }

  private ctx(preset: string): Ctx {
    let c = this.ctxs.get(preset)
    if (!c) {
      const dna = normalizeDNA({ kind: 'humanoid', seed: 7, sections: { scene: { background: 'scene', preset }, ...(this.style ? { style: { ...this.style } } : {}) } })
      c = createCtx({
        dna,
        view: 'front',
        idPrefix: `${this.o.prefix}s${this.ctxs.size}`,
        skel: new Skeleton(),
        detail: this.o.detail,
        baked: (this.o.quality ?? 'high') === 'high',
        motion: this.o.motion ?? false,
        scaleRef: 300,
      })
      this.ctxs.set(preset, c)
    }
    return c
  }

  /** The scene `preset` filling the world window `box` (world units). */
  draw(preset: string, box: Box): string {
    return drawBackground(this.ctx(preset), box)
  }

  defs(): string {
    let out = ''
    for (const c of this.ctxs.values()) out += defsBody(c)
    return out
  }
}
