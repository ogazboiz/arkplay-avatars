/* The 3D engine's view of an avatar (for a 3D renderer built on the same DNA).
 *
 * The 3D engine never re-decides what this engine already decides: proportions, the face
 * outline, hair recipes, resolved items and colours, and the 2D art it reuses as textures
 * (the face features, and flat stand-in "cards" for items that have no 3D model yet). This
 * module hands all of that over in one shape, so the 3D side needs no deep imports.
 *
 * Everything is in this engine's world units and 2D convention (y down), as laid out in
 * the requested view. Building a source costs one `buildModel`; it doesn't change any
 * 2D output. */

import { expressionState } from '../anim/expression.ts'
import type { Box } from '../core/math.ts'
import { slotSpec } from '../dna/schema/types.ts'
import { sectionsFor } from '../dna/schema/index.ts'
import type { AvatarDNA, Params } from '../dna/types.ts'
import { normalizeDNA } from '../dna/normalize.ts'
import { resolveHairRecipe, type HairRecipe } from '../parts/humanoid/hair.ts'
import { hairColorOf } from '../parts/humanoid/hairColor.ts'
import { faceGeom } from '../parts/humanoid/head.ts'
import { partExtent } from '../render/compose.ts'
import { PartList } from '../render/context.ts'
import { buildModel } from '../render/model.ts'
import type { ExprState, FrameState, Part, View } from '../render/types.ts'
import type { CreatureMeasure, LegDef } from '../rig/creature.ts'
import type { HumanMeasure } from '../rig/humanoid.ts'
import { FACE_STATES } from './rig.ts'

export type { HairRecipe } from '../parts/humanoid/hair.ts'
export type { HumanMeasure } from '../rig/humanoid.ts'
export type { CreatureMeasure, LegDef, Plan } from '../rig/creature.ts'

export interface Source3DPart {
  id: string
  bone: string
  /** 2D draw order: negative is behind the body, positive in front. */
  z: number
  /** SVG in the bone's local space (world units, y down). */
  svg: string
  /** What the part paints, in the bone's local space. */
  extent: Box
  /** Rebuilt per face or hand state. */
  dynamic: boolean
}

export interface Source3DBone {
  name: string
  parent: string | null
  /** Offset from the parent's origin, y down. */
  x: number
  y: number
  len: number
}

export interface Source3DItem {
  id: string
  /** The art id (limited variants and left-hand items draw another item's art). */
  art: string
  slot: string
  kind: 'garment' | 'accessory'
  /** Params with the item's defaults filled in. */
  params: Params
  index: number
}

export interface Source3DHuman {
  m: HumanMeasure
  /** The front-view face outline, head-local (y down, chin near 0, crown at `crownY`). */
  face: {
    crownY: number
    chinY: number
    /** [y, half width] from the crown down to the chin. */
    widths: [number, number][]
  }
  hair: HairRecipe
  hairColor: string
  hairline: number
  hides: { hair: boolean; hairTop: boolean; hairBack: boolean; ears: boolean; feet: boolean }
}

export interface Source3DCreature {
  m: CreatureMeasure
  legs: LegDef[]
  spine: string[]
  tail: string[]
}

export interface Avatar3DSource {
  /** The normalized DNA the source was built from. */
  dna: AvatarDNA
  kind: AvatarDNA['kind']
  view: View
  bones: Source3DBone[]
  /** Neutral rest position of every bone origin (no pose preset), in world units (y down,
   *  ground at y = 0). */
  origins: Record<string, { x: number; y: number }>
  /** Static parts plus the dynamic ones at the avatar's own expression and rest hands. */
  parts: Source3DPart[]
  /** `<defs>` content that the parts' SVG refers to (gradients, patterns, clips). */
  defs: string
  items: Source3DItem[]
  /** Every section of this kind, with the schema defaults filled in. */
  sections: Record<string, Params>
  human?: Source3DHuman
  creature?: Source3DCreature
  /**
   * The dynamic parts (face features, hands) for another face state: a `FACE_STATES` name
   * ('blink', 'talkA', 'happy'…) or an expression preset id ('grin', 'wink'…). `defs` may grow
   * while these are built, so read it again afterwards.
   */
  faceParts(state: string): { parts: Source3DPart[]; defs: string }
}

export interface Source3DOptions {
  view?: View
  /** Prefix for SVG ids (the default is unique per call). */
  idPrefix?: string
}

const toPart = (p: Part): Source3DPart => ({ id: p.id, bone: p.bone, z: p.z, svg: p.svg, extent: partExtent(p), dynamic: p.dynamic === true })

export function avatar3dSource(input: AvatarDNA, o: Source3DOptions = {}): Avatar3DSource {
  const dna = normalizeDNA(input)
  const view = o.view ?? 'front'
  const model = buildModel(dna, { view, background: false, frame: false, effects: false, quality: 'standard', motion: false, idPrefix: o.idPrefix })
  const { ctx } = model

  const dynamicAt = (expr: ExprState): Part[] => {
    const out = new PartList()
    const state: FrameState = { expr, hands: model.restHands, t: 0, phase: 0 }
    for (const gen of model.dynamic) gen(ctx, state, out)
    return out.parts
  }

  // The neutral rest (no pose preset): the 3D rig is built standing, and posed by clips.
  const world = ctx.skel.world()
  const origins: Record<string, { x: number; y: number }> = {}
  for (const b of ctx.skel.bones) {
    const m = world.get(b.name)
    if (m) origins[b.name] = { x: m[4], y: m[5] }
  }

  const sections: Record<string, Params> = {}
  for (const s of sectionsFor(dna.kind)) sections[s.id] = { ...ctx.sec(s.id).raw }

  const items: Source3DItem[] = ctx.items.map((i) => ({
    id: i.ref.id,
    art: i.art,
    slot: i.spec.slot,
    kind: slotSpec(i.spec.slot)?.kind ?? 'accessory',
    params: { ...i.p.raw },
    index: i.index,
  }))

  let human: Source3DHuman | undefined
  if (ctx.hr) {
    const fg = faceGeom(ctx)
    const widths: [number, number][] = []
    const N = 40
    for (let i = 0; i <= N; i++) {
      const y = fg.crownY + ((fg.chinY - fg.crownY) * i) / N
      widths.push([y, fg.widthAt(y)])
    }
    human = {
      m: ctx.hr.m,
      face: { crownY: fg.crownY, chinY: fg.chinY, widths },
      hair: resolveHairRecipe(ctx.sec('hair')),
      hairColor: hairColorOf(ctx),
      hairline: ctx.sec('hair').n('hairline'),
      hides: { hair: ctx.hides('hair'), hairTop: ctx.hides('hairTop'), hairBack: ctx.hides('hairBack'), ears: ctx.hides('ears'), feet: ctx.hides('feet') },
    }
  }
  const creature: Source3DCreature | undefined = ctx.cr ? { m: ctx.cr.m, legs: ctx.cr.legs, spine: ctx.cr.spine, tail: ctx.cr.tail } : undefined

  return {
    dna,
    kind: dna.kind,
    view,
    bones: ctx.skel.bones.map((b) => ({ name: b.name, parent: b.parent, x: b.x, y: b.y, len: b.len })),
    origins,
    parts: [...model.staticParts, ...dynamicAt(model.baseExpr)].map(toPart),
    defs: ctx.defs.toString(),
    items,
    sections,
    human,
    creature,
    faceParts(state) {
      const named = FACE_STATES[state]
      const expr = named ? named(model.baseExpr) : expressionState(state, 1)
      const parts = dynamicAt(expr).map(toPart)
      return { parts, defs: ctx.defs.toString() }
    },
  }
}
