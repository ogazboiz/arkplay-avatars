/* Thumbnail service: render jobs → cached object URLs of SVG images.
 *
 * Thumbnails are shown as <img> rather than inline SVG: dozens of 80 kB SVG documents
 * inline would make every React commit and style recalc slow, while an image is parsed
 * once, off the DOM, and scales without re-rendering. Requests for the same key share one
 * render; a render is cancelled only when every requester has given up on it. */

import { createLru, type Lru } from './lru.ts'
import { sharedPool, type RenderPool } from './pool.ts'
import type { RenderJob } from './job.ts'

export interface ThumbRequest {
  signal?: AbortSignal
  priority?: number
}

export interface ThumbService {
  peek(key: string): string | undefined
  request(key: string, make: () => RenderJob, opts?: ThumbRequest): Promise<string>
  retain(key: string): void
  release(key: string): void
}

interface Flight {
  promise: Promise<string>
  controller: AbortController
  refs: number
}

const abortError = () => new DOMException('The thumbnail is no longer needed.', 'AbortError')

export function createThumbService(pool: RenderPool, max = 320): ThumbService {
  const lru: Lru<string> = createLru<string>(max, (_key, url) => URL.revokeObjectURL(url))
  const inflight = new Map<string, Flight>()

  return {
    peek: (key) => lru.get(key),
    retain: (key) => lru.pin(key),
    release: (key) => lru.unpin(key),
    request(key, make, opts = {}) {
      const hit = lru.get(key)
      if (hit) return Promise.resolve(hit)
      let f = inflight.get(key)
      if (!f) {
        const controller = new AbortController()
        const flight: Flight = {
          controller,
          refs: 0,
          promise: pool
            .run(make(), { signal: controller.signal, priority: opts.priority })
            .then((svg) => {
              const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
              lru.set(key, url)
              return url
            })
            .finally(() => {
              if (inflight.get(key) === flight) inflight.delete(key)
            }),
        }
        f = flight
        inflight.set(key, f)
      }
      const flight = f
      flight.refs++
      return new Promise<string>((resolve, reject) => {
        let done = false
        const signal = opts.signal
        const settle = () => {
          done = true
          flight.refs--
          signal?.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
          if (done) return
          settle()
          if (flight.refs <= 0) flight.controller.abort()
          reject(abortError())
        }
        if (signal?.aborted) return onAbort()
        signal?.addEventListener('abort', onAbort, { once: true })
        flight.promise.then(
          (url) => {
            if (done) return
            settle()
            resolve(url)
          },
          (err: unknown) => {
            if (done) return
            settle()
            reject(err)
          },
        )
      })
    },
  }
}

let shared: ThumbService | null = null

export function sharedThumbs(): ThumbService {
  if (!shared) shared = createThumbService(sharedPool())
  return shared
}
