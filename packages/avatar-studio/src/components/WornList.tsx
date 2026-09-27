/* What the avatar is wearing, in draw order: each item can be edited (its own params from
 * the catalogue), moved earlier or later among its slot, or taken off. */

import { memo, useState, type CSSProperties } from 'react'
import { itemSpec, slotSpec, type ItemRef, type ParamSpec, type ParamValue } from '@arkplay/avatar-engine'
import { visibleParams } from '../state/params.ts'
import { itemBadge } from '../state/tiers.ts'
import { fmt } from '../strings.ts'
import { useActions, useEnv, useStrings, type ItemList } from './context.ts'
import { ParamControl } from './controls/ParamControl.tsx'
import { Icon } from './Icon.tsx'

export interface WornListProps {
  list: ItemList
  items: ItemRef[]
  idBase: string
  locked: boolean
  title: string
}

function artHref(item: ItemRef, assetUrl?: (id: string) => string | undefined): string | undefined {
  return item.asset?.src ?? (item.asset?.id ? assetUrl?.(item.asset.id) : undefined)
}

export const WornList = memo(function WornList({ list, items, idBase, locked, title }: WornListProps) {
  const s = useStrings()
  const a = useActions()
  const env = useEnv()
  const [open, setOpen] = useState<number | null>(null)
  const titleId = `${idBase}-${list}-worn`
  const lockLabel = list === 'outfit' ? s.lockOutfit : s.lockAccessories

  const move = (i: number, delta: number) => {
    a.moveItem(list, i, delta)
    if (open === i) setOpen(i + delta)
    else if (open === i + delta) setOpen(i)
  }

  return (
    <section className={`aps-card${locked ? ' is-locked' : ''}`} aria-labelledby={titleId}>
      <header className="aps-card__head">
        <h3 className="aps-card__title" id={titleId}>
          {title}
          {locked && <Icon name="lock" size={14} className="aps-card__lockmark" />}
        </h3>
        <div className="aps-card__actions">
          <button
            type="button"
            className="aps-iconbtn aps-iconbtn--sm aps-lockbtn"
            aria-pressed={locked}
            onClick={() => a.toggleLock(list)}
            aria-label={lockLabel}
            title={locked ? (list === 'outfit' ? s.unlockOutfit : s.unlockAccessories) : lockLabel}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size={17} />
          </button>
        </div>
      </header>
      <div className="aps-card__body">
        {items.length === 0 ? (
          <p className="aps-empty">{s.wearingNone}</p>
        ) : (
          <ol className="aps-worn">
            {items.map((item, i) => {
              const spec = itemSpec(item.id)
              if (!spec) return null
              const slot = slotSpec(spec.slot)
              const label = item.id === 'custom' ? item.asset?.name || s.customImage : spec.label
              const isOpen = open === i
              const panelId = `${idBase}-${list}-item-${i}`
              const swatch = typeof item.params.color === 'string' && item.params.color ? item.params.color : undefined
              const art = item.id === 'custom' ? artHref(item, env.assetUrl) : undefined
              const { basic, advanced } = visibleParams(spec.params, item.params)
              const onChange = (p: ParamSpec, v: ParamValue, group?: string) => a.setItemParam(list, i, p.key, v, fmt(s.h_itemParam, { item: label, param: p.label }), group)
              return (
                <li key={`${item.id}-${i}`} className={`aps-worn__item${isOpen ? ' is-open' : ''}`}>
                  <div className="aps-worn__row">
                    <span className="aps-worn__chip" style={swatch ? ({ '--aps-swatch': swatch } as CSSProperties) : undefined} aria-hidden="true">
                      {art ? <img src={art} alt="" /> : null}
                    </span>
                    <button type="button" className="aps-worn__name" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : i)}>
                      <span className="aps-worn__label">{label}</span>
                      {(() => {
                        const badge = itemBadge(item.id, s)
                        return badge ? <span className={`aps-tier aps-tier--${badge.tier}`}>{badge.full}</span> : null
                      })()}
                      <span className="aps-worn__slot">{slot.label}</span>
                      <Icon name={isOpen ? 'chevronUp' : 'edit'} size={15} className="aps-worn__caret" />
                    </button>
                    <div className="aps-worn__actions">
                      <button type="button" className="aps-iconbtn aps-iconbtn--sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={fmt(s.moveUp, { item: label })} title={fmt(s.moveUp, { item: label })}>
                        <Icon name="arrowUp" size={16} />
                      </button>
                      <button
                        type="button"
                        className="aps-iconbtn aps-iconbtn--sm"
                        disabled={i === items.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={fmt(s.moveDown, { item: label })}
                        title={fmt(s.moveDown, { item: label })}
                      >
                        <Icon name="arrowDown" size={16} />
                      </button>
                      <button
                        type="button"
                        className="aps-iconbtn aps-iconbtn--sm aps-iconbtn--danger"
                        onClick={() => {
                          if (open !== null && open >= i) setOpen(open === i ? null : open - 1)
                          a.removeItem(list, i)
                        }}
                        aria-label={fmt(s.removeItem, { item: label })}
                        title={fmt(s.removeItem, { item: label })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  <div id={panelId} className="aps-worn__params" hidden={!isOpen}>
                    {isOpen &&
                      [...basic, ...advanced].map((p) => (
                        <ParamControl key={p.key} spec={p} value={item.params[p.key]} id={`${panelId}-${p.key}`} group={`i:${list}.${i}.${p.key}`} onChange={onChange} onCommit={a.seal} />
                      ))}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
})
