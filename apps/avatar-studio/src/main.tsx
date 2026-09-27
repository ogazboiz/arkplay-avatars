/* Entry: embed mode (`?embed=1&origin=…`) or the standalone studio. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@arkplay/avatar-studio/styles.css'
import './app.css'
import { Embed, EmbedError } from './Embed.tsx'
import { readParams } from './embedParams.ts'
import { Standalone } from './Standalone.tsx'

const params = readParams(location.search, location.hash)
const root = createRoot(document.getElementById('root') as HTMLElement)

if (params.embed) document.documentElement.classList.add('is-embed')

root.render(
  <StrictMode>
    {params.embed ? (
      params.origin ? (
        <Embed origin={params.origin} code={params.code} config={params.config} />
      ) : (
        <EmbedError origin={params.rawOrigin} />
      )
    ) : (
      <Standalone code={params.code} />
    )}
  </StrictMode>,
)
