/* Modal dialog on the native <dialog> element: the browser traps focus, closes on Escape,
 * puts it in the top layer (above any host page stacking context) and restores focus. It
 * stays inside .aps-root in the DOM, so it inherits the studio's theme variables. */

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useStrings } from './context.ts'
import { Icon } from './Icon.tsx'

export interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** Blocks closing (a running export must be cancelled first). */
  busy?: boolean
}

export function Dialog({ title, onClose, children, className, busy }: DialogProps) {
  const s = useStrings()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) {
      try {
        d.showModal()
      } catch {
        d.setAttribute('open', '')
      }
    }
    const onCancel = (e: Event) => {
      e.preventDefault()
      if (!busyRef.current) closeRef.current()
    }
    d.addEventListener('cancel', onCancel)
    return () => {
      d.removeEventListener('cancel', onCancel)
      if (d.open) d.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={`aps-dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="aps-dialog__inner">
        <header className="aps-dialog__head">
          <h2 className="aps-dialog__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="aps-iconbtn" onClick={onClose} disabled={busy} aria-label={s.close} title={s.close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="aps-dialog__body">{children}</div>
      </div>
    </dialog>
  )
}
