/* A live thumbnail image (see render/useThumb.ts). The label lives on the tile, so the
 * image itself is decorative. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RenderJob } from '../render/job.ts'
import { SERVICE_ID_PREFIX, previewKey, type PremiumPreviewRequest, type PremiumService } from '../render/premium.ts'
import { useThumb } from '../render/useThumb.ts'

export interface ThumbProps {
  tkey: string | null
  make: () => RenderJob
  priority?: number
  className?: string
}

export function Thumb({ tkey, make, priority, className }: ThumbProps) {
  const t = useThumb(tkey, make, priority)
  const cls = `aps-thumb${t.loading ? ' is-loading' : ''}${t.failed ? ' is-failed' : ''}${className ? ` ${className}` : ''}`
  return <span ref={t.ref} className={cls}>{t.url ? <img src={t.url} alt="" draggable={false} decoding="async" /> : null}</span>
}

/**
 * A thumbnail the avatar service draws (premium items, premium core): a plain lazy <img>, which
 * the browser caches. If the service can't be reached, `fallback` (a local thumbnail with the
 * placeholder) takes its place.
 */
export function ServiceThumb({ src, className, fallback }: { src: string; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === src) return <>{fallback}</>
  return (
    <span className={`aps-thumb aps-thumb--service${className ? ` ${className}` : ''}`}>
      <img src={src} alt="" draggable={false} decoding="async" loading="lazy" onError={() => setFailed(src)} />
    </span>
  )
}

/**
 * A look the avatar service draws (premium core), as an image: the export dialog's preview of an
 * avatar that wears premium items. `fallback` shows while it loads and if it can't be fetched.
 */
export function ServicePreviewThumb({ premium, req, className, fallback }: { premium: PremiumService; req: PremiumPreviewRequest; className?: string; fallback: ReactNode }) {
  const key = previewKey(req)
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null)
  const reqRef = useRef(req)
  reqRef.current = req
  useEffect(() => {
    const controller = new AbortController()
    let url = ''
    premium
      .preview(reqRef.current, SERVICE_ID_PREFIX, controller.signal)
      .then((svg) => {
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setShown({ key, url })
      })
      .catch(() => {
        // Aborted, or the service can't draw it: the fallback stays.
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [premium, key])
  if (!shown || shown.key !== key) return <>{fallback}</>
  return (
    <span className={`aps-thumb aps-thumb--service${className ? ` ${className}` : ''}`}>
      <img src={shown.url} alt="" draggable={false} decoding="async" />
    </span>
  )
}
