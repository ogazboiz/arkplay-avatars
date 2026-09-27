/* SVG id prefixes. Inline SVGs share one document, so two renders using the same gradient
 * ids would paint with each other's defs. Every render gets a fresh prefix. */

let n = 0
const session = Math.floor(Math.random() * 36 ** 3).toString(36)

export const nextIdPrefix = (tag = 'r'): string => `aps${session}${tag}${(n++).toString(36)}`
