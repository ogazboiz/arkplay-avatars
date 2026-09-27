# @arkplay/avatar-vision

"Avatar from a photo", in the browser. A photo goes through MediaPipe perception, then measurement (colours, geometry, hair silhouette), then attributes (a trained int8 ONNX model merged head by head with measurement heuristics under a per-head trust table), and finally a pure mapping to avatar DNA with 4 candidates.

Guide: [Avatar from a photo](../../docs/photo-avatars.md).

## Privacy and safety (hard rules)

- **The photo lives in memory only, and only the chosen DNA is ever saved.** Never store or log the photo, or anything derived from it: pixels, landmarks, masks, crops, measurements, embeddings. That includes `console.log` in library code and analytics events.
- **No sensitive inference.** Never estimate or label gender, race or ethnicity, age or age group, body size, health or identity. Don't add such heads, cues, notes or heuristics, and don't derive them indirectly.
- **Body params stay at their defaults.** `skin.age` stays at its default. Skin tone is the measured colour, and exposure is never corrected from skin, so tones aren't pushed toward an average.
- Face shape options like monolid or hooded eyes are not auto-selected (they can act as an ethnicity proxy). The player can choose them in the studio.
- The demo is a dev tool. Its fixture photos are synthetic and licence-clean. Never fetch photos of real people for QA.

## Commands (from this folder, or `-w @arkplay/avatar-vision` from the root)

```bash
npm run fetch-models   # official MediaPipe models + wasm runtimes → models/; SHA-256 of everything in models/manifest.json
                       #   --verify: check only; --update: accept new upstream bytes for the "latest" URLs
npm test               # node --test: crop maths + crop parity with the Python reference crops, colour stats,
                       #   taxonomy/versions, trust table + merging, heuristics, toDNA fixtures
npm run typecheck      # src/test/scripts + demo
npm run demo           # Vite QA page on http://127.0.0.1:5182 (no HMR)
npm run qa-report      # after the demo's "Run all": agreement tables + out/calibration-v0.png
npm run sheet          # contact sheet of the candidates for test/fixtures → out/fixtures-sheet.png
```

## File map

| File | Purpose |
|---|---|
| `taxonomy.json` | **The contract with the model trainer**: heads, class order, crop spec, measured keys. Don't change existing entries; append classes only. |
| `src/index.ts` | `createPhotoAvatar({ modelBase?, onProgress?, delegate?, attributeModel?, attributeProvider?, flipTTA? })` → `{ analyze(image, { mirrored? }), warmUp(), backends, attributeModel, dispose() }`; `releaseAnalysis`; re-exports |
| `src/pipeline.ts` | Face choice, crop points, errors and lighting warnings |
| `src/perception.ts` | Lazy MediaPipe FaceLandmarker and ImageSegmenter, GPU→CPU fallback, EXIF orientation, ≤ 1280 px |
| `src/crop.ts` | Aligned crop: pure affine maths plus `drawAlignedCrop` (canvas) |
| `src/measure.ts` | Pure pixel maths: colours (white balance/exposure, trimmed OKLab), geometry ratios, hair silhouette, cues for heuristics |
| `src/color.ts` | OKLab, robust colour, k-means, `estimateCorrection` |
| `src/attributes.ts` | onnxruntime-web runner: reads `attributes.json`, loads `attributes.int8.onnx` after a SHA-256 check; the per-head trust table; returns null when there's no model |
| `src/heuristics.ts` | Attribute guesses from measurements; `mergeAttributes(model, heuristic, trust)` |
| `src/toDNA.ts` | **Pure** `photoToAvatars(input, { seed?, count })` → `{ best, candidates, notes }` |
| `src/calibration.ts` | Every calibration constant, in one table |
| `src/landmarks.ts`, `src/taxonomy.ts`, `src/types.ts`, `src/versions.ts` | Face-mesh indices; the typed taxonomy; the data model and `PhotoAvatarError`; pinned runtime versions |
| `scripts/fetch-models.ts` | Downloads and pins the model files and copies the runtimes |
| `demo/` | The QA page, plus a dev middleware that serves `models/`, the fixtures and the QA save endpoint |
| `fixtures/photos/` | 32 synthetic QA photos, with label sidecars and the Python reference crops |
| `test/` | Unit tests, hand-written analyses, Node-only image decoding and the software crop |

## Pipeline notes

- **Errors** (`PhotoAvatarError.code`): `no_face`, `too_small` (inter-ocular distance < 24 px), `too_dark`, `models_unavailable`. **Warnings** (`analysis.warnings`): `multiple_faces`, `dim_light`, `strong_cast`, `turned_head`, `partial_face`, `small_face`, `attribute_model_failed`.
- **Colours:** eye whites drive white balance and exposure (with dead zones and clamps); a single tinted garment or backdrop never recolours the face. Skin is the trimmed median. Each colour carries a `confidence`, and low-confidence colours are ignored.
- **Sides:** `hair_part` classes and the DNA's `hair.part` name the **subject's own** left and right. `analyze(img, { mirrored: true })` swaps both for selfie-camera frames.
- **Attributes:** trusted heads (accuracy ≥ baseline + 5 points) use the model, blended toward a confident, disagreeing heuristic; `hair_part` is presence only (the side comes from the measured part); other heads use heuristics. `attributes.headSource` says `model`, `blend` or `heuristic`.
- **Execution provider:** the int8 model runs on wasm; on WebGPU its quantized nodes fall back to the CPU and measured slower.

## Serving the models

Serve `models/` at the `modelBase` you pass to `createPhotoAvatar` (default `/avatar/v1/vision/models/`). Allow only the model and runtime extensions, no path traversal; versioned runtime folders (`runtime/mediapipe-<v>/`, `runtime/ort-<v>/`) can be cached forever. When you bump `@mediapipe/tasks-vision` or `onnxruntime-web`, update `src/versions.ts` and re-run `fetch-models`; `test/versions.test.ts` checks that they match.
