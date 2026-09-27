/* Inline icons (24-unit grid, stroked in currentColor) so they follow text colour on gold
 * buttons and in both themes. Decorative: the buttons that hold them carry the label. */

import type { ReactNode } from 'react'

const P = {
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  share: <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V18a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-5.5" />,
  download: <path d="M12 3.5V15m-4.5-4.5L12 15l4.5-4.5M5 20.5h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  trash: <path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9.5 7V4.5h5V7" />,
  camera: <path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
  upload: <path d="M12 16V4.5m-4.5 4.5L12 4.5 16.5 9M5 16v2.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V16" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />,
  reset: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" />,
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  sliders: <path d="M4 7h10m4 0h2M4 17h4m4 0h8M14 4.5v5M8 14.5v5" />,
  sparkle: <path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7-5.7-1.9L10.2 9 12 3.5ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </>
  ),
  paw: (
    <>
      <path d="M7.5 17.5c0-3 2.2-5.5 4.5-5.5s4.5 2.5 4.5 5.5c0 1.7-1.4 2.5-2.6 2.1-1.2-.4-2.6-.4-3.8 0-1.2.4-2.6-.4-2.6-2.1Z" />
      <ellipse cx="6" cy="10.5" rx="1.7" ry="2.2" />
      <ellipse cx="9.4" cy="6.4" rx="1.7" ry="2.3" />
      <ellipse cx="14.6" cy="6.4" rx="1.7" ry="2.3" />
      <ellipse cx="18" cy="10.5" rx="1.7" ry="2.2" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M6 10.5c2.2-1.4 9.8-1.4 12 0M12 9.5v5.5m0 0-3 6m3-6 3 6" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.8v.4m6-.4v.4" />
    </>
  ),
  drop: <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" />,
  hair: <path d="M5 16c-1-6 2.5-11.5 7-11.5S20 10 19 16M8.5 20c-1.5-3-1.5-7 1-9.5M15.5 20c1.5-3 1.5-7-1-9.5M12 4.5v5" />,
  shirt: <path d="M8.5 4 4 6.5l1.8 4 2.2-1V20h8V9.5l2.2 1 1.8-4L15.5 4a3.5 3.5 0 0 1-7 0Z" />,
  glasses: (
    <>
      <circle cx="7" cy="14" r="3.3" />
      <circle cx="17" cy="14" r="3.3" />
      <path d="M10.3 14c1-.8 2.4-.8 3.4 0M3.7 13.5 5 8m15.3 5.5L19 8" />
    </>
  ),
  wing: <path d="M4 18c3-9 9-13.5 16-13.5-1 3-3 5-5.5 6 2 0 3.5-.5 4.5-1.2-1.3 3.5-4.2 5.7-7.5 6.2 1.5.3 3 .2 4.3-.3C13.3 18 9 19.5 4 18Z" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.2-.5-1.4.4-2.8 1.9-2.8H18a2.5 2.5 0 0 0 2.5-2.5c0-5.3-3.8-9.5-8.5-9.5Z" />
      <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 13.5c1.8 3 6.2 3 8 0M9 9.5l.5.5M15 9.5l-.5.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="m3.5 16 5-5 4 4 2.5-2.5 5 5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
  brush: <path d="M14.5 4.5 19.5 9.5 11 18l-5-5 8.5-8.5ZM6 13c-2 0-2.5 2-2.5 3.5S3 20 3 20s2.5.5 4 0 3-1.5 3-3" />,
  shuffle: <path d="M4 7h3.5c4.5 0 5.5 10 10 10H20m0 0-2.5-2.5M20 17l-2.5 2.5M4 17h3.5c1.4 0 2.4-.9 3.2-2.2M20 7h-2.5c-1.4 0-2.4.9-3.2 2.2M20 7l-2.5-2.5M20 7l-2.5 2.5" />,
  history: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4M12 8v4.5l3 2" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  warning: <path d="M12 4 2.8 19.5h18.4L12 4Zm0 6v4.5m0 2.5v.1" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof P

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `aps-icon ${className}` : 'aps-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  )
}
