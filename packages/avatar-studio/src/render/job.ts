/* One thumbnail render request, and the function that fulfils it: the engine's `renderThumb`
 * (moved there so the avatar service draws byte-identical tiles, POST /studio/tiles). It runs in
 * the render workers and, when workers are unavailable, on the main thread. */

export { renderThumb as renderJob, THUMB_CROPS, type ThumbCrop, type ThumbJob as RenderJob } from '@arkplay/avatar-engine'
