# Avatar from a photo

A player takes or picks a photo, and `@arkplay/avatar-vision` suggests avatars that look like them. The player picks one and fine-tunes it in the studio. Everything runs in the browser: the photo never leaves the device.

The studio has this built in (the "From photo" button). This guide is for using the package directly.

## How it works

| Layer | What it produces | How |
|---|---|---|
| 1. Perception | 478 face landmarks (including irises), blendshapes, and a segmentation into hair, face skin, body skin, clothes and background | MediaPipe Tasks Vision (Apache-2.0), WASM + WebGL, GPU with CPU fallback |
| 2. Measurement | Skin, hair, iris, lip, brow, clothing and glasses colours; face, eye, nose, mouth and brow geometry; the hair silhouette; expression | Pure TypeScript on top of layer 1, with robust statistics and a conservative white balance |
| 3. Attributes | Hair length, texture, arrangement and part; bangs; beard; mustache; eyewear; headwear; earrings; headphones; freckles; eye makeup; top type (`taxonomy.json`) | A trained multi-task model (ONNX, int8) on onnxruntime-web, merged head by head with measurement heuristics under a per-head trust table |
| 4. Mapping | Valid DNA plus 3 alternative candidates, with notes | `photoToAvatars`: a pure function of the analysis |

## Setup

The runtime loads every model and wasm file from your own host, never a third-party CDN. Fetch them once:

```bash
npm run fetch-models -w @arkplay/avatar-vision
```

That downloads the official MediaPipe models, copies the MediaPipe and onnxruntime-web runtimes out of `node_modules` into versioned folders, and checks the SHA-256 of everything against `models/manifest.json`. The trained attribute model (`attributes.int8.onnx` + `attributes.json`) is already in the repository.

Serve `packages/avatar-vision/models/` at a URL of your choice (the studio app's dev server serves it at `/avatar/v1/vision/models/`). Versioned runtime folders can be cached forever. The first analysis downloads about 70 MB uncompressed (MediaPipe 32 MB, ORT wasm 14 MB, attribute model 24 MB).

## Use

```ts
// Lazy-import it, so MediaPipe and ORT stay out of your main bundle.
const { createPhotoAvatar, photoToAvatars, releaseAnalysis, PhotoAvatarError } = await import('@arkplay/avatar-vision')

const pa = createPhotoAvatar({ modelBase: '/vision-models/', onProgress: (p) => showProgress(p) })
void pa.warmUp()                                   // start loading while the player chooses a photo

try {
  const analysis = await pa.analyze(fileOrCanvas, { mirrored: false })   // a File, Blob, image or canvas
  const { best, candidates, notes } = photoToAvatars(analysis, { count: 4 })
  showCandidates(candidates.map((c) => renderSVG(c.dna, { crop: 'portrait' })), notes, analysis.warnings)
  releaseAnalysis(analysis)                        // drop the pixels and masks
} catch (e) {
  if (e instanceof PhotoAvatarError) showFriendly(e.code)   // no_face | too_small | too_dark | models_unavailable
  else throw e
}
```

- Open the chosen candidate's `dna` in the studio. Everything stays editable. "Try again" calls `photoToAvatars` again with another `seed`.
- `mirrored: true` for selfie-camera frames: left and right in the DNA are the subject's own.
- **Warnings** (`analysis.warnings`): `multiple_faces` (the largest, most central face is used), `dim_light`, `strong_cast`, `turned_head`, `partial_face`, `small_face`, `attribute_model_failed`.
- Without the attribute model (a 404, or a failure), measurement heuristics fill every head, so it still works, just less precisely.

## Privacy and safety

These are product requirements, and the code is built around them:

- **The photo lives in memory only, and only the chosen DNA is ever saved.** Nothing stores or logs the photo or anything derived from it: pixels, landmarks, masks, crops, measurements, embeddings.
- **Show consent first:** say what happens to the photo (it stays on the device) and that the player should use a photo of themselves or one they have permission to use. The studio's dialog does this.
- **No sensitive inference.** The system never estimates or labels gender, race or ethnicity, age, body size, health or identity, and doesn't derive them indirectly.
- **Body params stay at their defaults.** Skin tone is the measured colour, and exposure is never corrected from skin, so tones aren't pushed toward an average. Face-shape options that could act as an ethnicity proxy (such as monolid or hooded eyes) are never auto-selected; the player can choose them in the studio.
- The QA fixtures in `fixtures/photos/` are synthetic and licence-clean. Never use photos of real people for QA.

## The QA demo

```bash
npm run demo -w @arkplay/avatar-vision      # http://127.0.0.1:5182
```

Pick, drop or capture a photo, or click a synthetic QA photo. The page shows the landmarks, segmentation, aligned crop, colour swatches, attribute bars with each head's source (`model`, `blend` or `heuristic`), and the 4 candidates. "Run all" analyses every fixture and saves a report for `npm run qa-report`; `npm run sheet` renders a contact sheet of the fixtures' candidates.

## The attribute model contract

`taxonomy.json` is the contract between the model trainer and this runtime: heads, class order and the crop spec. Existing entries never change; classes are only appended. `models/attributes.json` lists each head's output, classes and activation (`softmax`, `coral`, `sigmoid` or `probs`), the files with their SHA-256 (checked before loading), and test metrics, which drive the trust table: heads that beat the majority baseline by 5 points use the model, blended toward a confident, disagreeing heuristic; the others use heuristics. A better model trusts more heads automatically.

The int8 model runs on wasm (on WebGPU its quantized nodes fall back to the CPU and measured slower).
