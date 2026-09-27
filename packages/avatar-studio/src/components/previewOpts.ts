/* The preview's own settings (not part of the avatar): framing, zoom, try-on overrides
 * and animation playback. */

import type { Crop, View } from '@arkplay/avatar-engine'

export interface PreviewOpts {
  view: View
  crop: Crop
  zoom: number
  /** '' = the avatar's own expression. */
  expression: string
  /** '' = the avatar's own pose. */
  pose: string
  /** '' = still. */
  clip: string
  playing: boolean
  time: number
}

export const initialPreview = (reducedMotion: boolean): PreviewOpts => ({ view: 'front', crop: 'fit', zoom: 1, expression: '', pose: '', clip: '', playing: !reducedMotion, time: 0 })
