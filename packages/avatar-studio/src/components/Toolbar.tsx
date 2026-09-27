/* The studio's top bar: history, randomize (with its theme), share, export, the host's
 * slot, and Cancel / Save. Labels collapse to icons on narrow screens. */

import { memo, type ReactNode } from 'react'
import { THEMES } from '@arkplay/avatar-engine'
import { fmt } from '../strings.ts'
import { useActions, useEnv, useStrings } from './context.ts'
import { Icon } from './Icon.tsx'

export interface ToolbarProps {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string
  redoLabel: string
  theme: string
  setTheme: (id: string) => void
  onShare: () => void
  onExport?: () => void
  onPhoto?: () => void
  extra?: ReactNode
  onCancel?: () => void
  onSave?: () => void
  saving: boolean
  saveLabel: string
  status?: string
}

export const Toolbar = memo(function Toolbar(p: ToolbarProps) {
  const s = useStrings()
  const a = useActions()
  const serverPhoto = useEnv().serverPhoto
  const undoTitle = p.canUndo ? fmt(s.undoNamed, { label: p.undoLabel }) : s.undo
  const redoTitle = p.canRedo ? fmt(s.redoNamed, { label: p.redoLabel }) : s.redo
  return (
    <div className="aps-toolbar">
      <div className="aps-toolbar__group">
        <button type="button" className="aps-iconbtn" onClick={a.undo} disabled={!p.canUndo} aria-label={undoTitle} title={undoTitle} aria-keyshortcuts="Control+Z Meta+Z">
          <Icon name="undo" />
        </button>
        <button type="button" className="aps-iconbtn" onClick={a.redo} disabled={!p.canRedo} aria-label={redoTitle} title={redoTitle} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y">
          <Icon name="redo" />
        </button>
      </div>
      <div className="aps-toolbar__group aps-rand">
        <button type="button" className="aps-btn aps-btn--gold-soft aps-rand__go" onClick={a.randomize} title={s.randomizeHint}>
          <Icon name="dice" />
          <span className="aps-collapse">{s.randomize}</span>
        </button>
        <label className="aps-select aps-select--pill aps-rand__theme">
          <span className="aps-sr">{s.theme}</span>
          <select value={p.theme} onChange={(e) => p.setTheme(e.currentTarget.value)} title={s.theme}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {p.onPhoto && (
        <div className="aps-toolbar__group">
          <button type="button" className="aps-btn aps-btn--quiet aps-photo-btn" onClick={p.onPhoto} title={serverPhoto ? s.fromPhotoHintServer : s.fromPhotoHint}>
            <Icon name="camera" />
            <span className="aps-collapse">{s.fromPhoto}</span>
          </button>
        </div>
      )}
      <div className="aps-toolbar__spacer" />
      {p.status && <span className="aps-toolbar__status">{p.status}</span>}
      <div className="aps-toolbar__group">
        <button type="button" className="aps-btn aps-btn--quiet" onClick={p.onShare} aria-label={s.share} title={s.share}>
          <Icon name="share" />
          <span className="aps-collapse">{s.share}</span>
        </button>
        {p.onExport && (
          <button type="button" className="aps-btn aps-btn--quiet" onClick={p.onExport} aria-label={s.export} title={s.export}>
            <Icon name="download" />
            <span className="aps-collapse">{s.export}</span>
          </button>
        )}
        {p.extra}
      </div>
      {(p.onCancel || p.onSave) && (
        <div className="aps-toolbar__group aps-toolbar__commit">
          {p.onCancel && (
            <button type="button" className="aps-btn aps-btn--quiet" onClick={p.onCancel}>
              {s.cancel}
            </button>
          )}
          {p.onSave && (
            <button type="button" className="aps-btn aps-btn--primary" onClick={p.onSave} disabled={p.saving} aria-busy={p.saving}>
              {p.saving ? <span className="aps-spinner" aria-hidden="true" /> : <Icon name="check" />}
              {p.saving ? s.saving : p.saveLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
})
