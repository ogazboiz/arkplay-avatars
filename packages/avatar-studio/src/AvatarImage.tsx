/* <AvatarImage>: an avatar rendered inline, for navs, profile pages and lists. Memoized:
 * it re-renders only when its inputs change. Alt text defaults to the engine's
 * description, so the picture means the same to screen-reader users.
 *
 * Premium items (premium core, docs/studio.md): the browser engine has no art for
 * them and draws a neutral placeholder. With `serviceBase` (the avatar API base), an avatar that
 * wears them is shown as the service's public image of its share code instead. With `server`
 * too (server rendering, docs/studio.md), every avatar is: nothing is drawn here. */

import { memo, useMemo } from 'react'
import { decodeShareCode, describeDNA, encodeShareCode, needsPremiumArt, normalizeDNA, renderSVG, type AvatarDNA, type Crop, type View } from '@arkplay/avatar-engine'
import { nextIdPrefix } from './render/ids.ts'

export interface AvatarImageProps {
  dna?: AvatarDNA
  code?: string
  /** Default 'portrait' (head and shoulders, room for a circle frame). */
  crop?: Crop
  view?: View
  /** Width in CSS px (default 128). */
  size?: number
  expression?: string
  /** Scene background (default true). */
  background?: boolean
  /** 'high' (default) is the engine's richer still look; 'standard' is lighter for long lists. */
  quality?: 'standard' | 'high'
  /** Looping aura/effect animation (default: the engine's, on for 'high'). */
  motion?: boolean
  className?: string
  /** Default: the avatar's description. Pass '' for a decorative image. */
  alt?: string
  /**
   * The avatar API base (e.g. `/avatar/v1`). An avatar wearing premium items is then shown as
   * the service's image (`{serviceBase}/render/{code}.svg`), because browsers have no premium art.
   */
  serviceBase?: string
  /** With `serviceBase`: always show the service's image, whatever the avatar wears. */
  server?: boolean
}

/** The service's public SVG of a premium look (sharp at any density; `detail` keeps small ones light). */
function serviceImageUrl(base: string, dna: AvatarDNA, o: { crop: Crop; view: View; size: number; expression?: string; background: boolean }): string {
  const q = new URLSearchParams({ size: String(Math.max(16, Math.min(2048, Math.round(o.size)))), crop: o.crop, view: o.view, bg: o.background ? '1' : '0' })
  if (o.expression) q.set('expression', o.expression)
  if (o.size <= 256) q.set('detail', o.size <= 96 ? 'low' : 'medium')
  return `${base.replace(/\/+$/, '')}/render/${encodeShareCode(dna)}.svg?${q}`
}

export const AvatarImage = memo(function AvatarImage({ dna, code, crop = 'portrait', view = 'front', size = 128, expression, background = true, quality = 'high', motion, className, alt, serviceBase, server }: AvatarImageProps) {
  const prefix = useMemo(() => nextIdPrefix('i'), [])
  const avatar = useMemo<AvatarDNA | null>(() => {
    try {
      if (dna) return normalizeDNA(dna)
      if (code) return decodeShareCode(code)
    } catch {
      // An unreadable code shows the empty placeholder.
    }
    return null
  }, [dna, code])
  const remote = useMemo(() => {
    if (!avatar || !serviceBase || (!server && !needsPremiumArt(avatar))) return ''
    try {
      return serviceImageUrl(serviceBase, avatar, { crop, view, size, expression, background })
    } catch {
      return ''
    }
  }, [avatar, serviceBase, server, crop, view, size, expression, background])
  const svg = useMemo(() => {
    if (!avatar || remote) return ''
    try {
      const out = renderSVG(avatar, { crop, view, size, expression, background, frame: background, quality, motion, idPrefix: prefix, title: false })
      // The wrapper carries the accessible name; the drawing itself is presentational.
      return out.replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
    } catch {
      return ''
    }
  }, [avatar, remote, crop, view, size, expression, background, quality, motion, prefix])
  const label = alt ?? (avatar ? describeDNA(avatar) : '')
  const cls = `aps-img${svg || remote ? '' : ' aps-img--empty'}${className ? ` ${className}` : ''}`
  const style = { display: 'inline-block', width: size, maxWidth: '100%', lineHeight: 0, verticalAlign: 'middle' } as const
  if (remote) {
    return (
      <span className={cls} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} style={style}>
        <img src={remote} alt="" width={size} decoding="async" loading="lazy" style={{ width: '100%', height: 'auto' }} />
      </span>
    )
  }
  return (
    <span
      className={cls}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
})
