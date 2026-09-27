/* Embed mode: the studio inside a host page's iframe, speaking the child side of
 * @arkplay/avatar-client's protocol. Messages go only to the host origin from the URL;
 * incoming messages count only if they come from that origin AND from the parent window. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { envelope, readEnvelope, type EmbedConfig, type HostMessage, type StudioMessage } from '@arkplay/avatar-client'
import { ENGINE_VERSION_STRING, decodeShareCode, encodeShareCode, type AvatarDNA } from '@arkplay/avatar-engine'
import { AvatarStudio, type AvatarStudioHandle, type SaveResult } from '@arkplay/avatar-studio'
import { sanitizeConfig } from './embedParams.ts'
import { AVATAR_API, SERVER_EXPORTS, SERVER_PHOTO, SERVER_STUDIO } from './premium.ts'

const CHANGE_DEBOUNCE_MS = 300

export function Embed({ origin, code, config }: { origin: string; code: string | null; config: EmbedConfig }) {
  const studio = useRef<AvatarStudioHandle>(null)
  const root = useRef<HTMLDivElement>(null)
  const [cfg, setCfg] = useState<EmbedConfig>(config)

  const post = useCallback(
    (msg: StudioMessage) => {
      try {
        window.parent.postMessage(envelope(msg), origin)
      } catch {
        // A detached or cross-origin-mismatched parent: nothing to tell.
      }
    },
    [origin],
  )

  // A bad code in the URL: the studio shows its own notice; the host hears about it too.
  const [initial] = useState(() => {
    if (!code) return undefined
    try {
      decodeShareCode(code)
      return code
    } catch {
      return undefined
    }
  })

  // Once per page, even when React re-runs effects (StrictMode in development).
  const announced = useRef(false)
  useEffect(() => {
    if (announced.current) return
    announced.current = true
    post({ type: 'ready', engineVersion: ENGINE_VERSION_STRING })
    if (code && !initial) post({ type: 'error', code: 'invalid-code', message: 'The avatar code in the embed URL could not be read.' })
  }, [post, code, initial])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== origin || ev.source !== window.parent) return
      const msg = readEnvelope<HostMessage>(ev.data)
      if (!msg) return
      switch (msg.type) {
        case 'load': {
          const input: AvatarDNA | string | undefined = msg.dna ?? msg.code
          if (!input) return
          const err = studio.current?.load(input)
          if (err) post({ type: 'error', code: 'invalid-avatar', message: err })
          break
        }
        case 'config':
          setCfg((c) => ({ ...c, ...sanitizeConfig(msg.config) }))
          break
        case 'theme':
          if (msg.theme === 'dark' || msg.theme === 'light') setCfg((c) => ({ ...c, theme: msg.theme }))
          break
        case 'requestSave':
          void studio.current?.save()
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, post])

  // Changes are debounced so a host doesn't process every intermediate edit.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onChange = useCallback(
    (dna: AvatarDNA) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        let c = ''
        try {
          c = encodeShareCode(dna)
        } catch {
          // The DNA is the payload; a code is a convenience.
        }
        post({ type: 'change', dna, code: c })
      }, CHANGE_DEBOUNCE_MS)
    },
    [post],
  )
  const onSave = useCallback((r: SaveResult) => post({ type: 'save', dna: r.dna, code: r.code, name: r.name }), [post])
  const onCancel = useCallback(() => post({ type: 'cancel' }), [post])

  // Preferred height, so the host can size the iframe to the content.
  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = -1
    let frame = 0
    const measure = () => {
      frame = 0
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h !== last) {
        last = h
        post({ type: 'resize', height: h })
      }
    }
    const ro = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure)
    })
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [post])

  const theme = cfg.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div ref={root} className="app-embed">
      <AvatarStudio
        ref={studio}
        initial={initial}
        draftKey={false}
        onChange={onChange}
        onSave={onSave}
        onCancel={cfg.cancel === false ? undefined : onCancel}
        saveLabel={cfg.saveLabel}
        kinds={cfg.kinds}
        exports={cfg.exports !== false}
        theme={theme}
        previewBase={AVATAR_API} serverExports={SERVER_EXPORTS} serverStudio={SERVER_STUDIO} serverPhoto={SERVER_PHOTO}
      />
    </div>
  )
}

export function EmbedError({ origin }: { origin: string | null }) {
  return (
    <main className="app-error" role="alert">
      <h1>This studio can’t be embedded like this</h1>
      <p>
        Embed mode needs the host page’s origin, for example <code>?embed=1&amp;origin=https://example.com</code>.{' '}
        {origin ? (
          <>
            <code>{origin}</code> is not a valid http(s) origin.
          </>
        ) : (
          'No origin was given.'
        )}
      </p>
      <p>Use mountStudio() from @arkplay/avatar-client, which sets this up for you.</p>
    </main>
  )
}
