/* On/off switch. */

import type { ParamValue, ToggleSpec } from '@arkplay/avatar-engine'

export interface ToggleProps {
  spec: ToggleSpec
  value: ParamValue | undefined
  id: string
  onChange: (value: boolean) => void
  label?: string
}

export function ToggleControl({ spec, value, id, onChange, label }: ToggleProps) {
  const on = typeof value === 'boolean' ? value : spec.default
  return (
    <div className="aps-field aps-toggle">
      <button type="button" id={id} role="switch" aria-checked={on} className="aps-switch" onClick={() => onChange(!on)}>
        <span className="aps-switch__label">{label ?? spec.label}</span>
        <span className="aps-switch__track" aria-hidden="true">
          <span className="aps-switch__thumb" />
        </span>
      </button>
      {spec.help && <p className="aps-help">{spec.help}</p>}
    </div>
  )
}
