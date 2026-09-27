/* Host side of the studio iframe embed. For pages that can't import the React studio
 * directly (games' web shells, other sites): `mountStudio(el, opts)` creates the iframe and
 * speaks protocol.ts with it. The ArkPlay website itself imports @arkplay/avatar-studio. */

import type { AvatarDNA } from '@arkplay/avatar-engine'
import { EMBED_PARAMS, envelope, readEnvelope, type EmbedConfig, type HostMessage, type StudioMessage, type StudioTheme } from './protocol.ts'

export interface MountStudioOptions {
  /** URL of the studio app (default `/avatar/studio/` on the current origin). */
  studioUrl?: string
  /** Initial avatar (a share code is shorter and goes in the URL; DNA is sent after `ready`). */
  code?: string
  dna?: AvatarDNA
  config?: EmbedConfig
  /** Grow and shrink the iframe with the studio's content (default true). */
  autoResize?: boolean
  /** Accessible title of the iframe. */
  title?: string
  onReady?: (engineVersion: string) => void
  onChange?: (dna: AvatarDNA, code: string) => void
  onSave?: (r: { dna: AvatarDNA; code: string; name: string }) => void
  onCancel?: () => void
  onError?: (e: { code: string; message: string }) => void
}

export interface StudioHandle {
  readonly iframe: HTMLIFrameElement
  readonly ready: Promise<void>
  load(avatar: { dna?: AvatarDNA; code?: string }): void
  setTheme(theme: StudioTheme): void
  setConfig(config: EmbedConfig): void
  requestSave(): void
  destroy(): void
}

export function mountStudio(el: HTMLElement, opts: MountStudioOptions = {}): StudioHandle {
  const src = new URL(opts.studioUrl ?? '/avatar/studio/', location.href)
  const studioOrigin = src.origin
  src.searchParams.set(EMBED_PARAMS.embed, '1')
  src.searchParams.set(EMBED_PARAMS.origin, location.origin)
  if (opts.code) src.searchParams.set(EMBED_PARAMS.code, opts.code)
  if (opts.config) src.searchParams.set(EMBED_PARAMS.config, JSON.stringify(opts.config))

  const iframe = document.createElement('iframe')
  iframe.src = src.href
  iframe.title = opts.title ?? 'Avatar studio'
  iframe.allow = 'clipboard-write'
  iframe.style.border = '0'
  iframe.style.width = '100%'
  iframe.style.minHeight = '560px'
  el.appendChild(iframe)

  let isReady = false
  const queue: HostMessage[] = []
  let resolveReady!: () => void
  const ready = new Promise<void>((r) => (resolveReady = r))

  const post = (msg: HostMessage) => {
    if (!isReady) {
      queue.push(msg)
      return
    }
    iframe.contentWindow?.postMessage(envelope(msg), studioOrigin)
  }

  const onMessage = (ev: MessageEvent) => {
    // Both checks matter: the origin alone would accept any other frame from the studio's origin.
    if (ev.origin !== studioOrigin || ev.source !== iframe.contentWindow) return
    const msg = readEnvelope<StudioMessage>(ev.data)
    if (!msg) return
    switch (msg.type) {
      case 'ready':
        isReady = true
        if (opts.dna) queue.unshift({ type: 'load', dna: opts.dna })
        for (const m of queue.splice(0)) iframe.contentWindow?.postMessage(envelope(m), studioOrigin)
        resolveReady()
        opts.onReady?.(msg.engineVersion)
        break
      case 'change':
        opts.onChange?.(msg.dna, msg.code)
        break
      case 'save':
        opts.onSave?.({ dna: msg.dna, code: msg.code, name: msg.name })
        break
      case 'cancel':
        opts.onCancel?.()
        break
      case 'resize':
        if (opts.autoResize !== false && Number.isFinite(msg.height)) iframe.style.height = `${Math.max(320, Math.min(4000, Math.ceil(msg.height)))}px`
        break
      case 'error':
        opts.onError?.({ code: msg.code, message: msg.message })
        break
    }
  }
  window.addEventListener('message', onMessage)

  return {
    iframe,
    ready,
    load: (avatar) => post({ type: 'load', ...avatar }),
    setTheme: (theme) => post({ type: 'theme', theme }),
    setConfig: (config) => post({ type: 'config', config }),
    requestSave: () => post({ type: 'requestSave' }),
    destroy: () => {
      window.removeEventListener('message', onMessage)
      iframe.remove()
    },
  }
}
