/* Slider with end labels, a numeric readout and a reset button. Drags report every value
 * (the preview follows the latest one) and close their undo step on release. */

import type { CSSProperties } from 'react'
import type { ParamValue, RangeSpec } from '@arkplay/avatar-engine'
import { formatRange, rangeValueText } from '../../state/params.ts'
import { fmt } from '../../strings.ts'
import { useStrings } from '../context.ts'
import { Icon } from '../Icon.tsx'

export interface RangeProps {
  spec: RangeSpec
  value: ParamValue | undefined
  id: string
  onChange: (value: number, continuous: boolean) => void
  onCommit: () => void
  /** Label override (items and custom art use their own words). */
  label?: string
}

export function RangeControl({ spec, value, id, onChange, onCommit, label }: RangeProps) {
  const s = useStrings()
  const v = typeof value === 'number' ? value : spec.default
  const pct = ((v - spec.min) / (spec.max - spec.min || 1)) * 100
  const name = label ?? spec.label
  const helpId = spec.help ? `${id}-help` : undefined
  const changed = Math.abs(v - spec.default) > 1e-6
  return (
    <div className="aps-field aps-range">
      <div className="aps-field__row">
        <label className="aps-field__label" htmlFor={id}>
          {name}
        </label>
        {changed && (
          <button
            type="button"
            className="aps-reset"
            onClick={() => {
              onChange(spec.default, false)
              onCommit()
            }}
            aria-label={fmt(s.resetParam, { param: name })}
            title={fmt(s.resetParam, { param: name })}
          >
            <Icon name="reset" size={14} />
          </button>
        )}
        <output className="aps-range__value" htmlFor={id} aria-hidden="true">
          {formatRange(spec, v)}
        </output>
      </div>
      <input
        id={id}
        className="aps-range__input"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={v}
        style={{ '--aps-pct': `${pct}%` } as CSSProperties}
        aria-valuetext={rangeValueText(spec, v)}
        aria-describedby={helpId}
        onChange={(e) => onChange(Number(e.currentTarget.value), true)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      {spec.ends && (
        <div className="aps-range__ends" aria-hidden="true">
          <span>{spec.ends[0]}</span>
          <span>{spec.ends[1]}</span>
        </div>
      )}
      {spec.help && (
        <p className="aps-help" id={helpId}>
          {spec.help}
        </p>
      )}
    </div>
  )
}
