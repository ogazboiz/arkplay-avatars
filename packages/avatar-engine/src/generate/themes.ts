/* Themes steer randomization: which tags are favoured, how often fantasy colours
 * appear, and items a theme should almost always include. */

export interface Theme {
  id: string
  label: string
  /** Options and items carrying these tags are much more likely. */
  tags: string[]
  /** Probability of a fantasy skin tone / hair colour. */
  fantasySkin: number
  fantasyHair: number
  /** Items to include (each entry: candidates, probability). */
  include: { ids: string[]; p: number }[]
  /** Accessory density multiplier. */
  accessories: number
  /** Preferred harmony base hues (degrees), if any. */
  hues?: number[]
  /** Preferred backgrounds. */
  scenes?: string[]
}

const T = (t: Theme) => t

export const THEMES: Theme[] = [
  T({ id: 'any', label: 'Anything', tags: [], fantasySkin: 0.04, fantasyHair: 0.12, include: [], accessories: 1 }),
  T({ id: 'casual', label: 'Casual', tags: ['casual', 'cozy'], fantasySkin: 0, fantasyHair: 0.08, include: [], accessories: 0.8, scenes: ['city', 'meadow', 'sky'] }),
  T({ id: 'sporty', label: 'Sporty', tags: ['sporty'], fantasySkin: 0, fantasyHair: 0.05, include: [{ ids: ['sneakers', 'hightops'], p: 0.9 }, { ids: ['headband', 'cap', 'wristband'], p: 0.5 }], accessories: 0.8, scenes: ['stage', 'sky'] }),
  T({ id: 'formal', label: 'Formal', tags: ['formal'], fantasySkin: 0, fantasyHair: 0.03, include: [{ ids: ['blazer', 'waistcoat', 'cardigan'], p: 0.6 }, { ids: ['loafers', 'heels', 'flats'], p: 0.8 }, { ids: ['tie', 'bowtie', 'pearls', 'watch'], p: 0.6 }], accessories: 0.8, scenes: ['city', 'stage'] }),
  T({ id: 'cute', label: 'Cute', tags: ['cute'], fantasySkin: 0.05, fantasyHair: 0.3, include: [{ ids: ['bow', 'clips', 'cat-ears', 'bunny-ears', 'flower'], p: 0.55 }], accessories: 1.3, hues: [330, 300, 200, 50], scenes: ['candy', 'meadow'] }),
  T({ id: 'fantasy', label: 'Fantasy', tags: ['fantasy', 'magic'], fantasySkin: 0.3, fantasyHair: 0.4, include: [{ ids: ['staff', 'wand', 'sword', 'orb', 'shield'], p: 0.5 }, { ids: ['angel-wings', 'fairy-wings', 'dragon-wings', 'cape'], p: 0.35 }], accessories: 1.3, scenes: ['forest', 'night', 'dungeon'] }),
  T({ id: 'wizard', label: 'Wizard', tags: ['wizard', 'magic', 'fantasy'], fantasySkin: 0.1, fantasyHair: 0.2, include: [{ ids: ['robe'], p: 0.85 }, { ids: ['wizard'], p: 0.85 }, { ids: ['staff', 'wand', 'book', 'orb'], p: 0.8 }], accessories: 1.1, hues: [250, 280], scenes: ['night', 'dungeon'] }),
  T({ id: 'knight', label: 'Knight', tags: ['knight', 'medieval', 'fantasy'], fantasySkin: 0, fantasyHair: 0.05, include: [{ ids: ['knight', 'armor'], p: 0.9 }, { ids: ['sword', 'shield'], p: 0.8 }, { ids: ['greaves', 'boots'], p: 0.8 }], accessories: 1, scenes: ['dungeon', 'forest'] }),
  T({ id: 'scifi', label: 'Sci-fi', tags: ['scifi', 'space'], fantasySkin: 0.2, fantasyHair: 0.35, include: [{ ids: ['jumpsuit', 'spacesuit'], p: 0.6 }, { ids: ['visor-shades', 'goggles', 'space-helm'], p: 0.5 }, { ids: ['jetpack', 'mech-wings'], p: 0.25 }], accessories: 1.2, hues: [190, 280, 160], scenes: ['space', 'city'] }),
  T({ id: 'spooky', label: 'Spooky', tags: ['spooky', 'mysterious'], fantasySkin: 0.35, fantasyHair: 0.3, include: [{ ids: ['witch', 'hood', 'devil-horns', 'bat-wings'], p: 0.6 }, { ids: ['lantern', 'shadow-aura'], p: 0.35 }], accessories: 1.2, hues: [280, 20, 120], scenes: ['night', 'dungeon'] }),
  T({ id: 'pirate', label: 'Pirate', tags: ['pirate', 'adventure'], fantasySkin: 0, fantasyHair: 0.05, include: [{ ids: ['pirate', 'bandana'], p: 0.9 }, { ids: ['eyepatch'], p: 0.5 }, { ids: ['sword'], p: 0.5 }, { ids: ['boots', 'kneeboots'], p: 0.7 }], accessories: 1, scenes: ['beach'] }),
  T({ id: 'royal', label: 'Royal', tags: ['royal', 'formal'], fantasySkin: 0, fantasyHair: 0.05, include: [{ ids: ['crown', 'tiara'], p: 0.9 }, { ids: ['gown', 'cape', 'sash'], p: 0.7 }, { ids: ['pearls', 'pendant'], p: 0.5 }], accessories: 1.1, hues: [270, 350, 45], scenes: ['stage'] }),
  T({ id: 'punk', label: 'Punk', tags: ['punk', 'rock'], fantasySkin: 0.05, fantasyHair: 0.5, include: [{ ids: ['leather'], p: 0.7 }, { ids: ['combat'], p: 0.8 }, { ids: ['choker', 'chain', 'nose-ring', 'lip-ring'], p: 0.6 }], accessories: 1.2, scenes: ['city', 'stage'] }),
  T({ id: 'beach', label: 'Beach', tags: ['beach'], fantasySkin: 0, fantasyHair: 0.1, include: [{ ids: ['sandals'], p: 0.8 }, { ids: ['shades', 'bucket', 'visor'], p: 0.6 }, { ids: ['lei', 'icecream'], p: 0.35 }], accessories: 1, hues: [190, 40, 330], scenes: ['beach'] }),
  T({ id: 'winter', label: 'Winter', tags: ['winter', 'cozy'], fantasySkin: 0, fantasyHair: 0.05, include: [{ ids: ['puffer', 'sweater', 'trench'], p: 0.8 }, { ids: ['beanie', 'scarf', 'mittens'], p: 0.8 }, { ids: ['boots'], p: 0.7 }], accessories: 1.1, hues: [210, 0, 160], scenes: ['snow'] }),
  T({ id: 'ninja', label: 'Ninja', tags: ['ninja', 'mysterious'], fantasySkin: 0, fantasyHair: 0.1, include: [{ ids: ['ninja-mask'], p: 0.85 }, { ids: ['sword-back', 'headband'], p: 0.6 }], accessories: 0.9, hues: [240, 0], scenes: ['night', 'forest'] }),
  T({ id: 'hero', label: 'Superhero', tags: ['hero'], fantasySkin: 0.05, fantasyHair: 0.15, include: [{ ids: ['hero'], p: 0.8 }, { ids: ['cape'], p: 0.8 }, { ids: ['bandit-mask'], p: 0.5 }], accessories: 1, scenes: ['city', 'sky'] }),
  T({ id: 'gaming', label: 'Gamer', tags: ['gaming'], fantasySkin: 0.05, fantasyHair: 0.3, include: [{ ids: ['hoodie'], p: 0.6 }, { ids: ['headphones'], p: 0.8 }, { ids: ['controller'], p: 0.5 }, { ids: ['pixels'], p: 0.2 }], accessories: 1, hues: [270, 190, 140], scenes: ['city', 'space'] }),
  T({ id: 'party', label: 'Party', tags: ['party'], fantasySkin: 0.05, fantasyHair: 0.35, include: [{ ids: ['party', 'star-shades', 'heart-shades'], p: 0.6 }, { ids: ['balloon', 'mic', 'sparkles'], p: 0.5 }], accessories: 1.3, scenes: ['stage', 'candy'] }),
]

export const themeById = (id?: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]
