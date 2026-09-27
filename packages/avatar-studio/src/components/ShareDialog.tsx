/* Share and import: the share code and link, importing a code / link / JSON (pasted or
 * from a file) with friendly validation, and the full JSON file. */

import { useId, useMemo, useRef, useState } from 'react'
import { encodeShareCode, type AvatarDNA } from '@arkplay/avatar-engine'
import { slugify } from '../export/formats.ts'
import { hasLocalArt, parseAvatarInput, type ParseResult } from '../state/share.ts'
import { fmt } from '../strings.ts'
import { copyText } from './clipboard.ts'
import { useActions, useEnv, useStrings } from './context.ts'
import { Dialog } from './Dialog.tsx'
import { downloadBlob } from './download.ts'
import { Icon } from './Icon.tsx'
import { useTrack } from '../telemetry/react.ts' // studio telemetry (F)

type Feedback = { tone: 'error' | 'warn'; text: string; list?: string[] } | null

export function ShareDialog({ dna, onClose }: { dna: AvatarDNA; onClose: () => void }) {
  const s = useStrings()
  const a = useActions()
  const env = useEnv()
  const track = useTrack() // studio telemetry (F)
  const id = useId()
  const code = useMemo(() => encodeShareCode(dna), [dna])
  const link = env.shareUrl(code)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const file = useRef<HTMLInputElement>(null)

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? code : link)
    if (ok) track('share_copy', what) // studio telemetry (F)
    setCopied(ok ? what : null)
    a.announce(ok ? (what === 'code' ? s.codeCopied : s.linkCopied) : s.copyFailed)
    if (!ok) setFeedback({ tone: 'error', text: s.copyFailed })
  }

  const explain = (r: Extract<ParseResult, { ok: false }>): string =>
    r.error === 'empty' ? s.importEmpty : r.error === 'badJson' ? fmt(s.importBadJson, { message: r.message }) : r.error === 'badCode' ? r.message : s.importNotAvatar

  const importText = (input: string) => {
    const r = parseAvatarInput(input)
    if (!r.ok) {
      setFeedback({ tone: 'error', text: explain(r) })
      return
    }
    a.load(r.dna, s.h_load)
    if (r.warnings.length) {
      setFeedback({ tone: 'warn', text: s.importWarnings, list: r.warnings })
      a.announce(s.importLoaded)
    } else {
      a.toast(s.importLoaded)
      onClose()
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const t = await f.text()
      setText(t.length > 4000 ? '' : t)
      importText(t)
    } catch (e) {
      setFeedback({ tone: 'error', text: fmt(s.importBadJson, { message: e instanceof Error ? e.message : String(e) }) })
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  return (
    <Dialog title={s.shareTitle} onClose={onClose} className="aps-dialog--share">
      <section className="aps-dsec">
        <h3 className="aps-dsec__title">{s.shareCode}</h3>
        <p className="aps-help">{s.shareCodeHelp}</p>
        <textarea className="aps-input aps-input--mono aps-code" readOnly value={code} rows={3} aria-label={s.shareCode} onFocus={(e) => e.currentTarget.select()} />
        <div className="aps-row">
          <button type="button" className="aps-btn aps-btn--primary" onClick={() => void copy('code')}>
            <Icon name={copied === 'code' ? 'check' : 'copy'} size={18} />
            {copied === 'code' ? s.copied : s.copyCode}
          </button>
          <button type="button" className="aps-btn aps-btn--quiet" onClick={() => void copy('link')}>
            <Icon name={copied === 'link' ? 'check' : 'link'} size={18} />
            {copied === 'link' ? s.linkCopied : s.copyLink}
          </button>
        </div>
        {hasLocalArt(dna) && (
          <p className="aps-notice aps-notice--warn">
            <Icon name="info" size={16} /> {s.shareCustomNote}
          </p>
        )}
      </section>

      <section className="aps-dsec">
        <h3 className="aps-dsec__title">
          <label htmlFor={`${id}-import`}>{s.importTitle}</label>
        </h3>
        <textarea
          id={`${id}-import`}
          className="aps-input aps-input--mono"
          rows={3}
          value={text}
          placeholder={s.importLabel}
          aria-describedby={feedback ? `${id}-fb` : undefined}
          onChange={(e) => {
            setText(e.currentTarget.value)
            setFeedback(null)
          }}
        />
        <div className="aps-row">
          <button type="button" className="aps-btn aps-btn--quiet" onClick={() => importText(text)}>
            <Icon name="check" size={18} />
            {s.importLoad}
          </button>
          <button type="button" className="aps-btn aps-btn--quiet" onClick={() => file.current?.click()}>
            <Icon name="upload" size={18} />
            {s.importFile}
          </button>
          <input ref={file} type="file" accept=".json,.txt,application/json,text/plain" className="aps-sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.currentTarget.files?.[0])} />
        </div>
        {feedback && (
          <div id={`${id}-fb`} className={`aps-notice aps-notice--${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
            <p>{feedback.text}</p>
            {feedback.list && (
              <ul>
                {feedback.list.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="aps-dsec">
        <h3 className="aps-dsec__title">{s.jsonTitle}</h3>
        <p className="aps-help">{s.jsonHelp}</p>
        <div className="aps-row">
          <button
            type="button"
            className="aps-btn aps-btn--quiet"
            onClick={() => downloadBlob(new Blob([JSON.stringify(dna, null, 2)], { type: 'application/json' }), `${slugify(dna.name)}.json`)}
          >
            <Icon name="download" size={18} />
            {s.downloadJson}
          </button>
        </div>
      </section>
    </Dialog>
  )
}
