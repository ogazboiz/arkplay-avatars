/* Downloads the official MediaPipe model files into models/, copies the MediaPipe and
 * onnxruntime-web wasm runtimes out of node_modules into models/runtime/, and records the
 * SHA-256 of every file in models/manifest.json. Nothing is ever loaded from a third-party
 * CDN at runtime: your host serves this folder (createPhotoAvatar's `modelBase`).
 *
 *   node scripts/fetch-models.ts            download what is missing, verify everything
 *   node scripts/fetch-models.ts --update   accept new upstream bytes for the "latest" URLs
 *   node scripts/fetch-models.ts --verify   verify only, never download
 *
 * It also records (never fetches) the trained attribute model, checking it against
 * attributes.json.
 *
 * The manifest pins what was downloaded. A later run that gets different bytes from the
 * upstream "latest" URL fails unless --update is passed, so a model can't change silently. */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEDIAPIPE_RUNTIME_DIR, MEDIAPIPE_VERSION, ORT_RUNTIME_DIR, ORT_VERSION } from '../src/versions.ts'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = path.join(PKG, 'models')
const MANIFEST = path.join(MODELS, 'manifest.json')
const args = new Set(process.argv.slice(2))
const UPDATE = args.has('--update')
const VERIFY_ONLY = args.has('--verify')

const DOWNLOADS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
    license: 'Apache-2.0',
  },
  {
    file: 'selfie_multiclass_256x256.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
    license: 'Apache-2.0',
  },
]

interface Entry {
  sha256: string
  bytes: number
  source: string
  license?: string
}
interface Manifest {
  _comment: string
  generated: string
  files: Record<string, Entry>
}

/** Resolves a package directory through Node's resolver (works with hoisted workspaces). */
function packageDir(name: string, entry: string): string {
  const p = fileURLToPath(import.meta.resolve(`${name}/${entry}`))
  return path.dirname(p)
}

const sha256 = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex')

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    (s) => s.isFile(),
    () => false,
  )
}

async function loadManifest(): Promise<Manifest> {
  try {
    const m = JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest
    if (m && typeof m.files === 'object') return m
  } catch {
    /* first run */
  }
  return { _comment: '', generated: '', files: {} }
}

async function download(url: string): Promise<Uint8Array> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (e) {
      lastErr = e
      console.warn(`  download attempt ${attempt} failed: ${String(e)}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastErr
}

async function writeAtomic(target: string, data: Uint8Array): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.part`
  await writeFile(tmp, data)
  await rename(tmp, target)
}

async function main(): Promise<void> {
  await mkdir(MODELS, { recursive: true })
  const manifest = await loadManifest()
  const next: Record<string, Entry> = { ...manifest.files }
  const problems: string[] = []

  // 1. Official model files.
  for (const d of DOWNLOADS) {
    const target = path.join(MODELS, d.file)
    const pinned = manifest.files[d.file]
    if (await exists(target)) {
      const buf = await readFile(target)
      const h = sha256(buf)
      if (pinned && pinned.sha256 !== h && !UPDATE) {
        problems.push(`${d.file}: on-disk SHA-256 ${h} does not match the manifest ${pinned.sha256}`)
        continue
      }
      next[d.file] = { sha256: h, bytes: buf.length, source: d.url, license: d.license }
      console.log(`ok       ${d.file}  ${buf.length} B  ${h}`)
      continue
    }
    if (VERIFY_ONLY) {
      problems.push(`${d.file}: missing (run without --verify to download)`)
      continue
    }
    console.log(`fetch    ${d.url}`)
    const buf = await download(d.url)
    const h = sha256(buf)
    if (pinned && pinned.sha256 !== h && !UPDATE) {
      problems.push(`${d.file}: upstream bytes changed (${h} vs pinned ${pinned.sha256}); re-run with --update to accept`)
      continue
    }
    await writeAtomic(target, buf)
    next[d.file] = { sha256: h, bytes: buf.length, source: d.url, license: d.license }
    console.log(`saved    ${d.file}  ${buf.length} B  ${h}`)
  }

  // 2. Runtimes from node_modules, into versioned folders (served immutable).
  const mpDir = path.join(packageDir('@mediapipe/tasks-vision', 'vision_wasm_internal.js'))
  const mpPkg = JSON.parse(await readFile(path.join(mpDir, '..', 'package.json'), 'utf8')) as { version: string }
  if (mpPkg.version !== MEDIAPIPE_VERSION) problems.push(`@mediapipe/tasks-vision is ${mpPkg.version} but src/versions.ts says ${MEDIAPIPE_VERSION}`)
  const ortDist = packageDir('onnxruntime-web', 'ort-wasm-simd-threaded.wasm')
  const ortPkg = JSON.parse(await readFile(path.join(ortDist, '..', 'package.json'), 'utf8')) as { version: string }
  if (ortPkg.version !== ORT_VERSION) problems.push(`onnxruntime-web is ${ortPkg.version} but src/versions.ts says ${ORT_VERSION}`)

  const copies: { from: string; to: string; source: string; license: string }[] = [
    // SIMD and no-SIMD filesets; FilesetResolver picks one at runtime.
    ...['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'].map((f) => ({
      from: path.join(mpDir, f),
      to: MEDIAPIPE_RUNTIME_DIR + f,
      source: `npm:@mediapipe/tasks-vision@${mpPkg.version}/wasm/${f}`,
      license: 'Apache-2.0',
    })),
    // onnxruntime-web itself is loaded from here at runtime (not bundled into apps), so the JS
    // always matches its wasm: ort.webgpu.min.mjs (WebGPU + wasm EPs) uses the asyncify
    // build; ort.wasm.min.mjs (no WebGPU) uses the plain build.
    ...[
      'ort.webgpu.min.mjs',
      'ort.wasm.min.mjs',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
    ].map((f) => ({
      from: path.join(ortDist, f),
      to: ORT_RUNTIME_DIR + f,
      source: `npm:onnxruntime-web@${ortPkg.version}/dist/${f}`,
      license: 'MIT',
    })),
  ]
  for (const c of copies) {
    const target = path.join(MODELS, c.to)
    if (!VERIFY_ONLY) {
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(c.from, target)
    }
    if (!(await exists(target))) {
      problems.push(`${c.to}: missing`)
      continue
    }
    const buf = await readFile(target)
    const h = sha256(buf)
    const src = sha256(await readFile(c.from))
    if (h !== src) problems.push(`${c.to}: differs from ${c.source}`)
    next[c.to] = { sha256: h, bytes: buf.length, source: c.source, license: c.license }
    console.log(`runtime  ${c.to}  ${buf.length} B`)
  }

  // 3. The trained attribute model, when the trainer has produced one: record, don't fetch.
  //    Only the int8 build ships (the runtime falls back to attributes.onnx if int8 is
  //    missing); the fp32 build is a training artefact and stays with the trainer.
  //    Every build present must match the SHA-256 that attributes.json records for it.
  const attrFiles = new Set(['attributes.json', 'attributes.int8.onnx', 'attributes.onnx'])
  let described: Record<string, { file?: string; sha256?: string; bytes?: number }> = {}
  if (await exists(path.join(MODELS, 'attributes.json'))) {
    try {
      described = (JSON.parse(await readFile(path.join(MODELS, 'attributes.json'), 'utf8')) as { files?: typeof described }).files ?? {}
    } catch (e) {
      problems.push(`attributes.json: not valid JSON (${String(e)})`)
    }
    for (const d of Object.values(described)) if (d.file && /^[A-Za-z0-9][A-Za-z0-9._-]*\.onnx$/.test(d.file)) attrFiles.add(d.file)
  }
  for (const f of [...attrFiles].sort()) {
    const target = path.join(MODELS, f)
    if (await exists(target)) {
      const buf = await readFile(target)
      const h = sha256(buf)
      const want = Object.values(described).find((d) => d.file === f)
      if (want?.sha256 && want.sha256 !== h) problems.push(`${f}: SHA-256 ${h} does not match attributes.json (${want.sha256})`)
      next[f] = { sha256: h, bytes: buf.length, source: 'attribute model trainer (export.py)' }
      console.log(`model    ${f}  ${buf.length} B`)
    } else {
      delete next[f]
    }
  }
  if (!(await exists(path.join(MODELS, 'attributes.int8.onnx'))) && (await exists(path.join(MODELS, 'attributes.onnx'))))
    console.warn('note     attributes.int8.onnx is missing; browsers will download the 4× larger attributes.onnx')
  else if (await exists(path.join(MODELS, 'attributes.onnx')))
    console.warn(
      'WARNING  models/attributes.onnx (fp32) sits next to the int8 build. models/ is served to\n' +
        '         browsers: move it out of models/ and re-run.',
    )

  // Forget runtimes of other versions that are no longer on disk.
  for (const k of Object.keys(next)) if (!(await exists(path.join(MODELS, k)))) delete next[k]

  if (problems.length) {
    console.error('\nfetch-models found problems:\n  ' + problems.join('\n  '))
    process.exitCode = 1
    return
  }
  const out: Manifest = {
    _comment:
      'Written by scripts/fetch-models.ts. SHA-256 of every file in models/. Model URLs are the official MediaPipe "latest" builds, pinned here; runtimes are copied from node_modules.',
    generated: new Date().toISOString(),
    files: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
  }
  const unchanged = JSON.stringify(out.files) === JSON.stringify(manifest.files)
  if (!unchanged || !manifest.generated) {
    if (VERIFY_ONLY) {
      console.error('manifest.json is out of date (run without --verify)')
      process.exitCode = 1
      return
    }
    await writeFile(MANIFEST, JSON.stringify(out, null, 2) + '\n')
    console.log(`\nwrote ${path.relative(PKG, MANIFEST)}`)
  } else {
    console.log('\nmanifest.json verified')
  }
}

await main()
