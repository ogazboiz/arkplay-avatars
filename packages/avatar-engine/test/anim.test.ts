/* Animation: every clip on every kind of body.
 *
 * The clip library adapts each clip to the avatar's body (gaits by body plan, IK-placed
 * feet, body-type tuning, secondary motion), so these tests sweep bodies rather than
 * clips: every species preset, gait overrides, and humanoids from chibi to tall, heavy,
 * old, winged and caped, in every view. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import {
  CLIPS,
  SPECIES,
  addItem,
  applySpecies,
  buildModel,
  clipFor,
  clipsFor,
  clipsForAvatar,
  defaultDNA,
  renderSVG,
  rigBundle,
  setParam,
  spriteSheet,
  type AvatarDNA,
  type Model,
  type View,
} from '../src/index.ts'
import { evalClip } from '../src/anim/evaluate.ts'
import { creatureStyle } from '../src/anim/profile.ts'
import { creatureMeasure } from '../src/rig/creature.ts'
import type { Pose } from '../src/rig/skeleton.ts'

const here = dirname(fileURLToPath(import.meta.url))
const human = defaultDNA('humanoid', 7)
const body = (d: AvatarDNA, kv: [string, string, string | number][]) => kv.reduce((x, [s, k, v]) => setParam(x, s, k, v), d)

/** Humanoids across the body sliders and the things that swing. */
const HUMANS: [string, AvatarDNA][] = [
  ['default', human],
  ['tall', body(human, [['body', 'height', 1], ['body', 'legs', 0.9]])],
  ['short', body(human, [['body', 'height', 0], ['body', 'legs', 0.1]])],
  ['heavy', body(human, [['body', 'build', 1], ['body', 'belly', 0.8]])],
  ['chibi', body(human, [['body', 'headRatio', 1], ['body', 'height', 0.1]])],
  ['old', body(human, [['skin', 'age', 1]])],
  ['caped', addItem(body(human, [['hair', 'style', 'twintails']]), 'cape')],
  ['winged', addItem(body(human, [['hair', 'style', 'high-pony']]), 'angel-wings')],
  ['seated', body(human, [['pose', 'preset', 'sit']])],
  ['prosthetic', body(human, [['body', 'limbDiff', 'leg-l'], ['body', 'prosthetic', 'blade']])],
]

const creature = (id: string, kv: [string, string, string | number][] = []): AvatarDNA => body(applySpecies(defaultDNA('creature', 7), id), kv)

/** Every species preset, plus gait overrides and odd anatomy. */
const CREATURES: [string, AvatarDNA][] = [
  ...SPECIES.map((s) => [s.id, creature(s.id)] as [string, AvatarDNA]),
  ['cat-hops', creature('cat', [['species', 'gait', 'hop']])],
  ['cat-waddles', creature('cat', [['species', 'gait', 'waddle']])],
  ['cat-floats', creature('cat', [['species', 'gait', 'float']])],
  ['slime-legs', creature('slime', [['limbs', 'legs', '2']])],
  ['robot-legless', creature('robot', [['limbs', 'legs', '0']])],
  ['fox-8tails', creature('fox', [['tail', 'count', 8]])],
  ['spider-2legs', creature('spider', [['limbs', 'legs', '2']])],
  ['owl-legless', creature('owl', [['limbs', 'legs', '0']])],
]

const models = new Map<string, Model>()
function model(label: string, dna: AvatarDNA, view: View): Model {
  const key = `${label}|${view}`
  let m = models.get(key)
  if (!m) models.set(key, (m = buildModel(dna, { view, quality: 'standard', idPrefix: 't' })))
  return m
}

function* bodies(): Generator<[string, AvatarDNA, View]> {
  for (const [l, d] of HUMANS) for (const v of ['side', 'front', 'back'] as const) yield [l, d, v]
  for (const [l, d] of CREATURES) yield [l, d, 'side']
  for (const id of ['cat', 'owl', 'robot', 'octopus', 'slime']) yield [`${id}`, creature(id), 'front']
}

function finitePose(pose: Pose): string | null {
  for (const [b, p] of Object.entries(pose))
    for (const [k, v] of Object.entries(p)) if (typeof v === 'number' && !Number.isFinite(v)) return `${b}.${k}=${v}`
  return null
}

test('catalogue: timing, frame budgets and names', () => {
  const names = new Set<string>()
  for (const c of CLIPS) {
    assert.ok(!names.has(c.name), `duplicate clip ${c.name}`)
    names.add(c.name)
    assert.match(c.name, /^[a-z][a-z-]*$/, c.name)
    assert.ok(c.label && c.tags.length && c.kinds.length, c.name)
    const frames = Math.round(c.duration * c.fps)
    assert.ok(frames >= 2 && frames <= 36, `${c.name}: ${frames} frames (animated SVG and GIFs keep every frame up to 36)`)
    assert.ok(c.fps >= 8 && c.fps <= 24, `${c.name}: fps ${c.fps}`)
  }
  // Names that were ever shipped keep existing (games and the SDK ask for them by name).
  for (const n of ['idle', 'blink', 'talk', 'walk', 'run', 'jump', 'fall', 'hover', 'flap', 'fly', 'swim', 'slither', 'hop', 'wave', 'cheer', 'dance', 'clap', 'nod', 'shake-head', 'laugh', 'cry', 'angry', 'love', 'surprise', 'shrug', 'think', 'victory', 'wag', 'attack', 'cast', 'hurt', 'ko', 'sit', 'sleep'])
    assert.ok(names.has(n), `clip ${n} was removed`)
  // A full game set exists for both kinds.
  for (const kind of ['humanoid', 'creature'] as const) {
    const own = new Set(clipsFor(kind).map((c) => c.name))
    for (const n of ['idle', 'idle-look', 'idle-fidget', 'walk', 'run', 'jump', 'jump-up', 'fall', 'land', 'hurt', 'victory', 'defeat', 'sit', 'sleep', 'wave', 'cheer', 'dance', 'dance-hop', 'dance-sway', 'laugh', 'clap', 'nod', 'shake-head', 'hover', 'glide', 'flap', 'bow', 'yawn'])
      assert.ok(own.has(n), `${kind} lacks ${n}`)
  }
})

test('every clip on every body: catalogue timing, finite poses, deterministic', () => {
  for (const [label, dna, view] of bodies()) {
    const m = model(label, dna, view)
    for (const info of clipsFor(dna.kind)) {
      const clip = clipFor(m, info.name)
      assert.ok(clip, `${label}: no ${info.name}`)
      assert.deepEqual([clip.name, clip.label, clip.duration, clip.fps, clip.loop], [info.name, info.label, info.duration, info.fps, info.loop], `${label} ${info.name}: timing must match the catalogue`)
      assert.ok(Number.isFinite(clip.travel ?? 0) && (clip.travel ?? 0) >= 0, `${label} ${info.name}: travel`)
      for (const e of clip.events ?? []) assert.ok(e.t >= 0 && e.t <= 1 && e.name, `${label} ${info.name}: event ${e.name}@${e.t}`)
      for (let i = 0; i <= 4; i++) {
        const f = evalClip(m, clip, (info.duration * i) / 4)
        const bad = finitePose(f.pose)
        assert.equal(bad, null, `${label} ${view} ${info.name} t=${i}/4: ${bad}`)
      }
    }
  }
  // Same DNA, fresh models: identical frames.
  for (const [label, dna] of [HUMANS[4], CREATURES.find((c) => c[0] === 'bunny') as [string, AvatarDNA]]) {
    for (const name of ['walk', 'idle-fidget', 'jump']) {
      const a = buildModel(dna, { view: 'side', quality: 'standard' })
      const b = buildModel(dna, { view: 'side', quality: 'standard' })
      assert.deepEqual(evalClip(a, clipFor(a, name)!, 0.37), evalClip(b, clipFor(b, name)!, 0.37), `${label} ${name}`)
    }
    assert.equal(renderSVG(dna, { anim: 'run', time: 0.2, idPrefix: 'd' }), renderSVG(dna, { anim: 'run', time: 0.2, idPrefix: 'd' }))
  }
})

test('looping clips are seamless (the last frame flows into the first)', () => {
  const seams: string[] = []
  for (const [label, dna, view] of bodies()) {
    const m = model(label, dna, view)
    for (const info of clipsFor(dna.kind)) {
      if (!info.loop) continue
      const clip = clipFor(m, info.name)!
      const a = evalClip(m, clip, 0).pose
      const b = evalClip(m, clip, info.duration * (1 - 1e-7)).pose
      for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const pa = a[bone] ?? {}
        const pb = b[bone] ?? {}
        const d = Math.max(
          Math.abs((pa.rot ?? 0) - (pb.rot ?? 0)) / 0.05,
          Math.abs((pa.x ?? 0) - (pb.x ?? 0)) / 0.05,
          Math.abs((pa.y ?? 0) - (pb.y ?? 0)) / 0.05,
          Math.abs((pa.sx ?? 1) - (pb.sx ?? 1)) / 1e-3,
          Math.abs((pa.sy ?? 1) - (pb.sy ?? 1)) / 1e-3,
        )
        if (d > 1) seams.push(`${label} ${view} ${info.name} ${bone}`)
      }
    }
  }
  assert.deepEqual(seams.slice(0, 20), [], `${seams.length} seams`)
})

/** World position of a bone's origin in a frame. */
const at = (m: Model, pose: Pose, bone: string): [number, number] => {
  const w = m.ctx.skel.world(pose).get(bone)
  return w ? [w[4], w[5]] : [0, 0]
}

test('gaits plant their feet: no sliding, no sinking through the floor', () => {
  const cases: [string, AvatarDNA, string[]][] = [
    ...HUMANS.filter(([l]) => l !== 'seated' && l !== 'prosthetic').map(([l, d]) => [l, d, ['footL', 'footR']] as [string, AvatarDNA, string[]]),
    ...['cat', 'horse', 'bear', 'mouse', 'dino', 'penguin', 'dragon', 'turtle'].map((id) => [id, creature(id), []] as [string, AvatarDNA, string[]]),
  ]
  for (const [label, dna, humanFeet] of cases) {
    const m = buildModel(dna, { view: 'side', quality: 'standard' })
    const feet = humanFeet.length ? humanFeet : (m.ctx.cr?.legs ?? []).map((l) => l.foot)
    const rest = m.ctx.skel.world({})
    const ground = Math.max(...feet.map((f) => (rest.get(f) as number[])[5]))
    const scale = m.ctx.hr ? m.ctx.hr.m.legLen : Math.max(40, m.ctx.cr!.m.legLen)
    for (const name of ['walk', 'run']) {
      const clip = clipFor(m, name)!
      const n = 96
      const dt = clip.duration / n
      const speed = (clip.travel ?? 0) / clip.duration
      assert.ok(speed > 0, `${label} ${name}: travels`)
      const pos = Array.from({ length: n + 1 }, (_, i) => evalClip(m, clip, i * dt).pose)
      for (const f of feet) {
        let planted = 0
        let worst = 0
        for (let i = 0; i < n; i++) {
          const a = at(m, pos[i], f)
          const b = at(m, pos[i + 1], f)
          assert.ok(a[1] <= ground + scale * 0.01, `${label} ${name} ${f} sinks below the floor at ${i}/${n}: ${a[1].toFixed(1)} > ${ground.toFixed(1)}`)
          if (Math.abs(a[1] - ground) < scale * 0.004 && Math.abs(b[1] - ground) < scale * 0.004) {
            planted++
            // On the ground the foot moves back exactly as fast as the avatar travels.
            worst = Math.max(worst, Math.abs(b[0] - a[0] + speed * dt))
          }
        }
        assert.ok(planted >= n * (name === 'walk' ? 0.3 : 0.15), `${label} ${name} ${f}: on the ground ${planted}/${n} samples`)
        assert.ok(worst < scale * 0.01, `${label} ${name} ${f} slides ${worst.toFixed(2)} units per sample`)
      }
    }
  }
})

test('creature gaits come from anatomy, and species.gait overrides them', () => {
  const gait = (d: AvatarDNA) => {
    const m = creatureMeasure(d)
    return creatureStyle(d, m.plan, m.legs).gait
  }
  const expect: Record<string, string> = {
    cat: 'walk', horse: 'walk', bunny: 'hop', frog: 'hop', dino: 'stride', owl: 'hop', penguin: 'waddle', duck: 'waddle',
    fish: 'swim', whale: 'swim', snake: 'slither', snail: 'inch', 'eastern-dragon': 'float', bee: 'walk', spider: 'walk',
    slime: 'hop', mochi: 'hop', ghost: 'float', wisp: 'float', octopus: 'crawl', jelly: 'pulse', robot: 'walk', 'bot-tv': 'roll', drone: 'hover',
  }
  for (const [id, g] of Object.entries(expect)) assert.equal(gait(creature(id)), g, id)
  assert.equal(gait(creature('cat', [['species', 'gait', 'hop']])), 'hop')
  assert.equal(gait(creature('cat', [['species', 'gait', 'waddle']])), 'waddle')
  assert.equal(gait(creature('cat', [['species', 'gait', 'float']])), 'float')
  assert.equal(gait(creature('fish', [['species', 'gait', 'walk']])), 'swim', 'a fish cannot walk')
  // The default is `auto`, so avatars saved before the param keep their look.
  assert.equal(defaultDNA('creature').sections.species.gait, 'auto')
})

test('clipsForAvatar offers what the body can do', () => {
  const names = (d: AvatarDNA) => new Set(clipsForAvatar(d).map((c) => c.name))
  assert.ok(names(creature('dragon')).has('fly') && names(creature('dragon')).has('glide'))
  assert.ok(!names(creature('cat')).has('fly') && !names(creature('cat')).has('flap'))
  assert.ok(names(creature('fish')).has('swim') && !names(creature('fish')).has('slither'))
  assert.ok(names(creature('snake')).has('slither'))
  assert.ok(names(creature('ghost')).has('hover'))
  for (const [, d] of CREATURES) for (const c of clipsForAvatar(d)) assert.ok(clipsFor('creature').includes(c))
  assert.deepEqual(clipsForAvatar(human), clipsFor('humanoid'))
})

test('secondary motion follows the body and stays bounded', () => {
  const pony = body(human, [['hair', 'style', 'high-pony'], ['hair', 'length', 0.9]])
  const m = buildModel(pony, { view: 'side', quality: 'standard' })
  const jump = clipFor(m, 'jump')!
  const rot = (t: number) => evalClip(m, jump, t).pose.hairTail?.rot ?? 0
  const swing = Math.max(...Array.from({ length: 33 }, (_, i) => Math.abs(rot(i / 32))))
  assert.ok(swing > 4, `a ponytail reacts to a jump (${swing.toFixed(1)}°)`)
  assert.ok(swing < 40, `…within bounds (${swing.toFixed(1)}°)`)
  // Clips that flap wings own them: secondary motion leaves them alone.
  const winged = buildModel(HUMANS[7][1], { view: 'side', quality: 'standard' })
  const flap = clipFor(winged, 'flap')!
  assert.ok(flap.owns?.includes('wingL'))
  const a = evalClip(winged, flap, 0).pose.wingL?.rot ?? 0
  const b = evalClip(winged, flap, flap.duration * 0.4).pose.wingL?.rot ?? 0
  assert.ok(Math.abs(a - b) > 30, 'wings beat')
})

test('animation frames are resvg-safe for every body plan', () => {
  const who: AvatarDNA[] = [human, HUMANS[6][1], HUMANS[7][1], ...['cat', 'dragon', 'owl', 'fish', 'snake', 'bee', 'spider', 'slime', 'ghost', 'octopus', 'jelly', 'robot', 'drone'].map((id) => creature(id))]
  for (const dna of who) {
    const s = spriteSheet(dna, { anims: clipsFor(dna.kind).map((c) => c.name), view: 'side', cell: 20, maxFrames: 2 })
    assert.doesNotMatch(s.svg, /NaN|undefined|Infinity/)
    const png = new Resvg(s.svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } }).render().asPng()
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
  }
})

test('rig bundles carry every clip with catalogue timing', () => {
  for (const dna of [human, creature('dragon'), creature('octopus')]) {
    const names = clipsFor(dna.kind).map((c) => c.name)
    const { bundle } = rigBundle(dna, { clips: names, scale: 0.25, faces: false })
    assert.deepEqual(bundle.clips.map((c) => c.name), names)
    for (const c of bundle.clips) {
      const info = CLIPS.find((x) => x.name === c.name)!
      assert.equal(c.times.length, Math.max(2, Math.round(info.duration * info.fps) + (info.loop ? 0 : 1)), c.name)
      for (const [bone, tr] of Object.entries(c.bones)) for (const arr of Object.values(tr)) assert.ok((arr as number[]).every(Number.isFinite), `${c.name} ${bone}`)
    }
  }
})

test('the Unity SDK knows every clip of each kind', () => {
  const file = join(here, '..', '..', '..', 'sdk', 'unity', 'com.arkplay.avatars', 'Runtime', 'Core', 'AvatarApi.cs')
  if (!existsSync(file)) return
  const src = readFileSync(file, 'utf8')
  const list = (name: string) => {
    const m = new RegExp(`public static readonly string\\[\\] ${name} =\\s*\\{([^}]*)\\}`).exec(src)
    assert.ok(m, `AvatarClips.${name} in AvatarApi.cs`)
    return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
  }
  for (const [name, kind] of [['Humanoid', 'humanoid'], ['Creature', 'creature']] as const) {
    const sdk = list(name)
    const engine = clipsFor(kind).map((c) => c.name)
    assert.deepEqual(engine.filter((n) => !sdk.has(n)), [], `AvatarClips.${name} is missing clips`)
    assert.deepEqual([...sdk].filter((n) => !engine.includes(n)), [], `AvatarClips.${name} lists clips the engine does not have`)
  }
})
