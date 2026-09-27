/* Colour picker: the spec's palette as swatches, "Auto" when the spec allows it, and a
 * custom colour well for anything else. */

import { useEffect, useRef, type CSSProperties } from 'react'
import { colors, colorName, type ColorSpec, type ParamValue } from '@arkplay/avatar-engine'
import { fmt } from '../../strings.ts'
import { useStrings } from '../context.ts'
import { rovingIndex, rovingKeyDown } from '../roving.ts'

export interface ColorProps {
  spec: ColorSpec
  value: ParamValue | undefined
  id: string
  onChange: (value: string, continuous: boolean) => void
  onCommit: () => void
  label?: string
}

export function ColorControl({ spec, value, id, onChange, onCommit, label }: ColorProps) {
  const s = useStrings()
  const v = typeof value === 'string' ? value : spec.default
  const palette: readonly string[] = colors.PALETTES[spec.palette] ?? []
  const inPalette = palette.includes(v)
  const custom = !!v && !inPalette
  const name = label ?? spec.label
  const labelId = `${id}-label`
  const wellRef = useRef<HTMLInputElement>(null)

  // The native "change" event fires once when the picker closes: that ends the undo step.
  useEffect(() => {
    const el = wellRef.current
    if (!el) return
    el.addEventListener('change', onCommit)
    return () => el.removeEventListener('change', onCommit)
  }, [onCommit])

  const any = v === '' ? spec.allowAuto === true : inPalette
  return (
    <div className="aps-field aps-color">
      <div className="aps-field__row">
        <span className="aps-field__label" id={labelId}>
          {name}
        </span>
        <span className="aps-color__value">{v ? colorName(v) : s.autoColor}</span>
      </div>
      <div className="aps-swatches">
        <div role="radiogroup" aria-labelledby={labelId} className="aps-swatches__group" onKeyDown={(e) => rovingKeyDown(e, { grid: true })}>
          {spec.allowAuto && (
            <button
              type="button"
              role="radio"
              aria-checked={v === ''}
              tabIndex={rovingIndex(v === '', 0, any)}
              className="aps-swatch aps-swatch--auto"
              title={s.autoColor}
              aria-label={s.autoColor}
              onClick={() => onChange('', false)}
            >
              <span aria-hidden="true">{s.auto}</span>
            </button>
          )}
          {palette.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={v === c}
              tabIndex={rovingIndex(v === c, spec.allowAuto ? i + 1 : i, any)}
              className="aps-swatch"
              style={{ '--aps-swatch': c } as CSSProperties}
              title={`${colorName(c)} ${c}`}
              aria-label={colorName(c)}
              onClick={() => onChange(c, false)}
            />
          ))}
        </div>
        <label className={`aps-swatch aps-swatch--custom${custom ? ' is-on' : ''}`} style={custom ? ({ '--aps-swatch': v } as CSSProperties) : undefined} title={s.customColor}>
          <input
            ref={wellRef}
            id={id}
            type="color"
            className="aps-swatch__well"
            value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'}
            aria-label={fmt(s.colorValue, { param: `${name} – ${s.customColor}`, value: v || s.autoColor })}
            onChange={(e) => onChange(e.currentTarget.value, true)}
            onBlur={onCommit}
          />
          <span className="aps-swatch__plus" aria-hidden="true">
            +
          </span>
        </label>
      </div>
      {spec.help && <p className="aps-help">{spec.help}</p>}
    </div>
  )
}
