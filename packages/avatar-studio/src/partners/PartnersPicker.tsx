/* The Partners picker (Accessories tab): published items from ArkPlay creator partners,
 * grouped by brand, tried on with one click as ordinary custom accessories.
 *
 * Premium-core safe: the tiles are the service's own previews of each item on a sample avatar
 * (`previewUrl`), so nothing here draws partner art; wearing an item only adds a `custom`
 * ItemRef with the published asset id, which the studio's preview resolves through the host's
 * `assetUrl` like any uploaded art (or its own placeholder rules). Off unless the host passes
 * `partners` (no request is made before that), and hidden without custom art. */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { AvatarDNA } from '@arkplay/avatar-engine'
import { useActions, useStrings } from '../components/context.ts'
import { rovingKeyDown } from '../components/roving.ts'
import { promoDate } from '../state/tiers.ts'
import { fmt } from '../strings.ts'
import { DEFAULT_CATALOG_URL, groupByBrand, loadPartnerCatalog, partnerBadge, resolveUrl, serviceBase, wornIndex } from './catalog.ts'
import { PARTNER_STRINGS } from './strings.ts'
import type { StudioPartnerCatalog, StudioPartnersOptions } from './types.ts'

export interface PartnersPickerProps {
  /** The host's `partners` prop: undefined/false = no picker, no request. */
  option: StudioPartnersOptions | false | undefined
  /** The host allows custom art (partner items are custom accessories). */
  customArt: boolean
  dna: AvatarDNA
  idBase: string
}

export const PartnersPicker = memo(function PartnersPicker({ option, customArt, dna, idBase }: PartnersPickerProps) {
  const on = !!option && customArt
  const s = useStrings()
  const a = useActions()
  const p = PARTNER_STRINGS
  const [catalog, setCatalog] = useState<StudioPartnerCatalog | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const [brand, setBrand] = useState<string>('all')
  // Hosts may pass a fresh options object on every render: load per catalog URL, not per object.
  const optionRef = useRef(option)
  optionRef.current = option
  const catalogUrl = option ? (option.catalogUrl ?? DEFAULT_CATALOG_URL) : null

  useEffect(() => {
    const o = optionRef.current
    if (!on || !o || !catalogUrl) return
    let live = true
    setFailed(false)
    loadPartnerCatalog(o)
      .then((c) => live && setCatalog(c))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [on, catalogUrl, tick])

  const groups = useMemo(() => (catalog ? groupByBrand(catalog) : []), [catalog])
  if (!on || !option) return null
  // Nothing published yet: stay out of the way.
  if (catalog && groups.length === 0) return null

  const base = serviceBase(option)
  const now = Date.now()
  const shown = brand === 'all' ? groups : groups.filter((g) => g.id === brand)
  const anyNote = groups.some((g) => g.items.some((i) => partnerBadge(i, s, now)?.note))
  const titleId = `${idBase}-partners`

  return (
    <section className="aps-card" aria-labelledby={titleId} aria-busy={!catalog && !failed}>
      <header className="aps-card__head">
        <h3 className="aps-card__title" id={titleId}>
          {p.title}
        </h3>
        <p className="aps-card__sub">{p.sub}</p>
      </header>
      <div className="aps-card__body">
        {failed && (
          <p className="aps-notice aps-notice--error" role="alert">
            {p.failed}{' '}
            <button type="button" className="aps-linkbtn" onClick={() => setTick((t) => t + 1)}>
              {p.retry}
            </button>
          </p>
        )}
        {!catalog && !failed && <p className="aps-help">{p.loading}</p>}
        {catalog && groups.length > 1 && (
          <div className="aps-slotbar" role="group" aria-label={p.title} onKeyDown={(e) => rovingKeyDown(e, { selector: 'button', select: false })}>
            {[{ id: 'all', name: p.all }, ...groups].map((g, i) => (
              <button key={g.id} type="button" className="aps-chip aps-slot" aria-pressed={brand === g.id} tabIndex={brand === g.id || (i === 0 && brand === 'all') ? 0 : -1} onClick={() => setBrand(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        )}
        {anyNote && <p className="aps-tier-legend">{fmt(s.tierLegend, { date: promoDate() })}</p>}
        {shown.map((g) => (
          <div key={g.id} className="aps-partners__brand">
            {shown.length > 1 && <h4 className="aps-help">{g.name}</h4>}
            <div className="aps-tiles aps-tiles--tall" role="group" aria-label={g.name} onKeyDown={(e) => rovingKeyDown(e, { selector: '.aps-tile', select: false, grid: true })}>
              {g.items.map((it, i) => {
                const idx = wornIndex(dna, it)
                const worn = idx >= 0
                const badge = partnerBadge(it, s, now)
                const label = fmt(worn ? p.takeOff : p.wear, { item: it.name, brand: it.brand })
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={`aps-tile${badge ? ` aps-tile--${badge.tier}` : ''}`}
                    aria-pressed={worn}
                    tabIndex={i === 0 ? 0 : -1}
                    title={badge ? `${label}. ${badge.full}` : label}
                    aria-label={badge ? `${label}. ${badge.full}` : label}
                    onClick={() => (worn ? a.removeItem('accessories', idx) : a.addItem('custom', it.item.params, it.item.asset))}
                  >
                    <img className="aps-tile__img aps-thumb" src={resolveUrl(base, it.previewUrl)} alt="" loading="lazy" decoding="async" />
                    {badge && (
                      <span className={`aps-tier aps-tier--${badge.tier} aps-tile__tier`} aria-hidden="true">
                        {badge.short}
                      </span>
                    )}
                    <span className="aps-tile__label" aria-hidden="true">
                      {it.name}
                    </span>
                    <span className="aps-tile__note" aria-hidden="true">
                      {badge?.note || it.brand}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {option.programmeUrl && (
          <p className="aps-help">
            <a href={option.programmeUrl}>{p.becomePartner}</a>
          </p>
        )}
      </div>
    </section>
  )
})
