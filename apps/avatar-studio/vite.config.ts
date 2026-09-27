import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Served at /avatar/studio/ next to the avatar service (the iframe embed and the standalone
// studio). The workspace packages are TypeScript sources; Vite bundles them directly.
// In dev, requests to /avatar/v1 (saves, premium previews, server exports) are proxied to
// DEV_AVATAR_ORIGIN when an avatar service runs there. Without one, the studio still works:
// everything free is drawn in the browser, and the "From photo" models are served from
// packages/avatar-vision/models by the middleware below.
const devAvatarOrigin = process.env.DEV_AVATAR_ORIGIN ?? 'http://127.0.0.1:8084'

// BASE_PATH: build for another path, e.g. BASE_PATH=/my-studio/ npm run build.
const base = process.env.BASE_PATH || '/avatar/studio/'

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/avatar-vision/models')
const MODELS_ROUTE = '/avatar/v1/vision/models/'
const TYPES: Record<string, string> = {
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** The vision model files from the workspace (allowlisted extensions, no traversal). */
function modelFile(rel: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  const parts = decoded.split('/')
  if (parts.length > 3 || !parts.every((p) => SEGMENT.test(p) && !p.includes('..'))) return null
  if (!TYPES[path.extname(decoded).toLowerCase()]) return null
  const file = path.join(MODELS, ...parts)
  if (!file.startsWith(MODELS + path.sep) || !existsSync(file) || !statSync(file).isFile()) return null
  return file
}

/** Dev only: serves the "From photo" models locally, ahead of the /avatar/v1 proxy. */
function visionModels(): Plugin {
  return {
    name: 'avatar-vision-models',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        if (!url.pathname.startsWith(MODELS_ROUTE)) return next()
        const file = modelFile(url.pathname.slice(MODELS_ROUTE.length))
        if (!file) return next()
        res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()])
        res.setHeader('Cache-Control', 'no-cache')
        res.end(readFileSync(file))
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), visionModels()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: { '/avatar/v1': { target: devAvatarOrigin, changeOrigin: true } },
  },
  preview: { port: 5181, strictPort: true },
  // The engine (all the procedural art) is most of the bundle and can't be split further.
  build: { outDir: 'dist', sourcemap: true, target: 'es2022', chunkSizeWarningLimit: 1600 },
})
