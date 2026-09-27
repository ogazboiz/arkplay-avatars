/* The wardrobe for one tab (garments or accessories): what's worn, a slot picker with
 * capacity counts, and every catalogue item for the slot previewed on this avatar. The
 * custom slot swaps the grid for the art uploader. PRO, limited and NFT items carry a badge
 * (state/tiers.ts); during the launch promo every one of them is free to wear. */

import { memo, useState } from 'react'
import { ACCESSORIES, GARMENTS, addItem, baseItemId, isPremiumArt, itemSpec, type AvatarKind, type ItemRef, type SlotId, type SlotSpec } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { slotCrop } from '../state/slotCrop.ts'
import { featureBadge, itemBadge, itemTierHint, promoDate } from '../state/tiers.ts'
import { fmt } from '../strings.ts'
import { useActions, useEnv, useStrings, useThumbBase, type ItemList } from './context.ts'
import { CustomUpload } from './CustomUpload.tsx'
import { Icon } from './Icon.tsx'
import { rovingKeyDown } from './roving.ts'
import { SavedLooks } from './SavedLooks.tsx'
import { ServiceThumb, Thumb } from './Thumb.tsx'
import { WornList } from './WornList.tsx'

export interface WardrobeProps {
  list: ItemList
  slots: SlotSpec[]
  items: ItemRef[]
  kind: AvatarKind
  locked: boolean
  showLooks: boolean
  idBase: string
}

export const Wardrobe = memo(function Wardrobe({ list, slots, items, kind, locked, showLooks, idBase }: WardrobeProps) {
  const s = useStrings()
  const [slotId, setSlotId] = useState<SlotId>(slots[0]?.id ?? 'head')
  const slot = slots.find((x) => x.id === slotId) ?? slots[0]
  const count = (id: SlotId) => items.filter((i) => itemSpec(i.id)?.slot === id).length
  const titleId = `${idBase}-${list}-slots`
  if (!slot) return null
  return (
    <>
      <WornList list={list} items={items} idBase={idBase} locked={locked} title={s.wearing} />
      <section className="aps-card" aria-labelledby={titleId}>
        <header className="aps-card__head">
          <h3 className="aps-card__title" id={titleId}>
            {list === 'outfit' ? s.outfitSection : s.accessoriesSection}
          </h3>
        </header>
        <div className="aps-card__body">
          <div className="aps-slotbar" role="group" aria-labelledby={titleId} onKeyDown={(e) => rovingKeyDown(e, { selector: 'button', select: false })}>
            {slots.map((sl, i) => {
              const n = count(sl.id)
              const on = sl.id === slot.id
              return (
                <button
                  key={sl.id}
                  type="button"
                  className={`aps-chip aps-slot${n ? ' has-items' : ''}`}
                  aria-pressed={on}
                  tabIndex={on || (i === 0 && !slots.some((x) => x.id === slot.id)) ? 0 : -1}
                  onClick={() => setSlotId(sl.id)}
                  aria-label={fmt(s.slotLabel, { slot: sl.label, count: n, capacity: sl.capacity })}
                >
                  {sl.label}
                  {n > 0 && <span className="aps-slot__count">{sl.capacity > 1 ? `${n}/${sl.capacity}` : n}</span>}
                </button>
              )
            })}
          </div>
          {slot.id === 'custom' ? (
            <>
              <TierNote badge={featureBadge('custom-uploads', s)} />
              <CustomUpload count={count('custom')} max={slot.capacity} idBase={idBase} />
            </>
          ) : (
            <ItemGrid list={list} slot={slot} items={items} kind={kind} />
          )}
        </div>
      </section>
      {showLooks && <SavedLooks idBase={idBase} />}
    </>
  )
})

function ItemGrid({ list, slot, items, kind }: { list: ItemList; slot: SlotSpec; items: ItemRef[]; kind: AvatarKind }) {
  const s = useStrings()
  const a = useActions()
  const thumbs = useThumbBase()
  const premium = useEnv().premium // premium core (G): the service draws premium tiles
  const pool = (list === 'outfit' ? GARMENTS : ACCESSORIES).filter((it) => it.slot === slot.id && it.kinds.includes(kind))
  const worn = items.filter((i) => itemSpec(i.id)?.slot === slot.id)
  const full = worn.length >= slot.capacity
  const crop = slotCrop(slot.id, kind)
  const oldest = worn[0] ? itemSpec(worn[0].id)?.label : undefined
  const now = Date.now()
  const anyBadge = pool.some((it) => itemBadge(it.id, s, now)?.note)
  return (
    <>
    {anyBadge && <p className="aps-tier-legend">{fmt(s.tierLegend, { date: promoDate() })}</p>}
    <div className={`aps-tiles${crop === 'tall' ? ' aps-tiles--tall' : ''}`} role="group" aria-label={slot.label} onKeyDown={(e) => rovingKeyDown(e, { selector: '.aps-tile', select: false, grid: true })}>
      <button type="button" className="aps-tile aps-tile--none" aria-pressed={worn.length === 0} tabIndex={0} onClick={() => a.removeSlot(list, slot.id)} title={s.none}>
        <span className="aps-tile__img aps-thumb aps-tile__noneart" aria-hidden="true">
          <Icon name="close" size={28} />
        </span>
        <span className="aps-tile__label">{s.none}</span>
      </button>
      {pool.map((it) => {
        const idx = items.findIndex((x) => x.id === it.id)
        const on = idx >= 0
        const action = on ? fmt(s.unequip, { item: it.label }) : full && oldest ? `${fmt(s.equip, { item: it.label })}. ${fmt(s.slotFullHint, { item: oldest })}` : fmt(s.equip, { item: it.label })
        const badge = itemBadge(it.id, s, now)
        const hint = badge ? `${action}. ${itemTierHint(it.id, it.label, s, now)}` : action
        return (
          <button
            key={it.id}
            type="button"
            className={`aps-tile${badge ? ` aps-tile--${badge.tier}` : ''}`}
            aria-pressed={on}
            tabIndex={-1}
            title={hint}
            aria-label={hint}
            onClick={() => (on ? a.removeItem(list, idx) : a.addItem(it.id))}
          >
            {(() => {
              const local = (
                <Thumb
                  tkey={`${thumbs.key}|it:${it.id}|${crop}`}
                  // Decide from the thumbnail's own base (it lags the live avatar by a moment).
                  make={() => ({ dna: thumbs.dna[list].some((x) => x.id === it.id) ? thumbs.dna : addItem(thumbs.dna, it.id), crop, idPrefix: nextIdPrefix('t'), assets: thumbs.assets })}
                  priority={on ? 1 : 0}
                  className="aps-tile__img"
                />
              )
              // premium core (G): browsers have no premium art; the service draws the item.
              return premium && isPremiumArt(baseItemId(it.id)) ? <ServiceThumb src={premium.itemThumbUrl(it.id, kind)} className="aps-tile__img" fallback={local} /> : local
            })()}
            {badge && (
              <span className={`aps-tier aps-tier--${badge.tier} aps-tile__tier`} aria-hidden="true">
                {badge.short}
              </span>
            )}
            <span className="aps-tile__label" aria-hidden="true">
              {it.label}
            </span>
            {badge?.note && (
              <span className="aps-tile__note" aria-hidden="true">
                {badge.note}
              </span>
            )}
          </button>
        )
      })}
    </div>
    </>
  )
}

/** A full-width "PRO · Free until 7 Oct" line above a paid feature (custom uploads). */
function TierNote({ badge }: { badge: ReturnType<typeof featureBadge> }) {
  if (!badge) return null
  return (
    <p className="aps-tier-legend">
      <span className={`aps-tier aps-tier--${badge.tier}`}>{badge.full}</span>
    </p>
  )
}
