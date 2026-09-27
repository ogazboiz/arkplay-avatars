/* Premium core (docs/studio.md): the engine in this bundle has no art for paid, limited and
 * NFT items, so the studio shows the avatar service's drawing of them. The service is on the
 * same origin (a reverse proxy serves /avatar/v1 next to /avatar/studio/, and the dev server
 * proxies it), which the preview route requires: it answers same-origin requests only.
 * Without a service, those items stay neutral placeholders and everything else still works. */

/** The avatar API base the studio asks for premium looks (VITE_AVATAR_API_BASE overrides it). */
export const AVATAR_API: string = import.meta.env.VITE_AVATAR_API_BASE || '/avatar/v1'

/** Server rendering, phase 1 (docs/studio.md): downloads made by the service
 *  (`POST {AVATAR_API}/studio/export`). Off unless VITE_SERVER_EXPORTS=1. */
export const SERVER_EXPORTS: boolean = import.meta.env.VITE_SERVER_EXPORTS === '1'

/** Server rendering, phase 2: the stage and the picker tiles drawn by the service
 *  (`/studio/preview`, `/studio/tiles`). Off unless VITE_SERVER_STUDIO=1. */
export const SERVER_STUDIO: boolean = import.meta.env.VITE_SERVER_STUDIO === '1'

/** Server rendering, phase 3: "From photo" analysed by the service (`/vision/avatar`). Off
 *  unless VITE_SERVER_PHOTO=1; by default the photo is analysed on the device. */
export const SERVER_PHOTO: boolean = import.meta.env.VITE_SERVER_PHOTO === '1'
