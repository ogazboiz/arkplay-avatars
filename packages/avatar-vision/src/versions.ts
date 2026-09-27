/* Runtime versions the browser loads from `models/runtime/`. The wasm loaders must match
 * the JS that was bundled, so the directories are versioned (and served immutable) and
 * these constants are checked against node_modules by `test/versions.test.ts` and by
 * `scripts/fetch-models.ts`. Bump them together with the dependency. */

export const MEDIAPIPE_VERSION = '1.0.1'
export const ORT_VERSION = '1.30.0'

/** Folder under the model base holding the MediaPipe wasm fileset. */
export const MEDIAPIPE_RUNTIME_DIR = `runtime/mediapipe-${MEDIAPIPE_VERSION}/`
/** Folder under the model base holding the onnxruntime-web loaders and binaries. */
export const ORT_RUNTIME_DIR = `runtime/ort-${ORT_VERSION}/`
