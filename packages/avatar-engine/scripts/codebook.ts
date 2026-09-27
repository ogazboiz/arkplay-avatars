/* Keeps the A2 share-code codebook (src/dna/codebook.data.ts) in step with the schema.
 *
 *   npm run codebook -w @arkplay/avatar-engine            append new ids, rewrite the data file
 *   npm run codebook -w @arkplay/avatar-engine -- --check exit 1 if the book is out of date
 *
 * Append-only: new sections, params, choice options, items, species, palettes and palette
 * colours go at the END of their lists; nothing is ever reordered, renamed or removed, and a
 * `k` or a snapshot (range bounds, unit, palette, list) never changes once written. A
 * changed type or default is a broken DNA contract, so it is reported and nothing is written.
 * See src/dna/codebook.ts for the format. */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PALETTES } from '../src/core/color.ts'
import type { ParamSpec } from '../src/dna/params.ts'
import { ALL_ITEMS, ALL_SECTIONS } from '../src/dna/schema/index.ts'
import { SPECIES } from '../src/dna/species.ts'
import { CODEBOOK_DATA } from '../src/dna/codebook.data.ts'
import type { CodebookData, ParamEntry } from '../src/dna/codebook.ts'

export const CODEBOOK_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'dna', 'codebook.data.ts')
export const CODEBOOK_COMMAND = 'npm run codebook -w @arkplay/avatar-engine'

interface Book {
  format: 1
  colorK: number
  itemK: number
  speciesK: number
  colors: string[]
  palettes: { id: string; k: number; colors: number[] }[]
  lists: { k: number; ids: string[] }[]
  sections: { id: string; params: ParamEntry[] }[]
  items: { id: string; params: ParamEntry[] }[]
  species: string[]
}

export interface CodebookUpdate {
  data: CodebookData
  /** What was appended (empty when the book was already complete). */
  added: string[]
  /** Frozen things that changed in the schema (a type or a default). Nothing is written. */
  problems: string[]
}

/** ⌊log2 n⌋: the Exp-Golomb order for a list with n possible wire values. */
function kFor(n: number): number {
  let k = 0
  while (2 ** (k + 1) <= n) k++
  return k
}

/** 1e-4 units, the precision `coerce` stores ranges at. */
const q = (x: number): number => Math.round(x * 10000)

const show = (v: unknown): string => JSON.stringify(v)

export function updateCodebook(prev: CodebookData = CODEBOOK_DATA): CodebookUpdate {
  const book = structuredClone(prev) as unknown as Book
  const added: string[] = []
  const problems: string[] = []
  const firstColors = book.colors.length === 0
  const firstItems = book.items.length === 0
  const firstSpecies = book.species.length === 0

  // Common colours: every palette colour, and each palette as a list of global indices.
  for (const [pid, list] of Object.entries(PALETTES)) {
    let pal = book.palettes.find((p) => p.id === pid)
    if (!pal) {
      pal = { id: pid, k: kFor(list.length), colors: [] }
      book.palettes.push(pal)
      added.push(`palette ${pid}`)
    }
    for (const raw of list) {
      const c = raw.toLowerCase()
      if (!/^#[0-9a-f]{6}$/.test(c)) {
        problems.push(`palette ${pid}: ${show(raw)} is not a #rrggbb colour.`)
        continue
      }
      let g = book.colors.indexOf(c)
      if (g < 0) {
        g = book.colors.push(c) - 1
        added.push(`colour ${c}`)
      }
      if (!pal.colors.includes(g)) {
        pal.colors.push(g)
        added.push(`palette ${pid}: ${c}`)
      }
    }
  }
  if (firstColors) book.colorK = kFor(book.colors.length)

  const listFor = (ids: string[]): number => {
    const same = book.lists.findIndex((l) => l.ids.length === ids.length && l.ids.every((x, i) => x === ids[i]))
    if (same >= 0) return same
    return book.lists.push({ k: kFor(ids.length + 1), ids: [...ids] }) - 1
  }

  const entryFor = (spec: ParamSpec): ParamEntry => {
    switch (spec.type) {
      case 'range':
        return [spec.key, 'range', q(spec.default), q(spec.min), q(spec.max), Math.max(1, q(spec.step))]
      case 'color':
        return [spec.key, 'color', spec.default, spec.palette]
      case 'choice':
        return [spec.key, 'choice', spec.default, listFor(spec.options.map((o) => o.id))]
      case 'toggle':
        return [spec.key, 'toggle', spec.default]
      case 'text':
        return [spec.key, 'text', spec.default]
    }
  }

  const syncGroup = (what: 'section' | 'item', list: Book['sections'], id: string, specs: readonly ParamSpec[]) => {
    let g = list.find((x) => x.id === id)
    if (!g) {
      g = { id, params: [] }
      list.push(g)
      added.push(`${what} ${id}`)
    }
    for (const spec of specs) {
      const where = `${what} ${id}, param ${show(spec.key)}`
      const old = g.params.find((p) => p[0] === spec.key)
      if (!old) {
        g.params.push(entryFor(spec))
        added.push(`${where}`)
        continue
      }
      if (old[1] !== spec.type) {
        problems.push(`${where}: type changed from ${old[1]} to ${spec.type}. Ids are frozen: add a new key instead.`)
        continue
      }
      const def = spec.type === 'range' ? q(spec.default) : spec.default
      if (old[2] !== def) problems.push(`${where}: default changed from ${show(old[2])} to ${show(def)}. Defaults are frozen forever (packages/avatar-engine/README.md).`)
      if (old[1] === 'choice' && spec.type === 'choice') {
        const opts = book.lists[old[3]]
        for (const o of spec.options) {
          if (opts.ids.includes(o.id)) continue
          opts.ids.push(o.id)
          added.push(`${where}: option ${show(o.id)}`)
        }
      }
    }
  }

  for (const s of ALL_SECTIONS) syncGroup('section', book.sections, s.id, s.params)
  for (const i of ALL_ITEMS) syncGroup('item', book.items, i.id, i.params)
  if (firstItems) book.itemK = kFor(book.items.length + 1)

  for (const s of SPECIES) {
    if (book.species.includes(s.id)) continue
    book.species.push(s.id)
    added.push(`species ${s.id}`)
  }
  if (firstSpecies) book.speciesK = kFor(book.species.length + 1)

  return { data: book as unknown as CodebookData, added, problems }
}

/* ---- Writing the data module ------------------------------------------ */

const LINE_SEPARATORS = new Set([0x2028, 0x2029])

/** A string literal for the generated module (U+2028/2029 are escaped, never written raw). */
const str = (s: string): string =>
  /^[\w .:#+&!?/()-]*$/.test(s)
    ? `'${s}'`
    : [...JSON.stringify(s)].map((ch) => (LINE_SEPARATORS.has(ch.charCodeAt(0)) ? '\\' + 'u' + ch.charCodeAt(0).toString(16) : ch)).join('')

function wrap(items: string[], indent: string, width = 100): string[] {
  const lines: string[] = []
  let line = ''
  for (const it of items) {
    if (line && indent.length + line.length + it.length + 2 > width) {
      lines.push(indent + line.trimEnd())
      line = ''
    }
    line += `${it}, `
  }
  if (line) lines.push(indent + line.trimEnd())
  return lines
}

const entry = (p: ParamEntry): string => `[${p.map((v) => (typeof v === 'string' ? str(v) : String(v))).join(', ')}]`

export function renderCodebook(d: CodebookData): string {
  const out: string[] = [
    '/* GENERATED by scripts/codebook.ts: run `npm run codebook -w @arkplay/avatar-engine` after adding a',
    ' * param, choice option, item, species or palette colour. APPEND-ONLY: every A2 share code ever made',
    ' * points into these lists by position, so never reorder, rename or delete an entry, and never change',
    ' * a `k` or a snapshot value. Format: src/dna/codebook.ts. */',
    '',
    "import type { CodebookData } from './codebook.ts'",
    '',
    'export const CODEBOOK_DATA: CodebookData = {',
    `  format: ${d.format},`,
    `  colorK: ${d.colorK},`,
    `  itemK: ${d.itemK},`,
    `  speciesK: ${d.speciesK},`,
    '  colors: [',
    ...wrap(d.colors.map(str), '    '),
    '  ],',
    '  palettes: [',
  ]
  for (const p of d.palettes) {
    out.push(`    { id: ${str(p.id)}, k: ${p.k}, colors: [`)
    out.push(...wrap(p.colors.map(String), '      '))
    out.push('    ] },')
  }
  out.push('  ],', '  lists: [')
  d.lists.forEach((l, i) => {
    out.push(`    /* ${i} */ { k: ${l.k}, ids: [`)
    out.push(...wrap(l.ids.map(str), '      '))
    out.push('    ] },')
  })
  out.push('  ],')
  for (const key of ['sections', 'items'] as const) {
    out.push(`  ${key}: [`)
    for (const g of d[key]) {
      if (!g.params.length) {
        out.push(`    { id: ${str(g.id)}, params: [] },`)
        continue
      }
      out.push(`    { id: ${str(g.id)}, params: [`)
      for (const p of g.params) out.push(`      ${entry(p)},`)
      out.push('    ] },')
    }
    out.push('  ],')
  }
  out.push('  species: [', ...wrap(d.species.map(str), '    '), '  ],', '}', '')
  return out.join('\n')
}

/* ---- CLI ----------------------------------------------------------------- */

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const check = process.argv.includes('--check')
  const { data, added, problems } = updateCodebook()
  const text = renderCodebook(data)
  const onDisk = readFileSync(CODEBOOK_FILE, 'utf8').replace(/\r\n/g, '\n')
  if (problems.length) {
    console.error(`The schema broke the DNA contract; the codebook was not changed:\n  - ${problems.join('\n  - ')}`)
    process.exitCode = 1
  } else if (check) {
    if (added.length || onDisk !== text) {
      const what = added.length ? `\n  + ${added.slice(0, 40).join('\n  + ')}${added.length > 40 ? `\n  … and ${added.length - 40} more` : ''}` : ' (the data file was edited by hand)'
      console.error(`The A2 share-code codebook is out of date${what}\nRun \`${CODEBOOK_COMMAND}\`.`)
      process.exitCode = 1
    } else console.log('Codebook is up to date.')
  } else if (onDisk !== text) {
    writeFileSync(CODEBOOK_FILE, text)
    console.log(`Codebook updated (${added.length} addition${added.length === 1 ? '' : 's'}):${added.length ? `\n  + ${added.slice(0, 40).join('\n  + ')}` : ''}${added.length > 40 ? `\n  … and ${added.length - 40} more` : ''}`)
  } else console.log('Codebook is up to date.')
}
