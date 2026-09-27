import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addItem, defaultDNA, dnaEquals, encodeShareCode, extractOutfit, withName } from '@arkplay/avatar-engine'
import { codeFromUrl, hasLocalArt, parseAvatarInput, resolveAvatar } from '../src/state/share.ts'
import { loadDraft, localOutfitStore, saveDraft, type KeyValueStore } from '../src/state/storage.ts'

const avatar = () => withName(defaultDNA('humanoid', 42), 'Robin')
const PNG = 'data:image/png;base64,iVBORw0KGgo='

function memoryStore(quota = Infinity): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > quota) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k) => void data.delete(k),
  }
}

const throwing: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

test('codes, links and JSON all load', () => {
  const dna = avatar()
  const code = encodeShareCode(dna)
  for (const input of [code, `  ${code}\n`, `https://arkplay.example/avatar#code=${code}`, `https://x.test/avatar/studio/?code=${code}&embed=0`, JSON.stringify(dna), JSON.stringify({ dna, id: 'av_1' })]) {
    const r = parseAvatarInput(input)
    assert.ok(r.ok, `should load: ${input.slice(0, 40)}`)
    if (r.ok) assert.ok(dnaEquals(r.dna, dna))
  }
  assert.equal(codeFromUrl('/avatar#code=A1abc_-'), 'A1abc_-')
  assert.equal(codeFromUrl('/avatar#code=A2abc_-'), 'A2abc_-')
})

test('A2 (default) and A1 codes both load, even with line breaks pasted in', () => {
  const dna = avatar()
  const a2 = encodeShareCode(dna)
  const a1 = encodeShareCode(dna, { format: 'A1' })
  assert.match(a2, /^A2/)
  assert.match(a1, /^A1/)
  const pasted = [a2.slice(0, 10), '\n', a2.slice(10)].join('')
  const wrapped = ['  ', a1.slice(0, 30), '\r\n', a1.slice(30), '  '].join('')
  for (const input of [a2, a1, pasted, wrapped]) {
    const r = parseAvatarInput(input)
    assert.ok(r.ok, `should load: ${input.slice(0, 20)}`)
    if (r.ok) assert.ok(dnaEquals(r.dna, dna))
  }
  const typo = a2.slice(0, 5) + (a2[5] === 'x' ? 'y' : 'x') + a2.slice(6)
  const r = parseAvatarInput(typo)
  assert.ok(!r.ok)
  if (!r.ok) {
    assert.equal(r.error, 'badCode')
    assert.match(r.message, /typo/)
  }
})

test('bad input explains itself', () => {
  const bad = (input: string, error: string) => {
    const r = parseAvatarInput(input)
    assert.ok(!r.ok)
    if (!r.ok) assert.equal(r.error, error)
  }
  bad('   ', 'empty')
  bad('hello there', 'notAvatar')
  bad('A1!!!', 'notAvatar')
  bad('A2!!!', 'notAvatar')
  bad('A3AAAA', 'notAvatar')
  bad('A1AAAA', 'badCode')
  bad('A2AAAA', 'badCode')
  bad('{ nope', 'badJson')
  bad('{"hello":1}', 'notAvatar')
  bad('[1,2]', 'notAvatar')
})

test('JSON with problems loads with warnings', () => {
  const dna = avatar() as unknown as Record<string, unknown>
  const r = parseAvatarInput(JSON.stringify({ ...dna, outfit: [{ id: 'no-such-item', params: {} }] }))
  assert.ok(r.ok)
  if (r.ok) assert.ok(r.warnings.some((w) => w.includes('no-such-item')))
  const viaResolve = resolveAvatar(avatar())
  assert.ok(viaResolve.ok && viaResolve.warnings.length === 0)
})

test('local-only art is detected (share codes drop it)', () => {
  const dna = avatar()
  assert.equal(hasLocalArt(dna), false)
  const withArt = addItem(dna, 'custom', {}, { src: PNG, w: 16, h: 16 })
  assert.equal(hasLocalArt(withArt), true)
  assert.equal(hasLocalArt(addItem(dna, 'custom', {}, { id: 'as_abcdefgh12', w: 16, h: 16 })), false)
})

test('draft round-trips, survives bad data and blocked storage', () => {
  const store = memoryStore()
  const dna = avatar()
  assert.ok(saveDraft(store, 'k', dna))
  const back = loadDraft(store, 'k')
  assert.ok(back && dnaEquals(back, dna))
  store.data.set('k', '{not json')
  assert.equal(loadDraft(store, 'k'), null)
  assert.equal(loadDraft(throwing, 'k'), null)
  assert.equal(saveDraft(throwing, 'k', dna), false)
  assert.equal(loadDraft(null, 'k'), null)
})

test('a draft too big for the quota is saved without its inline art', () => {
  const big = addItem(avatar(), 'custom', {}, { src: `data:image/png;base64,${'A'.repeat(6000)}`, w: 16, h: 16 })
  const store = memoryStore(5000)
  assert.ok(saveDraft(store, 'k', big))
  const back = loadDraft(store, 'k')
  assert.ok(back)
  assert.equal(back?.accessories.some((a) => a.id === 'custom'), false)
})

test('the default outfit store lists newest first and removes', async () => {
  const store = localOutfitStore(memoryStore(), 'looks')
  assert.deepEqual(await store.list(), [])
  const a = await store.save(extractOutfit(avatar(), 'First'))
  const b = await store.save(extractOutfit(avatar(), 'Second'))
  assert.notEqual(a.id, b.id)
  assert.deepEqual((await store.list()).map((o) => o.name), ['Second', 'First'])
  await store.remove(a.id)
  assert.deepEqual((await store.list()).map((o) => o.name), ['Second'])
})

test('the outfit store fails softly when storage is blocked', async () => {
  const store = localOutfitStore(throwing, 'looks')
  assert.deepEqual(await store.list(), [])
  await assert.rejects(store.save(extractOutfit(avatar(), 'x')))
  const none = localOutfitStore(null, 'looks')
  assert.deepEqual(await none.list(), [])
  await assert.rejects(none.save(extractOutfit(avatar(), 'x')))
})
