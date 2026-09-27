/* <AvatarStudio>: the whole creator. Layout (two panes, stacked on tablets, preview on top
 * with a bottom tab bar on phones) is CSS; this file wires state, contexts and panels. */

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { canRedo, canUndo, timeline, type HistoryEntry } from './state/history.ts'
import { crossSectionKey, lookupIn } from './state/params.ts'
import { resolveAvatar } from './state/share.ts'
import { sharedPool } from './render/pool.ts'
import { localOutfitStore } from './state/storage.ts'
import { tabsFor, type StudioTabId, type TabModel } from './state/tabs.ts'
import { fmt, mergeStrings } from './strings.ts'
import type { AvatarStudioProps } from './types.ts'
import { AboutPanel } from './components/AboutPanel.tsx'
import { ActionsContext, EnvContext, StringsContext, ThumbContext, type StudioEnv } from './components/context.ts'
import { Identity, JumpNav, TabBar } from './components/EditorTabs.tsx'
import { ExportDialog } from './components/ExportDialog.tsx'
import { Icon } from './components/Icon.tsx'
import { PhotoDialog } from './components/PhotoDialog.tsx'
import { Preview } from './components/Preview.tsx'
import { initialPreview, type PreviewOpts } from './components/previewOpts.ts'
import { RemixPanel } from './components/RemixPanel.tsx'
import { initialRemix, type RemixState } from './components/remixState.ts'
import { SectionCard } from './components/SectionCard.tsx'
import { ShareDialog } from './components/ShareDialog.tsx'
import { SpeciesPicker } from './components/SpeciesPicker.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { useStudio } from './components/useStudio.ts'
import { Wardrobe } from './components/Wardrobe.tsx'
import { premiumService } from './render/premium.ts' // premium core (G)
import { serverTilePool } from './render/serverTiles.ts' // server rendering: tiles from the service
import { createThumbService } from './render/thumbs.ts'
import { TelemetryContext, useStudioTelemetry, useTelemetryView } from './telemetry/react.ts' // studio telemetry (F)
import { PartnersPicker } from './partners/PartnersPicker.tsx' // creator partners (H)
import type { AvatarDNA, Params } from '@arkplay/avatar-engine'

const EMPTY: Params = {}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

const defaultShareUrl = (code: string) => (typeof location === 'undefined' ? `#code=${code}` : `${location.origin}${location.pathname}#code=${code}`)

export function AvatarStudio(props: AvatarStudioProps) {
  const s = useMemo(() => mergeStrings(props.strings), [props.strings])
  const rootRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const idBase = `aps${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const tel = useStudioTelemetry(props, s) // studio telemetry (F): session + save results; no-op without onTelemetry
  const ctl = tel.wrap(useStudio(tel.props, s, rootRef)) // studio telemetry (F): instrumented actions + theme
  const { state, actions } = ctl
  const dna = state.history.present
  const reducedMotion = useReducedMotion()
  const [preview, setPreviewState] = useState<PreviewOpts>(() => initialPreview(prefersReducedMotion()))
  const setPreview = useCallback((fn: (o: PreviewOpts) => PreviewOpts) => setPreviewState(fn), [])
  const [remix, setRemix] = useState<RemixState>(initialRemix)
  const [dialog, setDialog] = useState<'share' | 'export' | 'photo' | null>(null)
  const tabs = useMemo(() => tabsFor(dna.kind), [dna.kind])
  const [tabId, setTabId] = useState<StudioTabId>(() => tabs[0].id)
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]
  useTelemetryView(tel.track, { tab: tab.id, preview, dialog, history: state.history }) // studio telemetry (F)

  const fallbackStore = useMemo(() => localOutfitStore(), [])
  // premium core (G): the service draws premium looks when the host names it.
  const premium = useMemo(() => (props.previewBase ? premiumService(props.previewBase, props.previewFetch) : undefined), [props.previewBase, props.previewFetch])
  // Server rendering: picker tiles come from the avatar service, batched (render/serverTiles.ts).
  const serverStudio = !!premium && props.serverStudio === true
  const tilePool = useMemo(() => (serverStudio && premium ? serverTilePool(premium) : undefined), [serverStudio, premium])
  const thumbs = useMemo(() => (tilePool ? createThumbService(tilePool) : undefined), [tilePool])
  // No dispose on unmount: StrictMode's rehearsal unmount would kill the memoized pool, and it holds
  // nothing but a short timer (queued tiles are dropped with it).
  const env = useMemo<StudioEnv>(
    () => ({ assetUrl: props.assetUrl, uploadAsset: props.uploadAsset, outfitStore: props.outfitStore ?? fallbackStore, shareUrl: props.shareUrl ?? defaultShareUrl, premium, serverExports: !!premium && props.serverExports === true, serverStudio, serverPhoto: !!premium && props.serverPhoto === true, thumbs }),
    [props.assetUrl, props.uploadAsset, props.outfitStore, props.shareUrl, fallbackStore, premium, props.serverExports, serverStudio, props.serverPhoto, thumbs],
  )

  useImperativeHandle(
    props.ref,
    () => ({
      getDNA: () => actions.current(),
      load(avatar) {
        const r = resolveAvatar(avatar)
        if (!r.ok) return r.message
        actions.load(r.dna)
        return null
      },
      save: ctl.save,
      undo: actions.undo,
      redo: actions.redo,
      randomize: actions.randomize,
    }),
    [actions, ctl.save],
  )

  // Start the render workers while the user looks at the first tab, so the first grid of
  // thumbnails doesn't wait for them to load the engine.
  useEffect(() => {
    if (serverStudio) return // the service draws the tiles: no workers to start
    const t = setTimeout(() => sharedPool().warm(), 600)
    return () => clearTimeout(t)
  }, [serverStudio])

  const pickTab = useCallback((id: StudioTabId) => {
    setTabId(id)
    // If the page has scrolled past the panel's top, bring the new tab's start into view.
    requestAnimationFrame(() => {
      const p = panelRef.current
      if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: 'start' })
    })
  }, [])

  const h = state.history
  const theme = props.theme ?? 'dark'
  const exportsOn = props.exports !== false
  const wardrobeLooksTab = dna.kind === 'humanoid' ? 'outfit' : 'accessories'
  const onShare = useCallback(() => setDialog('share'), [])
  const onExport = useCallback(() => setDialog('export'), [])
  const photoOn = props.photo !== false && ctl.kinds.includes('humanoid')
  const photoBase = typeof props.photo === 'object' ? props.photo.modelBase : undefined
  const onPhoto = useCallback(() => setDialog('photo'), [])
  const pickFromPhoto = useCallback(
    (picked: AvatarDNA) => {
      // Keep the avatar's name; everything else comes from the photo.
      actions.load({ ...picked, name: actions.current().name }, s.h_fromPhoto)
      setDialog(null)
    },
    [actions, s],
  )
  const closeDialog = useCallback(() => setDialog(null), [])

  return (
    // studio telemetry (F): components report through useTrack() (src/telemetry)
    <TelemetryContext.Provider value={tel.track}>
    <StringsContext.Provider value={s}>
      <ActionsContext.Provider value={actions}>
        <EnvContext.Provider value={env}>
          <ThumbContext.Provider value={ctl.thumbBase}>
            <section ref={rootRef} className={`aps-root${props.className ? ` ${props.className}` : ''}`} data-theme={theme} aria-label={s.studioLabel}>
              <Toolbar
                canUndo={canUndo(h)}
                canRedo={canRedo(h)}
                undoLabel={h.presentLabel}
                redoLabel={h.future[0]?.label ?? ''}
                theme={ctl.theme}
                setTheme={ctl.setTheme}
                onShare={onShare}
                onExport={exportsOn ? onExport : undefined}
                onPhoto={photoOn ? onPhoto : undefined}
                extra={props.toolbarExtra}
                onCancel={props.onCancel}
                onSave={props.onSave ? () => void ctl.save() : undefined}
                saving={ctl.saving}
                saveLabel={props.saveLabel ?? s.save}
                status={ctl.draftSaved ? s.draftSaved : undefined}
              />
              {(ctl.notice || ctl.saveError) && (
                <div className="aps-banners">
                  {ctl.notice && (
                    <div className="aps-notice aps-notice--error aps-banner" role="alert">
                      <Icon name="warning" size={18} />
                      <span>{ctl.notice}</span>
                      <button type="button" className="aps-iconbtn aps-iconbtn--sm" onClick={ctl.dismissNotice} aria-label={s.close}>
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  )}
                  {ctl.saveError && (
                    <div className="aps-notice aps-notice--error aps-banner" role="alert">
                      <Icon name="warning" size={18} />
                      <span>{fmt(s.saveFailed, { message: ctl.saveError })}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="aps-body">
                <div className="aps-stagecol">
                  <Preview
                    dna={dna}
                    opts={preview}
                    setOpts={setPreview}
                    dragging={h.group !== null}
                    assetUrl={props.assetUrl}
                    reducedMotion={reducedMotion}
                    idBase={idBase}
                    tools={
                      <>
                        <button type="button" className="aps-iconbtn aps-iconbtn--glass" onClick={actions.undo} disabled={!canUndo(h)} aria-label={s.undo} title={s.undo}>
                          <Icon name="undo" size={17} />
                        </button>
                        <button type="button" className="aps-iconbtn aps-iconbtn--glass" onClick={actions.redo} disabled={!canRedo(h)} aria-label={s.redo} title={s.redo}>
                          <Icon name="redo" size={17} />
                        </button>
                      </>
                    }
                  />
                </div>
                <div className="aps-editor">
                  <Identity name={dna.name} kind={dna.kind} kinds={ctl.kinds} idBase={idBase} />
                  <TabBar tabs={tabs} active={tab.id} onPick={pickTab} idBase={idBase} />
                  <div className="aps-panel" role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${tab.id}`} ref={panelRef}>
                    <TabContent
                      tab={tab}
                      dna={dna}
                      locks={state.locks}
                      idBase={idBase}
                      reducedMotion={reducedMotion}
                      looksTab={wardrobeLooksTab}
                      theme={ctl.theme}
                      setTheme={ctl.setTheme}
                      remix={remix}
                      setRemix={setRemix}
                      entries={timeline(h).entries}
                      index={h.past.length}
                      customArt={props.customArt !== false}
                    />
                    {/* creator partners (H): the Partners picker, off unless the host passes `partners` */}
                    {tab.id === 'accessories' && <PartnersPicker option={props.partners} customArt={props.customArt !== false} dna={dna} idBase={idBase} />}
                  </div>
                </div>
              </div>
              <div className="aps-sr" aria-live="polite" aria-atomic="true">
                {ctl.announcement}
              </div>
              {ctl.toast && (
                <div className="aps-toast" key={ctl.toast.n}>
                  <span>{ctl.toast.text}</span>
                  {ctl.toast.action && (
                    <button
                      type="button"
                      className="aps-toast__action"
                      onClick={() => {
                        ctl.toast?.action?.run()
                        ctl.dismissToast()
                      }}
                    >
                      {ctl.toast.action.label}
                    </button>
                  )}
                </div>
              )}
              {dialog === 'share' && <ShareDialog dna={dna} onClose={closeDialog} />}
              {dialog === 'export' && exportsOn && <ExportDialog dna={dna} preview={preview} onClose={closeDialog} />}
              {dialog === 'photo' && photoOn && <PhotoDialog onClose={closeDialog} onPick={pickFromPhoto} modelBase={photoBase} idBase={idBase} />}
            </section>
          </ThumbContext.Provider>
        </EnvContext.Provider>
      </ActionsContext.Provider>
    </StringsContext.Provider>
    </TelemetryContext.Provider>
  )
}

interface TabContentProps {
  tab: TabModel
  dna: AvatarDNA
  locks: string[]
  idBase: string
  reducedMotion: boolean
  looksTab: string
  theme: string
  setTheme: (id: string) => void
  remix: RemixState
  setRemix: Dispatch<SetStateAction<RemixState>>
  entries: HistoryEntry<AvatarDNA>[]
  index: number
  /** false: no Custom art slot (and so no uploader). */
  customArt: boolean
}

function TabContent({ tab, dna, locks, idBase, reducedMotion, looksTab, theme, setTheme, remix, setRemix, entries, index, customArt }: TabContentProps) {
  if (tab.id === 'remix') return <RemixPanel kind={dna.kind} locks={locks} theme={theme} setTheme={setTheme} remix={remix} setRemix={setRemix} idBase={idBase} />
  if (tab.id === 'about') return <AboutPanel dna={dna} entries={entries} index={index} idBase={idBase} />
  const tabId = tab.id
  const lookup = lookupIn(dna)
  const list = tabId === 'outfit' ? 'outfit' : 'accessories'
  const slots = customArt ? tab.slots : tab.slots.filter((sl) => sl.id !== 'custom')
  return (
    <>
      {tab.species && <SpeciesPicker current={dna.meta?.species} idBase={idBase} />}
      {tab.sections.length >= 3 && <JumpNav sections={tab.sections} idBase={idBase} reducedMotion={reducedMotion} />}
      {tab.sections.map((sec) => (
        <SectionCard key={sec.id} section={sec} params={dna.sections[sec.id] ?? EMPTY} tab={tabId} locked={locks.includes(sec.id)} cross={crossSectionKey(sec.params, lookup)} idBase={idBase} />
      ))}
      {slots.length > 0 && (
        <Wardrobe key={list} list={list} slots={slots} items={dna[list]} kind={dna.kind} locked={locks.includes(list)} showLooks={tab.id === looksTab} idBase={idBase} />
      )}
    </>
  )
}
