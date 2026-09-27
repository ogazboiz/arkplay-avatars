/* Creature species presets as a filterable grid of live thumbnails: each shows *this*
 * avatar (its expression, scene and style) as that species. */

import { memo, useMemo, useState } from 'react'
import { SPECIES, applySpecies, hashString } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { fmt } from '../strings.ts'
import { useActions, useStrings, useThumbBase } from './context.ts'
import { rovingIndex, rovingKeyDown } from './roving.ts'
import { Thumb } from './Thumb.tsx'

const TAG_LIMIT = 8

export const SpeciesPicker = memo(function SpeciesPicker({ current, idBase }: { current: string | undefined; idBase: string }) {
  const s = useStrings()
  const a = useActions()
  const thumbs = useThumbBase()
  const [tag, setTag] = useState<string>('')
  // The most common tags make useful filters ("cute", "fantasy", "water"…).
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const sp of SPECIES) for (const t of sp.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()]
      .filter(([, n]) => n >= 3)
      .sort((x, y) => y[1] - x[1])
      .slice(0, TAG_LIMIT)
      .map(([t]) => t)
  }, [])
  // A preset replaces the whole anatomy, so these thumbnails only depend on what it keeps:
  // expression, art style, accessories and the seed. Tweaking a tail doesn't re-render 42 tiles.
  const base = thumbs.dna
  const baseKey = useMemo(
    () =>
      hashString(
        JSON.stringify([base.seed, base.sections.expression, base.sections.style, base.accessories.map((x) => [x.id, x.params, x.asset?.id ?? '', x.asset?.src?.length ?? 0])]),
      ).toString(36),
    [base],
  )
  const list = tag ? SPECIES.filter((sp) => sp.tags.includes(tag)) : SPECIES
  const any = list.some((sp) => sp.id === current)
  const titleId = `${idBase}-species-title`
  return (
    <section className="aps-card" aria-labelledby={titleId}>
      <header className="aps-card__head">
        <div>
          <h3 className="aps-card__title" id={titleId}>
            {s.speciesPicker}
          </h3>
          <p className="aps-card__sub">{s.speciesHelp}</p>
        </div>
      </header>
      <div className="aps-card__body">
        <div className="aps-chips aps-chips--filter" role="group" aria-label={s.speciesPicker}>
          {['', ...tags].map((t) => (
            <button key={t || 'all'} type="button" className="aps-chip" aria-pressed={tag === t} onClick={() => setTag(t)}>
              {t ? t[0].toUpperCase() + t.slice(1) : s.speciesAll}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-labelledby={titleId} className="aps-tiles aps-tiles--species" onKeyDown={(e) => rovingKeyDown(e, { grid: true })}>
          {list.map((sp, i) => {
            const on = sp.id === current
            return (
              <button
                key={sp.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={rovingIndex(on, i, any)}
                className="aps-tile"
                title={fmt(s.speciesApply, { species: sp.label })}
                onClick={() => a.applySpecies(sp.id)}
              >
                <Thumb
                  tkey={`sp:${sp.id}|${baseKey}|${Object.keys(thumbs.assets ?? {}).length}`}
                  make={() => ({ dna: applySpecies(thumbs.dna, sp.id), crop: 'full', idPrefix: nextIdPrefix('t'), assets: thumbs.assets })}
                  priority={on ? 1 : 0}
                  className="aps-tile__img"
                />
                <span className="aps-tile__label">{sp.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
})
