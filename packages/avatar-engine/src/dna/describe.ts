/* Plain-language descriptions of avatars, used as alt text so screen-reader users get
 * the same avatar everyone else sees ("An avatar with deep brown skin, long curly teal
 * hair and round glasses, wearing a red hoodie and jeans, smiling."). */

import { toLch } from '../core/color.ts'
import { itemSpec, sectionSpec } from './schema/index.ts'
import { speciesPreset } from './species.ts'
import type { AvatarDNA } from './types.ts'

const HUES: [number, string][] = [
  [20, 'red'],
  [50, 'orange'],
  [75, 'amber'],
  [100, 'yellow'],
  [140, 'lime'],
  [165, 'green'],
  [200, 'teal'],
  [240, 'blue'],
  [280, 'indigo'],
  [310, 'purple'],
  [345, 'pink'],
  [361, 'red'],
]

/** A short colour name for any hex colour. */
export function colorName(hex: string): string {
  const { l, c, h } = toLch(hex)
  if (c < 0.03) return l > 0.9 ? 'white' : l > 0.7 ? 'light grey' : l > 0.45 ? 'grey' : l > 0.25 ? 'dark grey' : 'black'
  let name = HUES.find(([lim]) => h < lim)?.[1] ?? 'red'
  if (name === 'orange' && l < 0.5) name = 'brown'
  if (name === 'amber' && l < 0.55) name = 'brown'
  if (name === 'red' && l < 0.4 && c < 0.12) name = 'maroon'
  const shade = l > 0.82 ? 'pale ' : l > 0.68 ? 'light ' : l < 0.32 ? 'dark ' : ''
  return shade + name
}

function skinName(hex: string): string {
  const { l, c, h } = toLch(hex)
  if (c > 0.09 && (h < 20 || h > 100)) return colorName(hex)
  if (l > 0.85) return 'fair'
  if (l > 0.75) return 'light'
  if (l > 0.65) return 'medium'
  if (l > 0.52) return 'tan'
  if (l > 0.4) return 'brown'
  return 'deep brown'
}

const label = (section: string, key: string, id: string): string =>
  (sectionSpec(section)?.params.find((p) => p.key === key) as { options?: { id: string; label: string }[] } | undefined)?.options?.find((o) => o.id === id)?.label.toLowerCase() ?? id

/** How each expression reads at the end of a sentence (labels like "Grin" aren't adjectives). */
const EXPRESSION_PHRASES: Record<string, string> = {
  neutral: 'looking calm',
  grin: 'grinning',
  laugh: 'laughing',
  smirk: 'smirking',
  love: 'in love',
  wink: 'winking',
  tongue: 'sticking out their tongue',
  cry: 'crying',
  pout: 'pouting',
  sick: 'looking queasy',
  mischief: 'looking mischievous',
}

const expressionPhrase = (id: string): string => EXPRESSION_PHRASES[id] ?? `looking ${label('expression', 'preset', id)}`

const list = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function describeDNA(dna: AvatarDNA): string {
  const s = dna.sections
  const who = dna.name ? `${dna.name}: ` : ''
  const expr = expressionPhrase(typeof s.expression?.preset === 'string' ? s.expression.preset : 'happy')
  const acc = dna.accessories.map((a) => itemSpec(a.id)?.label.toLowerCase()).filter((x): x is string => !!x && x !== 'custom accessory')
  if (dna.kind === 'creature') {
    const sp = dna.meta?.species ? speciesPreset(dna.meta.species)?.label.toLowerCase() : undefined
    const plan = typeof s.species?.plan === 'string' ? label('species', 'plan', s.species.plan) : 'creature'
    const coat = typeof s.coat?.primary === 'string' ? colorName(s.coat.primary) : ''
    const pattern = typeof s.coat?.pattern === 'string' && s.coat.pattern !== 'none' ? ` with ${label('coat', 'pattern', s.coat.pattern)}` : ''
    const wings = typeof s.wings?.style === 'string' && s.wings.style !== 'none' ? `, ${label('wings', 'style', s.wings.style)} wings` : ''
    const horns = typeof s.horns?.style === 'string' && s.horns.style !== 'none' ? `, ${label('horns', 'style', s.horns.style)}` : ''
    const extra = acc.length ? `, wearing ${list(acc)}` : ''
    return `${who}A ${coat} ${sp ?? plan.toLowerCase()}${pattern}${wings}${horns}${extra}, ${expr}.`.replace(/\s+/g, ' ')
  }
  const skin = typeof s.skin?.tone === 'string' ? skinName(s.skin.tone) : 'medium'
  const hairStyle = typeof s.hair?.style === 'string' ? s.hair.style : 'short-messy'
  const hair = hairStyle === 'bald' ? 'a bald head' : `${label('hair', 'style', hairStyle)} ${colorName(String(s.hair?.color ?? '#3f2a1f'))} hair`
  const beard = typeof s.facialHair?.beard === 'string' && s.facialHair.beard !== 'none' ? ` and a ${label('facialHair', 'beard', s.facialHair.beard)}` : ''
  const clothes = dna.outfit.map((o) => {
    const spec = itemSpec(o.id)
    const col = typeof o.params.color === 'string' ? colorName(o.params.color) : ''
    return `${col} ${spec?.label.toLowerCase() ?? o.id}`.trim()
  })
  const wearing = clothes.length ? `, wearing ${list(clothes)}` : ''
  const extras = acc.length ? `, with ${list(acc)}` : ''
  return `${who}An avatar with ${skin} skin, ${hair}${beard}${wearing}${extras}, ${expr}.`.replace(/\s+/g, ' ')
}
