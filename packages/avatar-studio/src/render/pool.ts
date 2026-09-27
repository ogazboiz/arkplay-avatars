/* A small pool of render workers with a priority queue and cancellation.
 *
 * Thumbnails ask for renders constantly (every edit changes every thumbnail), so stale
 * requests must be cheap to drop: a queued job is removed when its AbortSignal fires, and
 * a job already running finishes but its result is discarded. If workers can't be created
 * (old browsers, strict CSP, SSR shells) jobs run on the main thread, one per macrotask so
 * input stays responsive. Idle workers are terminated to give their memory back. */

import { renderJob, type RenderJob } from './job.ts'
import type { WorkerRequest, WorkerResponse } from './render.worker.ts'

export interface RunOptions {
  /** Higher runs first (default 0). */
  priority?: number
  signal?: AbortSignal
}

export interface RenderPool {
  run(job: RenderJob, opts?: RunOptions): Promise<string>
  /** 'workers' until workers prove unusable, then 'main'. */
  readonly mode: 'workers' | 'main'
  /** Jobs waiting or running. */
  readonly pending: number
  /** Starts the workers now (they load the engine) so the first thumbnails are quick. */
  warm(): void
  dispose(): void
}

interface Task {
  id: number
  job: RenderJob
  priority: number
  resolve: (svg: string) => void
  reject: (e: unknown) => void
  cancelled: boolean
  cleanup: () => void
}

interface Slot {
  worker: Worker
  task: Task | null
}

const abortError = () => new DOMException('The render was cancelled.', 'AbortError')

export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4
  return Math.max(1, Math.min(4, cores - 1))
}

function spawnWorker(): Worker | null {
  try {
    return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'arkplay-avatar-render' })
  } catch {
    return null
  }
}

export function createRenderPool(size = defaultPoolSize(), idleMs = 60_000): RenderPool {
  let mode: 'workers' | 'main' = typeof Worker === 'undefined' ? 'main' : 'workers'
  const slots: Slot[] = []
  const queue: Task[] = []
  let nextId = 1
  let mainScheduled = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let running = 0

  const take = (): Task | undefined => {
    let best = -1
    for (let i = 0; i < queue.length; i++) if (best < 0 || queue[i].priority > queue[best].priority) best = i
    return best < 0 ? undefined : queue.splice(best, 1)[0]
  }

  const finish = (t: Task, svg?: string, err?: unknown) => {
    running--
    t.cleanup()
    if (t.cancelled) return
    if (err !== undefined) t.reject(err)
    else t.resolve(svg as string)
  }

  const armIdle = () => {
    clearTimeout(idleTimer)
    if (queue.length || slots.some((s) => s.task)) return
    idleTimer = setTimeout(() => {
      if (queue.length || slots.some((s) => s.task)) return
      for (const s of slots.splice(0)) s.worker.terminate()
    }, idleMs)
  }

  const fallBack = () => {
    mode = 'main'
    for (const s of slots.splice(0)) {
      s.worker.terminate()
      if (s.task) {
        running--
        queue.push(s.task)
      }
    }
  }

  const addSlot = (): Slot | null => {
    const worker = spawnWorker()
    if (!worker) return null
    const slot: Slot = { worker, task: null }
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const t = slot.task
      if (!t || t.id !== ev.data.id) return
      slot.task = null
      if ('svg' in ev.data) finish(t, ev.data.svg)
      else finish(t, undefined, new Error(ev.data.error))
      pump()
    }
    // A worker that fails to load (bundler or CSP trouble) takes the pool to main-thread
    // rendering rather than leaving thumbnails blank.
    worker.onerror = (ev) => {
      ev.preventDefault?.()
      fallBack()
      pump()
    }
    slots.push(slot)
    return slot
  }

  const runMain = () => {
    mainScheduled = false
    const t = take()
    if (!t) return armIdle()
    running++
    let svg: string | undefined
    let err: unknown
    try {
      svg = renderJob(t.job)
    } catch (e) {
      err = e ?? new Error('Render failed')
    }
    finish(t, svg, err)
    pump()
  }

  function pump(): void {
    if (mode === 'main') {
      if (!mainScheduled && queue.length) {
        mainScheduled = true
        setTimeout(runMain, 0)
      }
      if (!queue.length) armIdle()
      return
    }
    while (queue.length) {
      let slot = slots.find((s) => !s.task)
      if (!slot && slots.length < size) {
        slot = addSlot() ?? undefined
        if (!slot && !slots.length) {
          fallBack()
          return pump()
        }
      }
      if (!slot) break
      const t = take()
      if (!t) break
      slot.task = t
      running++
      const msg: WorkerRequest = { id: t.id, job: t.job }
      try {
        slot.worker.postMessage(msg)
      } catch (e) {
        slot.task = null
        finish(t, undefined, e)
      }
    }
    armIdle()
  }

  return {
    get mode() {
      return mode
    },
    get pending() {
      return queue.length + running
    },
    run(job, opts = {}) {
      return new Promise<string>((resolve, reject) => {
        const signal = opts.signal
        if (signal?.aborted) return reject(abortError())
        const t: Task = { id: nextId++, job, priority: opts.priority ?? 0, resolve, reject, cancelled: false, cleanup: () => {} }
        if (signal) {
          const onAbort = () => {
            if (t.cancelled) return
            t.cancelled = true
            const i = queue.indexOf(t)
            if (i >= 0) queue.splice(i, 1)
            reject(abortError())
          }
          signal.addEventListener('abort', onAbort, { once: true })
          t.cleanup = () => signal.removeEventListener('abort', onAbort)
        }
        clearTimeout(idleTimer)
        queue.push(t)
        pump()
      })
    },
    warm() {
      if (mode !== 'workers') return
      while (slots.length < size) {
        if (!addSlot()) {
          if (!slots.length) fallBack()
          break
        }
      }
      armIdle()
    },
    dispose() {
      clearTimeout(idleTimer)
      for (const t of queue.splice(0)) {
        t.cancelled = true
        t.cleanup()
        t.reject(abortError())
      }
      for (const s of slots.splice(0)) s.worker.terminate()
    },
  }
}

let shared: RenderPool | null = null

/** The page-wide pool (created on first use). */
export function sharedPool(): RenderPool {
  if (!shared) shared = createRenderPool()
  return shared
}
