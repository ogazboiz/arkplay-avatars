/* QA page for @arkplay/avatar-vision: `npm run demo -w @arkplay/avatar-vision` → :5182.
 *
 * A small dev middleware stands in for the avatar service so the page works on its own:
 *   /avatar/v1/vision/models/*          files from packages/avatar-vision/models (same rules
 *                                       as the service route: allowlisted, no traversal)
 *   /fixtures/photos/manifest.json      the QA photos in packages/avatar-vision/fixtures/photos
 *                                       (synthetic, licence-clean, written by the trainer),
 *                                       with any sidecar <name>.json labels attached
 *   /fixtures/photos/<file>             the photos themselves (and crops/<file>, the Python
 *                                       reference crops)
 *   POST /__qa/out/<name>.json|.png     saves a QA report about the FIXTURES (Run all, Model
 *                                       check) to packages/avatar-vision/out/ (gitignored) for
 *                                       scripts/qa-report.ts; dev server only, 127.0.0.1 only
 * Photos picked or captured in the page never touch this server: the page only posts reports
 * for the synthetic fixture photos. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = path.join(PKG, 'models')
const PHOTOS = path.join(PKG, 'fixtures', 'photos')
const OUT = path.join(PKG, 'out')

const TYPES: Record<string, string> = {
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function safeFile(root: string, rel: string, maxDepth: number): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  const parts = decoded.split('/')
  if (parts.length > maxDepth || !parts.every((p) => SEGMENT.test(p) && !p.includes('..'))) return null
  if (!TYPES[path.extname(decoded).toLowerCase()]) return null
  const file = path.join(root, ...parts)
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return null
  return file
}

function visionDev(): Plugin {
  return {
    name: 'avatar-vision-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const send = (file: string, cache: string) => {
          res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()])
          res.setHeader('Cache-Control', cache)
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
          res.end(readFileSync(file))
        }
        const notFound = () => {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end('{"code":"not_found","message":"No such file."}')
        }
        if (url.pathname.startsWith('/avatar/v1/vision/models/')) {
          const file = safeFile(MODELS, url.pathname.slice('/avatar/v1/vision/models/'.length), 3)
          return file ? send(file, /-\d+\.\d+\.\d+/.test(url.pathname) ? 'public, max-age=31536000, immutable' : 'no-cache') : notFound()
        }
        if (url.pathname === '/fixtures/photos/manifest.json') {
          const photos = existsSync(PHOTOS)
            ? readdirSync(PHOTOS)
                .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
                .sort()
                .map((f) => {
                  const side = path.join(PHOTOS, f.replace(/\.[^.]+$/, '.json'))
                  let labels: unknown = null
                  try {
                    if (existsSync(side)) labels = JSON.parse(readFileSync(side, 'utf8'))
                  } catch {
                    labels = null
                  }
                  return { file: f, url: `/fixtures/photos/${encodeURIComponent(f)}`, labels }
                })
            : []
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(JSON.stringify({ dir: 'packages/avatar-vision/fixtures/photos', photos }))
        }
        if (url.pathname.startsWith('/fixtures/photos/')) {
          const file = safeFile(PHOTOS, url.pathname.slice('/fixtures/photos/'.length), 2)
          return file ? send(file, 'no-cache') : notFound()
        }
        if (url.pathname.startsWith('/__qa/out/') && req.method === 'POST') {
          const name = url.pathname.slice('/__qa/out/'.length)
          const remote = req.socket.remoteAddress ?? ''
          if (!/^[a-z0-9][a-z0-9-]{0,60}\.(json|png)$/.test(name) || !/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(remote)) return notFound()
          const chunks: Buffer[] = []
          let size = 0
          req.on('data', (c: Buffer) => {
            size += c.length
            if (size <= 32 * 1024 * 1024) chunks.push(c)
          })
          req.on('end', () => {
            if (size > 32 * 1024 * 1024) {
              res.statusCode = 413
              return res.end()
            }
            mkdirSync(OUT, { recursive: true })
            writeFileSync(path.join(OUT, name), Buffer.concat(chunks))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ saved: `out/${name}`, bytes: size }))
          })
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: path.join(PKG, 'demo'),
  plugins: [visionDev()],
  // No HMR: a "Run all" batch takes minutes, and any edit in the module graph (including the
  // engine, a workspace source dependency) would reload the page and kill it. Reload by hand.
  server: { port: 5182, strictPort: true, host: '127.0.0.1', hmr: false },
  preview: { port: 5182, strictPort: true },
  build: { outDir: path.join(PKG, 'demo', 'dist'), target: 'es2022', emptyOutDir: true },
})
