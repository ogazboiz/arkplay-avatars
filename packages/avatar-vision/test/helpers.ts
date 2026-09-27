/* Loads the hand-written fixture analyses in test/fixtures: JSON has no NaN, so null
 * numbers become NaN, and colours given only as hex get their OKLab value. */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hexToLab } from '../src/color.ts'
import { heuristicAttributes } from '../src/heuristics.ts'
import type { AvatarInput, Measured, MeasuredColor } from '../src/types.ts'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

export const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort()

const nanify = (o: Record<string, unknown>): Record<string, number> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? v : NaN]))

export function loadFixture(name: string): AvatarInput {
  const raw = JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as {
    measured: Record<string, Record<string, unknown>>
    attributes?: AvatarInput['attributes']
    mirrored?: boolean
  }
  const colors: Record<string, MeasuredColor> = {}
  for (const [k, c] of Object.entries(raw.measured.colors as Record<string, { hex: string; confidence?: number; n?: number }>)) {
    colors[k] = { hex: c.hex, lab: hexToLab(c.hex), confidence: c.confidence ?? 0.8, n: c.n ?? 1000 }
  }
  const measured = {
    colors,
    geometry: nanify(raw.measured.geometry),
    hair: nanify(raw.measured.hair),
    expression: nanify(raw.measured.expression),
    cues: nanify(raw.measured.cues),
  } as unknown as Measured
  const attributes = raw.attributes ?? heuristicAttributes(measured)
  return { measured, attributes, ...(raw.mirrored !== undefined ? { mirrored: raw.mirrored } : {}) }
}

export const argmaxClass = (classes: readonly string[], p: readonly number[]): string => classes[p.reduce((bi, v, i) => (v > p[bi] ? i : bi), 0)]
