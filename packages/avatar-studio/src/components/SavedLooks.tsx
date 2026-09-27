/* Saved looks: extractOutfit / applyOutfit through the host's OutfitStore (localStorage by
 * default). Each look is previewed on the current avatar. */

import { memo, useEffect, useState } from 'react'
import { applyOutfit, extractOutfit, hashString, type Outfit } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { fmt } from '../strings.ts'
import { useActions, useEnv, useStrings, useThumbBase } from './context.ts'
import { Icon } from './Icon.tsx'
import { rovingKeyDown } from './roving.ts'
import { Thumb } from './Thumb.tsx'

type Look = Outfit & { id: string }

export const SavedLooks = memo(function SavedLooks({ idBase }: { idBase: string }) {
  const s = useStrings()
  const a = useActions()
  const env = useEnv()
  const thumbs = useThumbBase()
  const [looks, setLooks] = useState<Look[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    env.outfitStore
      .list()
      .then((l) => live && setLooks(l))
      .catch(() => {
        if (!live) return
        setLooks([])
        setError(s.outfitLoadFailed)
      })
    return () => {
      live = false
    }
  }, [env.outfitStore, s.outfitLoadFailed])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const label = name.trim() || fmt(s.outfitDefaultName, { n: (looks?.length ?? 0) + 1 })
      const rec = await env.outfitStore.save(extractOutfit(a.current(), label.slice(0, 40)))
      setLooks((l) => [rec, ...(l ?? [])])
      setName('')
      a.announce(s.outfitSaved)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setConfirm(null)
    try {
      await env.outfitStore.remove(id)
      setLooks((l) => (l ?? []).filter((x) => x.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const tall = thumbs.dna.kind === 'humanoid'
  const titleId = `${idBase}-looks-title`
  const inputId = `${idBase}-looks-name`
  return (
    <section className="aps-card" aria-labelledby={titleId}>
      <header className="aps-card__head">
        <div>
          <h3 className="aps-card__title" id={titleId}>
            {s.outfits}
          </h3>
          <p className="aps-card__sub">{s.outfitsHelp}</p>
        </div>
      </header>
      <div className="aps-card__body">
        <form
          className="aps-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="aps-sr" htmlFor={inputId}>
            {s.outfitName}
          </label>
          <input id={inputId} className="aps-input" value={name} maxLength={40} placeholder={s.outfitName} onChange={(e) => setName(e.currentTarget.value)} />
          <button type="submit" className="aps-btn aps-btn--quiet" disabled={busy}>
            <Icon name="plus" size={16} />
            {s.outfitSave}
          </button>
        </form>
        {error && (
          <p className="aps-notice aps-notice--error" role="alert">
            {error}
          </p>
        )}
        {looks && looks.length === 0 && !error && <p className="aps-empty">{s.outfitEmpty}</p>}
        {looks && looks.length > 0 && (
          <ul className={`aps-tiles aps-tiles--looks${tall ? ' aps-tiles--tall' : ''}`} onKeyDown={(e) => rovingKeyDown(e, { selector: '.aps-tile', select: false, grid: true })}>
            {looks.map((o, i) => {
              const key = hashString(JSON.stringify([o.outfit, o.accessories.map((x) => [x.id, x.params])])).toString(36)
              return (
                <li key={o.id} className="aps-look">
                  <button type="button" className="aps-tile" tabIndex={i === 0 ? 0 : -1} title={fmt(s.outfitWear, { name: o.name })} onClick={() => a.wearOutfit(o)}>
                    <Thumb
                      tkey={`${thumbs.key}|look:${key}|${tall ? 't' : 'f'}`}
                      make={() => ({ dna: applyOutfit(thumbs.dna, o), crop: tall ? 'tall' : 'full', idPrefix: nextIdPrefix('t'), assets: thumbs.assets })}
                      className="aps-tile__img"
                    />
                    <span className="aps-tile__label">{o.name}</span>
                  </button>
                  {confirm === o.id ? (
                    <button type="button" className="aps-look__del is-confirm" onClick={() => void remove(o.id)} onBlur={() => setConfirm(null)} autoFocus>
                      {fmt(s.outfitDeleteConfirm, { name: o.name })}
                    </button>
                  ) : (
                    <button type="button" className="aps-look__del" onClick={() => setConfirm(o.id)} aria-label={fmt(s.outfitDelete, { name: o.name })} title={fmt(s.outfitDelete, { name: o.name })}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
})
