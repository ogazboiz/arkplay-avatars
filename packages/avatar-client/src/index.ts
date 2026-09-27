/* @arkplay/avatar-client — public API. See packages/avatar-client/README.md. */

export * from './types.ts'
export * from './protocol.ts'
export { AvatarClient, AvatarApiError, imageQuery, animatedQuery, spriteSheetQuery, rigQuery, type AvatarClientOptions, type TokenGetter } from './client.ts'
export { mountStudio, type MountStudioOptions, type StudioHandle } from './embed.ts'
export * from './shop.ts'
export * from './evm.ts'
// creator-partners: the Creator Partnership Programme (docs/studio.md)
export * from './partners.ts'
// developer-api: the Avatar API developer portal (docs/client.md)
export * from './developer.ts'
// bitmoji: stickers, comics and effects (docs/exports.md)
export * from './stickers.ts'
