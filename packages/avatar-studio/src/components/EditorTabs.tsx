/* Name + kind, the tab list (a bottom bar on phones) and the jump links for long tabs. */

import { memo, useEffect, useRef } from 'react'
import type { AvatarKind, SectionSpec } from '@arkplay/avatar-engine'
import type { StudioTabId, TabModel } from '../state/tabs.ts'
import { useActions, useStrings } from './context.ts'
import { Icon, type IconName } from './Icon.tsx'
import { rovingIndex, rovingKeyDown } from './roving.ts'

const TAB_ICON: Record<StudioTabId, IconName> = {
  species: 'paw',
  body: 'body',
  face: 'face',
  skin: 'drop',
  hair: 'hair',
  outfit: 'shirt',
  accessories: 'glasses',
  limbs: 'wing',
  coat: 'palette',
  expression: 'smile',
  scene: 'image',
  style: 'brush',
  remix: 'shuffle',
  about: 'info',
}

export const Identity = memo(function Identity({ name, kind, kinds, idBase }: { name: string; kind: AvatarKind; kinds: AvatarKind[]; idBase: string }) {
  const s = useStrings()
  const a = useActions()
  const kindId = `${idBase}-kind`
  return (
    <div className="aps-identity">
      <label className="aps-name">
        <span className="aps-field__label">{s.name}</span>
        <input className="aps-input aps-name__input" value={name} maxLength={40} placeholder={s.namePlaceholder} autoComplete="off" onChange={(e) => a.setName(e.currentTarget.value)} onBlur={a.seal} />
      </label>
      {kinds.length > 1 && (
        <div className="aps-kind">
          <span className="aps-field__label" id={kindId}>
            {s.kind}
          </span>
          <div role="radiogroup" aria-labelledby={kindId} className="aps-seg" onKeyDown={(e) => rovingKeyDown(e)}>
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={k === kind} tabIndex={k === kind ? 0 : -1} className="aps-seg__btn" onClick={() => a.setKind(k)}>
                <Icon name={k === 'humanoid' ? 'body' : 'paw'} size={16} />
                {s[`kind_${k}`]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export const TabBar = memo(function TabBar({ tabs, active, onPick, idBase }: { tabs: TabModel[]; active: StudioTabId; onPick: (id: StudioTabId) => void; idBase: string }) {
  const s = useStrings()
  const ref = useRef<HTMLDivElement>(null)
  // Keep the selected tab visible in the scrolling strip (horizontally only: scrollIntoView
  // could also scroll the host page).
  useEffect(() => {
    const strip = ref.current
    const el = strip?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!strip || !el) return
    const left = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft
    if (left < strip.scrollLeft) strip.scrollLeft = left - 8
    else if (left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + el.offsetWidth - strip.clientWidth + 8
  }, [active])
  const any = tabs.some((t) => t.id === active)
  return (
    <div className="aps-tabs" ref={ref} role="tablist" aria-label={s.tabs} onKeyDown={(e) => rovingKeyDown(e, { selector: '[role="tab"]' })}>
      {tabs.map((t, i) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={rovingIndex(on, i, any)}
            className="aps-tab"
            onClick={() => onPick(t.id)}
          >
            <Icon name={TAB_ICON[t.id]} size={20} />
            <span className="aps-tab__label">{s[`tab_${t.id}`]}</span>
          </button>
        )
      })}
    </div>
  )
})

export function JumpNav({ sections, idBase, reducedMotion }: { sections: SectionSpec[]; idBase: string; reducedMotion: boolean }) {
  const s = useStrings()
  return (
    <nav className="aps-jump" aria-label={s.jumpTo}>
      {sections.map((sec) => (
        <button
          key={sec.id}
          type="button"
          className="aps-chip aps-chip--quiet"
          onClick={() => {
            const el = document.getElementById(`${idBase}-sec-${sec.id}`)
            el?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
            el?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
          }}
        >
          {sec.label}
        </button>
      ))}
    </nav>
  )
}
