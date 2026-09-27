/* Render worker: turns RenderJobs into SVG strings off the main thread, so dozens of live
 * thumbnails never block a slider drag. */

import { renderJob, type RenderJob } from './job.ts'

export interface WorkerRequest {
  id: number
  job: RenderJob
}

export type WorkerResponse = { id: number; svg: string } | { id: number; error: string }

interface WorkerScope {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null
  postMessage(msg: WorkerResponse): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (ev) => {
  const { id, job } = ev.data
  try {
    scope.postMessage({ id, svg: renderJob(job) })
  } catch (e) {
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
