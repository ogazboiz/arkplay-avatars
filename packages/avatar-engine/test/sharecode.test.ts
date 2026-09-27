/* A2 share codes: exact round trips, A1 compatibility, typo detection, the codebook's
 * append-only guard and golden vectors that pin the format forever. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ShareCodeError,
  addItem,
  canonicalJSON,
  compactDNA,
  createRng,
  decodeAvatarBytes,
  decodeShareCode,
  defaultDNA,
  dnaHash,
  encodeAvatarBytes,
  encodeShareCode,
  expandDNA,
  normalizeDNA,
  randomDNA,
  renderSVG,
  type AvatarDNA,
  type NormalizeReport,
} from '../src/index.ts'
import { BitReader, BitWriter, crc16, egLength, wtf8Decode, wtf8Encode } from '../src/dna/bits.ts'
import { buildCodebook, codebook, type CodebookData, type GroupEntry } from '../src/dna/codebook.ts'
import { CODEBOOK_DATA } from '../src/dna/codebook.data.ts'
import { packCompact, unpackCompact } from '../src/dna/packed.ts'
import { CODEBOOK_COMMAND, CODEBOOK_FILE, renderCodebook, updateCodebook } from '../scripts/codebook.ts'
import { corpus, edgeCases, everyItem } from './corpus.ts'

const here = dirname(fileURLToPath(import.meta.url))
const canon = (d: AvatarDNA): string => canonicalJSON(compactDNA(d))
/** What a share code can carry: inline custom art (no uploaded asset id) is local-only. */
const shareable = (d: AvatarDNA): AvatarDNA => {
  const n = normalizeDNA(d)
  return { ...n, accessories: n.accessories.filter((a) => a.id !== 'custom' || a.asset?.id) }
}
const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64url')

/** decode(encode(d)) keeps everything compactDNA keeps: same canonical form, same dnaHash. */
function assertLossless(d: AvatarDNA, label: string): string {
  const code = encodeShareCode(d)
  assert.match(code, /^A2[A-Za-z0-9_-]+$/, label)
  const back = decodeShareCode(code)
  const want = canon(shareable(d))
  assert.equal(canon(back), want, `${label}: A2 round trip`)
  assert.equal(dnaHash(back), dnaHash(shareable(d)), `${label}: dnaHash`)
  // The compact level is exact too, with no normalization on the way back.
  const compact = compactDNA(shareable(d))
  assert.equal(canonicalJSON(unpackCompact(packCompact(compact))), canonicalJSON(compact), `${label}: compact round trip`)
  return code
}

/* ---- Bit-level building blocks --------------------------------------------- */

test('bits: Exp-Golomb, zigzag, truncated binary, doubles and text round-trip', () => {
  const w = new BitWriter()
  const eg: [number, number][] = []
  for (const k of [0, 1, 3, 8]) for (const n of [0, 1, 2, 3, 6, 7, 254, 255, 256, 65535, 2 ** 32, 2 ** 40 - 1]) eg.push([n, k])
  const zz = [0, -1, 1, -2, 2, -5000, 5000, -(2 ** 39), 2 ** 39]
  const tb: [number, number][] = [[0, 1], [0, 3], [1, 3], [2, 3], [100, 101], [0, 10001], [10000, 10001], [9999, 10001], [35, 36]]
  const floats = [0, -0, 1 / 3, 5e-324, Number.MAX_VALUE, -Infinity, 0.1 + 0.2]
  const strs = ['', 'hi', 'Zoë', '😀🦊', '\ud83e', 'a\udc00b', '李小龍']
  for (const [n, k] of eg) {
    const before = w.length
    w.eg(n, k)
    assert.equal(w.length - before, egLength(n, k), `egLength(${n}, ${k})`)
  }
  for (const n of zz) w.zz(n)
  for (const [x, n] of tb) w.tb(x, n)
  for (const f of floats) w.f64(f)
  for (const s of strs) w.str(s)
  const r = new BitReader(w.finish())
  for (const [n, k] of eg) assert.equal(r.eg(k), n)
  for (const n of zz) assert.equal(r.zz(), n)
  for (const [x, n] of tb) assert.equal(r.tb(n), x)
  for (const f of floats) assert.ok(Object.is(r.f64(), f))
  for (const s of strs) assert.equal(r.str(), s)
  assert.ok(r.atPaddedEnd())
  // Truncated binary spends ⌊log2 n⌋ or ⌈log2 n⌉ bits: 101 slider steps fit in 6–7 bits.
  const t = new BitWriter()
  t.tb(0, 101)
  assert.equal(t.length, 6)
})

test('bits: WTF-8 equals UTF-8 for well-formed text and refuses broken bytes', () => {
  for (const s of ['plain', 'Zoë', '😀', 'مرحبا', 'é́']) assert.deepEqual(wtf8Encode(s), new TextEncoder().encode(s))
  for (const bad of [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xe2, 0x82], [0x80]]) assert.throws(() => wtf8Decode(Uint8Array.from(bad)))
})

test('bits: CRC-16/GENIBUS check value', () => {
  assert.equal(crc16(new TextEncoder().encode('123456789')), 0xd64e)
})

/* ---- Lossless ------------------------------------------------------------- */

test('A2 is lossless over 2000+ generated avatars (every kind, species, theme, freeOnly, breeding)', () => {
  const all = corpus()
  assert.ok(all.length >= 2000, `corpus has ${all.length}`)
  let a1 = 0
  let a2 = 0
  all.forEach((d, i) => {
    a2 += assertLossless(d, `corpus #${i}`).length
    a1 += encodeShareCode(d, { format: 'A1' }).length
  })
  assert.ok(a2 < a1 * 0.3, `A2 total ${a2} chars vs A1 ${a1}`)
})

test('A2 is lossless on hand-made edge cases', () => {
  for (const { label, dna } of edgeCases()) assertLossless(dna, label)
})

test('A2 is lossless for every item id with every param off its default', () => {
  for (const n of [0, 1, 2]) for (const { label, dna } of everyItem(n)) assertLossless(dna, `${label} (${n})`)
})

test('A2 keeps the exact name, including a name cut inside an emoji', () => {
  const d = normalizeDNA({ ...defaultDNA(), name: 'x' + '🦊'.repeat(30) })
  assert.equal(d.name.length, 40)
  assert.equal(decodeShareCode(encodeShareCode(d)).name, d.name)
})

test('A2 renders the same avatar', () => {
  for (const seed of [3, 4, 5]) {
    const d = randomDNA({ seed, kind: seed % 2 ? 'humanoid' : 'creature' })
    assert.equal(renderSVG(decodeShareCode(encodeShareCode(d)), { idPrefix: 'rt' }), renderSVG(d, { idPrefix: 'rt' }))
  }
})

test('encodeAvatarBytes / decodeAvatarBytes: the same bytes as the text code', () => {
  const d = randomDNA({ seed: 77 })
  const bytes = encodeAvatarBytes(d)
  assert.equal('A2' + b64(bytes), encodeShareCode(d))
  assert.equal(canon(decodeAvatarBytes(bytes)), canon(d))
  assert.throws(() => decodeAvatarBytes(bytes.subarray(0, bytes.length - 1)), ShareCodeError)
  assert.throws(() => decodeAvatarBytes(new Uint8Array(0)), ShareCodeError)
})

test('A2 codes are much shorter than A1', () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  for (const kind of ['humanoid', 'creature'] as const) {
    const ds = Array.from({ length: 150 }, (_, i) => randomDNA({ seed: `size-${kind}-${i}`, kind }))
    const a1 = mean(ds.map((d) => encodeShareCode(d, { format: 'A1' }).length))
    const a2 = mean(ds.map((d) => encodeShareCode(d).length))
    assert.ok(a2 < a1 / 4, `${kind}: A2 ${a2} vs A1 ${a1}`)
    assert.ok(a2 < (kind === 'humanoid' ? 300 : 170), `${kind}: A2 mean ${a2}`)
  }
  assert.ok(encodeShareCode(defaultDNA()).length <= 24)
})

/* ---- A1 compatibility and parsing ----------------------------------------- */

test('A1 still encodes on request and decodes identically', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const d = randomDNA({ seed, kind: seed % 3 ? 'humanoid' : 'creature' })
    const a1 = encodeShareCode(d, { format: 'A1' })
    assert.match(a1, /^A1[A-Za-z0-9_-]+$/)
    assert.equal(canon(decodeShareCode(a1)), canon(d))
    assert.equal(canon(decodeShareCode(a1)), canon(decodeShareCode(encodeShareCode(d))))
  }
})

test('pasted codes may contain spaces and line breaks', () => {
  const d = randomDNA({ seed: 12 })
  for (const code of [encodeShareCode(d), encodeShareCode(d, { format: 'A1' })]) {
    const pasted = `  ${code.slice(0, 20)}\n${code.slice(20, 50)}\r\n  ${code.slice(50)} \t`
    assert.equal(canon(decodeShareCode(pasted)), canon(d))
  }
})

test('bad input throws ShareCodeError with a readable message', () => {
  const good = encodeShareCode(randomDNA({ seed: 9 }))
  const cases: [string, RegExp][] = [
    ['', /Not an avatar code/],
    ['A2', /Not an avatar code/],
    ['A3' + good.slice(2), /Not an avatar code/],
    ['A2!!!', /Not an avatar code/],
    ['A2' + 'x'.repeat(8100), /Not an avatar code/],
    [good.slice(0, good.length - 1), /typo or is incomplete/],
    [good.slice(0, good.length - 4), /typo or is incomplete/],
    [good + 'AAAA', /typo or is incomplete/],
    ['A2A', /typo or is incomplete/],
  ]
  for (const [code, msg] of cases) assert.throws(() => decodeShareCode(code), (e: unknown) => e instanceof ShareCodeError && msg.test(e.message), JSON.stringify(code.slice(0, 30)))
})

/* ---- Typos and corruption -------------------------------------------------- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function codes200(): string[] {
  const out: string[] = []
  for (let i = 0; i < 200; i++) out.push(encodeShareCode(randomDNA({ seed: `typo-${i}`, kind: i % 3 ? 'humanoid' : 'creature' })))
  return out
}

const rejected = (code: string): boolean => {
  try {
    decodeShareCode(code)
    return false
  } catch (e) {
    assert.ok(e instanceof ShareCodeError, `only ShareCodeError, got ${String(e)}`)
    return true
  }
}

test('every single mistyped character is detected (200 codes, every position)', () => {
  const rng = createRng('typos')
  let tried = 0
  for (const code of codes200()) {
    for (let i = 0; i < code.length; i++) {
      for (let k = 0; k < 2; k++) {
        let ch = rng.pick([...ALPHABET])
        if (ch === code[i]) ch = ALPHABET[(ALPHABET.indexOf(ch) + 1) % 64]
        tried++
        assert.ok(rejected(code.slice(0, i) + ch + code.slice(i + 1)), `position ${i} of ${code.slice(0, 16)}…`)
      }
    }
  }
  assert.ok(tried > 50_000, `${tried} typos tried`)
})

test('swapped neighbours, dropped and doubled characters are detected', () => {
  for (const code of codes200().slice(0, 60)) {
    for (let i = 2; i < code.length; i++) {
      if (i + 1 < code.length && code[i] !== code[i + 1]) assert.ok(rejected(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2)), `swap at ${i}`)
      assert.ok(rejected(code.slice(0, i) + code.slice(i + 1)), `drop at ${i}`)
      assert.ok(rejected(code.slice(0, i) + code[i] + code.slice(i)), `double at ${i}`)
    }
  }
})

test('random multi-character damage is refused, never read as a different avatar', () => {
  const rng = createRng('damage')
  const list = codes200()
  let undetected = 0
  let silentlyDifferent = 0
  const trials = 20_000
  for (let t = 0; t < trials; t++) {
    const code = list[t % list.length]
    const chars = [...code]
    const hits = rng.int(2, 6)
    for (let h = 0; h < hits; h++) chars[rng.int(2, chars.length - 1)] = rng.pick([...ALPHABET])
    const bad = chars.join('')
    if (bad === code) continue
    try {
      const d = decodeShareCode(bad)
      undetected++
      if (canon(d) !== canon(decodeShareCode(code))) silentlyDifferent++
    } catch (e) {
      assert.ok(e instanceof ShareCodeError)
    }
  }
  // A 16-bit check lets about 1 in 65 536 random corruptions through; the parser catches most
  // of those. Measured with these seeds: 0.
  assert.ok(undetected / trials <= 1e-4, `${undetected} of ${trials} slipped through`)
  assert.ok(silentlyDifferent <= undetected)
})

test('any byte string decodes to valid DNA or a ShareCodeError, never anything else', () => {
  const rng = createRng('fuzz')
  const withCrc = (payload: Uint8Array): Uint8Array => {
    const out = new Uint8Array(payload.length + 2)
    out.set(payload)
    const crc = crc16(payload)
    out[payload.length] = crc >> 8
    out[payload.length + 1] = crc & 0xff
    return out
  }
  const valid = codes200().map((c) => new Uint8Array(Buffer.from(c.slice(2), 'base64url')))
  let decoded = 0
  for (let t = 0; t < 6000; t++) {
    let payload: Uint8Array
    if (t % 2) {
      // Random bytes behind a valid checksum: the parser itself must hold.
      payload = Uint8Array.from({ length: rng.int(1, 300) }, () => rng.int(0, 255))
    } else {
      // A real code with a few bits flipped, re-checksummed.
      const src = valid[t % valid.length]
      payload = src.slice(0, src.length - 2)
      for (let k = rng.int(1, 4); k > 0; k--) payload[rng.int(0, payload.length - 1)] ^= 1 << rng.int(0, 7)
    }
    try {
      const d = decodeAvatarBytes(withCrc(payload))
      assert.deepEqual(normalizeDNA(d), d)
      decoded++
    } catch (e) {
      assert.ok(e instanceof ShareCodeError, `only ShareCodeError, got ${String(e)}`)
    }
  }
  assert.ok(decoded > 0)
  // Crafted ids can't reach the prototype.
  const sneaky = { v: 1, k: 'h', s: 1, x: { __proto__: { polluted: true } } } as unknown as Record<string, unknown>
  Object.defineProperty(sneaky.x, '__proto__', { value: { polluted: true }, enumerable: true })
  const back = unpackCompact(packCompact(sneaky)) as { x: Record<string, unknown> }
  assert.ok(Object.hasOwn(back.x, '__proto__'))
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  assert.doesNotThrow(() => decodeAvatarBytes(packCompact(sneaky)))
})

/* ---- Codebook ---------------------------------------------------------------- */

test('the codebook covers the live schema (append-only guard)', () => {
  const { added, problems } = updateCodebook()
  assert.deepEqual(problems, [], 'the schema changed a frozen type or default')
  assert.deepEqual(added, [], `the A2 codebook is missing ${added.length} schema entries: run \`${CODEBOOK_COMMAND}\``)
  assert.equal(readFileSync(CODEBOOK_FILE, 'utf8').replace(/\r\n/g, '\n'), renderCodebook(CODEBOOK_DATA), `codebook.data.ts was edited by hand: run \`${CODEBOOK_COMMAND}\``)
})

test('`npm run codebook -- --check` passes', () => {
  const out = execFileSync(process.execPath, [join(here, '..', 'scripts', 'codebook.ts'), '--check'], { encoding: 'utf8' })
  assert.match(out, /up to date/)
})

test('the codebook is well-formed: unique ids, valid references', () => {
  const d = CODEBOOK_DATA
  const unique = (ids: readonly string[], what: string) => assert.equal(new Set(ids).size, ids.length, `duplicate ${what}`)
  unique(d.colors, 'colours')
  unique(d.species, 'species')
  unique(d.sections.map((s) => s.id), 'sections')
  unique(d.items.map((s) => s.id), 'items')
  for (const c of d.colors) assert.match(c, /^#[0-9a-f]{6}$/)
  for (const p of d.palettes) for (const g of p.colors) assert.ok(g >= 0 && g < d.colors.length, `palette ${p.id}`)
  for (const l of d.lists) unique(l.ids, 'options')
  const groups: GroupEntry[] = [...d.sections, ...d.items]
  for (const g of groups) {
    unique(g.params.map((p) => p[0]), `keys in ${g.id}`)
    for (const p of g.params) {
      if (p[1] === 'choice') assert.ok(d.lists[p[3]], `${g.id}.${p[0]} list`)
      if (p[1] === 'color') assert.ok(d.palettes.some((x) => x.id === p[3]), `${g.id}.${p[0]} palette`)
      if (p[1] === 'range') assert.ok(p[5] >= 1 && p[3] <= p[4], `${g.id}.${p[0]} range`)
    }
  }
})

test('the codebook script only appends and refuses changed defaults', () => {
  const book = structuredClone(CODEBOOK_DATA) as unknown as { sections: { id: string; params: unknown[][] }[] }
  book.sections[0].params[0][2] = 1234
  const { problems } = updateCodebook(book as unknown as CodebookData)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /default changed/)
  // From an older, shorter book, an update only appends: every old list is a prefix.
  const old = staleBook()
  const { data } = updateCodebook(old)
  const prefix = (a: readonly unknown[], b: readonly unknown[], what: string) => assert.deepEqual(b.slice(0, a.length), a, what)
  prefix(old.colors, data.colors, 'colours')
  prefix(old.species, data.species, 'species')
  prefix(old.sections.map((s) => s.id), data.sections.map((s) => s.id), 'sections')
  prefix(old.items.map((s) => s.id), data.items.map((s) => s.id), 'items')
  old.lists.forEach((l, i) => prefix(l.ids, data.lists[i].ids, `list ${i}`))
  old.sections.forEach((s, i) => prefix(s.params, data.sections[i].params, `section ${s.id}`))
  old.palettes.forEach((p, i) => prefix(p.colors, data.palettes[i].colors, `palette ${p.id}`))
})

/** An "older" codebook: every list cut short, as if the newer entries didn't exist yet. */
function staleBook(): CodebookData {
  const d = CODEBOOK_DATA
  const half = <T>(xs: readonly T[]): T[] => xs.slice(0, Math.ceil(xs.length / 2))
  const colors = half(d.colors)
  return {
    ...d,
    colors,
    // An older palette is a prefix of today's, holding only colours the older list had.
    palettes: d.palettes.map((p) => ({ ...p, colors: p.colors.slice(0, (p.colors.findIndex((g) => g >= colors.length) + 1 || p.colors.length + 1) - 1) })),
    lists: d.lists.map((l) => ({ ...l, ids: half(l.ids) })),
    sections: half(d.sections).map((s) => ({ ...s, params: half(s.params) })),
    items: half(d.items).map((s) => ({ ...s, params: half(s.params) })),
    species: half(d.species),
  }
}

test('literal escapes: an out-of-date codebook still round-trips, and today’s book reads its codes', () => {
  const stale = buildCodebook(staleBook())
  const empty = buildCodebook({ ...CODEBOOK_DATA, colors: [], palettes: [], lists: [], sections: [], items: [], species: [] })
  const samples = [...corpus().filter((_, i) => i % 20 === 0), ...edgeCases().map((c) => c.dna), ...everyItem(1).filter((_, i) => i % 5 === 0).map((c) => c.dna)]
  let staleLen = 0
  let freshLen = 0
  for (const d of samples) {
    const c = compactDNA(shareable(d))
    const want = canonicalJSON(c)
    for (const book of [stale, empty]) {
      const bytes = packCompact(c, book)
      assert.equal(canonicalJSON(unpackCompact(bytes, undefined, book)), want, 'same book both ways')
      // Append-only: today's (longer) book reads what an older one wrote.
      assert.equal(canonicalJSON(unpackCompact(bytes, undefined, codebook())), want, 'older writer, newer reader')
      if (book === stale) staleLen += bytes.length
    }
    freshLen += packCompact(c).length
  }
  assert.ok(staleLen > freshLen, 'the literal path was exercised')
})

test('a code from a newer codebook: unknown options are reset with a warning, unknown items refuse', () => {
  const stale = buildCodebook(staleBook())
  // An option this (older) reader doesn't know yet: skipped, with a warning.
  const lastHair = CODEBOOK_DATA.lists[CODEBOOK_DATA.sections.find((s) => s.id === 'hair')!.params.find((p) => p[0] === 'style')![3] as number].ids.at(-1)!
  const d = normalizeDNA({ ...defaultDNA('humanoid', 3), sections: { hair: { style: lastHair, color: '#abcdef' } } })
  const warnings: string[] = []
  const c = unpackCompact(packCompact(compactDNA(d)), (m) => warnings.push(m), stale) as { x?: { hair?: Record<string, unknown> } }
  assert.equal(c.x?.hair?.style, undefined)
  assert.equal(c.x?.hair?.color, '#abcdef')
  assert.equal(warnings.length, 1)
  // An item it doesn't know can't even be skipped (its params are unknown): a clear error.
  const lastItem = CODEBOOK_DATA.items.at(-1)!.id
  const withItem = normalizeDNA(addItem(defaultDNA('humanoid', 3), lastItem))
  assert.ok(withItem.accessories.some((a) => a.id === lastItem) || withItem.outfit.some((a) => a.id === lastItem))
  assert.throws(() => unpackCompact(packCompact(compactDNA(withItem)), undefined, stale), /newer/)
})

test('decode reports normalization warnings for A2 like A1', () => {
  const report: NormalizeReport = { warnings: [] }
  const code = 'A2' + b64(packCompact({ v: 1, k: 'h', s: 1, a: [{ id: 'no-such-item' }] }))
  const d = decodeShareCode(code, report)
  assert.equal(d.accessories.length, 0)
  assert.ok(report.warnings.some((w) => w.includes('no-such-item')))
})

/* ---- Golden vectors ------------------------------------------------------------ */

interface Vector {
  label: string
  code: string
  compact: Record<string, unknown>
}
const golden = JSON.parse(readFileSync(join(here, 'fixtures', 'share-codes.json'), 'utf8')) as { a2: Vector[]; raw: Vector[]; a1: Vector[] }

test('golden A2 vectors: DNA → code and code → DNA, forever', () => {
  assert.ok(golden.a2.length >= 30)
  for (const v of golden.a2) {
    const dna = expandDNA(v.compact)
    assert.equal(canon(dna), canonicalJSON(v.compact), `${v.label}: fixture is canonical`)
    assert.equal(encodeShareCode(dna), v.code, `${v.label}: encodes to the golden code`)
    assert.equal(canon(decodeShareCode(v.code)), canonicalJSON(v.compact), `${v.label}: golden code decodes`)
  }
})

test('golden escape-path vectors (literal ids, mismatched types, raw doubles)', () => {
  for (const v of golden.raw) {
    const bytes = Buffer.from(v.code.slice(2), 'base64url')
    assert.equal(canonicalJSON(unpackCompact(new Uint8Array(bytes))), canonicalJSON(v.compact), `${v.label}: decodes`)
    assert.equal('A2' + b64(packCompact(v.compact)), v.code, `${v.label}: encodes`)
    assert.doesNotThrow(() => decodeShareCode(v.code), v.label)
  }
})

test('golden A1 vectors (including the website showcase) decode forever', () => {
  assert.ok(golden.a1.length >= 8)
  for (const v of golden.a1) {
    const d = decodeShareCode(v.code)
    assert.equal(canon(d), canonicalJSON(v.compact), v.label)
    assert.equal(canon(decodeShareCode(encodeShareCode(d))), canon(d), `${v.label}: re-shared as A2`)
    if (v.label.startsWith('showcase')) assert.ok(encodeShareCode(d).length < v.code.length / 3, `${v.label}: A2 is shorter`)
  }
})
