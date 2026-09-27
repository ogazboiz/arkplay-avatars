/* Rig bundles: the avatar as a skeletal "cutout" rig for game engines.
 *
 *   bones    the skeleton at rest (world units, y down, degrees)
 *   regions  every part rendered alone into one atlas, with the bone's pivot inside it
 *   slots    which region sits on which bone, in draw order; face and hand slots list a
 *            region per state so a runtime can swap them (blink, talk, smile, fist…)
 *   clips    bone channels sampled at the clip's fps, plus a face-state track and hand
 *            tracks, and the clip's events
 *
 * The Unity SDK builds a GameObject hierarchy from this and plays the clips; any engine
 * with sprites and transforms can (Godot, Phaser, Pixi, Spine-style runtimes). */

import { evalClip } from '../anim/evaluate.ts'
import { clipFor } from '../anim/clips.ts'
import { expressionState, withViseme } from '../anim/expression.ts'
import { f } from '../core/path.ts'
import { dnaHash } from '../dna/codec.ts'
import type { AvatarDNA } from '../dna/types.ts'
import { partExtent } from '../render/compose.ts'
import { buildModel, type Model } from '../render/model.ts'
import { PartList } from '../render/context.ts'
import type { ExprState, FrameState, HandShape, Part, View } from '../render/types.ts'
import { ENGINE_VERSION_STRING } from '../version.ts'
import { shelfPack } from './pack.ts'

export interface RigBone {
  name: string
  parent: string | null
  x: number
  y: number
  rot: number
  len: number
}

export interface RigRegion {
  x: number
  y: number
  w: number
  h: number
  /** Pivot (the bone origin) inside the region, pixels from its top-left. */
  px: number
  py: number
}

export interface RigSlot {
  name: string
  bone: string
  order: number
  region: string
  faceVariants?: Record<string, string>
  handVariants?: Record<string, string>
}

export interface RigClip {
  name: string
  duration: number
  loop: boolean
  fps: number
  travel: number
  events: { t: number; name: string }[]
  times: number[]
  bones: Record<string, { rot?: number[]; x?: number[]; y?: number[]; sx?: number[]; sy?: number[] }>
  face: string[]
  hands: { L: string[]; R: string[] }
}

export interface RigBundle {
  format: 'arkplay-rig'
  version: 1
  engine: string
  dna: string
  kind: string
  view: View
  /** Atlas pixels per world unit. */
  scale: number
  atlas: { image: string; width: number; height: number }
  bones: RigBone[]
  slots: RigSlot[]
  regions: Record<string, RigRegion>
  faceStates: string[]
  handStates: string[]
  clips: RigClip[]
}

/** Named face states a runtime can switch between. */
export const FACE_STATES: Record<string, (base: ExprState) => ExprState> = {
  neutral: () => expressionState('neutral', 1),
  happy: () => expressionState('happy', 0.9),
  blink: (b) => ({ ...b, openL: 0, openR: 0, eyeL: 'closed', eyeR: 'closed' }),
  talkA: (b) => withViseme(b, 'A'),
  talkE: (b) => withViseme(b, 'E'),
  talkO: (b) => withViseme(b, 'O'),
  talkM: (b) => withViseme(b, 'M'),
  surprised: () => expressionState('surprised', 1),
  sad: () => expressionState('sad', 1),
  angry: () => expressionState('angry', 1),
  laugh: () => expressionState('laugh', 1),
  love: () => expressionState('love', 1),
  hurt: () => ({ ...expressionState('scared', 1), eyeL: 'closed', eyeR: 'closed', mouth: 'grimace', open: 0.5 }),
  sleep: () => ({ ...expressionState('sleepy', 1), eyeL: 'closed', eyeR: 'closed' }),
  dizzy: () => expressionState('dizzy', 1),
}

const HAND_STATES: HandShape[] = ['relaxed', 'open', 'fist', 'point', 'hold', 'wave', 'peace', 'thumb']

/** Nearest named face state for an arbitrary expression (for clip face tracks). */
export function classifyFace(e: ExprState): string {
  if (e.eyeL === 'hearts') return 'love'
  if (e.eyeL === 'spiral') return 'dizzy'
  if (e.openL < 0.2 && e.openR < 0.2) return e.zzz ? 'sleep' : e.open > 0.3 ? 'hurt' : 'blink'
  if (e.eyeL === 'happy' && e.open > 0.4) return 'laugh'
  if (e.mouth === 'o' && e.browRaise > 0.5) return 'surprised'
  if (e.mouth === 'o') return 'talkO'
  if (e.mouth === 'flat' && e.open < 0.05 && e.browAngle < 0.5) return 'talkM'
  if (e.browAngle > 0.5) return 'angry'
  if (e.smile < -0.3) return 'sad'
  if (e.open > 0.55) return 'talkA'
  if (e.open > 0.2) return 'talkE'
  if (e.smile > 0.45) return 'happy'
  return 'neutral'
}

function dynamicParts(model: Model, state: FrameState): Part[] {
  const out = new PartList()
  for (const gen of model.dynamic) gen(model.ctx, state, out)
  return out.parts
}

export interface RigOptions {
  view?: View
  clips?: string[]
  /** Atlas pixels per world unit (default 1: a default avatar is ~740 px tall). */
  scale?: number
  /** Include every face state variant (default true). */
  faces?: boolean
  /** Resolves uploaded custom-asset ids to hrefs, as in RenderOptions.assetUrl. */
  assetUrl?: (id: string) => string | undefined
}

export interface RigResult {
  bundle: RigBundle
  /** The atlas as one SVG; rasterize to `bundle.atlas.image`. */
  atlasSvg: string
}

export function rigBundle(dna: AvatarDNA, o: RigOptions = {}): RigResult {
  const view = o.view ?? 'side'
  const scale = Math.max(0.1, Math.min(4, o.scale ?? 1))
  const model = buildModel(dna, { view, background: false, frame: false, quality: 'standard', assetUrl: o.assetUrl })
  const pad = 2

  // Every renderable piece: static parts once, dynamic parts once per state.
  interface Piece {
    region: string
    part: Part
  }
  const pieces: Piece[] = []
  const slots: RigSlot[] = []
  const base = model.baseExpr
  const restState: FrameState = { expr: base, hands: model.restHands, t: 0, phase: 0 }
  const orderParts = [...model.staticParts, ...dynamicParts(model, restState)]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.z - b.p.z || a.i - b.i)
    .map((x) => x.p)
  const dynamicIds = new Set(dynamicParts(model, restState).map((p) => p.id))

  const faceNames = o.faces === false ? ['neutral'] : Object.keys(FACE_STATES)
  const faceParts = new Map<string, Part[]>()
  for (const name of faceNames) faceParts.set(name, dynamicParts(model, { ...restState, expr: FACE_STATES[name](base) }))
  const handParts = new Map<HandShape, Part[]>()
  if (model.ctx.hr) for (const h of HAND_STATES) handParts.set(h, dynamicParts(model, { ...restState, hands: { L: h, R: h } }))

  orderParts.forEach((p, order) => {
    if (!dynamicIds.has(p.id)) {
      pieces.push({ region: p.id, part: p })
      slots.push({ name: p.id, bone: p.bone, order, region: p.id })
      return
    }
    const isHand = p.id.startsWith('hand-')
    const slot: RigSlot = { name: p.id, bone: p.bone, order, region: `${p.id}@${isHand ? model.restHands[p.id.endsWith('L') ? 'L' : 'R'] : 'neutral'}` }
    if (isHand) {
      slot.handVariants = {}
      for (const [h, parts] of handParts) {
        const q = parts.find((x) => x.id === p.id)
        if (q) {
          pieces.push({ region: `${p.id}@${h}`, part: q })
          slot.handVariants[h] = `${p.id}@${h}`
        }
      }
    } else {
      slot.faceVariants = {}
      for (const [name, parts] of faceParts) {
        const q = parts.find((x) => x.id === p.id)
        if (q) {
          pieces.push({ region: `${p.id}@${name}`, part: q })
          slot.faceVariants[name] = `${p.id}@${name}`
        }
      }
    }
    // A part can exist at rest but not in the default variant (blush on a happy face is gone
    // when neutral): fall back to the rest-state art so the slot never names a missing region.
    const variants = Object.values(slot.faceVariants ?? slot.handVariants ?? {})
    if (!variants.includes(slot.region)) {
      slot.region = `${p.id}@rest`
      pieces.push({ region: slot.region, part: p })
    }
    slots.push(slot)
  })

  // Pack. Each region holds its part's painted extent, plus a few world units for what the
  // geometry can't show (stroke caps and joins, antialiasing), plus `pad` pixels of empty
  // border so filtering never samples a neighbour.
  const margin = 4
  const rects = pieces.map((pc) => {
    const e = partExtent(pc.part)
    const b = { x: e.x - margin, y: e.y - margin, w: e.w + margin * 2, h: e.h + margin * 2 }
    return { id: pc.region, w: Math.max(1, Math.ceil(b.w * scale) + pad * 2), h: Math.max(1, Math.ceil(b.h * scale) + pad * 2), b }
  })
  const packed = shelfPack(rects, 2048)
  const regions: Record<string, RigRegion> = {}
  const drawn: string[] = []
  for (const r of rects) {
    const at = packed.positions.get(r.id)
    if (!at) continue
    const px = pad - r.b.x * scale
    const py = pad - r.b.y * scale
    regions[r.id] = { x: at.x, y: at.y, w: r.w, h: r.h, px: Math.round(px * 100) / 100, py: Math.round(py * 100) / 100 }
    const piece = pieces.find((p) => p.region === r.id) as Piece
    drawn.push(`<g transform="translate(${f(at.x + px)} ${f(at.y + py)}) scale(${f(scale)})">${piece.part.svg}</g>`)
  }
  const atlasSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${packed.width}" height="${packed.height}" viewBox="0 0 ${packed.width} ${packed.height}">${model.ctx.defs.toString()}${drawn.join('')}</svg>`

  // Clips.
  const clips: RigClip[] = []
  for (const name of o.clips ?? ['idle', 'walk', 'run', 'jump', 'talk', 'wave']) {
    const clip = clipFor(model, name)
    if (!clip) continue
    const n = Math.max(2, Math.round(clip.duration * clip.fps) + (clip.loop ? 0 : 1))
    const times: number[] = []
    const tracks: RigClip['bones'] = {}
    const face: string[] = []
    const hands: RigClip['hands'] = { L: [], R: [] }
    for (let i = 0; i < n; i++) {
      const t = clip.loop ? (i / n) * clip.duration : (i / (n - 1)) * clip.duration
      times.push(Math.round(t * 1000) / 1000)
      const fr = evalClip(model, clip, t)
      for (const b of model.ctx.skel.bones) {
        const p = fr.pose[b.name]
        if (!p) continue
        const tr = (tracks[b.name] ??= {})
        const push = (k: 'rot' | 'x' | 'y' | 'sx' | 'sy', v: number | undefined, dflt: number) => {
          const arr = (tr[k] ??= new Array(i).fill(dflt))
          arr.push(Math.round((v ?? dflt) * 1000) / 1000)
        }
        push('rot', p.rot, 0)
        push('x', p.x, 0)
        push('y', p.y, 0)
        push('sx', p.sx, 1)
        push('sy', p.sy, 1)
      }
      face.push(classifyFace(fr.state.expr))
      hands.L.push(fr.state.hands.L)
      hands.R.push(fr.state.hands.R)
    }
    // Pad late-starting channels and drop channels that never move.
    for (const [bone, tr] of Object.entries(tracks)) {
      for (const k of Object.keys(tr) as ('rot' | 'x' | 'y' | 'sx' | 'sy')[]) {
        const arr = tr[k] as number[]
        const dflt = k === 'sx' || k === 'sy' ? 1 : 0
        while (arr.length < n) arr.push(dflt)
        if (arr.every((v) => Math.abs(v - dflt) < 1e-3)) delete tr[k]
      }
      if (!Object.keys(tr).length) delete tracks[bone]
    }
    clips.push({ name, duration: clip.duration, loop: clip.loop, fps: clip.fps, travel: clip.travel ?? 0, events: clip.events ?? [], times, bones: tracks, face, hands })
  }

  const bundle: RigBundle = {
    format: 'arkplay-rig',
    version: 1,
    engine: ENGINE_VERSION_STRING,
    dna: dnaHash(dna),
    kind: dna.kind,
    view,
    scale,
    atlas: { image: 'atlas.png', width: packed.width, height: packed.height },
    bones: model.ctx.skel.bones.map((b) => ({ name: b.name, parent: b.parent, x: round(b.x), y: round(b.y), rot: round(b.rot), len: round(b.len) })),
    slots,
    regions,
    faceStates: faceNames,
    handStates: model.ctx.hr ? HAND_STATES : [],
    clips,
  }
  return { bundle, atlasSvg }
}

const round = (v: number) => Math.round(v * 100) / 100
