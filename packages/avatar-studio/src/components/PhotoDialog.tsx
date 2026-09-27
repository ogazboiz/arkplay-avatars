/* "From photo": consent → a photo (file or camera) → four suggested avatars → the studio.
 *
 * On this device (@arkplay/avatar-vision): the photo, the landmarks and the masks live in memory
 * until the dialog closes and are never uploaded or stored. The vision package and its models
 * load only when someone opens this dialog.
 *
 * With server photos (the host's `serverPhoto`, docs/studio.md) the avatar
 * service analyses the photo instead: it is drawn upright at ≤ 1280 px and re-encoded as a JPEG
 * (no EXIF) first (photo/serverPhoto.ts), sent once, analysed in memory and dropped there; the
 * consent screen says so. The JPEG stays in this dialog's memory for "Try again" and goes when
 * it closes. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { itemSpec, sectionSpec, type AvatarDNA } from '@arkplay/avatar-engine'
import type { PhotoAnalysis, PhotoAvatar, PhotoAvatars, ProgressEvent } from '@arkplay/avatar-vision'
import { AvatarImage } from '../AvatarImage.tsx'
import { fmt, type StudioStrings } from '../strings.ts'
import { useEnv, useStrings } from './context.ts'
import { Dialog } from './Dialog.tsx'
import { Icon } from './Icon.tsx'
import { FORGE_PCT, ForgeLoader, type ForgeStage, type Loot } from './ForgeLoader.tsx'
import { PhotoServerError, prepareUpload } from '../photo/serverPhoto.ts'

type Vision = typeof import('@arkplay/avatar-vision')

let visionModule: Promise<Vision> | null = null
const loadVision = (): Promise<Vision> => (visionModule ??= import('@arkplay/avatar-vision'))

type Step =
  | { t: 'consent' }
  | { t: 'camera' }
  | { t: 'working'; stage: ForgeStage; pct: number; bytes: { loaded: number; total: number } | null; loot: Loot[] | null }
  | { t: 'results'; result: PhotoAvatars; pick: number }
  | { t: 'error'; message: string }

export interface PhotoDialogProps {
  onClose: () => void
  onPick: (dna: AvatarDNA) => void
  /** Where the vision models are served (default: the package's default, /avatar/v1/vision/models/). */
  modelBase?: string
  idBase: string
}

/** The forge stays up at least this long, so it reads as a sequence, not a flicker. */
const MIN_FORGE_MS = 1500
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const optionLabel = (section: string, key: string, id: string): string =>
  (sectionSpec(section)?.params.find((p) => p.key === key) as { options?: { id: string; label: string }[] } | undefined)?.options?.find((o) => o.id === id)?.label ?? id

/** What the forged avatar got, as loot: straight from its DNA, so it's exactly what you get. */
function lootOf(dna: AvatarDNA, s: StudioStrings): Loot[] {
  const sec = dna.sections
  const out: Loot[] = []
  const hair = String(sec.hair?.style ?? '')
  if (hair) out.push({ label: s.lootHair, value: optionLabel('hair', 'style', hair), swatch: hair === 'bald' ? undefined : String(sec.hair?.color ?? '') || undefined, icon: 'sparkle' })
  if (typeof sec.eyes?.iris === 'string') out.push({ label: s.lootEyes, value: optionLabel('eyes', 'style', String(sec.eyes?.style ?? '')), swatch: sec.eyes.iris })
  if (typeof sec.skin?.tone === 'string') out.push({ label: s.lootSkin, value: s.lootMatched, swatch: sec.skin.tone })
  const beard = String(sec.facialHair?.beard ?? 'none')
  if (beard !== 'none') out.push({ label: s.lootFacialHair, value: optionLabel('facialHair', 'beard', beard), swatch: String(sec.facialHair?.color || sec.hair?.color || '') || undefined })
  const top = dna.outfit.find((o) => ['top', 'full', 'outer'].includes(itemSpec(o.id)?.slot ?? ''))
  if (top) out.push({ label: s.lootOutfit, value: itemSpec(top.id)?.label ?? top.id, swatch: typeof top.params.color === 'string' ? top.params.color : undefined })
  for (const a of dna.accessories.slice(0, 3)) out.push({ label: s.lootGear, value: itemSpec(a.id)?.label ?? a.id, icon: 'sparkle' })
  return out.slice(0, 7)
}

const hasCamera = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function PhotoDialog({ onClose, onPick, modelBase, idBase }: PhotoDialogProps) {
  const s = useStrings()
  const env = useEnv()
  // Server photos: the avatar service analyses the photo (needs the host's `serverPhoto`).
  const server = env.serverPhoto && env.premium ? env.premium : null
  const upload = useRef<Blob | null>(null)
  const [step, setStep] = useState<Step>({ t: 'consent' })
  const [warnings, setWarnings] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoAvatar = useRef<PhotoAvatar | null>(null)
  const analysis = useRef<PhotoAnalysis | null>(null)
  const seed = useRef(1)
  const alive = useRef(true)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const downloads = useRef(new Map<string, { loaded: number; total: number }>())

  // A local preview of the photo for the scanner; revoked as soon as it's replaced.
  useEffect(
    () => () => {
      if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
    },
    [photoUrl],
  )

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const forget = useCallback(async () => {
    upload.current = null
    const a = analysis.current
    analysis.current = null
    if (a) (await loadVision()).releaseAnalysis(a)
  }, [])

  // Nothing about the photo outlives the dialog.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopCamera()
      void forget()
      photoAvatar.current?.dispose()
      photoAvatar.current = null
    }
  }, [stopCamera, forget])

  const onProgress = useCallback((e: ProgressEvent) => {
    if (!alive.current) return
    if (e.stage === 'models') {
      if (e.file && e.total) downloads.current.set(e.file, { loaded: e.loaded ?? 0, total: e.total })
      let loaded = 0
      let total = 0
      for (const d of downloads.current.values()) {
        loaded += d.loaded
        total += d.total
      }
      const frac = total ? loaded / total : 0
      setStep({ t: 'working', stage: 'models', pct: FORGE_PCT.models + frac * (FORGE_PCT.faces - FORGE_PCT.models - 2), bytes: total ? { loaded, total } : null, loot: null })
    } else if (e.stage !== 'done') {
      const stage = e.stage as ForgeStage
      setStep((cur) => {
        // Never step backwards (the attribute model can report after measuring).
        const prev = cur.t === 'working' ? cur.pct : 0
        return { t: 'working', stage, pct: Math.max(prev, FORGE_PCT[stage] ?? prev), bytes: null, loot: null }
      })
    }
  }, [])

  const analyze = useCallback(
    async (photo: Blob | HTMLCanvasElement) => {
      const started = performance.now()
      setWarnings([])
      downloads.current.clear()
      setPhotoUrl(photo instanceof Blob ? URL.createObjectURL(photo) : photo.toDataURL('image/jpeg', 0.85))
      setStep({ t: 'working', stage: 'boot', pct: FORGE_PCT.boot, bytes: null, loot: null })
      if (server) {
        try {
          await forget()
          const jpeg = await prepareUpload(photo)
          if (!alive.current) return
          upload.current = jpeg
          setStep({ t: 'working', stage: 'faces', pct: FORGE_PCT.faces, bytes: null, loot: null })
          seed.current = 1
          const result = await server.photoAvatar(jpeg, { count: 4 })
          if (!alive.current) return
          const loot = lootOf(result.best, s)
          setStep({ t: 'working', stage: 'synth', pct: 100, bytes: null, loot })
          await wait(Math.max(900 + loot.length * 160, MIN_FORGE_MS - (performance.now() - started)))
          if (!alive.current) return
          setWarnings(result.warnings.map((w) => w.message))
          setStep({ t: 'results', result, pick: 0 })
        } catch (e) {
          if (!alive.current) return
          setStep({ t: 'error', message: serverPhotoMessage(e, s) })
        }
        return
      }
      try {
        const V = await loadVision()
        photoAvatar.current ??= V.createPhotoAvatar({ modelBase, onProgress })
        await forget()
        const a = await photoAvatar.current.analyze(photo)
        if (!alive.current) return V.releaseAnalysis(a)
        analysis.current = a
        seed.current = 1
        const result = V.photoToAvatars(a, { count: 4 })
        const loot = lootOf(result.best, s)
        setStep({ t: 'working', stage: 'synth', pct: 100, bytes: null, loot })
        // Let the loot drop in and the level-up land before the hero select.
        await wait(Math.max(900 + loot.length * 160, MIN_FORGE_MS - (performance.now() - started)))
        if (!alive.current) return
        setWarnings(a.warnings.map((w) => w.message))
        setStep({ t: 'results', result, pick: 0 })
      } catch (e) {
        if (!alive.current) return
        const code = (e as { code?: string }).code
        const message =
          code === 'no_face' ? s.photoNoFace : code === 'too_small' ? s.photoTooSmall : code === 'too_dark' ? s.photoTooDark : code === 'models_unavailable' ? s.photoToolsFailed : s.photoFailed
        setStep({ t: 'error', message })
      }
    },
    [s, modelBase, onProgress, forget, server],
  )

  const retry = useCallback(async () => {
    if (server) {
      const jpeg = upload.current
      if (!jpeg) return
      seed.current += 1
      try {
        const result = await server.photoAvatar(jpeg, { count: 4, seed: seed.current * 7919 })
        if (alive.current) setStep({ t: 'results', result, pick: 0 })
      } catch (e) {
        if (alive.current) setStep({ t: 'error', message: serverPhotoMessage(e, s) })
      }
      return
    }
    const a = analysis.current
    if (!a) return
    seed.current += 1
    const V = await loadVision()
    setStep({ t: 'results', result: V.photoToAvatars(a, { count: 4, seed: seed.current * 7919 }), pick: 0 })
  }, [])

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      if (!alive.current) return stream.getTracks().forEach((t) => t.stop())
      streamRef.current = stream
      setStep({ t: 'camera' })
    } catch {
      setStep({ t: 'error', message: s.photoCameraFailed })
    }
  }, [s])

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (step.t === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => {})
    }
  }, [step.t])

  const snap = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    stopCamera()
    // The frame itself isn't mirrored (only the live preview is, via CSS).
    void analyze(c)
  }, [analyze, stopCamera])

  const chooseFile = () => fileRef.current?.click()
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const f = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (f) void analyze(f)
      }}
    />
  )

  const busy = step.t === 'working'
  return (
    <Dialog title={s.photoTitle} onClose={onClose} busy={busy} className="aps-dialog--photo">
      {fileInput}
      {step.t === 'consent' && (
        <div className="aps-photo">
          <div className="aps-photo__questCard">
            <div className="aps-photo__hero" aria-hidden="true">
              <Icon name="camera" size={30} />
            </div>
            <div>
              <span className="aps-forge__questTag">{s.forgeNewQuest}</span>
              <p className="aps-photo__lead">{s.photoIntro}</p>
            </div>
          </div>
          <ul className="aps-photo__points">
            <li>
              <Icon name="lock" size={16} />
              <span>{server ? s.photoPrivacyServer : s.photoPrivacy}</span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span>{s.photoPermission}</span>
            </li>
            <li>
              <Icon name="sliders" size={16} />
              <span>{s.photoNoGuessing}</span>
            </li>
          </ul>
          {!server && <p className="aps-photo__small">{s.photoDownloadNote}</p>}
          <div className="aps-row aps-photo__actions">
            <button type="button" className="aps-btn aps-btn--primary" onClick={chooseFile}>
              <Icon name="upload" />
              {s.photoChoose}
            </button>
            {hasCamera() && (
              <button type="button" className="aps-btn aps-btn--quiet" onClick={() => void openCamera()}>
                <Icon name="camera" />
                {s.photoUseCamera}
              </button>
            )}
          </div>
        </div>
      )}

      {step.t === 'camera' && (
        <div className="aps-photo">
          <video ref={videoRef} className="aps-photo__video" playsInline muted aria-label={s.photoCameraPreview} />
          <div className="aps-row aps-photo__actions">
            <button type="button" className="aps-btn aps-btn--primary" onClick={snap}>
              <Icon name="camera" />
              {s.photoTake}
            </button>
            <button
              type="button"
              className="aps-btn aps-btn--quiet"
              onClick={() => {
                stopCamera()
                setStep({ t: 'consent' })
              }}
            >
              {s.cancel}
            </button>
          </div>
        </div>
      )}

      {step.t === 'working' && <ForgeLoader photoUrl={photoUrl} stage={step.stage} pct={step.pct} bytes={step.bytes} loot={step.loot} />}

      {step.t === 'results' && (
        <div className="aps-photo aps-heroes">
          <div className="aps-heroes__head">
            <span className="aps-forge__questTag">{s.heroesTag}</span>
            <p className="aps-photo__lead">{s.photoPick}</p>
          </div>
          <div className="aps-photo__grid aps-heroes__grid" role="radiogroup" aria-label={s.photoPick}>
            {step.result.candidates.map((c, i) => (
              <button
                key={`${seed.current}-${i}`}
                type="button"
                role="radio"
                aria-checked={step.pick === i}
                className={`aps-hero${step.pick === i ? ' is-picked' : ''}`}
                style={{ animationDelay: `${i * 110}ms` }}
                onClick={() => setStep({ ...step, pick: i })}
                onDoubleClick={() => onPick(c.dna)}
              >
                {i === 0 && <span className="aps-hero__ribbon">{s.heroBest}</span>}
                <span className="aps-hero__art">
                  <AvatarImage dna={c.dna} crop="portrait" size={200} alt={c.label} className={`${idBase}-photo${i}`} serviceBase={env.premium?.base} server={env.serverStudio} />
                </span>
                <span className="aps-hero__name">{c.label}</span>
                <span className="aps-hero__meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(40 + c.confidence * 60)}%` }} />
                </span>
              </button>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="aps-notice">
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {step.result.notes.length > 0 && (
            <details className="aps-photo__notes">
              <summary>{fmt(s.photoNotes, { count: step.result.notes.length })}</summary>
              <ul>
                {step.result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="aps-row aps-photo__actions">
            <button type="button" className="aps-btn aps-btn--primary aps-heroes__play" onClick={() => onPick(step.result.candidates[step.pick].dna)}>
              <Icon name="play" />
              {s.photoUse}
            </button>
            <button type="button" className="aps-btn aps-btn--quiet" onClick={() => void retry()}>
              <Icon name="dice" />
              {s.photoRetry}
            </button>
            <button type="button" className="aps-btn aps-btn--quiet" onClick={chooseFile}>
              <Icon name="upload" />
              {s.photoAnother}
            </button>
          </div>
        </div>
      )}

      {step.t === 'error' && (
        <div className="aps-photo">
          <div className="aps-notice aps-notice--error" role="alert">
            <Icon name="warning" size={18} />
            <span>{step.message}</span>
          </div>
          <div className="aps-row aps-photo__actions">
            <button type="button" className="aps-btn aps-btn--primary" onClick={chooseFile}>
              <Icon name="upload" />
              {s.photoChoose}
            </button>
            {hasCamera() && (
              <button type="button" className="aps-btn aps-btn--quiet" onClick={() => void openCamera()}>
                <Icon name="camera" />
                {s.photoUseCamera}
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

/** What to tell the player when the service couldn't use a photo (never its raw message). */
function serverPhotoMessage(e: unknown, s: StudioStrings): string {
  if (!(e instanceof PhotoServerError)) return s.photoFailed
  if (e.code === 'no_face') return s.photoNoFace
  if (e.code === 'too_small') return s.photoTooSmall
  if (e.code === 'too_dark') return s.photoTooDark
  if (e.code === 'busy') return s.photoServerBusy
  if (e.code === 'offline') return s.photoServerOffline
  if (e.code === 'unavailable') return s.photoToolsFailed
  return s.photoFailed
}
