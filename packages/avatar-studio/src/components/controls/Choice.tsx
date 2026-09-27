/* Choices: tiles with live thumbnails when the schema asks for a preview, otherwise a
 * segmented control (few short options) or wrapping chips. */

import type { ChoiceSpec, ParamValue } from '@arkplay/avatar-engine'
import type { RenderJob } from '../../render/job.ts'
import { rovingIndex, rovingKeyDown } from '../roving.ts'
import { Thumb } from '../Thumb.tsx'

export interface ChoiceThumb {
  key: string
  make: () => RenderJob
}

export interface ChoiceProps {
  spec: ChoiceSpec
  value: ParamValue | undefined
  id: string
  onChange: (value: string) => void
  /** Thumbnail for an option, when this choice shows tiles. */
  thumbFor?: (optionId: string) => ChoiceThumb
  label?: string
  /** Wide tiles for full-body previews. */
  tall?: boolean
}

export function ChoiceControl({ spec, value, id, onChange, thumbFor, label, tall }: ChoiceProps) {
  const v = typeof value === 'string' ? value : spec.default
  const labelId = `${id}-label`
  const name = label ?? spec.label
  const options = spec.options
  const any = options.some((o) => o.id === v)
  const current = options.find((o) => o.id === v)

  if (thumbFor) {
    return (
      <div className="aps-field aps-choice">
        <div className="aps-field__row">
          <span className="aps-field__label" id={labelId}>
            {name}
          </span>
          <span className="aps-choice__current">{current?.label}</span>
        </div>
        <div role="radiogroup" aria-labelledby={labelId} className={`aps-tiles${tall ? ' aps-tiles--tall' : ''}`} onKeyDown={(e) => rovingKeyDown(e, { grid: true })}>
          {options.map((o, i) => {
            const t = thumbFor(o.id)
            const on = o.id === v
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={rovingIndex(on, i, any)}
                className="aps-tile"
                title={o.label}
                onClick={() => onChange(o.id)}
              >
                <Thumb tkey={t.key} make={t.make} priority={on ? 1 : 0} className="aps-tile__img" />
                <span className="aps-tile__label">{o.label}</span>
              </button>
            )
          })}
        </div>
        {spec.help && <p className="aps-help">{spec.help}</p>}
      </div>
    )
  }

  const segmented = options.length <= 4 && options.every((o) => o.label.length <= 12)
  return (
    <div className="aps-field aps-choice">
      <div className="aps-field__row">
        <span className="aps-field__label" id={labelId}>
          {name}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className={segmented ? 'aps-seg aps-seg--fill' : 'aps-chips'} onKeyDown={(e) => rovingKeyDown(e)}>
        {options.map((o, i) => {
          const on = o.id === v
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={rovingIndex(on, i, any)}
              className={segmented ? 'aps-seg__btn' : 'aps-chip'}
              onClick={() => onChange(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {spec.help && <p className="aps-help">{spec.help}</p>}
    </div>
  )
}
