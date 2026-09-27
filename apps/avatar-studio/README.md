# Avatar Studio app

The standalone and iframe-embeddable host for `@arkplay/avatar-studio`, built with Vite. It serves the studio at `/avatar/studio/`:

- **Standalone:** `/avatar/studio/`, with a local draft, share links (`#code=A2…`) and exports.
- **Embed:** `/avatar/studio/?embed=1&origin=<host origin>[&code=…][&config=<json>]`, the studio side of the v1 postMessage protocol (see [Embedding the studio](../../docs/embedding.md)).

```bash
npm run dev                                   # from the repo root: http://localhost:5181/avatar/studio/
npm run build -w @arkplay/avatar-studio-app   # static files in apps/avatar-studio/dist
BASE_PATH=/my-studio/ npm run build -w @arkplay/avatar-studio-app
```

"From photo" needs `npm run fetch-models -w @arkplay/avatar-vision` once; the dev server then serves the models itself.

## Environment

| Variable | Effect |
|---|---|
| `BASE_PATH` | Public path of the build (default `/avatar/studio/`) |
| `DEV_AVATAR_ORIGIN` | Dev only: an avatar service to proxy `/avatar/v1` to (default `http://127.0.0.1:8084`) |
| `VITE_AVATAR_API_BASE` | The avatar API base for premium looks (default `/avatar/v1`, same origin) |
| `VITE_SERVER_EXPORTS=1` | Downloads made by the service |
| `VITE_SERVER_STUDIO=1` | Stage and tiles drawn by the service |
| `VITE_SERVER_PHOTO=1` | "From photo" analysed by the service |

Without a service, everything free is drawn in the browser and premium items stay placeholders.

## Files

- `src/main.tsx`: picks standalone or embed mode from the URL.
- `src/Standalone.tsx`: the page.
- `src/Embed.tsx`: embed mode; posts only to the validated `?origin=`, ignores every other origin and window, and never autosaves.
- `src/embedParams.ts`: reads and sanitizes `?embed`, `?origin`, `?code` and `?config`.
- `src/premium.ts`: the service base and the server-rendering switches.
