/* "From photo" progress, as a game: the Avatar Forge.
 *
 * The analysis stages are quests, the gold bar is the real progress, and once the avatar
 * is made its traits drop in as loot before a level-up. The player's photo is
 * shown in its own colours inside a gold portal (a local object/data URL; it never leaves
 * the device). Purely presentational; all motion is CSS and stops under
 * prefers-reduced-motion, where the text and the bar still update. */

import { useEffect, useRef, useState } from 'react'
import { fmt } from '../strings.ts'
import { useStrings } from './context.ts'
import { Icon, type IconName } from './Icon.tsx'

export type ForgeStage = 'boot' | 'models' | 'faces' | 'segmentation' | 'measure' | 'attributes' | 'synth'

export const FORGE_ORDER: ForgeStage[] = ['boot', 'models', 'faces', 'segmentation', 'measure', 'attributes', 'synth']

/** Overall progress at the start of each stage (models fills 2 → 60 by bytes). */
export const FORGE_PCT: Record<ForgeStage, number> = { boot: 2, models: 2, faces: 62, segmentation: 74, measure: 84, attributes: 91, synth: 97 }

export interface Loot {
  label: string
  value: string
  swatch?: string
  icon?: IconName
}

export interface ForgeLoaderProps {
  photoUrl: string | null
  stage: ForgeStage
  /** 0..100 overall. */
  pct: number
  bytes: { loaded: number; total: number } | null
  /** Traits of the forged avatar, revealed during the last stage. */
  loot: Loot[] | null
}

const SEGMENTS = 20

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Counts up to `target` (the percentage readout). */
function useCountUp(target: number): number {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reducedMotion()) {
      setV(target)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 450)
      const cur = Math.round(a + (target - a) * (1 - (1 - k) ** 3))
      setV(cur)
      from.current = cur
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

const mb = (b: number) => (b / 1048576).toFixed(1)

export function ForgeLoader({ photoUrl, stage, pct, bytes, loot }: ForgeLoaderProps) {
  const s = useStrings()
  const quests: Record<Exclude<ForgeStage, 'boot'>, string> = {
    models: s.forgeModels,
    faces: s.forgeFaces,
    segmentation: s.forgeSegmentation,
    measure: s.forgeMeasure,
    attributes: s.forgeAttributes,
    synth: s.forgeSynth,
  }
  const at = FORGE_ORDER.indexOf(stage)
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const leveled = !!loot && stage === 'synth'
  const shown = useCountUp(leveled ? 100 : p)
  const lit = Math.round(((leveled ? 100 : p) / 100) * SEGMENTS)
  const now = stage === 'boot' ? s.forgeBoot : quests[stage]

  return (
    <div
      className={`aps-forge aps-forge--${stage}${at >= FORGE_ORDER.indexOf('faces') ? ' is-found' : ''}${leveled ? ' is-leveled' : ''}`}
      role="progressbar"
      aria-label={now}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={leveled ? 100 : p}
    >
      <div className="aps-forge__portal" aria-hidden="true">
        <div className="aps-forge__rune" />
        <div className="aps-forge__frame">
          {photoUrl && <img className="aps-forge__photo" src={photoUrl} alt="" />}
          <div className="aps-forge__glint" />
          <div className="aps-forge__reticle">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="aps-forge__spark" style={{ left: `${8 + ((i * 37) % 84)}%`, animationDelay: `${(i * 0.37) % 2.2}s`, animationDuration: `${1.9 + (i % 4) * 0.35}s` }} />
        ))}
        <div className="aps-forge__badge">{leveled ? s.forgeLevelUp : fmt(s.forgeLevel, { level: 1 })}</div>
      </div>

      <div className="aps-forge__side">
        <div className="aps-forge__quest">
          <span className="aps-forge__questTag">{s.forgeQuest}</span>
          <span className="aps-forge__questName">{s.forgeQuestName}</span>
        </div>

        <div className="aps-forge__progress">
          <div className="aps-forge__progressTop">
            <span className="aps-forge__pct">{shown}%</span>
            {bytes && stage === 'models' && <span className="aps-forge__mb">{fmt(s.scanMB, { loaded: mb(bytes.loaded), total: mb(bytes.total) })}</span>}
          </div>
          <div className={`aps-forge__bar${stage === 'boot' ? ' is-idle' : ''}`} aria-hidden="true">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span key={i} className={i < lit ? 'is-lit' : undefined} style={{ animationDelay: `${i * 45}ms` }} />
            ))}
          </div>
        </div>

        {leveled ? (
          <div className="aps-forge__loot" aria-live="polite">
            <div className="aps-forge__lootHead">{s.forgeLoot}</div>
            <ul>
              {loot.map((l, i) => (
                <li key={`${l.label}-${i}`} style={{ animationDelay: `${120 + i * 160}ms` }}>
                  {l.swatch ? <span className="aps-forge__swatch" style={{ background: l.swatch }} /> : <Icon name={l.icon ?? 'sparkle'} size={16} />}
                  <span className="aps-forge__lootLabel">{l.label}</span>
                  <span className="aps-forge__lootValue">{l.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="aps-forge__log" aria-live="polite">
            {FORGE_ORDER.slice(1).map((st) => {
              const i = FORGE_ORDER.indexOf(st)
              const state = i < at ? 'done' : i === at ? 'now' : 'todo'
              const key = st as Exclude<ForgeStage, 'boot'>
              return (
                <li key={st} className={`is-${state}`}>
                  <span className="aps-forge__check" aria-hidden="true">
                    {state === 'done' ? <Icon name="check" size={13} /> : null}
                  </span>
                  <span className="aps-forge__questLine">{quests[key]}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
