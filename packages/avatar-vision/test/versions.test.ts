import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEDIAPIPE_VERSION, ORT_VERSION, MEDIAPIPE_RUNTIME_DIR, ORT_RUNTIME_DIR } from '../src/versions.ts'
import { HEAD_IDS, TAXONOMY, flipProbs } from '../src/taxonomy.ts'

const pkgVersion = (name: string, entry: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.resolve(`${name}/${entry}`)))
  return (JSON.parse(readFileSync(path.join(dir, '..', 'package.json'), 'utf8')) as { version: string }).version
}

describe('runtime versions and the taxonomy', () => {
  it('src/versions.ts matches the installed runtimes', () => {
    assert.equal(pkgVersion('@mediapipe/tasks-vision', 'vision_wasm_internal.js'), MEDIAPIPE_VERSION)
    assert.equal(pkgVersion('onnxruntime-web', 'ort-wasm-simd-threaded.wasm'), ORT_VERSION)
  })

  it('fetched runtimes (when present) live in the versioned folders', () => {
    const models = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models')
    if (!existsSync(path.join(models, 'manifest.json'))) return
    const manifest = JSON.parse(readFileSync(path.join(models, 'manifest.json'), 'utf8')) as { files: Record<string, { sha256: string }> }
    assert.ok(manifest.files[`${MEDIAPIPE_RUNTIME_DIR}vision_wasm_internal.wasm`], 'MediaPipe wasm in manifest')
    assert.ok(manifest.files[`${ORT_RUNTIME_DIR}ort-wasm-simd-threaded.wasm`], 'ORT wasm in manifest')
    for (const [f, e] of Object.entries(manifest.files)) assert.match(e.sha256, /^[0-9a-f]{64}$/, f)
  })

  it('taxonomy heads are well-formed and hair_part flips', () => {
    assert.equal(TAXONOMY.version, 1)
    assert.equal(new Set(HEAD_IDS).size, HEAD_IDS.length)
    for (const h of TAXONOMY.heads) {
      assert.ok(h.classes.length >= 2, h.id)
      if (h.prompts) assert.equal(h.prompts.length, h.classes.length, h.id)
    }
    assert.deepEqual(flipProbs('hair_part', [0.1, 0.6, 0.2, 0.1]), [0.1, 0.1, 0.2, 0.6])
    assert.deepEqual(flipProbs('beard', [1, 0, 0, 0, 0, 0, 0]), [1, 0, 0, 0, 0, 0, 0])
  })
})
