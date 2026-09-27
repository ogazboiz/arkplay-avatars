/* The sticker templates: pose + face + props + caption + backdrop (+ an effect), in
 * categories, the way Bitmoji packs its stickers. Every template works for humanoids and
 * creatures (creatures can't do humanoid poses, so each actor may carry a creature
 * variant: usually a clip frame). Friendmoji templates have two actors.
 *
 * Content rules (ArkPlay is a Christian studio's platform): faith stickers are joyful and
 * sincere, never mocking; captions are fixed here (no user text), all caps, short. */

import type { EffectId } from '../export/effects.ts'
import type { BackdropKind } from './shapes.ts'
import type { ActorPose } from './stage.ts'
import { PAL } from './pen.ts'

export type StickerCategory = 'greetings' | 'reactions' | 'love' | 'celebrations' | 'faith' | 'gaming' | 'school' | 'weather' | 'friends'

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: 'greetings', label: 'Greetings' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'love', label: 'Love & friendship' },
  { id: 'celebrations', label: 'Celebrations' },
  { id: 'faith', label: 'Faith' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'school', label: 'School & work' },
  { id: 'weather', label: 'Weather & moods' },
  { id: 'friends', label: 'Friendmoji' },
]

/** A prop on a sticker: at an actor's anchor (sizes in head heights) or at canvas px. */
export interface PropSpec {
  id: string
  /** 'handR' | 'handL' | 'hands' (between both hands) | 'headTop' | 'face' | 'eyes' | 'chest' | 'feet', or canvas [x, y] (0..512). */
  at: string | [number, number]
  /** Offset: head heights for anchors, px for canvas positions. */
  dx?: number
  dy?: number
  /** Head heights for anchors, px for canvas positions. */
  size: number
  rot?: number
  flip?: boolean
  /** Behind the characters (default: in front). */
  back?: boolean
  /** Which actor the anchor belongs to (default 0). */
  actor?: number
  /** Turn with the head (hats, glasses). */
  follow?: boolean
  color?: string
  color2?: string
  /** Only for these kinds (e.g. sunglasses on humanoid faces). */
  kinds?: ('humanoid' | 'creature')[]
  /** Where a creature carries it instead (creatures have no hands). Default: in front of the chest. */
  creatureAt?: string | [number, number]
}

export interface ActorSpec extends ActorPose {
  /** The creature version of this actor (a clip frame, another face). */
  creature?: ActorPose
  /** Horizontal place in two-actor stickers, -1 (left) … 1 (right). */
  x?: number
  /** Face the other way (mirror). */
  flip?: boolean
  /** Framing: 'knees' (3/4, the default for one humanoid), the whole figure ('full', the
   *  default for friendmoji and creatures), 'bust' or 'head'. */
  frame?: 'full' | 'knees' | 'bust' | 'head'
  /** Extra room above the figure for an overhead prop, in head heights. */
  headroom?: number
}

export type CaptionStyle = 'plain' | 'banner' | 'pill' | 'bubble' | 'thought' | 'arc' | 'shout'

export interface CaptionSpec {
  text: string
  style: CaptionStyle
  at?: 'top' | 'bottom'
  /** Lettering colour (plain, arc, shout) or shape colour (banner, pill). */
  color: string
  /** Lettering colour on a banner or pill (default white). */
  ink?: string
}

export interface StickerTemplate {
  id: string
  label: string
  category: StickerCategory
  keywords: string[]
  actors: ActorSpec[]
  caption?: CaptionSpec
  backdrop?: { kind: BackdropKind; color: string; color2?: string }
  props?: PropSpec[]
  effect?: EffectId
  /** Seasonal window, 'MM-DD' (inclusive; may wrap the new year). */
  season?: { from: string; until: string }
}

const C = PAL
const held = (id: string, size = 1.1, extra: Partial<PropSpec> = {}): PropSpec => ({ id, at: 'hands', size, dy: 0.15, ...extra })

export const STICKER_TEMPLATES: StickerTemplate[] = [
  /* ---- Greetings ---------------------------------------------------------- */
  {
    id: 'hello',
    label: 'Hello!',
    category: 'greetings',
    keywords: ['hi', 'hey', 'wave', 'greeting'],
    actors: [{ pose: 'wave', expression: 'happy', creature: { clip: 'hop', t: 0.35, expression: 'happy' } }],
    caption: { text: 'Hello!', style: 'plain', color: C.sky },
    backdrop: { kind: 'circle', color: '#dff3ff' },
    props: [{ id: 'sparkles', at: [96, 190], size: 70, back: true }],
  },
  {
    id: 'good-morning',
    label: 'Good morning!',
    category: 'greetings',
    keywords: ['morning', 'sunrise', 'coffee', 'wake'],
    actors: [{ pose: 'sticker-hold', expression: 'happy', creature: { clip: 'idle', expression: 'happy' } }],
    caption: { text: 'Good morning!', style: 'banner', color: C.orange },
    backdrop: { kind: 'rays', color: '#ffe79a', color2: '#fff6cf' },
    props: [held('coffee', 0.95), { id: 'sun', at: [420, 170], size: 120, back: true }],
  },
  {
    id: 'good-night',
    label: 'Good night',
    category: 'greetings',
    keywords: ['night', 'sleep', 'bed', 'moon'],
    actors: [{ frame: 'full', pose: 'sit', expression: 'sleepy', creature: { clip: 'sleep', t: 0.8, expression: 'sleepy' } }],
    caption: { text: 'Good night', style: 'plain', color: C.lavender },
    backdrop: { kind: 'circle', color: '#2c3570', color2: '#4b58a6' },
    props: [
      { id: 'moon', at: [392, 170], size: 110, back: true },
      { id: 'stars', at: [128, 190], size: 90, back: true },
    ],
  },
  {
    id: 'whats-up',
    label: "What's up?",
    category: 'greetings',
    keywords: ['sup', 'hey', 'how are you'],
    actors: [{ pose: 'relaxed', expression: 'smirk', look: [0.3, -0.1], creature: { clip: 'idle', expression: 'smirk' } }],
    caption: { text: "What's up?", style: 'bubble', color: '#ffffff' },
  },
  {
    id: 'bye',
    label: 'Bye!',
    category: 'greetings',
    keywords: ['goodbye', 'see you', 'later', 'wave'],
    actors: [{ pose: 'wave', expression: 'grin', tilt: -4, creature: { clip: 'hop', t: 0.6, expression: 'grin' } }],
    caption: { text: 'See you!', style: 'pill', color: C.teal },
  },
  {
    id: 'welcome',
    label: 'Welcome!',
    category: 'greetings',
    keywords: ['welcome', 'come in', 'hello'],
    actors: [{ pose: 'sticker-praise', expression: 'excited', creature: { clip: 'jump', t: 0.4, expression: 'excited' } }],
    caption: { text: 'Welcome!', style: 'banner', color: C.purple },
    effect: 'confetti',
  },

  /* ---- Reactions ------------------------------------------------------------ */
  {
    id: 'lol',
    label: 'LOL',
    category: 'reactions',
    keywords: ['haha', 'funny', 'laugh', 'lol'],
    actors: [{ pose: 'relaxed', expression: 'sticker-joy', creature: { clip: 'laugh', t: 0.3, expression: 'sticker-joy' } }],
    caption: { text: 'LOL!', style: 'shout', color: C.yellow },
  },
  {
    id: 'wow',
    label: 'Wow!',
    category: 'reactions',
    keywords: ['wow', 'amazing', 'omg', 'surprised'],
    actors: [{ pose: 'stand', expression: 'sticker-wow', creature: { clip: 'surprise', t: 0.4, expression: 'sticker-wow' } }],
    caption: { text: 'Wow!', style: 'plain', color: C.gold },
    backdrop: { kind: 'burst', color: '#ffd84a', color2: '#fff3b0' },
    props: [{ id: 'exclaim', at: 'headTop', dx: 0.75, dy: -0.1, size: 0.7, rot: 12 }],
  },
  {
    id: 'yay',
    label: 'Yay!',
    category: 'reactions',
    keywords: ['yay', 'hooray', 'happy', 'celebrate'],
    actors: [{ pose: 'cheer', expression: 'excited', creature: { clip: 'jump', t: 0.45, expression: 'excited' } }],
    caption: { text: 'Yay!', style: 'plain', color: C.pink },
    effect: 'confetti',
  },
  {
    id: 'oops',
    label: 'Oops!',
    category: 'reactions',
    keywords: ['oops', 'sorry', 'my bad', 'embarrassed'],
    actors: [{ pose: 'sticker-cover-face', expression: 'sticker-awkward', creature: { clip: 'idle', expression: 'sticker-awkward' } }],
    caption: { text: 'Oops!', style: 'plain', color: C.orange },
    props: [{ id: 'sweat', at: 'headTop', dx: 0.62, dy: 0.25, size: 0.36 }],
  },
  {
    id: 'hmm',
    label: 'Hmm…',
    category: 'reactions',
    keywords: ['hmm', 'thinking', 'wonder', 'question'],
    actors: [{ pose: 'think', expression: 'confused', creature: { clip: 'idle', expression: 'confused' } }],
    caption: { text: 'Hmm...', style: 'thought', color: '#ffffff' },
    props: [{ id: 'question', at: 'headTop', dx: 0.7, dy: 0.1, size: 0.6, rot: 10 }],
  },
  {
    id: 'sounds-good',
    label: 'Sounds good!',
    category: 'reactions',
    keywords: ['ok', 'okay', 'yes', 'thumbs up', 'agree'],
    actors: [{ pose: 'thumbs-up', expression: 'grin', creature: { clip: 'nod', t: 0.2, expression: 'grin' } }],
    caption: { text: 'Sounds good!', style: 'pill', color: C.green },
  },
  {
    id: 'no-way',
    label: 'No way!',
    category: 'reactions',
    keywords: ['no way', 'shocked', 'what', 'omg'],
    actors: [{ pose: 'stand', expression: 'shocked', creature: { clip: 'surprise', t: 0.3, expression: 'shocked' } }],
    caption: { text: 'No way!', style: 'shout', color: '#ffe0e6' },
    backdrop: { kind: 'speed', color: '#ffcad4', color2: '#ffffff' },
  },
  {
    id: 'oh-no',
    label: 'Oh no…',
    category: 'reactions',
    keywords: ['oh no', 'facepalm', 'ugh', 'fail'],
    actors: [{ pose: 'sticker-oh-no', expression: 'worried', creature: { clip: 'shake-head', t: 0.3, expression: 'worried' } }],
    caption: { text: 'Oh no...', style: 'plain', color: C.lavender },
  },
  {
    id: 'sad',
    label: 'Sad day',
    category: 'reactions',
    keywords: ['sad', 'cry', 'down', 'tears'],
    actors: [{ pose: 'stand', expression: 'cry', headroom: 1.1, creature: { clip: 'cry', t: 0.4, expression: 'cry' } }],
    caption: { text: 'Sad day', style: 'plain', color: C.sky },
    props: [{ id: 'rain-cloud', at: 'headTop', dy: -0.62, size: 1.15 }],
  },
  {
    id: 'cool',
    label: 'Cool!',
    category: 'reactions',
    keywords: ['cool', 'awesome', 'nice', 'sunglasses'],
    actors: [{ pose: 'arms-crossed', expression: 'cool', creature: { clip: 'idle', expression: 'cool' } }],
    caption: { text: 'Cool!', style: 'plain', color: C.teal },
    props: [{ id: 'shades', at: 'eyes', size: 1.02, follow: true, kinds: ['humanoid'] }],
  },
  {
    id: 'nailed-it',
    label: 'Nailed it!',
    category: 'reactions',
    keywords: ['nailed it', 'success', 'win', 'proud'],
    actors: [{ pose: 'flex', expression: 'sticker-proud', creature: { clip: 'jump', t: 0.5, expression: 'sticker-proud' } }],
    caption: { text: 'Nailed it!', style: 'banner', color: C.green },
    props: [{ id: 'check', at: [420, 170], size: 86 }],
  },
  {
    id: 'who-knows',
    label: 'Who knows?',
    category: 'reactions',
    keywords: ['shrug', 'dunno', 'no idea', 'whatever'],
    actors: [{ pose: 'shrug', expression: 'smirk', creature: { clip: 'shake-head', t: 0.25, expression: 'smirk' } }],
    caption: { text: 'Who knows?', style: 'plain', color: C.purple },
    props: [{ id: 'question', at: 'headTop', dx: -0.8, dy: 0.1, size: 0.5, rot: -12 }, { id: 'question', at: 'headTop', dx: 0.8, dy: 0, size: 0.4, rot: 14 }],
  },
  {
    id: 'thank-you',
    label: 'Thank you!',
    category: 'reactions',
    keywords: ['thanks', 'thank you', 'grateful', 'appreciate'],
    actors: [{ pose: 'heart', expression: 'sticker-grateful', creature: { clip: 'love', t: 0.3, expression: 'sticker-grateful' } }],
    caption: { text: 'Thank you!', style: 'banner', color: C.pink },
    props: [{ id: 'hearts', at: [410, 200], size: 100, back: true }],
  },

  /* ---- Love & friendship ------------------------------------------------------ */
  {
    id: 'love-you',
    label: 'Love you!',
    category: 'love',
    keywords: ['love', 'heart', 'love you', 'xoxo'],
    actors: [{ pose: 'heart', expression: 'love', creature: { clip: 'love', t: 0.4, expression: 'love' } }],
    caption: { text: 'Love you!', style: 'plain', color: C.red },
    backdrop: { kind: 'heart', color: '#ffc2d4' },
    effect: 'hearts',
  },
  {
    id: 'miss-you',
    label: 'Miss you!',
    category: 'love',
    keywords: ['miss you', 'letter', 'far away', 'love'],
    actors: [{ pose: 'sticker-hold', expression: 'pout', intensity: 0.7, creature: { clip: 'idle', expression: 'pout' } }],
    caption: { text: 'Miss you!', style: 'pill', color: C.pink },
    props: [held('letter', 1.05)],
  },
  {
    id: 'sending-hugs',
    label: 'Sending hugs',
    category: 'love',
    keywords: ['hug', 'hugs', 'care', 'comfort'],
    actors: [{ pose: 'sticker-hug-l', expression: 'sticker-grateful', creature: { clip: 'love', t: 0.6, expression: 'sticker-grateful' } }],
    caption: { text: 'Sending hugs', style: 'banner', color: C.purple },
    effect: 'hearts',
  },
  {
    id: 'thinking-of-you',
    label: 'Thinking of you',
    category: 'love',
    keywords: ['thinking of you', 'care', 'friend'],
    actors: [{ pose: 'think', expression: 'sticker-grateful', creature: { clip: 'idle', expression: 'sticker-grateful' } }],
    caption: { text: 'Thinking of you', style: 'thought', color: '#ffffff' },
    props: [{ id: 'heart', at: 'headTop', dx: 0.75, dy: -0.1, size: 0.45, rot: 12 }],
  },
  {
    id: 'you-got-this',
    label: 'You got this!',
    category: 'love',
    keywords: ['encourage', 'you can do it', 'support', 'strong'],
    actors: [{ pose: 'flex', expression: 'determined', creature: { clip: 'jump', t: 0.35, expression: 'determined' } }],
    caption: { text: 'You got this!', style: 'banner', color: C.orange },
    backdrop: { kind: 'burst', color: '#ffd9a8', color2: '#fff3e0' },
  },

  /* ---- Celebrations and holidays ----------------------------------------------- */
  {
    id: 'happy-birthday',
    label: 'Happy birthday!',
    category: 'celebrations',
    keywords: ['birthday', 'cake', 'party', 'bday'],
    actors: [{ pose: 'sticker-hold', expression: 'excited', creature: { clip: 'idle', expression: 'excited' } }],
    caption: { text: 'Happy birthday!', style: 'banner', color: C.pink },
    props: [held('cake', 1.2), { id: 'balloons', at: [96, 250], size: 170, back: true }, { id: 'party-hat', at: 'headTop', dy: -0.1, size: 0.62, follow: true }],
    effect: 'confetti',
  },
  {
    id: 'congrats',
    label: 'Congrats!',
    category: 'celebrations',
    keywords: ['congrats', 'congratulations', 'well done', 'proud'],
    actors: [{ pose: 'cheer', expression: 'excited', creature: { clip: 'jump', t: 0.45, expression: 'excited' } }],
    caption: { text: 'Congrats!', style: 'banner', color: C.gold, ink: '#5a3c00' },
    props: [{ id: 'party-popper', at: [420, 300], size: 120, flip: true }],
    effect: 'confetti',
  },
  {
    id: 'party-time',
    label: 'Party time!',
    category: 'celebrations',
    keywords: ['party', 'dance', 'fun', 'weekend'],
    actors: [{ frame: 'full', pose: 'sticker-dance', expression: 'laugh', creature: { clip: 'dance', t: 0.3, expression: 'laugh' } }],
    caption: { text: 'Party time!', style: 'plain', color: C.purple },
    props: [{ id: 'balloons', at: [420, 250], size: 160, back: true }],
    effect: 'confetti',
  },
  {
    id: 'merry-christmas',
    label: 'Merry Christmas!',
    category: 'celebrations',
    keywords: ['christmas', 'xmas', 'gift', 'tree', 'holiday'],
    actors: [{ pose: 'sticker-hold', expression: 'happy', creature: { clip: 'idle', expression: 'happy' } }],
    caption: { text: 'Merry Christmas!', style: 'banner', color: C.red },
    props: [held('gift', 1.05), { id: 'christmas-tree', at: [96, 300], size: 190, back: true }],
    effect: 'snow',
    season: { from: '11-20', until: '12-31' },
  },
  {
    id: 'joy-to-the-world',
    label: 'Joy to the world',
    category: 'celebrations',
    keywords: ['christmas', 'nativity', 'star', 'jesus', 'joy'],
    actors: [{ pose: 'sticker-praise', expression: 'sticker-joy', creature: { clip: 'jump', t: 0.4, expression: 'sticker-joy' } }],
    caption: { text: 'Joy to the world!', style: 'banner', color: C.navy },
    backdrop: { kind: 'glory', color: '#ffe79a', color2: '#fff8dc' },
    props: [{ id: 'star-bethlehem', at: [420, 120], size: 110, back: true }],
    effect: 'stars',
    season: { from: '12-01', until: '01-06' },
  },
  {
    id: 'he-is-risen',
    label: 'He is risen!',
    category: 'celebrations',
    keywords: ['easter', 'risen', 'resurrection', 'jesus', 'alive'],
    actors: [{ pose: 'sticker-praise', expression: 'excited', creature: { clip: 'jump', t: 0.4, expression: 'excited' } }],
    caption: { text: 'He is risen!', style: 'banner', color: C.gold, ink: '#5a3c00' },
    backdrop: { kind: 'glory', color: '#fff0b8', color2: '#ffffff' },
    props: [
      { id: 'tomb', at: [410, 330], size: 150, back: true },
      { id: 'lily', at: [92, 400], size: 120 },
    ],
    effect: 'rays',
    season: { from: '03-15', until: '04-30' },
  },
  {
    id: 'happy-easter',
    label: 'Happy Easter!',
    category: 'celebrations',
    keywords: ['easter', 'spring', 'lily', 'egg'],
    actors: [{ pose: 'sticker-hold', expression: 'happy', creature: { clip: 'hop', t: 0.3, expression: 'happy' } }],
    caption: { text: 'Happy Easter!', style: 'pill', color: C.purple },
    backdrop: { kind: 'circle', color: '#d9f7e6' },
    props: [held('lily', 1.1), { id: 'egg', at: [96, 420], size: 70, rot: -12 }, { id: 'egg', at: [430, 425], size: 62, rot: 10, color: C.mint, color2: C.pink }],
    effect: 'petals',
    season: { from: '03-15', until: '04-30' },
  },
  {
    id: 'happy-new-year',
    label: 'Happy New Year!',
    category: 'celebrations',
    keywords: ['new year', 'fireworks', 'party', 'cheers'],
    actors: [{ pose: 'cheer', expression: 'excited', creature: { clip: 'jump', t: 0.45, expression: 'excited' } }],
    caption: { text: 'Happy New Year!', style: 'banner', color: C.navy },
    props: [{ id: 'fireworks', at: [256, 210], size: 360, back: true }],
    effect: 'confetti',
    season: { from: '12-26', until: '01-10' },
  },
  {
    id: 'give-thanks',
    label: 'Give thanks',
    category: 'celebrations',
    keywords: ['thanksgiving', 'grateful', 'harvest', 'thanks'],
    actors: [{ pose: 'sticker-pray', expression: 'sticker-grateful', creature: { clip: 'nod', t: 0.3, expression: 'sticker-grateful' } }],
    caption: { text: 'Give thanks!', style: 'banner', color: C.orange },
    backdrop: { kind: 'circle', color: '#ffe2bf' },
    props: [{ id: 'pumpkin', at: [96, 430], size: 88 }, { id: 'bread', at: [420, 440], size: 80 }],
    season: { from: '10-01', until: '11-30' },
  },

  /* ---- Faith --------------------------------------------------------------- */
  {
    id: 'blessed',
    label: 'Blessed',
    category: 'faith',
    keywords: ['blessed', 'grateful', 'god', 'thankful'],
    actors: [{ pose: 'heart', expression: 'sticker-grateful', creature: { clip: 'love', t: 0.3, expression: 'sticker-grateful' } }],
    caption: { text: 'Blessed', style: 'arc', color: C.gold },
    backdrop: { kind: 'glory', color: '#ffe9a8', color2: '#fffaf0' },
    effect: 'sparkles',
  },
  {
    id: 'praying-for-you',
    label: 'Praying for you',
    category: 'faith',
    keywords: ['pray', 'prayer', 'praying', 'care', 'support'],
    actors: [{ pose: 'sticker-pray', expression: 'sticker-serene', creature: { clip: 'idle', expression: 'sticker-serene' } }],
    caption: { text: 'Praying for you', style: 'banner', color: C.navy },
    backdrop: { kind: 'circle', color: '#dfe7ff', color2: '#ffffff' },
    props: [{ id: 'dove', at: [410, 150], size: 96, back: true }],
    effect: 'rays',
  },
  {
    id: 'amen',
    label: 'Amen!',
    category: 'faith',
    keywords: ['amen', 'prayer', 'agree', 'so be it'],
    actors: [{ pose: 'sticker-pray', expression: 'sticker-grateful', creature: { clip: 'nod', t: 0.3, expression: 'sticker-grateful' } }],
    caption: { text: 'Amen!', style: 'plain', color: C.gold },
    backdrop: { kind: 'badge', color: '#ffe9a8' },
    effect: 'sparkles',
  },
  {
    id: 'hallelujah',
    label: 'Hallelujah!',
    category: 'faith',
    keywords: ['hallelujah', 'praise', 'worship', 'joy'],
    actors: [{ pose: 'sticker-praise', expression: 'sticker-joy', creature: { clip: 'jump', t: 0.4, expression: 'sticker-joy' } }],
    caption: { text: 'Hallelujah!', style: 'plain', color: C.gold },
    backdrop: { kind: 'glory', color: '#fff0b8', color2: '#ffffff' },
    effect: 'rays',
  },
  {
    id: 'god-is-good',
    label: 'God is good!',
    category: 'faith',
    keywords: ['god is good', 'praise', 'thankful', 'faith'],
    actors: [{ pose: 'thumbs-up', expression: 'grin', creature: { clip: 'nod', t: 0.2, expression: 'grin' } }],
    caption: { text: 'God is good!', style: 'banner', color: C.gold, ink: '#5a3c00' },
    backdrop: { kind: 'rays', color: '#ffe38a', color2: '#fff6d6' },
  },
  {
    id: 'peace-be-with-you',
    label: 'Peace be with you',
    category: 'faith',
    keywords: ['peace', 'dove', 'calm', 'blessing'],
    actors: [{ pose: 'peace', expression: 'happy', creature: { clip: 'idle', expression: 'sticker-serene' } }],
    caption: { text: 'Peace be with you', style: 'plain', color: C.sky },
    backdrop: { kind: 'cloud', color: '#e6f4ff' },
    props: [{ id: 'dove', at: [400, 150], size: 110 }],
  },
  {
    id: 'bible-time',
    label: 'Bible time!',
    category: 'faith',
    keywords: ['bible', 'read', 'study', 'scripture', 'devotion'],
    actors: [{ pose: 'sticker-hold', expression: 'happy', creature: { clip: 'idle', expression: 'happy' } }],
    caption: { text: 'Bible time!', style: 'pill', color: '#8c2f39' },
    backdrop: { kind: 'rounded', color: '#fff1d6' },
    props: [held('bible', 1.2)],
    effect: 'sparkles',
  },
  {
    id: 'god-bless',
    label: 'God bless you!',
    category: 'faith',
    keywords: ['god bless', 'blessing', 'bless you'],
    actors: [{ pose: 'wave', expression: 'sticker-grateful', creature: { clip: 'hop', t: 0.35, expression: 'sticker-grateful' } }],
    caption: { text: 'God bless you!', style: 'banner', color: C.teal },
    backdrop: { kind: 'glory', color: '#dff6f2', color2: '#ffffff' },
    effect: 'sparkles',
  },
  {
    id: 'see-you-at-church',
    label: 'See you at church!',
    category: 'faith',
    keywords: ['church', 'sunday', 'worship', 'service'],
    actors: [{ pose: 'wave', expression: 'happy', creature: { clip: 'hop', t: 0.35, expression: 'happy' } }],
    caption: { text: 'See you at church!', style: 'pill', color: C.navy },
    props: [{ id: 'bible', at: 'handL', size: 0.9, dy: 0.1, creatureAt: [400, 400] }],
  },
  {
    id: 'promise-kept',
    label: 'Promises kept',
    category: 'faith',
    keywords: ['rainbow', 'promise', 'noah', 'hope', 'faithful'],
    actors: [{ pose: 'cheer', expression: 'sticker-starry', creature: { clip: 'jump', t: 0.45, expression: 'sticker-starry' } }],
    caption: { text: 'He keeps His promises!', style: 'banner', color: C.blue },
    props: [{ id: 'rainbow', at: [256, 250], size: 440, back: true }],
  },
  {
    id: 'shine',
    label: 'Let your light shine',
    category: 'faith',
    keywords: ['light', 'shine', 'candle', 'joy', 'matthew 5'],
    actors: [{ pose: 'sticker-hold', expression: 'sticker-serene', creature: { clip: 'idle', expression: 'sticker-serene' } }],
    caption: { text: 'Let your light shine!', style: 'plain', color: C.gold },
    backdrop: { kind: 'glory', color: '#2c3570', color2: '#ffe38a' },
    props: [held('candle', 1)],
    effect: 'glow',
  },

  /* ---- Gaming ------------------------------------------------------------------ */
  {
    id: 'gg',
    label: 'GG',
    category: 'gaming',
    keywords: ['gg', 'good game', 'well played', 'wp'],
    actors: [{ pose: 'thumbs-up', expression: 'grin', creature: { clip: 'nod', t: 0.2, expression: 'grin' } }],
    caption: { text: 'GG!', style: 'shout', color: '#d9ffe6' },
    props: [{ id: 'controller', at: [410, 330], size: 110, rot: -14 }],
  },
  {
    id: 'level-up',
    label: 'Level up!',
    category: 'gaming',
    keywords: ['level up', 'xp', 'upgrade', 'progress'],
    actors: [{ pose: 'cheer', expression: 'sticker-starry', creature: { clip: 'jump', t: 0.45, expression: 'sticker-starry' } }],
    caption: { text: 'Level up!', style: 'plain', color: C.green },
    backdrop: { kind: 'circle', color: '#d9ffe6' },
    props: [{ id: 'level-up', at: [420, 200], size: 110, back: true }],
    effect: 'stars',
  },
  {
    id: 'good-luck',
    label: 'Good luck!',
    category: 'gaming',
    keywords: ['good luck', 'gl', 'you can do it', 'hf'],
    actors: [{ pose: 'thumbs-up', expression: 'wink', creature: { clip: 'nod', t: 0.2, expression: 'wink' } }],
    caption: { text: 'Good luck!', style: 'pill', color: C.purple },
    props: [{ id: 'stars', at: [410, 190], size: 100 }],
  },
  {
    id: 'game-on',
    label: 'Game on!',
    category: 'gaming',
    keywords: ['game on', 'play', 'controller', 'ready'],
    actors: [{ pose: 'sticker-hold', expression: 'sticker-focus', creature: { clip: 'idle', expression: 'sticker-focus' } }],
    caption: { text: 'Game on!', style: 'plain', color: C.purple },
    backdrop: { kind: 'speed', color: '#d8ccff', color2: '#ffffff' },
    props: [held('controller', 1.2, { dy: 0.05 })],
  },
  {
    id: 'victory',
    label: 'Victory!',
    category: 'gaming',
    keywords: ['victory', 'win', 'winner', 'trophy', 'champion'],
    actors: [{ frame: 'full', headroom: 1.3, pose: 'sticker-lift', expression: 'excited', creature: { clip: 'jump', t: 0.45, expression: 'excited' } }],
    caption: { text: 'Victory!', style: 'banner', at: 'bottom', color: C.gold, ink: '#5a3c00' },
    backdrop: { kind: 'burst', color: '#ffd84a', color2: '#fff3b0' },
    props: [{ id: 'trophy', at: 'hands', size: 1.25, dy: -0.55, creatureAt: [410, 360] }],
    effect: 'confetti',
  },
  {
    id: 'lets-play',
    label: "Let's play!",
    category: 'gaming',
    keywords: ['play', 'lets play', 'invite', 'join'],
    actors: [{ pose: 'point', expression: 'excited', creature: { clip: 'hop', t: 0.4, expression: 'excited' } }],
    caption: { text: "Let's play!", style: 'bubble', color: '#ffffff' },
    props: [{ id: 'controller', at: [420, 380], size: 100, rot: 12 }],
  },
  {
    id: 'on-fire',
    label: 'On fire!',
    category: 'gaming',
    keywords: ['on fire', 'streak', 'hot', 'unstoppable'],
    actors: [{ pose: 'flex', expression: 'determined', creature: { clip: 'idle', expression: 'determined' } }],
    caption: { text: 'On fire!', style: 'shout', color: '#ffe3c2' },
    effect: 'fire',
  },
  {
    id: 'brb',
    label: 'BRB',
    category: 'gaming',
    keywords: ['brb', 'be right back', 'afk', 'pause'],
    actors: [{ pose: 'salute', expression: 'wink', creature: { clip: 'hop', t: 0.4, expression: 'wink' } }],
    caption: { text: 'BRB!', style: 'pill', color: C.navy },
    props: [{ id: 'coin', at: [420, 190], size: 70 }],
  },

  /* ---- School and work ------------------------------------------------------------ */
  {
    id: 'study-time',
    label: 'Study time',
    category: 'school',
    keywords: ['study', 'homework', 'books', 'school', 'exam'],
    actors: [{ pose: 'sticker-hold', expression: 'determined', creature: { clip: 'idle', expression: 'determined' } }],
    caption: { text: 'Study time', style: 'pill', color: C.blue },
    props: [held('books', 1.15), { id: 'pencil', at: [420, 190], size: 90 }],
  },
  {
    id: 'got-an-idea',
    label: "I've got an idea!",
    category: 'school',
    keywords: ['idea', 'lightbulb', 'eureka', 'smart'],
    actors: [{ pose: 'point', expression: 'excited', creature: { clip: 'jump', t: 0.4, expression: 'excited' } }],
    caption: { text: 'I got an idea!', style: 'plain', color: C.gold },
    props: [{ id: 'lightbulb', at: 'headTop', dx: 0.9, dy: -0.3, size: 0.85 }],
  },
  {
    id: 'a-plus',
    label: 'A+!',
    category: 'school',
    keywords: ['a+', 'grade', 'test', 'smart', 'school'],
    actors: [{ pose: 'sticker-hold', expression: 'sticker-proud', creature: { clip: 'idle', expression: 'sticker-proud' } }],
    caption: { text: 'Top marks!', style: 'banner', color: C.red },
    props: [held('grade', 1.25, { dy: -0.05 })],
    effect: 'sparkles',
  },
  {
    id: 'coffee-first',
    label: 'Coffee first',
    category: 'school',
    keywords: ['coffee', 'tired', 'morning', 'monday'],
    actors: [{ pose: 'sticker-hold', expression: 'sticker-yawn', creature: { clip: 'idle', expression: 'sticker-yawn' } }],
    caption: { text: 'Coffee first', style: 'plain', color: '#c98a4e' },
    props: [held('coffee', 0.95)],
  },
  {
    id: 'so-busy',
    label: 'So busy!',
    category: 'school',
    keywords: ['busy', 'work', 'laptop', 'deadline'],
    actors: [{ pose: 'sticker-hold', expression: 'worried', creature: { clip: 'idle', expression: 'worried' } }],
    caption: { text: 'So busy!', style: 'pill', color: C.orange },
    props: [held('laptop', 1.25), { id: 'sweat', at: 'headTop', dx: 0.62, dy: 0.25, size: 0.34 }],
  },
  {
    id: 'running-late',
    label: 'Running late!',
    category: 'school',
    keywords: ['late', 'hurry', 'running', 'on my way'],
    actors: [{ frame: 'full', pose: 'run', expression: 'worried', creature: { clip: 'run', t: 0.2, expression: 'worried' } }],
    caption: { text: 'On my way!', style: 'plain', color: C.red },
    backdrop: { kind: 'speed', color: '#ffe2bf', color2: '#ffffff' },
    props: [{ id: 'alarm', at: [420, 180], size: 90, rot: 12 }],
  },
  {
    id: 'done',
    label: 'Done!',
    category: 'school',
    keywords: ['done', 'finished', 'complete', 'check'],
    actors: [{ pose: 'thumbs-up', expression: 'sticker-proud', creature: { clip: 'nod', t: 0.2, expression: 'sticker-proud' } }],
    caption: { text: 'Done!', style: 'plain', color: C.green },
    props: [{ id: 'check', at: [410, 190], size: 96 }],
  },

  /* ---- Weather and moods --------------------------------------------------------- */
  {
    id: 'sunny-day',
    label: 'Sunny day!',
    category: 'weather',
    keywords: ['sunny', 'sun', 'summer', 'nice day'],
    actors: [{ pose: 'relaxed', expression: 'happy', creature: { clip: 'idle', expression: 'happy' } }],
    caption: { text: 'Sunny day!', style: 'plain', color: C.orange },
    backdrop: { kind: 'circle', color: '#fff0b8' },
    props: [{ id: 'sun', at: [410, 170], size: 140, back: true }],
  },
  {
    id: 'rainy-day',
    label: 'Rainy day',
    category: 'weather',
    keywords: ['rain', 'rainy', 'umbrella', 'wet'],
    actors: [{ pose: 'stand', expression: 'bored', headroom: 1.3, creature: { clip: 'idle', expression: 'bored' } }],
    caption: { text: 'Rainy day', style: 'plain', color: C.sky },
    props: [{ id: 'umbrella', at: 'headTop', dy: -0.55, size: 1.8 }],
    effect: 'rain',
  },
  {
    id: 'snow-day',
    label: 'Snow day!',
    category: 'weather',
    keywords: ['snow', 'winter', 'cold', 'snowman'],
    actors: [{ frame: 'full', pose: 'cheer', expression: 'excited', creature: { clip: 'jump', t: 0.45, expression: 'excited' } }],
    caption: { text: 'Snow day!', style: 'plain', color: C.sky },
    backdrop: { kind: 'circle', color: '#e6f4ff' },
    props: [{ id: 'snowman', at: [420, 400], size: 130 }],
    effect: 'snow',
  },
  {
    id: 'sleepy',
    label: 'Sleepy…',
    category: 'weather',
    keywords: ['sleepy', 'tired', 'yawn', 'zzz'],
    actors: [{ pose: 'relaxed', expression: 'sticker-yawn', creature: { clip: 'sleep', t: 1.2, expression: 'sticker-yawn' } }],
    caption: { text: 'Sleepy...', style: 'plain', color: C.lavender },
    props: [{ id: 'zzz', at: 'headTop', dx: 0.9, dy: -0.2, size: 0.8 }],
  },
  {
    id: 'so-hot',
    label: 'So hot!',
    category: 'weather',
    keywords: ['hot', 'heat', 'summer', 'sweat'],
    actors: [{ pose: 'stand', expression: 'sticker-awkward', creature: { clip: 'idle', expression: 'sticker-awkward' } }],
    caption: { text: 'So hot!', style: 'shout', color: '#ffe3c2' },
    props: [{ id: 'sun', at: [410, 180], size: 130, back: true, color: C.orange }, { id: 'sweat', at: 'headTop', dx: -0.62, dy: 0.25, size: 0.34 }],
  },
  {
    id: 'chillin',
    label: "Chillin'",
    category: 'weather',
    keywords: ['chill', 'relax', 'cool', 'vacation'],
    actors: [{ pose: 'relaxed', expression: 'cool', creature: { clip: 'idle', expression: 'cool' } }],
    caption: { text: "Chillin'", style: 'plain', color: C.teal },
    backdrop: { kind: 'halftone', color: '#c8f5ef', color2: '#2ec4b6' },
    props: [{ id: 'shades', at: 'eyes', size: 1.02, follow: true, kinds: ['humanoid'] }],
  },
  {
    id: 'keep-smiling',
    label: 'Keep smiling!',
    category: 'weather',
    keywords: ['smile', 'happy', 'cheer up', 'sunshine'],
    actors: [{ pose: 'peace', expression: 'grin', creature: { clip: 'idle', expression: 'grin' } }],
    caption: { text: 'Keep smiling!', style: 'pill', color: C.pink },
    props: [{ id: 'flower', at: [100, 400], size: 100 }, { id: 'sun', at: [420, 170], size: 110, back: true }],
  },

  /* ---- Friendmoji (two avatars) ---------------------------------------------------- */
  {
    id: 'high-five',
    label: 'High five!',
    category: 'friends',
    keywords: ['high five', 'team', 'friends', 'yes'],
    actors: [
      { pose: 'sticker-high-five-l', expression: 'excited', x: -1, creature: { clip: 'jump', t: 0.4, expression: 'excited' } },
      { pose: 'sticker-high-five-r', expression: 'excited', x: 1, creature: { clip: 'jump', t: 0.45, expression: 'excited' } },
    ],
    caption: { text: 'High five!', style: 'plain', color: C.orange },
    props: [{ id: 'sparkles', at: [256, 150], size: 110 }],
  },
  {
    id: 'hug',
    label: 'Hugs!',
    category: 'friends',
    keywords: ['hug', 'hugs', 'friends', 'love', 'besties'],
    actors: [
      { pose: 'sticker-hug-l', expression: 'sticker-grateful', x: -0.55, creature: { clip: 'love', t: 0.3, expression: 'sticker-grateful' } },
      { pose: 'sticker-hug-r', expression: 'sticker-grateful', x: 0.55, creature: { clip: 'love', t: 0.5, expression: 'sticker-grateful' } },
    ],
    caption: { text: 'Hugs!', style: 'plain', color: C.pink },
    backdrop: { kind: 'heart', color: '#ffd6e2' },
    effect: 'hearts',
  },
  {
    id: 'selfie',
    label: 'Selfie!',
    category: 'friends',
    keywords: ['selfie', 'photo', 'friends', 'smile'],
    actors: [
      { pose: 'sticker-selfie', expression: 'grin', x: -0.85, creature: { clip: 'idle', expression: 'grin' } },
      { pose: 'peace', expression: 'tongue', x: 0.85, tilt: -6, creature: { clip: 'idle', expression: 'tongue' } },
    ],
    caption: { text: 'Selfie!', style: 'pill', color: C.purple },
    props: [{ id: 'phone', at: 'handR', actor: 0, size: 0.75, rot: -18, creatureAt: [110, 190] }],
    effect: 'sparkles',
  },
  {
    id: 'race',
    label: 'Race you!',
    category: 'friends',
    keywords: ['race', 'run', 'fast', 'compete', 'challenge'],
    actors: [
      { clip: 'run', t: 0.15, view: 'side', expression: 'determined', x: 0.55, creature: { clip: 'run', t: 0.15, view: 'side', expression: 'determined' } },
      { clip: 'run', t: 0.45, view: 'side', expression: 'laugh', x: -0.6, creature: { clip: 'run', t: 0.45, view: 'side', expression: 'laugh' } },
    ],
    caption: { text: 'Race you!', style: 'plain', color: C.red },
    backdrop: { kind: 'speed', color: '#ffe2bf', color2: '#ffffff' },
    props: [{ id: 'flag', at: [455, 300], size: 120 }],
  },
  {
    id: 'besties',
    label: 'Besties!',
    category: 'friends',
    keywords: ['besties', 'bff', 'best friends', 'friends'],
    actors: [
      { pose: 'peace', expression: 'wink', x: -0.8, creature: { clip: 'idle', expression: 'wink' } },
      { pose: 'peace', expression: 'happy', x: 0.8, creature: { clip: 'idle', expression: 'happy' } },
    ],
    caption: { text: 'Besties!', style: 'banner', color: C.pink },
    props: [{ id: 'hearts', at: [256, 150], size: 100 }],
  },
  {
    id: 'we-did-it',
    label: 'We did it!',
    category: 'friends',
    keywords: ['we did it', 'team', 'win', 'celebrate'],
    actors: [
      { pose: 'cheer', expression: 'excited', x: -0.85, creature: { clip: 'jump', t: 0.4, expression: 'excited' } },
      { pose: 'cheer', expression: 'laugh', x: 0.85, creature: { clip: 'jump', t: 0.5, expression: 'laugh' } },
    ],
    caption: { text: 'We did it!', style: 'banner', color: C.gold, ink: '#5a3c00' },
    effect: 'confetti',
  },
  {
    id: 'praying-together',
    label: 'Praying together',
    category: 'friends',
    keywords: ['pray', 'together', 'friends', 'faith', 'church'],
    actors: [
      { pose: 'sticker-pray', expression: 'sticker-serene', x: -0.8, creature: { clip: 'idle', expression: 'sticker-serene' } },
      { pose: 'sticker-pray', expression: 'sticker-serene', x: 0.8, creature: { clip: 'idle', expression: 'sticker-serene' } },
    ],
    caption: { text: 'Better together', style: 'banner', color: C.navy },
    backdrop: { kind: 'glory', color: '#ffe9a8', color2: '#fffaf0' },
    effect: 'rays',
  },
  {
    id: 'player-two',
    label: 'Player 2 ready?',
    category: 'friends',
    keywords: ['player 2', 'co-op', 'gaming', 'play together'],
    actors: [
      { pose: 'sticker-hold', expression: 'sticker-focus', x: -0.85, creature: { clip: 'idle', expression: 'sticker-focus' } },
      { pose: 'sticker-hold', expression: 'grin', x: 0.85, creature: { clip: 'idle', expression: 'grin' } },
    ],
    caption: { text: 'Player 2 ready?', style: 'plain', color: C.purple },
    backdrop: { kind: 'speed', color: '#d8ccff', color2: '#ffffff' },
    props: [
      { id: 'controller', at: 'hands', actor: 0, size: 1.1, dy: 0.1, creatureAt: [150, 420] },
      { id: 'controller', at: 'hands', actor: 1, size: 1.1, dy: 0.1, color: C.teal, creatureAt: [370, 420] },
    ],
  },
]

export const stickerTemplate = (id: string): StickerTemplate | undefined => STICKER_TEMPLATES.find((t) => t.id === id)
