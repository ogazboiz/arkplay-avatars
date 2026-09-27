/* A schema section as a card: its visible params, advanced ones folded away, and the
 * section's randomize and lock buttons. Memoized on the section's own params, so dragging
 * a slider re-renders one card, not the whole editor. */

import { memo, useCallback, useState } from 'react'
import { setParam, type ChoiceSpec, type ParamSpec, type ParamValue, type Params, type SectionSpec, type TabId } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { choiceLook, visibleParams } from '../state/params.ts'
import { fmt } from '../strings.ts'
import { useActions, useStrings, useThumbBase } from './context.ts'
import type { ChoiceThumb } from './controls/Choice.tsx'
import { ParamControl } from './controls/ParamControl.tsx'
import { Icon } from './Icon.tsx'

export interface SectionCardProps {
  section: SectionSpec
  params: Params
  tab: TabId
  locked: boolean
  /** Values of other sections this card's visibility depends on (memo key only). */
  cross: string
  idBase: string
}

export const SectionCard = memo(function SectionCard({ section, params, tab, locked, idBase }: SectionCardProps) {
  const s = useStrings()
  const a = useActions()
  const thumbs = useThumbBase()
  const [more, setMore] = useState(false)
  const { basic, advanced } = visibleParams(section.params, params, a.lookup)
  const sid = section.id

  const onChange = useCallback((spec: ParamSpec, value: ParamValue, group?: string) => a.setParam(sid, spec.key, value, spec.label, group), [a, sid])
  const onCommit = a.seal

  const thumbFor = (spec: ParamSpec): ((opt: string) => ChoiceThumb) | undefined => {
    if (spec.type !== 'choice') return undefined
    const look = choiceLook(spec as ChoiceSpec, tab)
    if (!look) return undefined
    const crop = look.crop === 'full' && thumbs.dna.kind === 'humanoid' ? 'tall' : look.crop
    return (opt) => ({
      key: `${thumbs.key}|s:${sid}.${spec.key}=${opt}|${crop}${look.scene ? '+scene' : ''}`,
      make: () => ({ dna: setParam(thumbs.dna, sid, spec.key, opt), crop, scene: look.scene, idPrefix: nextIdPrefix('t'), assets: thumbs.assets }),
    })
  }

  const control = (spec: ParamSpec) => (
    <ParamControl
      key={spec.key}
      spec={spec}
      value={params[spec.key]}
      id={`${idBase}-${sid}-${spec.key}`}
      group={`s:${sid}.${spec.key}`}
      onChange={onChange}
      onCommit={onCommit}
      thumbFor={thumbFor(spec)}
      tall={spec.type === 'choice' && (spec as ChoiceSpec).preview === 'full' && thumbs.dna.kind === 'humanoid'}
    />
  )

  const titleId = `${idBase}-${sid}-title`
  const moreId = `${idBase}-${sid}-more`
  return (
    <section className={`aps-card${locked ? ' is-locked' : ''}`} id={`${idBase}-sec-${sid}`} aria-labelledby={titleId}>
      <header className="aps-card__head">
        <h3 className="aps-card__title" id={titleId} tabIndex={-1}>
          {section.label}
          {locked && <Icon name="lock" size={14} className="aps-card__lockmark" />}
        </h3>
        <div className="aps-card__actions">
          <button
            type="button"
            className="aps-iconbtn aps-iconbtn--sm"
            onClick={() => a.randomizeSection(sid, section.label)}
            aria-label={fmt(s.randomizeSection, { section: section.label })}
            title={fmt(s.randomizeSection, { section: section.label })}
          >
            <Icon name="dice" size={17} />
          </button>
          <button
            type="button"
            className="aps-iconbtn aps-iconbtn--sm aps-lockbtn"
            aria-pressed={locked}
            onClick={() => a.toggleLock(sid)}
            aria-label={fmt(s.lockSection, { section: section.label })}
            title={locked ? fmt(s.unlockSection, { section: section.label }) : fmt(s.lockSection, { section: section.label })}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size={17} />
          </button>
        </div>
      </header>
      <div className="aps-card__body">
        {basic.map(control)}
        {advanced.length > 0 && (
          <div className="aps-more">
            <button type="button" className="aps-more__toggle" aria-expanded={more} aria-controls={moreId} onClick={() => setMore((m) => !m)}>
              <span>{more ? s.fewerOptions : s.moreOptions}</span>
              <Icon name={more ? 'chevronUp' : 'chevronDown'} size={16} />
            </button>
            <div id={moreId} className="aps-more__body" hidden={!more}>
              {more && advanced.map(control)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
})
