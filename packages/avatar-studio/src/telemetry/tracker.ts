/* A small batching tracker for hosts that forward studio telemetry to the avatar service
 * (`POST /avatar/v1/telemetry`, docs/studio.md).
 *
 *   const tracker = createTelemetryTracker({ src: 'web', send: (batch, final) => … })
 *   <AvatarStudio onTelemetry={tracker.track} />
 *
 * Events queue in memory and leave in batches of at most MAX_EVENTS (and about MAX_BYTES of
 * JSON, under the service's 16 KB): when the queue fills, after `flushMs` of quiet, and at
 * once with `final: true` when a `session_end` arrives (the page may be going away, so the
 * host should use navigator.sendBeacon for final batches). `sid` is random per tracker, kept
 * in memory only: the service joins a page's sessions with it and never stores it.
 *
 * Transport, consent and retries are the host's business; a failed send is simply lost. */

import { cleanEvent, type StudioTelemetryEvent } from './events.ts'

export const MAX_EVENTS = 50
export const MAX_BYTES = 14_000
export const FLUSH_MS = 20_000

export type TelemetrySource = 'web' | 'app' | 'embed' | 'other'

export interface TelemetryBatch {
  v: 1
  sid: string
  src: TelemetrySource
  events: StudioTelemetryEvent[]
}

export interface TrackerOptions {
  /** Delivers one batch; `final` = the page may be closing (use sendBeacon). */
  send: (batch: TelemetryBatch, final: boolean) => void
  src?: TelemetrySource
  /** Session id; default a random one (per tracker, so per page load for a module-level tracker). */
  sid?: string
  maxEvents?: number
  maxBytes?: number
  flushMs?: number
  /** Timers (tests). */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

export interface TelemetryTracker {
  /** Queues an event (the studio's `onTelemetry`). Never throws. */
  track: (event: StudioTelemetryEvent) => void
  /** Sends everything queued now. */
  flush: (final?: boolean) => void
  /** Drops the queue (consent withdrawn). */
  clear: () => void
  readonly pending: number
  readonly sid: string
}

/** 22 url-safe random characters (the service accepts [A-Za-z0-9_-]{8,64}). */
export function randomSid(): string {
  const bytes = new Uint8Array(16)
  try {
    globalThis.crypto.getRandomValues(bytes)
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let s = ''
  for (const b of bytes) s += abc[b & 63]
  return s + abc[bytes[0] >> 6] + abc[bytes[1] >> 6] + abc[bytes[2] >> 6] + abc[bytes[3] >> 6] + abc[bytes[4] >> 6] + abc[bytes[5] >> 6]
}

export function createTelemetryTracker(o: TrackerOptions): TelemetryTracker {
  const maxEvents = Math.max(1, Math.min(MAX_EVENTS, o.maxEvents ?? MAX_EVENTS))
  const maxBytes = o.maxBytes ?? MAX_BYTES
  const flushMs = o.flushMs ?? FLUSH_MS
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = o.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const sid = o.sid ?? randomSid()
  const src = o.src ?? 'web'
  let queue: StudioTelemetryEvent[] = []
  let bytes = 0
  let timer: unknown = null

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }

  const flush = (final = false) => {
    stopTimer()
    while (queue.length) {
      const chunk: StudioTelemetryEvent[] = []
      let size = 60
      while (queue.length && chunk.length < maxEvents) {
        const n = JSON.stringify(queue[0]).length + 1
        if (chunk.length && size + n > maxBytes) break
        chunk.push(queue.shift() as StudioTelemetryEvent)
        size += n
      }
      try {
        o.send({ v: 1, sid, src, events: chunk }, final)
      } catch {
        /* lost: telemetry never breaks the page */
      }
    }
    bytes = 0
  }

  const track = (event: StudioTelemetryEvent) => {
    const e = event && cleanEvent(event.name, event.key, event.value)
    if (!e) return
    queue.push(e)
    bytes += JSON.stringify(e).length + 1
    if (e.name === 'session_end') return flush(true)
    if (queue.length >= maxEvents || bytes >= maxBytes - 200) return flush(false)
    if (timer === null) timer = setTimer(() => flush(false), flushMs)
  }

  return {
    track,
    flush,
    clear: () => {
      stopTimer()
      queue = []
      bytes = 0
    },
    get pending() {
      return queue.length
    },
    sid,
  }
}
