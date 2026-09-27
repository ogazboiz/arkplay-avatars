/* WebM video through canvas.captureStream + MediaRecorder. Recording is real time, so the
 * frames are drawn first and then played into the canvas at the clip's frame rate. */

const CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

/** The MediaRecorder type to use, or null when this browser can't record WebM from a canvas. */
export function webmMimeType(): string | null {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return null
  const c = document.createElement('canvas')
  if (typeof (c as HTMLCanvasElement & { captureStream?: unknown }).captureStream !== 'function') return null
  for (const t of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      // isTypeSupported can throw on odd inputs in old engines; try the next.
    }
  }
  return null
}

export interface RecordOptions {
  fps: number
  /** How many times to play the frames. */
  loops: number
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

export async function recordWebm(frames: readonly CanvasImageSource[], width: number, height: number, o: RecordOptions): Promise<Blob> {
  const mimeType = webmMimeType()
  if (!mimeType) throw new Error('This browser can’t record WebM video.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw images (no 2D canvas).')
  ctx.drawImage(frames[0], 0, 0, width, height)
  // Frame rate 0 + requestFrame(): one video frame per drawn frame, even when the page is
  // not painting (a background tab or hidden panel would otherwise drop frames).
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.min(8_000_000, width * height * o.fps * 0.25) })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  recorder.start(250)
  const total = frames.length * o.loops
  const step = 1000 / o.fps
  const t0 = performance.now()
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError')
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(frames[i % frames.length], 0, 0, width, height)
      track?.requestFrame?.()
      o.onProgress?.((i + 1) / total)
      // Schedule against the start time so timer drift doesn't stretch the video.
      const wait = t0 + (i + 1) * step - performance.now()
      await new Promise((r) => setTimeout(r, Math.max(0, wait)))
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
    for (const t of stream.getTracks()) t.stop()
  }
  return new Blob(chunks, { type: 'video/webm' })
}
