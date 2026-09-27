/* The export dialog: pick a format, see exactly the options it uses, preview, export with
 * progress and cancel. Everything runs in the browser (exportAvatar). */

import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clipsFor, describeDNA, needsPremiumArt, type AvatarDNA, type Crop, type View } from '@arkplay/avatar-engine'
import { exportAvatar } from '../export/exportAvatar.ts'
import {
  ANIM_SIZES,
  CELL_SIZES,
  EXPORT_FORMATS,
  FPS_CHOICES,
  PIXEL_GRIDS,
  RIG_SCALES,
  SECONDS_CHOICES,
  SIZE_PRESETS,
  formatInfo,
  type ExportFormat,
} from '../export/formats.ts'
import { webmMimeType } from '../export/webm.ts'
import { nextIdPrefix } from '../render/ids.ts'
import type { ThumbCrop } from '../render/job.ts'
import { dnaKey } from '../render/keys.ts'
import { PremiumExportError, PremiumPreviewError } from '../render/premium.ts' // premium core (G)
import { EXPORT_FEATURE, featureBadge, hiresSize } from '../state/tiers.ts'
import { fmt, type StudioStrings } from '../strings.ts'
import { copyText } from './clipboard.ts'
import { useActions, useEnv, useStrings } from './context.ts'
import { Dialog } from './Dialog.tsx'
import { downloadBlob } from './download.ts'
import { Icon } from './Icon.tsx'
import type { PreviewOpts } from './previewOpts.ts'
import { rovingIndex, rovingKeyDown } from './roving.ts'
import { ServicePreviewThumb, Thumb } from './Thumb.tsx'
import { useTrack } from '../telemetry/react.ts' // studio telemetry (F)

const VIEWS: View[] = ['front', 'side', 'back']
const CROPS: Crop[] = ['full', 'fit', 'bust', 'head', 'portrait']
const toThumbCrop = (c: Crop): ThumbCrop => (c === 'full' ? 'fixed' : c === 'fit' ? 'full' : c)

const sizeChoices = (f: ExportFormat): readonly number[] => (f === 'gif' || f === 'webm' ? ANIM_SIZES : f === 'stickers' ? [256, 512] : SIZE_PRESETS)
const defaultSize = (f: ExportFormat): number => (f === 'gif' || f === 'webm' ? 384 : f === 'stickers' || f === 'pixel' ? 512 : 1024)

type Status = { tone: 'ok' | 'error' | 'info'; text: string } | null

function Select<T extends string | number>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <label className="aps-select aps-select--field">
      <span className="aps-select__label">{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o) === e.currentTarget.value) ?? value)}>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Seg<T extends string>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => string }) {
  const id = useId()
  return (
    <div className="aps-field">
      <span className="aps-field__label" id={id}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="aps-seg aps-seg--fill aps-seg--sm" onKeyDown={(e) => rovingKeyDown(e)}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} tabIndex={o === value ? 0 : -1} className="aps-seg__btn" onClick={() => onChange(o)}>
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

const fmtLabel = (s: StudioStrings, f: ExportFormat) => (s as Record<string, string>)[`fmt_${f}`] ?? f
const fmtDesc = (s: StudioStrings, f: ExportFormat) => (s as Record<string, string>)[`fmtDesc_${f}`] ?? ''

export function ExportDialog({ dna, preview, onClose }: { dna: AvatarDNA; preview: PreviewOpts; onClose: () => void }) {
  const s = useStrings()
  const a = useActions()
  const env = useEnv()
  const track = useTrack() // studio telemetry (F)
  const uid = useId()
  const clips = clipsFor(dna.kind)
  // WebM: the service makes it with server exports; otherwise only browsers that can record it.
  const webm = useMemo(() => env.serverExports || webmMimeType() !== null, [env.serverExports])
  const formats = EXPORT_FORMATS.filter((f) => f.id !== 'webm' || webm)

  const [format, setFormat] = useState<ExportFormat>('png')
  const [sizes, setSizes] = useState<Partial<Record<ExportFormat, number>>>({})
  const [view, setView] = useState<View>(preview.view)
  const [gameView, setGameView] = useState<View>('side')
  const [crop, setCrop] = useState<Crop>(preview.crop)
  const [transparent, setTransparent] = useState(false)
  const [motion, setMotion] = useState(true)
  const [quality, setQuality] = useState(0.9)
  const [clip, setClip] = useState(() => clips.find((c) => c.name === preview.clip)?.name ?? clips.find((c) => c.name === 'idle')?.name ?? clips[0]?.name ?? 'idle')
  const [picked, setPicked] = useState<string[]>(() => clips.filter((c) => c.name === 'idle' || c.name === 'walk').map((c) => c.name))
  const [fps, setFps] = useState<number>(12)
  const [seconds, setSeconds] = useState<number>(3)
  const [cell, setCell] = useState<number>(256)
  const [scale, setScale] = useState<number>(1)
  const [grid, setGrid] = useState<number>(48)
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const ctrl = useRef<AbortController | null>(null)

  const info = formatInfo(format)
  const has = (k: (typeof info.options)[number]) => info.options.includes(k)
  const size = sizes[format] ?? defaultSize(format)
  const game = format === 'spritesheet' || format === 'rig'
  const premiumLook = needsPremiumArt(dna) // premium core (G)
  const v = game ? gameView : view
  const busy = progress !== null

  async function run() {
    if (has('clips') && !picked.length) {
      setStatus({ tone: 'error', text: s.selectAtLeastOne })
      return
    }
    const controller = new AbortController()
    ctrl.current = controller
    setStatus(null)
    setProgress(0)
    try {
      const r = await exportAvatar(dna, {
        format,
        size,
        view: v,
        crop,
        background: !(has('transparent') && transparent),
        expression: preview.expression || undefined,
        pose: preview.pose || undefined,
        anim: clip,
        anims: picked,
        fps: has('fps') ? fps : undefined,
        seconds,
        cell,
        scale,
        pixelGrid: grid,
        quality,
        motion: has('motion') ? motion : undefined,
        assetUrl: env.assetUrl,
        premium: env.premium, // premium core (G): premium looks export from the service's drawing
        server: env.serverExports ? env.premium : undefined, // server exports: the service makes every file
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      })
      downloadBlob(r.blob, r.filename)
      track('export', format) // studio telemetry (F)
      const text = fmt(s.exportDone, { file: r.filename })
      setStatus({ tone: 'ok', text })
      a.announce(text)
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') setStatus({ tone: 'info', text: s.exportCancelled })
      else {
        track('export_error', format) // studio telemetry (F)
        // premium core (G): premium items render on ArkPlay; say why this export can't have them.
        if (e instanceof PremiumExportError) setStatus({ tone: 'error', text: e.reason === 'service' ? s.premiumExportService : s.premiumExportFormat })
        else if (e instanceof PremiumPreviewError) setStatus({ tone: 'error', text: serverExportMessage(e, s) })
        else setStatus({ tone: 'error', text: fmt(s.exportFailed, { message: e instanceof Error ? e.message : String(e) }) })
      }
    } finally {
      ctrl.current = null
      setProgress(null)
    }
  }

  const previewCrop = game ? 'full' : toThumbCrop(crop)
  const scene = !(has('transparent') && transparent) && !game
  const key = `exp:${dnaKey(dna)}|${v}|${previewCrop}|${scene ? 1 : 0}|${preview.expression}|${preview.pose}|${info.animated ? 's' : 'h'}`
  const pct = Math.round((progress ?? 0) * 100)
  const fmtId = `${uid}-fmt`

  return (
    <Dialog title={s.exportTitle} onClose={() => (busy ? ctrl.current?.abort() : onClose())} busy={busy} className="aps-dialog--export">
      <div className="aps-export">
        <div className="aps-export__formats">
          <span className="aps-sr" id={fmtId}>
            {s.format}
          </span>
          <div role="radiogroup" aria-labelledby={fmtId} className="aps-fmts" onKeyDown={(e) => rovingKeyDown(e)}>
            {formats.map((f, i) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === format}
                tabIndex={rovingIndex(f.id === format, i, true)}
                className="aps-fmt"
                disabled={busy}
                onClick={() => {
                  setFormat(f.id)
                  setStatus(null)
                }}
              >
                <span className="aps-fmt__name">
                  {fmtLabel(s, f.id)}
                  <span className="aps-fmt__ext">{f.bundle ? '.zip' : `.${f.ext}`}</span>
                </span>
                <span className="aps-fmt__desc">{fmtDesc(s, f.id)}</span>
                {(() => {
                  const badge = featureBadge(EXPORT_FEATURE[f.id], s)
                  return badge ? <span className={`aps-tier aps-tier--${badge.tier} aps-fmt__tier`}>{badge.full}</span> : null
                })()}
              </button>
            ))}
          </div>
        </div>

        <div className="aps-export__side">
          <div className={`aps-export__preview${scene ? '' : ' is-transparent'}`}>
            {(() => {
              const local = (
                <Thumb
                  tkey={key}
                  make={() => ({ dna, crop: previewCrop, view: v, scene, expression: preview.expression || undefined, pose: preview.pose || undefined, idPrefix: nextIdPrefix('e'), quality: info.animated ? 'standard' : 'high' })}
                  className="aps-export__img"
                />
              )
              // premium core (G): show the service's drawing of a premium look (stills; animations use the local frame).
              return env.premium && premiumLook && !info.animated ? (
                <ServicePreviewThumb premium={env.premium} req={{ dna, view: v, crop, size: 320, expression: preview.expression || undefined, pose: preview.pose || undefined, background: scene, motion: false }} className="aps-export__img" fallback={local} />
              ) : (
                local
              )
            })()}
          </div>

          <div className="aps-export__opts">
            {has('clip') && <Select label={s.clip} value={clip} options={clips.map((c) => c.name)} onChange={setClip} render={(n) => clips.find((c) => c.name === n)?.label ?? n} />}
            {has('clips') && (
              <fieldset className="aps-checks">
                <legend className="aps-field__label">{s.clips}</legend>
                <div className="aps-checks__grid">
                  {clips.map((c) => (
                    <label key={c.name} className="aps-check">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.name)}
                        onChange={(e) => {
                          const on = e.currentTarget.checked
                          setPicked((p) => (on ? [...p, c.name] : p.filter((x) => x !== c.name)))
                        }}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {has('pixelGrid') && <Select label={s.pixelGrid} value={grid} options={PIXEL_GRIDS} onChange={setGrid} render={(n) => fmt(s.pixelGridValue, { n })} />}
            {has('size') && <Select label={s.size} value={size} options={sizeChoices(format)} onChange={(n) => setSizes((x) => ({ ...x, [format]: n }))} render={(n) => (hiresSize(format, n) ? fmt(s.sizeValuePro, { size: n, tier: s.tierPro }) : fmt(s.sizeValue, { size: n }))} />}
            {has('cell') && <Select label={s.cell} value={cell} options={CELL_SIZES} onChange={setCell} render={(n) => fmt(s.sizeValue, { size: n })} />}
            {has('scale') && <Select label={s.scale} value={scale} options={RIG_SCALES} onChange={setScale} render={(n) => fmt(s.scaleValue, { scale: n })} />}
            {has('fps') && <Select label={s.fps} value={fps} options={FPS_CHOICES} onChange={setFps} render={(n) => fmt(s.fpsValue, { fps: n })} />}
            {has('seconds') && <Select label={s.length} value={seconds} options={SECONDS_CHOICES} onChange={setSeconds} render={(n) => fmt(s.lengthValue, { seconds: n })} />}
            {has('view') && <Seg label={s.view} value={v} options={VIEWS} onChange={game ? setGameView : setView} render={(x) => s[`view_${x}`]} />}
            {has('crop') && <Seg label={s.crop} value={crop} options={CROPS} onChange={setCrop} render={(x) => s[`crop_${x}`]} />}
            {has('quality') && (
              <div className="aps-field">
                <div className="aps-field__row">
                  <label className="aps-field__label" htmlFor={`${uid}-q`}>
                    {s.quality}
                  </label>
                  <output className="aps-range__value">{Math.round(quality * 100)}</output>
                </div>
                <input
                  id={`${uid}-q`}
                  className="aps-range__input"
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={quality}
                  style={{ '--aps-pct': `${((quality - 0.5) / 0.5) * 100}%` } as CSSProperties}
                  onChange={(e) => setQuality(Number(e.currentTarget.value))}
                />
              </div>
            )}
            {has('transparent') && (
              <button type="button" role="switch" aria-checked={transparent} className="aps-switch" onClick={() => setTransparent((t) => !t)}>
                <span className="aps-switch__label">{s.transparent}</span>
                <span className="aps-switch__track" aria-hidden="true">
                  <span className="aps-switch__thumb" />
                </span>
              </button>
            )}
            {has('motion') && (
              <button type="button" role="switch" aria-checked={motion} className="aps-switch" onClick={() => setMotion((m) => !m)}>
                <span className="aps-switch__label">{s.motion}</span>
                <span className="aps-switch__track" aria-hidden="true">
                  <span className="aps-switch__thumb" />
                </span>
              </button>
            )}
          </div>

          <div className="aps-export__go">
            {busy ? (
              <>
                <div className="aps-progress" role="progressbar" aria-label={fmt(s.exporting, { percent: pct })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <span className="aps-progress__bar" style={{ width: `${pct}%` }} />
                </div>
                <div className="aps-row">
                  <span className="aps-export__pct">{fmt(s.exporting, { percent: pct })}</span>
                  <button type="button" className="aps-btn aps-btn--quiet aps-btn--sm" onClick={() => ctrl.current?.abort()}>
                    {s.cancelExport}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="aps-btn aps-btn--primary aps-btn--block" onClick={() => void run()}>
                <Icon name="download" size={18} />
                {fmt(s.exportButton, { format: fmtLabel(s, format) })}
              </button>
            )}
            {premiumLook && !status && <p className="aps-help aps-export__premium">{env.premium ? s.premiumExportNote : s.premiumExportService}</p>}
            {status && (
              <p className={`aps-notice aps-notice--${status.tone === 'ok' ? 'ok' : status.tone === 'error' ? 'error' : 'info'}`} role={status.tone === 'error' ? 'alert' : 'status'}>
                {status.text}
              </p>
            )}
          </div>

          <div className="aps-export__alt">
            <p className="aps-help">{describeDNA(dna)}</p>
            <button
              type="button"
              className="aps-btn aps-btn--quiet aps-btn--sm"
              onClick={async () => {
                const ok = await copyText(describeDNA(dna))
                a.announce(ok ? s.altCopied : s.copyFailed)
                setStatus({ tone: ok ? 'ok' : 'error', text: ok ? s.altCopied : s.copyFailed })
              }}
            >
              <Icon name="copy" size={16} />
              {s.copyAlt}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/** What to tell the player when the service couldn't make a download (never its raw message). */
function serverExportMessage(e: PremiumPreviewError, s: StudioStrings): string {
  if (e.kind === 'locked') return s.exportLocked
  if (e.kind === 'busy') return e.retryAfter ? fmt(s.exportBusyRetry, { seconds: e.retryAfter }) : s.exportBusy
  if (e.kind === 'offline') return s.exportOffline
  if (e.kind === 'too-large') return s.exportTooLarge
  return s.exportServerFailed
}
