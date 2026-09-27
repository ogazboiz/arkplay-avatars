/* Arrow-key navigation for radio groups, tab lists and tile grids (roving tabindex): Tab
 * enters the group once, arrows move within it. In grids, Up/Down move by a whole row. */

import type { KeyboardEvent } from 'react'

export interface RovingOptions {
  selector?: string
  /** Activate (click) the newly focused item, as radio groups and tabs do. Default true. */
  select?: boolean
  /** Up/Down move by row in a wrapping grid. */
  grid?: boolean
}

export function rovingKeyDown(e: KeyboardEvent<HTMLElement>, o: RovingOptions = {}): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const k = e.key
  if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Home' && k !== 'End') return
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(o.selector ?? '[role="radio"]')].filter((el) => !(el as HTMLButtonElement).disabled)
  const i = items.indexOf(document.activeElement as HTMLElement)
  if (i < 0 || !items.length) return
  const n = items.length
  let cols = 1
  if (o.grid) {
    const top = items[0].offsetTop
    while (cols < n && items[cols].offsetTop === top) cols++
  }
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'
  let j = i
  if (k === 'Home') j = 0
  else if (k === 'End') j = n - 1
  else if (o.grid && cols > 1 && (k === 'ArrowUp' || k === 'ArrowDown')) j = Math.max(0, Math.min(n - 1, i + (k === 'ArrowUp' ? -cols : cols)))
  else j = k === back || k === 'ArrowUp' ? (i - 1 + n) % n : (i + 1) % n
  e.preventDefault()
  if (j === i) return
  items[j].focus()
  if (o.select !== false) items[j].click()
}

/** tabIndex for item `index` of a roving group. */
export const rovingIndex = (checked: boolean, index: number, anyChecked: boolean): 0 | -1 => (checked || (!anyChecked && index === 0) ? 0 : -1)
