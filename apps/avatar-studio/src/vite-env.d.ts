/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the header's "back to ArkPlay" link goes (default '/play/'). */
  readonly VITE_SITE_URL?: string
  /** The avatar API for premium looks (default '/avatar/v1', same origin). */
  readonly VITE_AVATAR_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
