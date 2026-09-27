/* One control per ParamSpec, chosen by its type. Continuous edits carry an undo group so a
 * drag or a typed word is a single history step. */

import type { ParamSpec, ParamValue } from '@arkplay/avatar-engine'
import { ChoiceControl, type ChoiceThumb } from './Choice.tsx'
import { ColorControl } from './Color.tsx'
import { RangeControl } from './Range.tsx'
import { TextControl } from './Text.tsx'
import { ToggleControl } from './Toggle.tsx'

export interface ParamControlProps {
  spec: ParamSpec
  value: ParamValue | undefined
  id: string
  /** Undo group for continuous edits of this param. */
  group: string
  onChange: (spec: ParamSpec, value: ParamValue, group?: string) => void
  onCommit: () => void
  thumbFor?: (optionId: string) => ChoiceThumb
  tall?: boolean
}

export function ParamControl({ spec, value, id, group, onChange, onCommit, thumbFor, tall }: ParamControlProps) {
  switch (spec.type) {
    case 'range':
      return <RangeControl spec={spec} value={value} id={id} onChange={(v, cont) => onChange(spec, v, cont ? group : undefined)} onCommit={onCommit} />
    case 'color':
      return <ColorControl spec={spec} value={value} id={id} onChange={(v, cont) => onChange(spec, v, cont ? group : undefined)} onCommit={onCommit} />
    case 'choice':
      return <ChoiceControl spec={spec} value={value} id={id} onChange={(v) => onChange(spec, v)} thumbFor={thumbFor} tall={tall} />
    case 'toggle':
      return <ToggleControl spec={spec} value={value} id={id} onChange={(v) => onChange(spec, v)} />
    case 'text':
      return <TextControl spec={spec} value={value} id={id} onChange={(v, cont) => onChange(spec, v, cont ? group : undefined)} onCommit={onCommit} />
  }
}
