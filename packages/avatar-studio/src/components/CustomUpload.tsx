/* Adding your own art: drop or pick a PNG/SVG/JPEG/WebP. With an `uploadAsset` host hook
 * it goes to the avatar service; without one it is kept inline in the DNA and we say so. */

import { useRef, useState, type DragEvent } from 'react'
import { LIMITS } from '@arkplay/avatar-engine'
import { fmt } from '../strings.ts'
import { useActions, useEnv, useStrings } from './context.ts'
import { Icon } from './Icon.tsx'
import { ACCEPT, AssetTooLargeError, AssetTypeError, assetMime, fileToAsset } from './upload.ts'

export function CustomUpload({ count, max, idBase }: { count: number; max: number; idBase: string }) {
  const s = useStrings()
  const a = useActions()
  const env = useEnv()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const local = !env.uploadAsset

  async function take(file: File | undefined) {
    if (!file || busy) return
    setError(null)
    if (count >= max) return setError(fmt(s.customFull, { max }))
    if (!assetMime(file)) return setError(s.customBadType)
    setBusy(true)
    try {
      const asset = env.uploadAsset ? await env.uploadAsset(file) : await fileToAsset(file)
      a.addItem('custom', {}, asset)
    } catch (e) {
      if (e instanceof AssetTooLargeError) setError(fmt(s.customTooBig, { size: `${Math.round(LIMITS.inlineAssetChars / 1370)} kB` }))
      else if (e instanceof AssetTypeError) setError(s.customBadType)
      else setError(fmt(s.customFailed, { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files[0])
  }

  const hintId = `${idBase}-custom-hint`
  return (
    <div className="aps-upload">
      <p className="aps-help">{s.customHelp}</p>
      <div
        className={`aps-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" size={26} />
        <p>
          {busy ? (
            s.customUploading
          ) : (
            <>
              {s.customDrop}{' '}
              <button type="button" className="aps-linkbtn" onClick={() => input.current?.click()} aria-describedby={hintId} disabled={count >= max}>
                {s.customBrowse}
              </button>
            </>
          )}
        </p>
        <p className="aps-drop__hint" id={hintId}>
          {s.customTypes} · {count}/{max}
        </p>
        <input ref={input} type="file" accept={ACCEPT} className="aps-sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void take(e.currentTarget.files?.[0])} />
      </div>
      {error && (
        <p className="aps-notice aps-notice--error" role="alert">
          {error}
        </p>
      )}
      {local && count > 0 && (
        <p className="aps-notice aps-notice--warn">
          <Icon name="info" size={16} /> {s.customLocalWarning}
        </p>
      )}
    </div>
  )
}
