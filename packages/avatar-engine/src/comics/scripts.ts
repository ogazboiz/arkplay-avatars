/* Comic scripts: 3–4 panel strips starring the player (cast 0) and a friend (cast 1).
 *
 * Bible Comic Universe tie-ins put the player and a friend into Bible stories as helpers
 * and witnesses: the story's own heroes speak from off-panel (a bubble tail pointing at the
 * ark's window, a field, a doorway), so no one has to "play" Noah or David, and nothing
 * sacred is drawn as a gag. Every strip is kind: jokes are about us, never about faith.
 *
 * Positions: actor `x` is -1 (left) … 1 (right) across the panel; props sit at (u, v), the
 * fraction of the panel's width and height, and `size` is a fraction of its height. In a
 * wide shot the ground is at v ≈ 0.91. */

import type { EffectId } from '../export/effects.ts'
import { PAL } from './pen.ts'
import type { BubbleKind } from './shapes.ts'
import type { ActorPose } from './stage.ts'

export type ComicCategory = 'bcu' | 'faith' | 'friends' | 'gaming' | 'school' | 'seasons'

export const COMIC_CATEGORIES: { id: ComicCategory; label: string }[] = [
  { id: 'bcu', label: 'Bible Comic Universe' },
  { id: 'faith', label: 'Faith' },
  { id: 'friends', label: 'Friends' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'school', label: 'School & work' },
  { id: 'seasons', label: 'Seasons' },
]

export interface ComicLine {
  /** Cast index of the speaker; -1 = off-panel (then `from` aims the tail). */
  who: number
  text: string
  kind?: BubbleKind
  /** Off-panel speakers: where the tail points, as panel fractions (u, v). */
  from?: [number, number]
}

export interface ComicActor extends ActorPose {
  who: number
  x?: number
  /** Face left (side views) / mirror. */
  flip?: boolean
  creature?: ActorPose
  /** A prop in the hands (humanoids) or held against the chest (creatures). */
  hold?: { id: string; size?: number; dy?: number; rot?: number; hand?: 'L' | 'R' }
}

export interface ComicPanelProp {
  id: string
  u: number
  v: number
  size: number
  rot?: number
  flip?: boolean
  /** Behind the actors (default true); false = in front of them. */
  back?: boolean
  color?: string
  color2?: string
}

export interface ComicPanel {
  scene?: string
  shot?: 'wide' | 'medium' | 'close'
  /** Narration box, top left. */
  caption?: string
  actors: ComicActor[]
  lines?: ComicLine[]
  props?: ComicPanelProp[]
  effect?: EffectId
  /** Sound-effect lettering. */
  sfx?: { text: string; u: number; v: number; color?: string; rot?: number; burst?: boolean }
}

export interface ComicScript {
  id: string
  title: string
  blurb: string
  category: ComicCategory
  cast: 1 | 2
  /** Default scene preset of the panels. */
  scene: string
  panels: ComicPanel[]
  tags: string[]
  /** Bible Comic Universe tie-in: the story and where to read it. */
  bcu?: { story: string; ref: string }
  season?: { from: string; until: string }
}

type AExtra = Partial<ComicActor>
const A = (who: number, x: number, pose: string, expression: string, extra: AExtra = {}): ComicActor => ({ who, x, pose, expression, ...extra })
const L = (who: number, text: string, extra: Partial<ComicLine> = {}): ComicLine => ({ who, text, ...extra })
const P = (id: string, u: number, v: number, size: number, extra: Partial<ComicPanelProp> = {}): ComicPanelProp => ({ id, u, v, size, ...extra })
const off = (text: string, from: [number, number], kind?: BubbleKind): ComicLine => ({ who: -1, text, from, kind })
const run = (who: number, x: number, expression: string, t = 0.2, extra: AExtra = {}): ComicActor => ({ who, x, clip: 'run', t, view: 'side', expression, ...extra })

export const COMIC_SCRIPTS: ComicScript[] = [
  /* ---- Bible Comic Universe ----------------------------------------------------- */
  {
    id: 'ark-helpers',
    title: 'Helping Noah load the Ark',
    blurb: 'Two by two, up the ramp: a very busy day at the Ark.',
    category: 'bcu',
    cast: 2,
    scene: 'meadow',
    bcu: { story: "Noah's Ark", ref: 'Genesis 6-9' },
    tags: ['noah', 'ark', 'animals', 'rainbow', 'bible'],
    panels: [
      {
        caption: 'Long ago, next to a VERY big boat...',
        props: [P('ark', 0.74, 0.6, 0.6), P('sheep', 0.14, 0.85, 0.14)],
        actors: [A(0, -0.75, 'sticker-point-l', 'sticker-wow'), A(1, 0.1, 'stand', 'surprised')],
        lines: [L(0, 'Whoa! Is that the ark?')],
      },
      {
        props: [P('ark', 0.78, 0.54, 0.62), P('sheep', 0.34, 0.85, 0.13), P('sheep', 0.5, 0.86, 0.11, { flip: true })],
        actors: [A(0, -0.8, 'sticker-hold', 'happy', { hold: { id: 'crate', size: 1.1 } })],
        lines: [off('Two by two, everyone!', [0.7, 0.44])],
        sfx: { text: 'Baa!', u: 0.46, v: 0.68, color: PAL.pink },
      },
      {
        shot: 'medium',
        props: [P('giraffe', 0.8, 0.66, 0.72)],
        actors: [A(1, -0.75, 'shrug', 'confused'), A(0, 0.3, 'think', 'worried')],
        lines: [L(1, 'How does a giraffe fit through the door?'), L(0, 'Very carefully!')],
      },
      {
        scene: 'sky',
        props: [P('rainbow', 0.5, 0.36, 0.5), P('ark', 0.84, 0.72, 0.36), P('dove', 0.2, 0.3, 0.1)],
        actors: [A(0, -0.55, 'cheer', 'sticker-starry'), A(1, 0.25, 'sticker-praise', 'sticker-joy')],
        lines: [L(0, 'A rainbow! God keeps His promises.')],
      },
    ],
  },
  {
    id: 'david-sling',
    title: 'David practises with his sling',
    blurb: 'A shepherd boy, a sling, and a LOT of practice.',
    category: 'bcu',
    cast: 1,
    scene: 'meadow',
    bcu: { story: 'David the shepherd', ref: '1 Samuel 17' },
    tags: ['david', 'sling', 'shepherd', 'sheep', 'bible'],
    panels: [
      {
        caption: 'Out in the fields near Bethlehem...',
        props: [P('sheep', 0.66, 0.84, 0.14), P('sheep', 0.84, 0.85, 0.12, { flip: true })],
        actors: [A(0, -0.55, 'wave', 'happy')],
        lines: [off("Hi! I'm David. Want to practise with my sling?", [1, 0.62])],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-sling', 'sticker-focus', { hold: { id: 'sling', size: 1.5, dy: -0.72, hand: 'R' } })],
        lines: [L(0, 'Eyes on the target...')],
        sfx: { text: 'Whirr!', u: 0.8, v: 0.5, color: PAL.teal },
      },
      {
        props: [P('stone', 0.08, 0.16, 0.05), P('sheep', 0.74, 0.84, 0.14, { flip: true })],
        actors: [A(0, -0.45, 'sticker-cover-face', 'sticker-awkward')],
        lines: [L(0, 'Oops! Wrong way!')],
        sfx: { text: 'Baa?', u: 0.72, v: 0.62, color: PAL.pink },
      },
      {
        shot: 'medium',
        actors: [A(0, -0.3, 'thumbs-up', 'determined')],
        lines: [off('Keep practising, and trust God with the big things!', [1, 0.6])],
      },
    ],
  },
  {
    id: 'jonah-big-fish',
    title: "Jonah's big fish",
    blurb: 'Running from God never works out, but second chances do.',
    category: 'bcu',
    cast: 2,
    scene: 'beach',
    bcu: { story: 'Jonah', ref: 'Jonah 1-3' },
    tags: ['jonah', 'whale', 'fish', 'sea', 'bible'],
    panels: [
      {
        props: [P('whale', 0.74, 0.62, 0.3)],
        actors: [A(0, -0.7, 'sticker-point-l', 'sticker-wow'), A(1, 0, 'stand', 'surprised')],
        lines: [L(0, "That's the biggest fish I've ever seen!"), L(1, "Like the one in Jonah's story!")],
      },
      {
        scene: 'underwater',
        caption: 'Jonah ran away from God... and ended up inside a big fish!',
        effect: 'bubbles',
        props: [P('whale', 0.5, 0.66, 0.56)],
        actors: [],
        lines: [off('Three days in here?!', [0.52, 0.62])],
      },
      {
        scene: 'underwater',
        shot: 'medium',
        effect: 'bubbles',
        actors: [A(1, -0.35, 'sticker-pray', 'sticker-serene')],
        lines: [L(1, 'Jonah prayed from inside the fish, and God heard him.')],
      },
      {
        props: [P('whale', 0.8, 0.7, 0.24, { flip: true })],
        actors: [A(0, -0.65, 'thumbs-up', 'sticker-grateful'), A(1, 0.1, 'wave', 'happy')],
        lines: [L(0, 'God gives second chances!')],
      },
    ],
  },
  {
    id: 'brave-like-daniel',
    title: 'Brave like Daniel',
    blurb: 'A night in the lions’ den, and a God who keeps His people safe.',
    category: 'bcu',
    cast: 1,
    scene: 'dungeon',
    bcu: { story: "Daniel in the lions' den", ref: 'Daniel 6' },
    tags: ['daniel', 'lions', 'brave', 'prayer', 'bible'],
    panels: [
      {
        caption: 'Daniel kept praying to God, even when it was against the rules...',
        actors: [A(0, 0, 'sticker-pray', 'sticker-serene')],
      },
      {
        props: [P('lion', 0.24, 0.8, 0.22), P('lion', 0.78, 0.8, 0.2, { flip: true }), P('zzz', 0.3, 0.6, 0.1), P('zzz', 0.84, 0.6, 0.09)],
        actors: [A(0, 0.1, 'stand', 'worried')],
        lines: [L(0, 'Shh... the lions are napping!', { kind: 'whisper' })],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'sticker-wow')],
        lines: [L(0, "God shut the lions' mouths!")],
      },
      {
        props: [P('lion', 0.76, 0.78, 0.26, { flip: true })],
        actors: [A(0, -0.45, 'cheer', 'sticker-proud')],
        lines: [L(0, 'God is with me. I can be brave!')],
        effect: 'rays',
      },
    ],
  },
  {
    id: 'red-sea',
    title: 'Crossing the Red Sea',
    blurb: 'Walls of water, dry ground, and a God who makes a way.',
    category: 'bcu',
    cast: 2,
    scene: 'beach',
    bcu: { story: 'The Red Sea', ref: 'Exodus 14' },
    tags: ['moses', 'red sea', 'miracle', 'bible'],
    panels: [
      {
        caption: 'The sea opened up!',
        props: [P('water-wall', 0.06, 0.62, 0.8), P('water-wall', 0.94, 0.62, 0.8, { flip: true })],
        actors: [A(0, -0.4, 'stand', 'shocked'), A(1, 0.35, 'point', 'excited')],
        lines: [L(0, 'Walls of water?!'), L(1, 'Keep walking!')],
      },
      {
        shot: 'medium',
        props: [P('water-wall', 0.08, 0.6, 1), P('fish', 0.12, 0.42, 0.1)],
        actors: [A(0, 0.2, 'wave', 'laugh')],
        lines: [L(0, 'Hi, fishy!')],
        sfx: { text: 'Blub!', u: 0.24, v: 0.3, color: PAL.blue },
      },
      {
        props: [P('water-wall', 0.05, 0.62, 0.8), P('water-wall', 0.95, 0.62, 0.8, { flip: true })],
        actors: [run(1, -0.25, 'laugh', 0.45), run(0, 0.3, 'determined', 0.15)],
        lines: [L(0, 'Almost across!')],
      },
      {
        scene: 'sunset',
        actors: [A(0, -0.55, 'cheer', 'sticker-joy'), A(1, 0.3, 'sticker-praise', 'excited')],
        lines: [L(1, 'God made a way where there was no way!')],
        effect: 'sparkles',
      },
    ],
  },
  {
    id: 'loaves-and-fishes',
    title: 'Lunch for five thousand',
    blurb: 'Five loaves, two fish, one big miracle.',
    category: 'bcu',
    cast: 2,
    scene: 'meadow',
    bcu: { story: 'Feeding the five thousand', ref: 'John 6' },
    tags: ['jesus', 'miracle', 'sharing', 'bread', 'bible'],
    panels: [
      {
        caption: 'A hungry crowd... and one small lunch.',
        actors: [A(1, -0.5, 'sticker-hold', 'worried', { hold: { id: 'basket', size: 1.1 } }), A(0, 0.4, 'think', 'confused')],
        lines: [L(1, 'Just five loaves and two fish...')],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-hold', 'happy', { hold: { id: 'bread', size: 0.9 } })],
        lines: [L(0, "Let's give it to Jesus anyway!")],
      },
      {
        shot: 'medium',
        props: [P('basket', 0.2, 0.84, 0.2), P('basket', 0.5, 0.86, 0.2), P('basket', 0.8, 0.84, 0.2), P('bread', 0.36, 0.68, 0.08, { back: false }), P('fish', 0.66, 0.66, 0.09, { back: false })],
        actors: [A(0, -0.1, 'stand', 'sticker-wow')],
        lines: [L(0, "Wait... there's MORE?!")],
        effect: 'sparkles',
      },
      {
        actors: [A(0, -0.55, 'cheer', 'sticker-joy'), A(1, 0.3, 'thumbs-up', 'grin')],
        lines: [L(1, 'Twelve baskets of leftovers!')],
        props: [P('basket', 0.86, 0.84, 0.2)],
      },
    ],
  },
  {
    id: 'follow-the-star',
    title: 'Follow the star',
    blurb: 'A bright star, a long walk, and the best news ever.',
    category: 'bcu',
    cast: 2,
    scene: 'night',
    bcu: { story: 'The first Christmas', ref: 'Matthew 2' },
    tags: ['christmas', 'star', 'nativity', 'jesus', 'bible'],
    season: { from: '12-01', until: '01-06' },
    panels: [
      {
        props: [P('star-bethlehem', 0.8, 0.2, 0.22)],
        actors: [A(0, -0.55, 'sticker-point-l', 'sticker-wow'), A(1, 0.1, 'stand', 'surprised')],
        lines: [L(0, 'Look at that star!')],
      },
      {
        actors: [run(1, -0.3, 'excited', 0.4), run(0, 0.35, 'excited', 0.1)],
        lines: [L(1, "Let's follow it!")],
        props: [P('star-bethlehem', 0.9, 0.16, 0.16)],
      },
      {
        caption: '...all the way to a baby in a manger.',
        props: [P('manger', 0.62, 0.78, 0.3), P('star-bethlehem', 0.62, 0.16, 0.18)],
        actors: [A(0, -0.6, 'sticker-pray', 'sticker-serene')],
        lines: [L(0, 'Jesus is born!', { kind: 'whisper' })],
      },
      {
        actors: [A(0, -0.45, 'sticker-praise', 'sticker-joy'), A(1, 0.35, 'sticker-praise', 'excited')],
        lines: [L(0, 'Joy to the world!')],
        effect: 'stars',
      },
    ],
  },
  {
    id: 'easter-morning',
    title: 'Easter morning',
    blurb: 'An early walk, a rolled-away stone, and the happiest news.',
    category: 'bcu',
    cast: 2,
    scene: 'sunset',
    bcu: { story: 'The empty tomb', ref: 'Matthew 28' },
    tags: ['easter', 'risen', 'tomb', 'jesus', 'bible'],
    season: { from: '03-15', until: '04-30' },
    panels: [
      {
        caption: 'Early on Sunday morning...',
        props: [P('tomb', 0.74, 0.7, 0.44)],
        actors: [A(1, -0.6, 'sticker-point-l', 'surprised'), A(0, 0, 'stand', 'worried')],
        lines: [L(1, 'The stone is rolled away!')],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'sticker-wow')],
        lines: [L(0, 'The tomb is empty!')],
      },
      {
        props: [P('tomb', 0.7, 0.7, 0.44), P('lily', 0.12, 0.82, 0.18, { back: false })],
        actors: [A(0, -0.55, 'stand', 'sticker-starry')],
        lines: [off('He is not here. He has risen, just as He said!', [0.64, 0.74])],
        effect: 'rays',
      },
      {
        actors: [A(0, -0.5, 'sticker-praise', 'sticker-joy'), A(1, 0.35, 'cheer', 'excited')],
        lines: [L(0, 'He is risen!'), L(1, 'He is risen indeed!')],
        effect: 'sparkles',
      },
    ],
  },
  {
    id: 'up-a-tree',
    title: 'Up a tree with Zacchaeus',
    blurb: 'Too short to see? Jesus sees you anyway.',
    category: 'bcu',
    cast: 2,
    scene: 'forest',
    bcu: { story: 'Zacchaeus', ref: 'Luke 19' },
    tags: ['zacchaeus', 'tree', 'jesus', 'bible'],
    panels: [
      {
        actors: [A(1, -0.5, 'stand', 'pout'), A(0, 0.3, 'think', 'confused')],
        lines: [L(1, "There's such a big crowd! I can't see anything!")],
      },
      {
        caption: 'Zacchaeus was too short to see Jesus, so he climbed a tree.',
        props: [P('tree', 0.72, 0.52, 0.86)],
        actors: [A(0, -0.6, 'sticker-point-l', 'excited')],
        lines: [L(0, "Look! There's Zacchaeus!")],
      },
      {
        props: [P('tree', 0.84, 0.52, 0.86)],
        actors: [A(0, -0.55, 'stand', 'sticker-wow'), A(1, 0.1, 'stand', 'surprised')],
        lines: [off("Zacchaeus, come down! I'm going to your house today!", [0, 0.6])],
      },
      {
        actors: [A(0, -0.5, 'heart', 'sticker-grateful'), A(1, 0.35, 'thumbs-up', 'happy')],
        lines: [L(1, 'Jesus loves everyone!')],
        effect: 'hearts',
      },
    ],
  },
  {
    id: 'good-neighbour',
    title: 'Be a good neighbour',
    blurb: 'A scraped knee and the story of the Good Samaritan.',
    category: 'bcu',
    cast: 2,
    scene: 'city',
    bcu: { story: 'The Good Samaritan', ref: 'Luke 10' },
    tags: ['samaritan', 'kindness', 'help', 'bible'],
    panels: [
      {
        actors: [A(1, -0.45, 'sticker-cover-face', 'cry', { clip: 'hurt', t: 0.3 }), A(0, 0.4, 'stand', 'shocked')],
        sfx: { text: 'Oof!', u: 0.2, v: 0.5, color: PAL.red, burst: true },
      },
      {
        shot: 'medium',
        actors: [A(0, -0.3, 'sticker-hold', 'worried'), A(1, 0.45, 'stand', 'sad')],
        lines: [L(0, 'Are you OK? Let me help you up!')],
      },
      {
        shot: 'medium',
        actors: [A(1, -0.2, 'heart', 'sticker-grateful')],
        lines: [L(1, "Thanks! You're a real good Samaritan.")],
      },
      {
        caption: '"Love your neighbour as yourself." - Luke 10:27',
        actors: [A(0, -0.3, 'sticker-hug-l', 'happy'), A(1, 0.3, 'sticker-hug-r', 'happy')],
        effect: 'hearts',
      },
    ],
  },

  /* ---- Faith ------------------------------------------------------------------ */
  {
    id: 'joyful-noise',
    title: 'Make a joyful noise',
    blurb: 'Choir practice: loud, happy and a little off-key.',
    category: 'faith',
    cast: 2,
    scene: 'stage',
    tags: ['church', 'choir', 'singing', 'worship', 'psalm 100'],
    panels: [
      {
        caption: 'Sunday morning, choir practice...',
        actors: [A(1, -0.45, 'wave', 'happy'), A(0, 0.4, 'stand', 'worried')],
        lines: [L(1, 'Ready to sing?'), L(0, "I'm not a very good singer...")],
      },
      {
        shot: 'medium',
        props: [P('music', 0.8, 0.28, 0.16)],
        actors: [A(0, -0.2, 'sticker-praise', 'sticker-joy', { clip: 'talk', t: 0.3 })],
        lines: [L(0, 'Halle-LUUU-jah!', { kind: 'shout' })],
      },
      {
        shot: 'medium',
        actors: [A(1, 0, 'thumbs-up', 'sticker-joy')],
        lines: [L(1, 'The Bible says make a JOYFUL noise, not a perfect one!')],
      },
      {
        props: [P('music', 0.18, 0.32, 0.14), P('music', 0.84, 0.3, 0.13, { flip: true })],
        actors: [A(0, -0.45, 'sticker-praise', 'sticker-joy'), A(1, 0.4, 'sticker-praise', 'excited')],
        lines: [L(0, 'Then I am GREAT at this!')],
        effect: 'sparkles',
      },
    ],
  },
  {
    id: 'thankful-list',
    title: 'The thankful list',
    blurb: 'Counting blessings at bedtime.',
    category: 'faith',
    cast: 1,
    scene: 'night',
    tags: ['prayer', 'bedtime', 'thankful', 'gratitude'],
    panels: [
      {
        caption: 'Bedtime.',
        props: [P('moon', 0.8, 0.2, 0.16)],
        actors: [A(0, -0.2, 'sit', 'sleepy')],
        lines: [L(0, 'Before I sleep...')],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-pray', 'sticker-serene')],
        lines: [L(0, 'Thank You, God, for my family and my friends...')],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'sticker-grateful')],
        lines: [L(0, "...and for today's adventures!")],
        effect: 'sparkles',
      },
      {
        props: [P('moon', 0.82, 0.18, 0.16), P('zzz', 0.62, 0.5, 0.12)],
        actors: [A(0, -0.2, 'sit', 'sleepy', { clip: 'sleep', t: 1, creature: { clip: 'sleep', t: 1, expression: 'sleepy' } })],
        caption: 'Goodnight!',
        effect: 'stars',
      },
    ],
  },
  {
    id: 'helping-hands',
    title: 'Helping hands',
    blurb: 'The food drive needs helpers. Many hands make light work!',
    category: 'faith',
    cast: 2,
    scene: 'city',
    tags: ['serve', 'volunteer', 'helping', 'food drive', 'kindness'],
    panels: [
      {
        props: [P('crate', 0.82, 0.82, 0.18), P('crate', 0.9, 0.66, 0.14)],
        actors: [A(1, -0.5, 'sticker-point-l', 'excited'), A(0, 0.15, 'stand', 'happy')],
        lines: [L(1, 'The food drive needs helpers!'), L(0, "Count me in!")],
      },
      {
        actors: [A(0, -0.5, 'sticker-hold', 'determined', { hold: { id: 'crate', size: 1.1 } }), A(1, 0.4, 'sticker-hold', 'happy', { hold: { id: 'crate', size: 1.1 } })],
        lines: [L(1, 'Many hands make light work!')],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'sticker-awkward')],
        lines: [L(0, "Phew! That's a LOT of boxes.")],
      },
      {
        actors: [A(0, -0.3, 'sticker-high-five-l', 'excited'), A(1, 0.3, 'sticker-high-five-r', 'excited')],
        lines: [L(0, 'Serve one another in love!')],
        effect: 'sparkles',
      },
    ],
  },

  /* ---- Friends ------------------------------------------------------------------ */
  {
    id: 'rainy-day',
    title: 'Rainy day plans',
    blurb: 'The forecast says rain. The plan says puddles.',
    category: 'friends',
    cast: 2,
    scene: 'city',
    tags: ['rain', 'puddles', 'friends', 'weather'],
    panels: [
      {
        effect: 'rain',
        actors: [A(0, -0.4, 'stand', 'bored'), A(1, 0.4, 'stand', 'sad')],
        lines: [L(0, 'Rain again...')],
      },
      {
        shot: 'medium',
        effect: 'rain',
        props: [P('umbrella', 0.78, 0.44, 0.34, { back: false })],
        actors: [A(1, -0.2, 'point', 'mischief')],
        lines: [L(1, 'Want to go puddle jumping?')],
      },
      {
        effect: 'rain',
        actors: [A(0, -0.45, 'jump', 'laugh', { clip: 'jump', t: 0.45 }), A(1, 0.4, 'cheer', 'sticker-joy')],
        sfx: { text: 'Splash!', u: 0.5, v: 0.84, color: PAL.blue, burst: true },
      },
      {
        scene: 'sky',
        props: [P('rainbow', 0.5, 0.34, 0.46)],
        actors: [A(0, -0.4, 'thumbs-up', 'grin'), A(1, 0.4, 'peace', 'happy')],
        lines: [L(0, 'Totally worth it!')],
      },
    ],
  },
  {
    id: 'surprise-party',
    title: 'Surprise!',
    blurb: 'Shh! They are coming. Everybody hide!',
    category: 'friends',
    cast: 2,
    scene: 'stage',
    tags: ['birthday', 'party', 'surprise', 'friends'],
    panels: [
      {
        props: [P('balloons', 0.84, 0.4, 0.4)],
        actors: [A(1, -0.2, 'sticker-cover-face', 'mischief')],
        lines: [L(1, 'Shh! Here they come...', { kind: 'whisper' })],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'stand', 'confused')],
        lines: [L(0, 'Hello? Why is it so dark?')],
      },
      {
        props: [P('balloons', 0.12, 0.42, 0.36), P('party-popper', 0.86, 0.46, 0.18, { flip: true, back: false })],
        actors: [A(0, -0.5, 'stand', 'shocked'), A(1, 0.4, 'cheer', 'sticker-joy')],
        lines: [L(1, 'SURPRISE!', { kind: 'shout' })],
        effect: 'confetti',
      },
      {
        shot: 'medium',
        actors: [A(0, -0.3, 'sticker-hold', 'sticker-joy', { hold: { id: 'cake', size: 1.2 } }), A(1, 0.45, 'heart', 'happy')],
        lines: [L(0, 'Best friends EVER!')],
      },
    ],
  },
  {
    id: 'picnic',
    title: 'The great picnic',
    blurb: 'Sunshine, a basket of bread, and some very bold birds.',
    category: 'friends',
    cast: 2,
    scene: 'meadow',
    tags: ['picnic', 'birds', 'sharing', 'friends', 'summer'],
    panels: [
      {
        props: [P('sun', 0.84, 0.16, 0.18)],
        actors: [A(0, -0.45, 'sticker-hold', 'excited', { hold: { id: 'basket', size: 1.1 } }), A(1, 0.4, 'cheer', 'happy')],
        lines: [L(0, 'Picnic time!')],
      },
      {
        shot: 'medium',
        props: [P('dove', 0.78, 0.3, 0.16, { flip: true }), P('bread', 0.64, 0.4, 0.07)],
        actors: [A(0, -0.3, 'sticker-point-l', 'shocked')],
        lines: [L(0, 'Hey! That bird took my bread!')],
      },
      {
        shot: 'medium',
        actors: [A(1, 0, 'relaxed', 'laugh')],
        lines: [L(1, 'Sharing is caring?')],
      },
      {
        props: [P('dove', 0.7, 0.56, 0.12), P('dove', 0.86, 0.6, 0.1, { flip: true })],
        actors: [A(0, -0.4, 'shrug', 'smirk'), A(1, 0.3, 'sticker-hold', 'happy', { hold: { id: 'bread', size: 0.8 } })],
        lines: [L(0, 'OK, OK... you can have some.')],
      },
    ],
  },

  /* ---- Gaming ------------------------------------------------------------------- */
  {
    id: 'boss-battle',
    title: 'The final boss',
    blurb: 'Low health, high hopes, and a friend who has your back.',
    category: 'gaming',
    cast: 2,
    scene: 'space',
    tags: ['gaming', 'co-op', 'boss', 'teamwork'],
    panels: [
      {
        actors: [A(0, -0.45, 'sticker-hold', 'sticker-focus', { hold: { id: 'controller', size: 1 } }), A(1, 0.4, 'sticker-hold', 'determined', { hold: { id: 'controller', size: 1 } })],
        lines: [L(1, 'Final boss. Ready?'), L(0, 'Born ready!')],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'scared')],
        lines: [L(0, 'LOW HEALTH!', { kind: 'shout' })],
        sfx: { text: 'Boom!', u: 0.8, v: 0.8, color: PAL.orange, burst: true },
      },
      {
        shot: 'medium',
        actors: [A(1, 0, 'sticker-hold', 'grin', { hold: { id: 'controller', size: 1 } })],
        lines: [L(1, 'I got you! Healing!')],
        effect: 'sparkles',
      },
      {
        actors: [A(0, -0.55, 'sticker-lift', 'sticker-starry', { hold: { id: 'trophy', size: 1.2, dy: -0.6 } }), A(1, 0.5, 'cheer', 'excited')],
        lines: [L(0, 'VICTORY!', { kind: 'shout' })],
        effect: 'confetti',
      },
    ],
  },
  {
    id: 'patience-lag',
    title: 'Patience, young gamer',
    blurb: 'The game froze. The fruit of the Spirit did not.',
    category: 'gaming',
    cast: 1,
    scene: 'city',
    tags: ['gaming', 'patience', 'lag', 'fruit of the spirit'],
    panels: [
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-hold', 'sticker-focus', { hold: { id: 'controller', size: 1 } })],
        lines: [L(0, 'Come on... almost there...')],
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'shocked')],
        lines: [L(0, 'It FROZE?!')],
        sfx: { text: 'Lag!', u: 0.8, v: 0.78, color: PAL.purple, burst: true },
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-pray', 'sticker-serene')],
        lines: [L(0, 'Deep breath. Patience is a fruit of the Spirit...')],
      },
      {
        actors: [A(0, -0.2, 'cheer', 'sticker-proud')],
        lines: [L(0, "It's back! And I stayed calm!")],
        props: [P('level-up', 0.82, 0.3, 0.2)],
        effect: 'stars',
      },
    ],
  },

  /* ---- School and work ------------------------------------------------------------- */
  {
    id: 'test-day',
    title: 'Test day',
    blurb: 'Studied all week. Prayed this morning. Let’s go!',
    category: 'school',
    cast: 2,
    scene: 'city',
    tags: ['school', 'test', 'study', 'prayer'],
    panels: [
      {
        actors: [A(1, -0.45, 'stand', 'worried'), A(0, 0.4, 'thumbs-up', 'determined')],
        lines: [L(1, 'Big test today...'), L(0, 'We studied all week. We got this!')],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-pray', 'sticker-serene')],
        lines: [L(0, 'Lord, help me remember what I learned.')],
      },
      {
        shot: 'close',
        props: [P('pencil', 0.8, 0.8, 0.26, { back: false })],
        actors: [A(0, 0, 'think', 'sticker-focus')],
        lines: [L(0, 'Question one... I know this!')],
      },
      {
        actors: [A(0, -0.45, 'sticker-hold', 'sticker-proud', { hold: { id: 'grade', size: 1.2 } }), A(1, 0.4, 'cheer', 'excited')],
        lines: [L(1, 'Top marks!')],
        effect: 'sparkles',
      },
    ],
  },
  {
    id: 'science-fair',
    title: 'The science fair',
    blurb: 'One model volcano. Slightly more fizz than planned.',
    category: 'school',
    cast: 2,
    scene: 'volcano',
    tags: ['school', 'science', 'volcano', 'experiment'],
    panels: [
      {
        actors: [A(0, -0.4, 'point', 'sticker-proud'), A(1, 0.4, 'stand', 'surprised')],
        lines: [L(0, 'Behold: my volcano project!'), L(1, 'Does it work?')],
      },
      {
        shot: 'medium',
        props: [P('lightbulb', 0.8, 0.3, 0.2)],
        actors: [A(0, -0.1, 'think', 'mischief')],
        lines: [L(0, 'Just a LITTLE more fizz...')],
      },
      {
        actors: [A(0, -0.4, 'stand', 'shocked'), A(1, 0.45, 'sticker-cover-face', 'scared')],
        sfx: { text: 'Fwoosh!', u: 0.5, v: 0.34, color: PAL.orange, burst: true },
        effect: 'confetti',
      },
      {
        props: [P('medal', 0.18, 0.4, 0.18)],
        actors: [A(0, -0.1, 'cheer', 'sticker-joy'), A(1, 0.5, 'thumbs-up', 'laugh')],
        lines: [L(1, 'First prize... for "most exciting"!')],
      },
    ],
  },
  {
    id: 'morning-rush',
    title: 'The morning rush',
    blurb: 'Five more minutes turned into fifteen.',
    category: 'school',
    cast: 1,
    scene: 'city',
    tags: ['morning', 'late', 'school', 'work'],
    panels: [
      {
        props: [P('alarm', 0.8, 0.36, 0.16, { rot: 12 })],
        actors: [A(0, -0.2, 'relaxed', 'sticker-yawn')],
        lines: [L(0, 'Five more minutes...')],
        sfx: { text: 'Ring!', u: 0.8, v: 0.18, color: PAL.red },
      },
      {
        shot: 'close',
        actors: [A(0, 0, 'stand', 'shocked')],
        lines: [L(0, "I'm LATE!", { kind: 'shout' })],
      },
      {
        actors: [run(0, 0, 'worried', 0.2)],
        lines: [L(0, 'Keys... bag... Bible...')],
      },
      {
        props: [P('check', 0.82, 0.3, 0.16)],
        actors: [A(0, -0.2, 'thumbs-up', 'sticker-proud')],
        lines: [L(0, 'Made it! Right on time!')],
      },
    ],
  },

  /* ---- Seasons ----------------------------------------------------------------------- */
  {
    id: 'snow-day',
    title: 'Snow day!',
    blurb: 'School is cancelled and the snowman needs a nose.',
    category: 'seasons',
    cast: 2,
    scene: 'snow',
    tags: ['snow', 'winter', 'snowman', 'friends'],
    season: { from: '12-01', until: '02-28' },
    panels: [
      {
        effect: 'snow',
        actors: [A(0, -0.4, 'cheer', 'excited'), A(1, 0.4, 'cheer', 'sticker-joy')],
        lines: [L(0, 'SNOW DAY!', { kind: 'shout' })],
      },
      {
        props: [P('snowman', 0.76, 0.76, 0.34)],
        actors: [A(1, -0.4, 'sticker-point-l', 'happy')],
        lines: [L(1, 'He needs a nose!')],
      },
      {
        props: [P('snowman', 0.74, 0.76, 0.34)],
        actors: [A(0, -0.4, 'stand', 'shocked')],
        lines: [L(0, "Hey, that's my carrot snack!")],
        sfx: { text: 'Crunch!', u: 0.4, v: 0.3, color: PAL.orange },
      },
      {
        shot: 'medium',
        effect: 'snow',
        actors: [A(0, -0.4, 'sticker-hold', 'sticker-grateful', { hold: { id: 'coffee', size: 0.8 } }), A(1, 0.4, 'sticker-hold', 'happy', { hold: { id: 'coffee', size: 0.8 } })],
        lines: [L(1, 'Best. Day. Ever.')],
      },
    ],
  },
  {
    id: 'new-year',
    title: 'New year, new pages',
    blurb: 'Fireworks, resolutions, and a plan to keep them together.',
    category: 'seasons',
    cast: 2,
    scene: 'night',
    tags: ['new year', 'fireworks', 'resolution', 'bible'],
    season: { from: '12-26', until: '01-10' },
    panels: [
      {
        props: [P('fireworks', 0.5, 0.28, 0.44)],
        actors: [A(0, -0.4, 'cheer', 'excited'), A(1, 0.4, 'cheer', 'sticker-joy')],
        lines: [L(0, 'Happy New Year!')],
      },
      {
        shot: 'medium',
        actors: [A(1, 0, 'think', 'happy')],
        lines: [L(1, 'Any resolutions?')],
      },
      {
        shot: 'medium',
        actors: [A(0, 0, 'sticker-hold', 'determined', { hold: { id: 'bible', size: 1.1 } })],
        lines: [L(0, 'Read my Bible every day!')],
      },
      {
        props: [P('fireworks', 0.5, 0.24, 0.4)],
        actors: [A(0, -0.3, 'sticker-high-five-l', 'excited'), A(1, 0.3, 'sticker-high-five-r', 'excited')],
        lines: [L(1, "Let's do it together!")],
        effect: 'confetti',
      },
    ],
  },
]

export const comicScript = (id: string): ComicScript | undefined => COMIC_SCRIPTS.find((s) => s.id === id)
