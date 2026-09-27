/* Standalone mode: the full-page studio with the ArkPlay header, local draft autosave and
 * share links (`#code=` or `?code=` load on start). */

import { useCallback, useEffect, useState } from 'react'
import { AvatarStudio } from '@arkplay/avatar-studio'
import { AVATAR_API, SERVER_EXPORTS, SERVER_PHOTO, SERVER_STUDIO } from './premium.ts'

type Theme = 'dark' | 'light'
const THEME_KEY = 'arkplay-avatar-studio-theme'
const siteUrl = import.meta.env.VITE_SITE_URL || '/play/'

function savedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

const ControllerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7.5 9.5h-.9A3.6 3.6 0 0 0 3 13.1l-.5 3.6A2.3 2.3 0 0 0 6.6 18.6l1.5-1.6h7.8l1.5 1.6a2.3 2.3 0 0 0 4.1-1.9l-.5-3.6a3.6 3.6 0 0 0-3.6-3.6H7.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M7.6 12.2v2.4M6.4 13.4h2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="16" cy="12.9" r="1" fill="currentColor" />
    <circle cx="17.8" cy="14.6" r="1" fill="currentColor" />
  </svg>
)

export function Standalone({ code }: { code: string | null }) {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  // Load a shared avatar once, then drop the code from the address bar so a reload keeps the
  // user's edits (the draft) instead of reloading the original.
  const [initial] = useState(() => code ?? undefined)
  useEffect(() => {
    if (code) history.replaceState(null, '', location.pathname)
  }, [code])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // The choice just isn't remembered.
    }
  }, [theme])

  const shareUrl = useCallback((c: string) => `${location.origin}${location.pathname}#code=${c}`, [])

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-brand" href={siteUrl} aria-label="ArkPlay home">
          <span className="app-brand__mark">
            PL
            <ControllerIcon />Y
          </span>
          <span className="app-brand__word">ArkPlay</span>
        </a>
        <span className="app-header__title">Avatar Studio</span>
        <div className="app-header__actions">
          <button type="button" className="app-theme" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-pressed={theme === 'light'}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <a className="app-back" href={siteUrl}>
            Back to ArkPlay
          </a>
        </div>
      </header>
      <main className="app-main">
        <AvatarStudio initial={initial} theme={theme} shareUrl={shareUrl} previewBase={AVATAR_API} serverExports={SERVER_EXPORTS} serverStudio={SERVER_STUDIO} serverPhoto={SERVER_PHOTO} />
      </main>
    </div>
  )
}
