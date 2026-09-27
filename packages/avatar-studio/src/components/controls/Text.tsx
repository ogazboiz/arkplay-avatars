/* Short text (prints on clothes, jersey numbers). The engine's stroke font draws a fixed
 * character set, so the value is coerced as you type and the allowed characters are shown. */

import type { ParamValue, TextSpec } from '@arkplay/avatar-engine'
import { fmt } from '../../strings.ts'
import { useStrings } from '../context.ts'

export interface TextProps {
  spec: TextSpec
  value: ParamValue | undefined
  id: string
  onChange: (value: string, continuous: boolean) => void
  onCommit: () => void
  label?: string
}

export function TextControl({ spec, value, id, onChange, onCommit, label }: TextProps) {
  const s = useStrings()
  const v = typeof value === 'string' ? value : spec.default
  const helpId = `${id}-help`
  return (
    <div className="aps-field aps-textfield">
      <div className="aps-field__row">
        <label className="aps-field__label" htmlFor={id}>
          {label ?? spec.label}
        </label>
        <span className="aps-textfield__count" aria-hidden="true">
          {fmt(s.charCount, { count: v.length, max: spec.maxLength })}
        </span>
      </div>
      <input
        id={id}
        className="aps-input aps-input--mono"
        type="text"
        value={v}
        maxLength={spec.maxLength}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={spec.charset || spec.help ? helpId : undefined}
        onChange={(e) => onChange(e.currentTarget.value, true)}
        onBlur={onCommit}
      />
      {(spec.charset || spec.help) && (
        <p className="aps-help" id={helpId}>
          {spec.help ?? spec.charset}
        </p>
      )}
    </div>
  )
}
