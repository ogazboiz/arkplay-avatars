/* About: what's free (and what is free only until the launch promo ends), this avatar's
 * rarity, the live alt text (what screen readers hear wherever the avatar appears), the undo
 * history as a list you can jump through, and the keyboard shortcuts. */

import { memo, useMemo, useState, type ReactNode } from 'react'
import { ENGINE_VERSION_STRING, avatarRarity, describeDNA, promoActive, type AvatarDNA } from '@arkplay/avatar-engine'
import type { HistoryEntry } from '../state/history.ts'
import { freeFeatures, paidFeatures, promoDate, tierBadge } from '../state/tiers.ts'
import { fmt } from '../strings.ts'
import { useActions, useStrings } from './context.ts'
import { copyText } from './clipboard.ts'
import { Icon } from './Icon.tsx'

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export const AboutPanel = memo(function AboutPanel({ dna, entries, index, idBase }: { dna: AvatarDNA; entries: HistoryEntry<AvatarDNA>[]; index: number; idBase: string }) {
  const s = useStrings()
  const a = useActions()
  const alt = describeDNA(dna)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const mod = isMac() ? '⌘' : 'Ctrl'
  return (
    <>
      <WhatsFree dna={dna} idBase={idBase} />

      <section className="aps-card" aria-labelledby={`${idBase}-alt`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-alt`}>
              {s.altText}
            </h3>
            <p className="aps-card__sub">{s.altTextHelp}</p>
          </div>
          <div className="aps-card__actions">
            <button
              type="button"
              className="aps-btn aps-btn--quiet aps-btn--sm"
              onClick={async () => {
                const ok = await copyText(alt)
                setCopied(ok ? 'ok' : 'fail')
                a.announce(ok ? s.altCopied : s.copyFailed)
              }}
            >
              <Icon name={copied === 'ok' ? 'check' : 'copy'} size={16} />
              {copied === 'ok' ? s.copied : s.copy}
            </button>
          </div>
        </header>
        <div className="aps-card__body">
          <p className="aps-alt" aria-live="off">
            {alt}
          </p>
          {copied === 'fail' && <p className="aps-notice aps-notice--error">{s.copyFailed}</p>}
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-hist`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-hist`}>
              {s.history}
            </h3>
            <p className="aps-card__sub">{s.historyHelp}</p>
          </div>
        </header>
        <div className="aps-card__body">
          <ol className="aps-history" reversed>
            {entries
              .map((e, i) => ({ e, i }))
              .reverse()
              .map(({ e, i }) => (
                <li key={i} className={i === index ? 'is-current' : i > index ? 'is-future' : undefined}>
                  <button type="button" className="aps-history__btn" aria-current={i === index ? 'step' : undefined} onClick={() => a.jump(i)}>
                    <span className="aps-history__n">{i + 1}</span>
                    <span className="aps-history__label">{e.label}</span>
                    {i === index && <span className="aps-sr">({s.historyCurrent})</span>}
                  </button>
                </li>
              ))}
          </ol>
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-keys`}>
        <header className="aps-card__head">
          <h3 className="aps-card__title" id={`${idBase}-keys`}>
            {s.shortcuts}
          </h3>
        </header>
        <div className="aps-card__body">
          <dl className="aps-keys">
            <dt>
              <kbd>{mod}</kbd> + <kbd>Z</kbd>
            </dt>
            <dd>{s.shortcutUndo}</dd>
            <dt>
              <kbd>{mod}</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> {!isMac() && <>/ <kbd>Ctrl</kbd> + <kbd>Y</kbd></>}
            </dt>
            <dd>{s.shortcutRedo}</dd>
            <dt>
              <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
            </dt>
            <dd>{s.shortcutArrows}</dd>
          </dl>
          <p className="aps-help">
            {s.engine}: {ENGINE_VERSION_STRING}
          </p>
        </div>
      </section>
    </>
  )
})

/** "What's free": the paid features that are free for everyone during the launch promo, the
 *  limited editions, what stays free for good, and this avatar's rarity (engine: FEATURES,
 *  PROMO, avatarRarity). */
const WhatsFree = memo(function WhatsFree({ dna, idBase }: { dna: AvatarDNA; idBase: string }) {
  const s = useStrings()
  const now = Date.now()
  const active = promoActive(now)
  const date = promoDate()
  const pro = tierBadge('paid', s, now)
  const limited = tierBadge('limited', s, now)
  const rarity = useMemo(() => avatarRarity(dna), [dna])
  const tierName = (s as Record<string, string>)[`rarity_${rarity.tier}`] ?? rarity.tier
  return (
    <section className="aps-card aps-card--hero aps-free" aria-labelledby={`${idBase}-free`}>
      <header className="aps-card__head">
        <div>
          <h3 className="aps-card__title" id={`${idBase}-free`}>
            <Icon name="sparkle" size={17} />
            {s.whatsFree}
          </h3>
          <p className="aps-card__sub">{active ? fmt(s.whatsFreeHelp, { date }) : s.whatsFreeAfter}</p>
        </div>
      </header>
      <div className="aps-card__body">
        <div className={`aps-rarity aps-rarity--${rarity.tier}`}>
          <span className="aps-rarity__label">{s.rarity}</span>
          <span className="aps-rarity__value">
            <span className="aps-rarity__gem" aria-hidden="true" />
            {fmt(s.rarityValue, { tier: tierName, score: rarity.score })}
          </span>
          <p className="aps-help">{s.rarityHelp}</p>
        </div>

        <FeatureList title={active ? s.freeForNow : s.proFeatures}>
          {paidFeatures().map((f) => (
            <li key={f.id}>
              {pro && <span className={`aps-tier aps-tier--${pro.tier}`}>{pro.full}</span>}
              <strong>{f.label}</strong>
              <span>{f.description}</span>
            </li>
          ))}
          {limited && (
            <li>
              <span className={`aps-tier aps-tier--${limited.tier}`}>{limited.full}</span>
              <strong>{s.limitedItems}</strong>
              <span>{fmt(s.limitedItemsHelp, { date })}</span>
            </li>
          )}
        </FeatureList>

        <FeatureList title={s.freeForGood} free>
          {freeFeatures().map((f) => (
            <li key={f.id}>
              <Icon name="check" size={15} className="aps-free__check" />
              <strong>{f.label}</strong>
              <span>{f.description}</span>
            </li>
          ))}
        </FeatureList>
      </div>
    </section>
  )
})

function FeatureList({ title, free, children }: { title: string; free?: boolean; children: ReactNode }) {
  return (
    <div className="aps-free__group">
      <h4 className="aps-free__head">{title}</h4>
      <ul className={`aps-free__list${free ? ' aps-free__list--free' : ''}`}>{children}</ul>
    </div>
  )
}
