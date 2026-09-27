/* Picker tiles drawn by the avatar service (server rendering, docs/studio.md):
 * a RenderPool (the same interface as the browser worker pool) whose jobs are sent in batches to
 * `POST {base}/studio/tiles`. Jobs asked for within one frame travel together (up to 48 a
 * request, highest priority first, two requests in flight); a job cancelled before its batch
 * leaves never goes. A busy service (429/503 with Retry-After) is asked again when it says it can
 * take it, up to a few times; tiles keep showing their previous picture meanwhile.
 *
 * Uploaded custom art travels by id (the service reads it itself); only art that exists nowhere
 * but in the DNA (inline `src`, e.g. an embed without uploads) is sent inline. */

import type { AvatarDNA } from '@arkplay/avatar-engine'
import type { RenderJob } from './job.ts'
import type { RenderPool, RunOptions } from './pool.ts'
import { PremiumPreviewError, type PremiumService } from './premium.ts'

/** Most tiles in one request (the service's limit). */
export const TILES_PER_REQUEST = 48
/** Keep a request's JSON under this (the service reads up to 1 MB). */
const MAX_BODY_CHARS = 700_000
const IN_FLIGHT = 2
const MAX_RETRIES = 3

interface Queued {
  job: RenderJob
  priority: number
  signal?: AbortSignal
  resolve: (svg: string) => void
  reject: (e: unknown) => void
  tries: number
}

const abortError = () => new DOMException('The thumbnail is no longer needed.', 'AbortError')

/** Custom art by id when it has one (the service resolves it); inline only when that's all there is. */
function lean(dna: AvatarDNA): AvatarDNA {
  const strip = <T extends { asset?: { id?: string; src?: string } }>(i: T): T => (i.asset?.id && i.asset.src ? { ...i, asset: { ...i.asset, src: undefined } } : i)
  return { ...dna, outfit: dna.outfit.map(strip), accessories: dna.accessories.map(strip) }
}

/** The request body item of one job. */
export function tileItem(job: RenderJob): Record<string, unknown> {
  const it: Record<string, unknown> = { dna: lean(job.dna), crop: job.crop, size: job.size ?? 160 }
  if (job.view && job.view !== 'front') it.view = job.view
  if (job.scene) it.scene = true
  if (job.expression) it.expression = job.expression
  if (job.pose) it.pose = job.pose
  if (job.quality && job.quality !== 'standard') it.quality = job.quality
  if (job.detail) it.detail = job.detail
  return it
}

export function serverTilePool(service: PremiumService): RenderPool {
  let queue: Queued[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = 0
  let disposed = false

  const schedule = (ms = 16) => {
    if (timer === undefined && !disposed) timer = setTimeout(pump, ms)
  }

  function pump() {
    timer = undefined
    // Cancelled jobs never leave.
    queue = queue.filter((q) => {
      if (!q.signal?.aborted) return true
      q.reject(abortError())
      return false
    })
    while (inFlight < IN_FLIGHT && queue.length) {
      queue.sort((a, b) => b.priority - a.priority)
      const batch: Queued[] = []
      const items: Record<string, unknown>[] = []
      let chars = 0
      while (queue.length && batch.length < TILES_PER_REQUEST) {
        const item = tileItem(queue[0].job)
        const size = JSON.stringify(item).length
        if (batch.length && chars + size > MAX_BODY_CHARS) break
        batch.push(queue.shift() as Queued)
        items.push(item)
        chars += size
      }
      send(batch, items)
    }
  }

  function send(batch: Queued[], items: Record<string, unknown>[]) {
    inFlight++
    service.tiles(items).then(
      (svgs) => {
        batch.forEach((q, i) => {
          const svg = svgs[i]
          if (svg) q.resolve(svg)
          else q.reject(new PremiumPreviewError('failed', 'The avatar service could not draw this tile.'))
        })
      },
      (e: unknown) => {
        const retryable = e instanceof PremiumPreviewError && e.kind === 'busy'
        const wait = retryable ? Math.min(15, Math.max(1, e.retryAfter ?? 2)) * 1000 : 0
        for (const q of batch) {
          if (retryable && q.tries < MAX_RETRIES && !q.signal?.aborted) {
            q.tries++
            queue.push(q)
          } else q.reject(e)
        }
        if (retryable) {
          clearTimeout(timer)
          timer = undefined
          schedule(wait)
        }
      },
    ).finally(() => {
      inFlight--
      if (queue.length) schedule(0)
    })
  }

  return {
    mode: 'workers',
    get pending() {
      return queue.length + inFlight
    },
    warm() {},
    dispose() {
      disposed = true
      clearTimeout(timer)
      for (const q of queue.splice(0)) q.reject(abortError())
    },
    run(job: RenderJob, opts: RunOptions = {}): Promise<string> {
      if (disposed) return Promise.reject(abortError())
      if (opts.signal?.aborted) return Promise.reject(abortError())
      return new Promise<string>((resolve, reject) => {
        queue.push({ job, priority: opts.priority ?? 0, signal: opts.signal, resolve, reject, tries: 0 })
        schedule()
      })
    },
  }
}
