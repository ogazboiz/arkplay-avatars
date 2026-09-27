/* Remix: themed randomize (with the lock summary), variations, breeding with a partner,
 * morphing towards the partner, and re-rolling the small procedural details. */

import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { THEMES, crossover, freshSeed, interpolate, randomDNA, variations, type AvatarDNA } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { dnaKey } from '../render/keys.ts'
import { parseAvatarInput } from '../state/share.ts'
import { fmt } from '../strings.ts'
import { useActions, useStrings, useThumbBase } from './context.ts'
import { Icon } from './Icon.tsx'
import { rovingIndex, rovingKeyDown } from './roving.ts'
import { Thumb } from './Thumb.tsx'
import { STRENGTH, lockLabel, type RemixState } from './remixState.ts'

export interface RemixPanelProps {
  kind: AvatarDNA['kind']
  locks: string[]
  theme: string
  setTheme: (id: string) => void
  remix: RemixState
  setRemix: Dispatch<SetStateAction<RemixState>>
  idBase: string
}

export function RemixPanel({ kind, locks, theme, setTheme, remix, setRemix, idBase }: RemixPanelProps) {
  const s = useStrings()
  const a = useActions()
  const thumbs = useThumbBase()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)

  const rollPartner = () => setRemix((r) => ({ ...r, partner: randomDNA({ seed: freshSeed(), kind, theme }), morphFrom: null, morphT: 0, breedSeed: freshSeed() }))

  // Keep a partner of the current kind around (breeding and morphing need one).
  const partner = remix.partner
  useEffect(() => {
    if (!partner || partner.kind !== kind) setRemix((r) => ({ ...r, partner: randomDNA({ seed: freshSeed(), kind, theme }), morphFrom: null, morphT: 0 }))
  }, [partner, kind, theme, setRemix])

  const strength = STRENGTH[remix.strength]
  const vars = useMemo(() => variations(thumbs.dna, 8, strength, remix.varSeed), [thumbs.dna, strength, remix.varSeed])
  const partnerKey = partner ? dnaKey(partner) : ''
  const kids = useMemo(() => (partner ? Array.from({ length: 6 }, (_, i) => crossover(thumbs.dna, partner, remix.breedSeed + i)) : []), [thumbs.dna, partner, remix.breedSeed])
  const morphFrom = remix.morphFrom
  // Humanoids are tall and thin: a 3:4 whole-body frame shows them bigger.
  const body = kind === 'humanoid' ? 'tall' : 'full'
  const tilesCls = `aps-tiles aps-tiles--big${kind === 'humanoid' ? ' aps-tiles--tall' : ''}`
  const sameKind = !!partner && partner.kind === kind && (!morphFrom || morphFrom.kind === kind)

  function morphTo(t: number) {
    if (!partner) return
    const from = morphFrom ?? a.current()
    setRemix((r) => ({ ...r, morphFrom: from, morphT: t }))
    a.edit(s.h_morph, () => interpolate(from, partner, t), 'morph')
  }

  function usePartnerCode() {
    const r = parseAvatarInput(code)
    if (!r.ok) {
      setCodeError(r.error === 'empty' ? s.importEmpty : r.error === 'badJson' ? fmt(s.importBadJson, { message: r.message }) : r.error === 'badCode' ? r.message : s.importNotAvatar)
      return
    }
    setCodeError(null)
    setCode('')
    setCodeOpen(false)
    setRemix((x) => ({ ...x, partner: r.dna, morphFrom: null, morphT: 0 }))
  }

  const themeId = `${idBase}-remix-theme`
  const strengthId = `${idBase}-remix-strength`
  const morphId = `${idBase}-remix-morph`
  const anyTheme = THEMES.some((t) => t.id === theme)
  return (
    <>
      <section className="aps-card aps-card--hero" aria-labelledby={`${idBase}-remix-rand`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-remix-rand`}>
              {s.remixRandom}
            </h3>
            <p className="aps-card__sub">{s.remixRandomHelp}</p>
          </div>
        </header>
        <div className="aps-card__body">
          <span className="aps-field__label" id={themeId}>
            {s.theme}
          </span>
          <div role="radiogroup" aria-labelledby={themeId} className="aps-chips" onKeyDown={(e) => rovingKeyDown(e)}>
            {THEMES.map((t, i) => (
              <button key={t.id} type="button" role="radio" aria-checked={t.id === theme} tabIndex={rovingIndex(t.id === theme, i, anyTheme)} className="aps-chip" onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="aps-btn aps-btn--primary aps-btn--block" onClick={a.randomize}>
            <Icon name="dice" />
            {s.randomize}
          </button>
          <div className="aps-locks">
            {locks.length ? (
              <>
                <span>
                  <Icon name="lock" size={14} /> {fmt(s.lockedList, { list: locks.map((l) => lockLabel(l, s)).join(', ') })}
                </span>
                <button type="button" className="aps-linkbtn" onClick={() => a.setLocks([])}>
                  {s.unlockAll}
                </button>
              </>
            ) : (
              <span className="aps-help">{s.noLocks}</span>
            )}
          </div>
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-remix-var`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-remix-var`}>
              {s.variations}
            </h3>
            <p className="aps-card__sub">{s.variationsHelp}</p>
          </div>
          <div className="aps-card__actions">
            <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" onClick={() => setRemix((r) => ({ ...r, varSeed: freshSeed() }))}>
              <Icon name="shuffle" size={16} />
              {s.shuffle}
            </button>
          </div>
        </header>
        <div className="aps-card__body">
          <span className="aps-field__label" id={strengthId}>
            {s.strength}
          </span>
          <div role="radiogroup" aria-labelledby={strengthId} className="aps-seg aps-seg--fill" onKeyDown={(e) => rovingKeyDown(e)}>
            {(['subtle', 'medium', 'wild'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={remix.strength === k} tabIndex={remix.strength === k ? 0 : -1} className="aps-seg__btn" onClick={() => setRemix((r) => ({ ...r, strength: k }))}>
                {s[`strength_${k}`]}
              </button>
            ))}
          </div>
          <div className={tilesCls} role="group" aria-label={s.variations} onKeyDown={(e) => rovingKeyDown(e, { selector: '.aps-tile', select: false, grid: true })}>
            {vars.map((v, i) => (
              <button key={i} type="button" className="aps-tile" tabIndex={i === 0 ? 0 : -1} onClick={() => a.load(v, s.h_variation)} aria-label={fmt(s.useVariation, { n: i + 1 })} title={fmt(s.useVariation, { n: i + 1 })}>
                <Thumb tkey={`${thumbs.key}|${body}|var:${remix.strength}:${remix.varSeed}:${i}`} make={() => ({ dna: v, crop: body, idPrefix: nextIdPrefix('t'), assets: thumbs.assets })} className="aps-tile__img" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-remix-breed`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-remix-breed`}>
              {s.breed}
            </h3>
            <p className="aps-card__sub">{s.breedHelp}</p>
          </div>
        </header>
        <div className="aps-card__body">
          <div className={`aps-parents${kind === 'humanoid' ? ' aps-parents--tall' : ''}`}>
            <figure className="aps-parent">
              <Thumb tkey={`${thumbs.key}|${body}|parent`} make={() => ({ dna: thumbs.dna, crop: body, idPrefix: nextIdPrefix('t'), assets: thumbs.assets })} className="aps-parent__img" />
              <figcaption>{s.you}</figcaption>
            </figure>
            <span className="aps-parents__x" aria-hidden="true">
              ×
            </span>
            <figure className="aps-parent">
              {partner && <Thumb tkey={`partner:${partnerKey}|${body}`} make={() => ({ dna: partner, crop: body, idPrefix: nextIdPrefix('t') })} className="aps-parent__img" />}
              <figcaption>{s.partner}</figcaption>
            </figure>
            <div className="aps-parents__actions">
              <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" onClick={rollPartner}>
                <Icon name="dice" size={16} />
                {s.rollPartner}
              </button>
              <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" aria-expanded={codeOpen} onClick={() => setCodeOpen((o) => !o)}>
                <Icon name="link" size={16} />
                {s.partnerFromCode}
              </button>
            </div>
          </div>
          {codeOpen && (
            <form
              className="aps-inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                usePartnerCode()
              }}
            >
              <label className="aps-sr" htmlFor={`${idBase}-partner-code`}>
                {s.partnerCodeLabel}
              </label>
              <input id={`${idBase}-partner-code`} className="aps-input aps-input--mono" value={code} placeholder={s.partnerCodeLabel} onChange={(e) => setCode(e.currentTarget.value)} />
              <button type="submit" className="aps-btn aps-btn--quiet">
                {s.partnerSet}
              </button>
            </form>
          )}
          {codeError && (
            <p className="aps-notice aps-notice--error" role="alert">
              {codeError}
            </p>
          )}
          <div className="aps-field__row">
            <span className="aps-field__label">{s.children}</span>
            <button type="button" className="aps-linkbtn" onClick={() => setRemix((r) => ({ ...r, breedSeed: freshSeed() }))}>
              {s.shuffle}
            </button>
          </div>
          <div className={tilesCls} role="group" aria-label={s.children} onKeyDown={(e) => rovingKeyDown(e, { selector: '.aps-tile', select: false, grid: true })}>
            {kids.map((k, i) => (
              <button key={i} type="button" className="aps-tile" tabIndex={i === 0 ? 0 : -1} onClick={() => a.load(k, s.h_child)} aria-label={fmt(s.useChild, { n: i + 1 })} title={fmt(s.useChild, { n: i + 1 })}>
                <Thumb tkey={`${thumbs.key}|${body}|child:${partnerKey}:${remix.breedSeed}:${i}`} make={() => ({ dna: k, crop: body, idPrefix: nextIdPrefix('t'), assets: thumbs.assets })} className="aps-tile__img" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-remix-morph`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-remix-morph`}>
              {s.morph}
            </h3>
            <p className="aps-card__sub">{s.morphHelp}</p>
          </div>
          {morphFrom && (
            <div className="aps-card__actions">
              <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" onClick={() => setRemix((r) => ({ ...r, morphFrom: null, morphT: 0 }))}>
                {s.morphRestart}
              </button>
            </div>
          )}
        </header>
        <div className="aps-card__body">
          {sameKind ? (
            <div className="aps-morph">
              <label className="aps-sr" htmlFor={morphId}>
                {s.morphAmount}
              </label>
              <span className="aps-morph__end">{s.you}</span>
              <input
                id={morphId}
                className="aps-range__input"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={remix.morphT}
                style={{ '--aps-pct': `${remix.morphT * 100}%` } as CSSProperties}
                aria-valuetext={`${Math.round(remix.morphT * 100)}%`}
                onChange={(e) => morphTo(Number(e.currentTarget.value))}
                onPointerUp={a.seal}
                onKeyUp={a.seal}
                onBlur={a.seal}
              />
              <span className="aps-morph__end">{s.partner}</span>
            </div>
          ) : (
            <p className="aps-help">{s.morphKindMismatch}</p>
          )}
        </div>
      </section>

      <section className="aps-card" aria-labelledby={`${idBase}-remix-seed`}>
        <header className="aps-card__head">
          <div>
            <h3 className="aps-card__title" id={`${idBase}-remix-seed`}>
              {s.details}
            </h3>
            <p className="aps-card__sub">{s.detailsHelp}</p>
          </div>
          <div className="aps-card__actions">
            <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" onClick={a.shuffleSeed}>
              <Icon name="sparkle" size={16} />
              {s.shuffleDetails}
            </button>
          </div>
        </header>
      </section>
    </>
  )
}
