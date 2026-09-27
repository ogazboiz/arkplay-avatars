/* The big live preview.
 *
 * Rendering is imperative (innerHTML on a host element) and paced by requestAnimationFrame:
 * a slider can fire far more often than the screen refreshes, and each frame draws only
 * the latest avatar. The model (rig + static parts) is rebuilt only when the avatar or the
 * view changes; animation frames reuse it and cost well under a millisecond.
 *
 * Quality follows the engine's guidance: 'standard' while a drag is in progress and for
 * animation, 'high' for the still preview once edits pause for 150 ms.
 *
 * Premium items (premium core, docs/studio.md): the browser engine draws them as
 * neutral placeholders. With the host's avatar service (`previewBase`), a still that wears them
 * is swapped for the service's drawing 250 ms after edits pause (cached by look, abortable);
 * the local render stays up while it loads, and a small note says when it can't be fetched.
 *
 * Server rendering (docs/studio.md, the host's `serverStudio`): nothing is drawn
 * here. Every still comes from the service (720 px at rest; 480 px at medium detail while a drag
 * goes on, at most every SERVER_DRAG_MS, a newer picture replacing an older one as it arrives),
 * a playing clip is one looping animated SVG the browser plays by itself, and a paused clip shows
 * the service's frame at that time. */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react'
import { EXPRESSIONS, POSES, buildModel, clipsFor, describeDNA, needsPremiumArt, renderModel, sampleAnim, type AvatarDNA, type Crop, type Model, type View } from '@arkplay/avatar-engine'
import { nextIdPrefix } from '../render/ids.ts'
import { dnaKey } from '../render/keys.ts'
import { PremiumPreviewError, type PremiumErrorKind, type PremiumPreviewRequest } from '../render/premium.ts'
import { fmt, type StudioStrings } from '../strings.ts'
import { useEnv, useStrings } from './context.ts'
import { Icon } from './Icon.tsx'
import { rovingKeyDown } from './roving.ts'
import type { PreviewOpts } from './previewOpts.ts'

export type { PreviewOpts }


const VIEWS: View[] = ['front', 'side', 'back']
const CROPS: Crop[] = ['full', 'fit', 'bust', 'head', 'portrait']
const FPS = 24
const SETTLE_MS = 150
const ZOOMS = [1, 1.25, 1.6, 2, 2.5, 3, 4]
/** Stage width in px (the local render and the service's premium drawing alike). */
const STAGE_SIZE = 720
/** Premium looks are asked for once edits pause this long. */
const PREMIUM_DEBOUNCE_MS = 250
/** Server rendering: at most one stage request this often while a drag goes on, and the
 *  stage's smaller size then. */
const SERVER_DRAG_MS = 140
const SERVER_DRAG_SIZE = 480

/** Where the stage's premium drawing is: none worn, no service, animating, loading, shown, or why
 *  not. Server rendering uses `drawing` (waiting for the service) and the `stage-` errors. */
type PremiumState = 'none' | 'local' | 'animating' | 'loading' | 'shown' | 'drawing' | `error-${PremiumErrorKind}` | `stage-${PremiumErrorKind}`

/** What identifies a still on the stage (the service draws stills only). */
const stillKey = (d: AvatarDNA, o: PreviewOpts): string => `${dnaKey(d)}|${o.view}|${o.crop}|${o.expression}|${o.pose}`

function premiumNote(st: PremiumState, s: StudioStrings): string {
  switch (st) {
    case 'none':
    case 'shown':
    case 'drawing':
      return ''
    case 'stage-busy':
      return s.stageBusy
    case 'stage-offline':
    case 'stage-unavailable':
    case 'stage-failed':
    case 'stage-locked':
      return s.stageOffline
    case 'stage-too-large':
      return s.premiumTooLarge
    case 'local':
      return s.premiumLocal
    case 'animating':
      return s.premiumAnimating
    case 'loading':
      return s.premiumLoading
    case 'error-busy':
      return s.premiumBusy
    case 'error-unavailable':
      return s.premiumUnavailable
    case 'error-too-large':
      return s.premiumTooLarge
    default:
      return s.premiumOffline
  }
}

type Quality = 'standard' | 'high'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PreviewProps {
  dna: AvatarDNA
  opts: PreviewOpts
  setOpts: (fn: (o: PreviewOpts) => PreviewOpts) => void
  /** An edit gesture (slider drag, typing) is in progress. */
  dragging: boolean
  assetUrl?: (id: string) => string | undefined
  reducedMotion: boolean
  idBase: string
  /** Buttons overlaid on the stage on small screens (undo/redo). */
  tools?: ReactNode
}

export const Preview = memo(function Preview(p: PreviewProps) {
  const s = useStrings()
  const { dna, opts, setOpts, dragging, reducedMotion, idBase } = p
  const hostRef = useRef<HTMLDivElement>(null)
  const scrubRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const latest = useRef(p)
  latest.current = p
  const model = useRef<{ key: string; model: Model; boxes: Map<string, Box> } | null>(null)
  const drawn = useRef('')
  const raf = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorRef = useRef(false)
  const [error, setError] = useState(false)
  const [more, setMore] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // premium core (G): the service's drawing of a still that wears premium items.
  const env = useEnv()
  const premium = env.premium
  // Server rendering: the service draws the whole stage.
  const serverMode = !!premium && env.serverStudio === true
  const serverRef = useRef(serverMode)
  serverRef.current = serverMode
  const needsServer = !serverMode && needsPremiumArt(dna)
  const serverShown = useRef('')
  const [premiumState, setPremiumState] = useState<PremiumState>('none')
  const [retry, setRetry] = useState(0)

  const clips = clipsFor(dna.kind)
  const clip = clips.find((c) => c.name === opts.clip)
  const clipName = clip?.name ?? ''

  const draw = useCallback((quality: Quality, time?: number) => {
    const host = hostRef.current
    if (!host || serverRef.current) return
    const { dna: d, opts: o, assetUrl } = latest.current
    const c = clipsFor(d.kind).find((x) => x.name === o.clip)
    // The service's drawing of this very still is up: keep it (premium core).
    if (!c && serverShown.current && serverShown.current === stillKey(d, o)) return
    try {
      const key = `${dnaKey(d)}|${o.view}|${o.expression}|${o.pose}|${quality}`
      if (model.current?.key !== key) {
        model.current = {
          key,
          boxes: new Map(),
          model: buildModel(d, { view: o.view, expression: o.expression || undefined, pose: o.pose || undefined, quality, assetUrl, idPrefix: nextIdPrefix('p') }),
        }
      }
      const m = model.current
      let viewBox: Box | undefined
      if (c && o.crop === 'fit') {
        // A per-frame `fit` would re-centre every frame: frame the whole clip once instead.
        viewBox = m.boxes.get(c.name)
        if (!viewBox) {
          const b = sampleAnim(m.model, c.name, { fps: 12, maxFrames: 24 }).box
          const side = Math.max(b.w, b.h) * 1.12
          viewBox = { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, w: side, h: side }
          m.boxes.set(c.name, viewBox)
        }
      }
      const t = time ?? o.time
      const stamp = `${key}|${o.crop}|${c?.name ?? ''}|${c ? t.toFixed(3) : ''}`
      if (stamp === drawn.current) return
      host.innerHTML = renderModel(m.model, { view: o.view, crop: o.crop, viewBox, anim: c?.name, time: t, size: STAGE_SIZE, title: false })
      drawn.current = stamp
      if (errorRef.current) {
        errorRef.current = false
        setError(false)
      }
    } catch {
      // The engine is being worked on; keep the last good picture and try again next change.
      if (!errorRef.current) {
        errorRef.current = true
        setError(true)
      }
    }
  }, [])

  const playing = !!clip && opts.playing
  const still = stillKey(dna, opts)

  // Server rendering: every picture on the stage is the service's.
  const serverSeq = useRef(0)
  const serverShownSeq = useRef(0)
  const serverSent = useRef(0)
  useLayoutEffect(() => {
    if (!serverMode || !premium) return
    const { dna: d, opts: o } = latest.current
    const drag = dragging && !clipName
    const req: PremiumPreviewRequest = {
      dna: d,
      view: o.view,
      crop: o.crop,
      size: drag ? SERVER_DRAG_SIZE : STAGE_SIZE,
      detail: drag ? 'medium' : undefined,
      expression: o.expression || undefined,
      pose: o.pose || undefined,
      ...(clipName ? (playing ? { anim: clipName, loop: true } : { anim: clipName, time: o.time }) : {}),
    }
    const seq = ++serverSeq.current
    const show = (svg: string) => {
      const host = hostRef.current
      // A newer picture than the one up (even if edits moved on) is better than none: a drag
      // keeps showing progress on a slow connection.
      if (!host || seq <= serverShownSeq.current) return
      serverShownSeq.current = seq
      host.innerHTML = svg
      drawn.current = `server|${seq}`
      if (seq === serverSeq.current) setPremiumState('shown')
    }
    const cached = premium.peek(req, nextIdPrefix('v'))
    if (cached) return show(cached)
    setPremiumState('drawing')
    let again: ReturnType<typeof setTimeout> | undefined
    const send = () => {
      serverSent.current = performance.now()
      premium.preview(req, nextIdPrefix('v')).then(show, (e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError' || seq !== serverSeq.current) return
        const kind = e instanceof PremiumPreviewError ? e.kind : 'failed'
        setPremiumState(`stage-${kind}`)
        if (kind === 'busy') again = setTimeout(() => setRetry((n) => n + 1), Math.min(15, Math.max(1, (e as PremiumPreviewError).retryAfter ?? 2)) * 1000)
      })
    }
    // While dragging: at most one request per SERVER_DRAG_MS (anchored to the last one sent, so
    // a steady drag still gets pictures); otherwise at once.
    const wait = drag ? Math.max(0, serverSent.current + SERVER_DRAG_MS - performance.now()) : 0
    const timer = setTimeout(send, wait)
    return () => {
      clearTimeout(timer)
      clearTimeout(again)
    }
  }, [serverMode, premium, still, clipName, playing, opts.time, dragging, retry])

  // Still (or paused) frames: one draw per animation frame, whatever the input rate.
  useLayoutEffect(() => {
    if (playing || serverMode) return
    cancelAnimationFrame(raf.current)
    clearTimeout(settle.current)
    const quick = dragging || !!clip
    raf.current = requestAnimationFrame(() => draw(quick ? 'standard' : 'high'))
    if (dragging && !clip) settle.current = setTimeout(() => draw('high'), SETTLE_MS)
    return () => {
      cancelAnimationFrame(raf.current)
      clearTimeout(settle.current)
    }
  }, [dna, opts.view, opts.crop, opts.expression, opts.pose, opts.time, clipName, dragging, playing, draw, serverMode])

  // premium core (G): a still that wears premium items is drawn by the avatar service. A cached
  // look shows at once (before the frame is painted); a new one once edits pause, while the
  // local render (placeholders for the premium items) stays up.
  useLayoutEffect(() => {
    if (serverMode) return
    if (!needsServer) return setPremiumState('none')
    if (!premium) return setPremiumState('local')
    if (clipName) return setPremiumState('animating')
    const { dna: d, opts: o } = latest.current
    const req: PremiumPreviewRequest = { dna: d, view: o.view, crop: o.crop, size: STAGE_SIZE, expression: o.expression || undefined, pose: o.pose || undefined }
    const show = (svg: string) => {
      const host = hostRef.current
      const now = latest.current
      if (!host || now.opts.clip || stillKey(now.dna, now.opts) !== still) return
      cancelAnimationFrame(raf.current)
      clearTimeout(settle.current)
      host.innerHTML = svg
      serverShown.current = still
      drawn.current = `service|${still}`
      setPremiumState('shown')
    }
    const cached = premium.peek(req, nextIdPrefix('v'))
    if (cached) return show(cached)
    serverShown.current = ''
    setPremiumState('loading')
    if (dragging) return
    const controller = new AbortController()
    let again: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      premium.preview(req, nextIdPrefix('v'), controller.signal).then(show, (e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return
        const kind = e instanceof PremiumPreviewError ? e.kind : 'failed'
        setPremiumState(`error-${kind}`)
        // A busy service is asked once more when it says it can take it.
        if (kind === 'busy') again = setTimeout(() => setRetry((n) => n + 1), Math.min(15, Math.max(2, (e as PremiumPreviewError).retryAfter ?? 3)) * 1000)
      })
    }, PREMIUM_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(again)
      controller.abort()
    }
  }, [still, needsServer, premium, clipName, dragging, retry, serverMode])

  // Playback at ~24 fps; the scrubber and clock are updated directly, not through React. (Server
  // rendering plays the looping SVG instead: nothing to draw per frame.)
  useEffect(() => {
    if (!playing || !clip || serverMode) return
    const period = clip.loop ? clip.duration : clip.duration + 0.8
    const start = performance.now() - latest.current.opts.time * 1000
    let last = -1e9
    let current = latest.current.opts.time
    const tick = (now: number) => {
      raf.current = requestAnimationFrame(tick)
      if (now - last < 1000 / FPS - 2) return
      last = now
      current = Math.min(((now - start) / 1000) % period, clip.duration)
      draw('standard', current)
      const scrub = scrubRef.current
      if (scrub) {
        scrub.value = String(current)
        scrub.style.setProperty('--aps-pct', `${(current / clip.duration) * 100}%`)
      }
      if (timeRef.current) timeRef.current.textContent = fmt(s.timeReadout, { time: current.toFixed(1), duration: clip.duration.toFixed(1) })
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf.current)
      // Pausing keeps the frame on screen; switching clips starts the new one at 0.
      setOpts((o) => (o.clip === clip.name ? { ...o, time: current } : o))
    }
  }, [playing, clip, draw, setOpts, s.timeReadout, serverMode])

  // Reset the pan whenever zoom returns to 1 or the framing changes.
  useEffect(() => setPan({ x: 0, y: 0 }), [opts.crop, opts.view])
  useEffect(() => {
    if (opts.zoom <= 1) setPan({ x: 0, y: 0 })
  }, [opts.zoom])

  const setZoom = (z: number) => setOpts((o) => ({ ...o, zoom: Math.max(1, Math.min(4, Math.round(z * 100) / 100)) }))
  const zoomStep = (dir: 1 | -1) => {
    const z = opts.zoom
    const next = dir > 0 ? (ZOOMS.find((x) => x > z + 0.01) ?? 4) : ([...ZOOMS].reverse().find((x) => x < z - 0.01) ?? 1)
    setZoom(next)
  }
  const clampPan = (x: number, y: number, el: HTMLElement) => {
    const lim = ((opts.zoom - 1) * el.clientWidth) / 2
    return { x: Math.max(-lim, Math.min(lim, x)), y: Math.max(-lim, Math.min(lim, y)) }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (opts.zoom <= 1 || e.button !== 0 || (e.target as Element).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setPan(clampPan(d.px + e.clientX - d.x, d.py + e.clientY - d.y, e.currentTarget))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(opts.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const step = 40
    if (e.key === '+' || e.key === '=') zoomStep(1)
    else if (e.key === '-' || e.key === '_') zoomStep(-1)
    else if (e.key === '0') setZoom(1)
    else if (e.key === ' ' && clip) setOpts((o) => ({ ...o, playing: !o.playing }))
    else if (opts.zoom > 1 && e.key.startsWith('Arrow')) {
      const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0
      const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
      setPan((pp) => clampPan(pp.x + dx, pp.y + dy, e.currentTarget))
    } else return
    e.preventDefault()
  }

  const pickClip = (name: string) => setOpts((o) => ({ ...o, clip: name, time: 0, playing: !!name && !reducedMotion }))
  const transparent = dna.sections.scene?.background === 'none'
  const altId = `${idBase}-preview-alt`
  const viewId = `${idBase}-view`
  const cropId = `${idBase}-crop`
  const pct = clip ? (opts.time / clip.duration) * 100 : 0

  return (
    <div className="aps-previewwrap">
      <div
        className={`aps-stage${transparent ? ' is-transparent' : ''}${opts.zoom > 1 ? ' is-zoomed' : ''}`}
        role="group"
        aria-label={s.preview}
        aria-describedby={altId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKey}
        onDoubleClick={() => setZoom(opts.zoom > 1 ? 1 : 2)}
      >
        <div ref={hostRef} className="aps-stage__art" aria-hidden="true" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${opts.zoom})` }} />
        <p className="aps-sr" id={altId}>
          {describeDNA(dna)}
        </p>
        {p.tools && <div className="aps-stage__tools">{p.tools}</div>}
        <button
          type="button"
          className="aps-iconbtn aps-iconbtn--glass aps-stage__more"
          aria-expanded={more}
          aria-controls={`${idBase}-try`}
          onClick={() => setMore((m) => !m)}
          aria-label={`${s.tryExpression} / ${s.tryPose}`}
          title={`${s.tryExpression} / ${s.tryPose}`}
        >
          <Icon name="sliders" size={17} />
        </button>
        {error && (
          <div className="aps-stage__error" role="status">
            <Icon name="warning" size={16} />
          </div>
        )}
        {premiumNote(premiumState, s) && (
          // Loading is shown, not announced (it comes and goes with every edit); the rest is.
          <div className={`aps-stage__premium aps-stage__premium--${premiumState.startsWith('error') ? 'error' : premiumState}`} role={premiumState === 'loading' ? undefined : 'status'} aria-hidden={premiumState === 'loading' ? true : undefined}>
            <Icon name="lock" size={14} />
            <span>{premiumNote(premiumState, s)}</span>
          </div>
        )}
        <div className="aps-stage__zoom">
          <button type="button" className="aps-iconbtn aps-iconbtn--glass" onClick={() => zoomStep(-1)} disabled={opts.zoom <= 1} aria-label={s.zoomOut} title={s.zoomOut}>
            <Icon name="minus" size={16} />
          </button>
          <button type="button" className="aps-stage__pct" onClick={() => setZoom(1)} aria-label={s.zoomReset} title={s.zoomReset}>
            {fmt(s.zoomLevel, { percent: Math.round(opts.zoom * 100) })}
          </button>
          <button type="button" className="aps-iconbtn aps-iconbtn--glass" onClick={() => zoomStep(1)} disabled={opts.zoom >= 4} aria-label={s.zoomIn} title={s.zoomIn}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      <div className="aps-stagebar">
        <div role="radiogroup" aria-labelledby={viewId} className="aps-seg aps-seg--sm" onKeyDown={(e) => rovingKeyDown(e)}>
          <span className="aps-sr" id={viewId}>
            {s.view}
          </span>
          {VIEWS.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={opts.view === v} tabIndex={opts.view === v ? 0 : -1} className="aps-seg__btn" onClick={() => setOpts((o) => ({ ...o, view: v }))}>
              {s[`view_${v}`]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-labelledby={cropId} className="aps-seg aps-seg--sm" onKeyDown={(e) => rovingKeyDown(e)}>
          <span className="aps-sr" id={cropId}>
            {s.crop}
          </span>
          {CROPS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={opts.crop === c} tabIndex={opts.crop === c ? 0 : -1} className="aps-seg__btn" onClick={() => setOpts((o) => ({ ...o, crop: c, zoom: 1 }))}>
              {s[`crop_${c}`]}
            </button>
          ))}
        </div>
      </div>

      <div className={`aps-stagebar aps-stagebar--try${more ? ' is-open' : ''}`} id={`${idBase}-try`}>
        <label className="aps-select">
          <span className="aps-select__label">{s.tryExpression}</span>
          <select value={opts.expression} onChange={(e) => setOpts((o) => ({ ...o, expression: e.currentTarget.value }))}>
            <option value="">{s.ownExpression}</option>
            {EXPRESSIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        {dna.kind === 'humanoid' && (
          <label className="aps-select">
            <span className="aps-select__label">{s.tryPose}</span>
            <select value={opts.pose} onChange={(e) => setOpts((o) => ({ ...o, pose: e.currentTarget.value }))}>
              <option value="">{s.ownPose}</option>
              {POSES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="aps-anim">
        <label className="aps-select aps-select--clip">
          <span className="aps-sr">{s.animation}</span>
          <select value={clipName} onChange={(e) => pickClip(e.currentTarget.value)}>
            <option value="">{s.animNone}</option>
            {clips.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="aps-iconbtn aps-iconbtn--play"
          disabled={!clip}
          onClick={() => setOpts((o) => ({ ...o, playing: !o.playing, time: clip && o.time >= clip.duration - 0.01 && !clip.loop ? 0 : o.time }))}
          aria-label={playing ? s.pause : s.play}
          title={playing ? s.pause : s.play}
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <input
          ref={scrubRef}
          className="aps-range__input aps-anim__scrub"
          type="range"
          min={0}
          max={clip?.duration ?? 1}
          step={0.01}
          value={clip ? opts.time : 0}
          disabled={!clip}
          aria-label={s.scrub}
          aria-valuetext={clip ? `${opts.time.toFixed(1)} s` : undefined}
          style={{ '--aps-pct': `${pct}%` } as CSSProperties}
          onChange={(e) => {
            const t = Number(e.currentTarget.value)
            setOpts((o) => ({ ...o, time: t, playing: false }))
          }}
        />
        <span className="aps-anim__time" ref={timeRef} aria-hidden="true">
          {clip ? fmt(s.timeReadout, { time: opts.time.toFixed(1), duration: clip.duration.toFixed(1) }) : ''}
        </span>
      </div>
      {clip && reducedMotion && !opts.playing && opts.time === 0 && <p className="aps-help aps-anim__note">{s.reducedMotionNote}</p>}
    </div>
  )
})
