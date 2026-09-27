/* React wiring of studio telemetry (the one optional `onTelemetry` prop):
 *
 *   const tel = useStudioTelemetry(props, strings)                 // session + save results
 *   const ctl = tel.wrap(useStudio(tel.props, strings, rootRef))    // instrumented actions + theme
 *   useTelemetryView(tel.track, { tab, preview, dialog, history })  // tabs, previews, dialogs, undo/redo
 *   <TelemetryContext.Provider value={tel.track}>…                  // components: useTrack()
 *
 * Without `onTelemetry` everything here is a no-op and nothing is measured for sending. The
 * session: `session_start` when telemetry is on (at mount, or when the host turns it on
 * later), `session_end` with the active seconds (session.ts) at unmount or when the page goes
 * away (pagehide), whichever comes first; a page restored from the back/forward cache starts
 * a new one. */

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { StudioActions } from '../components/context.ts'
import type { History } from '../state/history.ts'
import type { StudioStrings } from '../strings.ts'
import type { AvatarStudioProps, SaveResult } from '../types.ts'
import { cleanEvent, type StudioEventName } from './events.ts'
import { historyStep, instrumentActions, type Emit, type LabelStrings } from './instrument.ts'
import { ActiveTimer } from './session.ts'

const NOOP: Emit = () => {}

/** The studio's tracker for components (ExportDialog, ShareDialog): `useTrack()('export', 'png')`. */
export const TelemetryContext = createContext<Emit>(NOOP)
export const useTrack = (): Emit => useContext(TelemetryContext)

interface Wrappable {
  actions: StudioActions
  setTheme: (id: string) => void
  state: { history: History<{ kind: string }> }
}

export interface StudioTelemetry {
  /** The host props with `onSave` wrapped to report the result. */
  props: AvatarStudioProps
  /** The controller with instrumented actions and theme (same object shape). */
  wrap: <C extends Wrappable>(ctl: C) => C
  /** Stable; a no-op while the host passes no `onTelemetry`. */
  track: Emit
}

const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export function useStudioTelemetry(props: AvatarStudioProps, s: StudioStrings): StudioTelemetry {
  const sink = useRef(props.onTelemetry)
  sink.current = props.onTelemetry
  const track = useCallback<Emit>((name: StudioEventName, key?: string, value?: number) => {
    const fn = sink.current
    if (!fn) return
    const e = cleanEvent(name, key, value)
    if (!e) return
    try {
      fn(e)
    } catch {
      /* a host's telemetry never breaks the studio */
    }
  }, [])

  // Save results (the studio shows errors itself; this only counts them).
  const onSave = props.onSave
  const saveRef = useRef<{ from: AvatarStudioProps['onSave']; to: AvatarStudioProps['onSave'] }>({ from: undefined, to: undefined })
  if (saveRef.current.from !== onSave) {
    saveRef.current = {
      from: onSave,
      to: onSave
        ? async (r: SaveResult) => {
            try {
              await onSave(r)
              track('save', 'ok')
            } catch (e) {
              track('save', 'error')
              throw e
            }
          }
        : undefined,
    }
  }
  const tprops: AvatarStudioProps = onSave ? { ...props, onSave: saveRef.current.to } : props

  // Instrumented actions and theme, cached by the controller's own (stable) values.
  const strings = useRef(s)
  strings.current = s
  const kind = useRef('humanoid')
  const cache = useRef<{ src: StudioActions | null; out: StudioActions | null; setSrc: ((id: string) => void) | null; setOut: ((id: string) => void) | null }>({ src: null, out: null, setSrc: null, setOut: null })
  const wrap = useCallback(
    <C extends Wrappable>(ctl: C): C => {
      kind.current = ctl.state.history.present.kind
      const c = cache.current
      let actions = c.out
      if (c.src !== ctl.actions || !actions) {
        const labels: LabelStrings = {
          get h_fromPhoto() {
            return strings.current.h_fromPhoto
          },
          get h_load() {
            return strings.current.h_load
          },
          get h_variation() {
            return strings.current.h_variation
          },
          get h_child() {
            return strings.current.h_child
          },
          get h_morph() {
            return strings.current.h_morph
          },
        }
        actions = instrumentActions(ctl.actions, track, labels)
        c.src = ctl.actions
        c.out = actions
      }
      let setTheme = c.setOut
      if (c.setSrc !== ctl.setTheme || !setTheme) {
        const set = ctl.setTheme
        setTheme = (id: string) => {
          track('theme_apply', id)
          set(id)
        }
        c.setSrc = set
        c.setOut = setTheme
      }
      return { ...ctl, actions, setTheme }
    },
    [track],
  )

  // The session.
  const enabled = !!props.onTelemetry
  const session = useRef<{ timer: ActiveTimer | null; started: boolean }>({ timer: null, started: false })
  useEffect(() => {
    const st = session.current
    const hasDoc = typeof document !== 'undefined'
    const visible = () => !hasDoc || document.visibilityState !== 'hidden'
    st.timer ??= new ActiveTimer(Date.now, undefined, visible())
    const start = () => {
      if (st.started || !sink.current) return
      st.started = true
      st.timer?.reset(visible())
      track('session_start', kind.current)
    }
    const end = () => {
      if (!st.started) return
      st.started = false
      track('session_end', undefined, Math.round((st.timer?.total() ?? 0) / 1000))
    }
    if (enabled) start()
    else st.started = false
    if (!hasDoc) return end
    const onInput = () => st.timer?.activity()
    const onVisibility = () => (document.visibilityState === 'hidden' ? st.timer?.hidden() : st.timer?.visible())
    const onPageHide = () => end()
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) start()
    }
    const opts = { capture: true, passive: true } as const
    for (const type of INPUTS) document.addEventListener(type, onInput, opts)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      for (const type of INPUTS) document.removeEventListener(type, onInput, opts)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      end()
    }
  }, [enabled, track])

  return { props: tprops, wrap, track }
}

export interface TelemetryView {
  tab: string
  preview: { expression: string; pose: string; clip: string; view: string; crop: string }
  dialog: string | null
  history: History<{ kind: string }>
}

/** Reports what the player opens and previews, from changes of the studio's view state. */
export function useTelemetryView(track: Emit, v: TelemetryView): void {
  const prev = useRef<TelemetryView | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = v
    if (!p) return
    if (v.tab !== p.tab) track('tab_open', v.tab)
    if (v.dialog && v.dialog !== p.dialog) track('dialog_open', v.dialog)
    const pv = v.preview
    const pp = p.preview
    if (pv.expression !== pp.expression) track('expression_preview', pv.expression || 'none')
    if (pv.pose !== pp.pose) track('pose_preview', pv.pose || 'none')
    if (pv.clip !== pp.clip) track('clip_preview', pv.clip || 'none')
    if (pv.view !== pp.view) track('view_change', pv.view)
    if (pv.crop !== pp.crop) track('crop_change', pv.crop)
    // A kind switch can bring back a stashed avatar that is also on the timeline: not a jump.
    if (v.history !== p.history && v.history.present.kind === p.history.present.kind) {
      const step = historyStep(p.history, v.history)
      if (step === 'undo') track('undo')
      else if (step === 'redo') track('redo')
      else if (step === 'jump') track('history_jump')
    }
  })
}
