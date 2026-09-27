/* Wardrobe thumbnails: how close to frame an item so it reads on the avatar. Pure. */

import type { AvatarKind, SlotId } from '@arkplay/avatar-engine'
import type { ThumbCrop } from '../render/job.ts'

/** How an item's thumbnail is framed: close enough to see the item on the avatar. */
export function slotCrop(slot: SlotId, kind: AvatarKind): ThumbCrop {
  if (kind === 'creature') return slot === 'head' || slot === 'eyes' || slot === 'face' ? 'head' : slot === 'neck' ? 'bust' : 'full'
  switch (slot) {
    case 'top':
    case 'outer':
    case 'neck':
      return 'bust'
    case 'bottom':
    case 'waist':
      return 'legs'
    case 'shoes':
    case 'socks':
      return 'feet'
    case 'head':
    case 'headFeature':
    case 'hairAcc':
    case 'ears':
      return 'head'
    case 'eyes':
    case 'face':
      return 'face'
    default:
      return 'tall'
  }
}
