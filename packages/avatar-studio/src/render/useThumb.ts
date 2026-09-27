/* Lazy live thumbnails: a tile asks for its render only while it is near the viewport,
 * keeps showing its previous image until the new one is ready (no flashing while the
 * avatar changes), and cancels the request when its key changes or it scrolls away. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderJob } from './job.ts'
import { useEnv } from '../components/context.ts'
import { sharedThumbs } from './thumbs.ts'

type Watcher = (visible: boolean) => void

let observer: IntersectionObserver | null = null
const watchers = new WeakMap<Element, Watcher>()

function observe(el: Element, fn: Watcher): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    fn(true)
    return () => {}
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) watchers.get(e.target)?.(e.isIntersecting)
      },
      { rootMargin: '240px 0px' },
    )
  }
  watchers.set(el, fn)
  observer.observe(el)
  return () => {
    watchers.delete(el)
    observer?.unobserve(el)
  }
}

export interface ThumbState {
  ref: (el: Element | null) => void
  url: string | undefined
  loading: boolean
  failed: boolean
}

/** `key` identifies the image; `make` builds its job and is only called if it must render. */
export function useThumb(key: string | null, make: () => RenderJob, priority = 0): ThumbState {
  // Server rendering: the studio's own tile service (drawn by the avatar service).
  const service = useEnv().thumbs ?? sharedThumbs()
  const [el, setEl] = useState<Element | null>(null)
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState<{ key: string; url: string } | null>(() => {
    const url = key ? service.peek(key) : undefined
    return key && url ? { key, url } : null
  })
  const [failed, setFailed] = useState(false)
  const makeRef = useRef(make)
  makeRef.current = make

  useEffect(() => (el ? observe(el, setVisible) : undefined), [el])

  useEffect(() => {
    if (!key) return
    const hit = service.peek(key)
    if (hit) {
      setShown((s) => (s?.key === key ? s : { key, url: hit }))
      setFailed(false)
      return
    }
    if (!visible) return
    const controller = new AbortController()
    service
      .request(key, () => makeRef.current(), { signal: controller.signal, priority })
      .then((url) => {
        setShown({ key, url })
        setFailed(false)
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [key, visible, priority, service])

  // Pin what is on screen so the cache never revokes a URL an <img> is showing.
  const shownKey = shown?.key
  useEffect(() => {
    if (!shownKey) return
    service.retain(shownKey)
    return () => service.release(shownKey)
  }, [shownKey, service])

  const ref = useCallback((node: Element | null) => setEl(node), [])
  return { ref, url: shown?.url, loading: !!key && shown?.key !== key && !failed, failed }
}
