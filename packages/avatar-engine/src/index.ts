/* @arkplay/avatar-engine — public API.
 *
 * Everything a consumer needs is exported from here; deep imports are not part of the
 * contract. See packages/avatar-engine/README.md for the rules of this package. */

export { ENGINE_VERSION, ENGINE_VERSION_STRING } from './version.ts'

// DNA
export * from './dna/types.ts'
export * from './dna/params.ts'
export * from './dna/schema/index.ts'
export { normalizeDNA, validateDNA, resolveItems, LIMITS, type NormalizeReport } from './dna/normalize.ts'
export { defaultDNA, makeItem, applySpecies } from './dna/defaults.ts'
export * from './dna/edit.ts'
export {
  encodeShareCode,
  decodeShareCode,
  encodeAvatarBytes,
  decodeAvatarBytes,
  compactDNA,
  expandDNA,
  canonicalJSON,
  dnaHash,
  dnaEquals,
  ShareCodeError,
  type ShareCodeFormat,
  type ShareCodeOptions,
} from './dna/codec.ts'
export { SPECIES, speciesPreset, type SpeciesPreset } from './dna/species.ts'

// Rendering
export type { View, Crop, RenderOptions, ExprState, HandShape, EyeMode, MouthShape, Part, FrameState } from './render/types.ts'
export { renderSVG, renderModel, resolveFrame } from './render/render.ts'
export { buildModel, type Model } from './render/model.ts'
export { layoutFrame, partsSVG, documentSVG, cropBox, type Frame } from './render/compose.ts'

// Animation
export { CLIPS, clipsFor, clipFor, clipsForAvatar } from './anim/clips.ts'
export type { Clip, ClipInfo, ClipEvent } from './anim/clip.ts'
// anim-expansion: creature stances (sit, lie, rear, bow…) for renderers that pose creatures
export { creaturePose } from './anim/creaturePoses.ts'
export { GAIT_CHOICES, type Gait } from './anim/profile.ts'
export { EXPRESSION_PRESETS, expressionState, visemesFor, VISEMES, type Viseme } from './anim/expression.ts'
export { POSE_DEFS } from './anim/poses.ts'

// Generation
export { randomDNA, randomParam, type RandomOptions } from './generate/random.ts'
export { THEMES, themeById, type Theme } from './generate/themes.ts'
export { mutate, variations, crossover, interpolate } from './generate/evolve.ts'
// Premium art: the drawings of paid, limited and NFT items are not in this package. They plug
// into this registry; without them those items draw a placeholder (docs/studio.md).
export {
  PREMIUM_ART,
  PREMIUM_ART_ITEMS,
  LOCAL_ART,
  isPremiumArt,
  premiumArtKind,
  hasArt,
  premiumArtRegistered,
  premiumItems,
  needsPremiumArt,
  type PremiumArt,
  type PremiumArtKind,
  type Layers as PremiumArtLayers,
} from './render/premiumArt.ts'

// Exports (files for games, chat and the web)
export { sampleAnim, sampleAnims, frameContent, type SampledFrame, type SampledAnim, type SampleOptions } from './export/frames.ts'
export { spriteSheet, type SpriteSheet, type SpriteSheetOptions, type SpriteSheetMeta, type SheetFrame, type SheetAnimation } from './export/spritesheet.ts'
export { rigBundle, FACE_STATES, classifyFace, type RigBundle, type RigBone, type RigRegion, type RigSlot, type RigClip, type RigOptions, type RigResult } from './export/rig.ts'
export { shelfPack, type PackRect, type PackResult } from './export/pack.ts'
export { animatedSVG, type AnimatedOptions } from './export/animated.ts'
export { stickerSet, type Sticker } from './export/stickers.ts'
export { renderThumb, THUMB_CROPS, type ThumbCrop, type ThumbJob } from './export/thumb.ts'
// Stickers, comics and effects (Bitmoji-style packs; docs/exports.md)
export { renderSticker, stickerCatalogue, stickerInfo, buddyDNA, inSeason, STICKER_TEMPLATES, STICKER_CATEGORIES, type StickerInfo, type StickerOptions, type StickerTemplate, type StickerCategory } from './export/stickers.ts'
export { renderComic, comicCatalogue, comicInfo, dailyComic, dayNumber, COMIC_SCRIPTS, COMIC_CATEGORIES, COMIC_LAYOUTS, type ComicInfo, type ComicOptions, type ComicLayout, type ComicScript, type ComicCategory } from './export/comics.ts'
export { EFFECTS, EFFECT_IDS, isEffect, effectLayers, applyEffect, renderWithEffect, type EffectId, type EffectInfo, type EffectOptions, type EffectLayers, type Subject as EffectSubject } from './export/effects.ts'
export { describeDNA, colorName } from './dna/describe.ts'

// The 3D engine's view of an avatar (for a 3D renderer): measurements, face outline,
// hair recipe, resolved items and the 2D art it reuses as textures. Adds no 2D output.
export {
  avatar3dSource,
  type Avatar3DSource,
  type Source3DOptions,
  type Source3DPart,
  type Source3DBone,
  type Source3DItem,
  type Source3DHuman,
  type Source3DCreature,
  type HairRecipe,
  type HumanMeasure,
  type CreatureMeasure,
  type LegDef,
  type Plan,
} from './export/bridge3d.ts'

// Economy: rarity, free and paid features, the launch promo
export {
  RARITY_VERSION,
  RARITY_TIERS,
  RARITY_THRESHOLDS,
  RARITY_POINTS,
  LIMITED_EDITION_POINTS,
  avatarRarity,
  itemPoints,
  nonFreeItems,
  rarityTierFor,
  type Rarity,
  type RarityTier,
  type RarityContribution,
  type RarityOptions,
} from './rarity.ts'
export {
  FEATURES,
  FEATURE_LIMITS,
  PROMO,
  featureSpec,
  featureFreeNow,
  itemFeature,
  promoActive,
  temporarilyFreeFeatures,
  type FeatureSpec,
  type FeatureTier,
  type Promo,
} from './features.ts'

// Core utilities useful to UIs
export { createRng, freshSeed, hashString, type Rng } from './core/rng.ts'
export * as colors from './core/color.ts'
