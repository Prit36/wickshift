// The stamp album: 32 rules that hook into shared resources. Trick stamps change
// what a trick is worth as you drive (and shake on the HUD when they fire). Post
// stamps fire left to right in the tally, so their order in the album matters.

export type Rarity = 'common' | 'uncommon' | 'rare';

export type StampId =
  // trick builds
  | 'loop'
  | 'grease'
  | 'crumbs'
  | 'hoopla'
  | 'kite'
  | 'tailwind'
  | 'redLetter'
  | 'daredevil'
  | 'backhand'
  | 'sorter'
  // post shaping
  | 'wax'
  | 'bigEnvelope'
  | 'pigeonhole'
  | 'airmail'
  | 'expressSeal'
  | 'assorted'
  | 'purist'
  | 'doubleWick'
  | 'lastPost'
  | 'moonlighter'
  // scaling
  | 'collector'
  | 'bonfire'
  | 'nightOwl'
  // risk
  | 'hotPotato'
  | 'midnightOil'
  | 'postageDue'
  // safety
  | 'secondWind'
  | 'tempered'
  | 'lantern'
  // economy
  | 'pennyBlack'
  | 'purse'
  // rule bender
  | 'carbon';

/** When the stamp acts. Decides where it is shown firing. */
export type StampWhen = 'trick' | 'post' | 'rule' | 'money';

export interface StampDef {
  id: StampId;
  name: string;
  text: string;
  rarity: Rarity;
  when: StampWhen;
  /** Ink colour index for the printed stamp. */
  ink: number;
  /** Drawing motif key. */
  motif: string;
}

const S = (id: StampId, name: string, rarity: Rarity, when: StampWhen, ink: number, motif: string, text: string): StampDef => ({ id, name, text, rarity, when, ink, motif });

export const STAMPS: Record<StampId, StampDef> = {
  loop: S('loop', 'Loop Stamp', 'common', 'trick', 0, 'loop', 'Every flip you land adds +1 spark.'),
  grease: S('grease', 'Grease', 'common', 'trick', 1, 'drop', 'Grinds earn ×2 heat and add +1 spark.'),
  crumbs: S('crumbs', 'Crumbs', 'common', 'trick', 4, 'cube', 'Smashes earn ×2 heat, +1 spark per 5 cubes.'),
  hoopla: S('hoopla', 'Hoopla', 'common', 'trick', 4, 'ring', 'Hoops add +2 more sparks.'),
  kite: S('kite', 'Kite String', 'common', 'trick', 2, 'kite', 'Airtime earns ×2 heat. Huge Air adds +2 sparks.'),
  tailwind: S('tailwind', 'Tailwind', 'common', 'trick', 2, 'wind', 'Striker strips boost harder and add +2 sparks.'),
  redLetter: S('redLetter', 'Red Letter', 'common', 'trick', 0, 'envelope', 'Letters earn ×4 heat. Every 4th letter adds +1 spark.'),
  daredevil: S('daredevil', 'Daredevil', 'uncommon', 'trick', 0, 'skull', 'Close-call landings earn ×3 heat and +2 sparks.'),
  backhand: S('backhand', 'Backhand', 'uncommon', 'trick', 3, 'arrowBack', 'Backflips earn ×2 heat and +1 spark. A frontflip snuffs your sparks to 1.'),
  sorter: S('sorter', "Sorter's Eye", 'uncommon', 'trick', 1, 'eye', 'Repeating a trick never loses value.'),

  wax: S('wax', 'Wax Seal', 'common', 'post', 0, 'seal', '+3 sparks when you post.'),
  bigEnvelope: S('bigEnvelope', 'Big Envelope', 'common', 'post', 4, 'envelopeBig', '+250 heat when you post.'),
  pigeonhole: S('pigeonhole', 'Pigeonhole', 'common', 'post', 1, 'house', '+60 heat for each window you have lit this delivery.'),
  airmail: S('airmail', 'Air Mail', 'uncommon', 'post', 2, 'plane', '×2 sparks if you post while airborne.'),
  expressSeal: S('expressSeal', 'Express Seal', 'uncommon', 'post', 3, 'crown', '×1.5 sparks at high windows.'),
  assorted: S('assorted', 'Assorted', 'uncommon', 'post', 2, 'box', '×2 sparks if the flame holds 4+ kinds of trick.'),
  purist: S('purist', 'Purist', 'uncommon', 'post', 3, 'one', '×3 sparks if every trick in the flame is the same kind.'),
  doubleWick: S('doubleWick', 'Double Wick', 'rare', 'post', 4, 'wick', '×2 sparks if you have 10+ sparks by now.'),
  lastPost: S('lastPost', 'Last Post', 'rare', 'post', 0, 'flag', '×3 sparks at the sorting office.'),
  moonlighter: S('moonlighter', 'Moonlighter', 'uncommon', 'post', 3, 'moon', '+1 spark for every 4 pennies you hold.'),

  collector: S('collector', 'Collector', 'rare', 'post', 1, 'album', '+1 spark, growing by 1 every time you post 8+ sparks.'),
  bonfire: S('bonfire', 'Bonfire', 'rare', 'post', 0, 'fire', '×1 sparks, growing ×0.25 for every delivery you finish without breaking a glass.'),
  nightOwl: S('nightOwl', 'Night Owl', 'uncommon', 'rule', 2, 'owl', 'Every window you light this delivery makes new flames start with +1 spark.'),

  hotPotato: S('hotPotato', 'Hot Potato', 'uncommon', 'rule', 4, 'potato', 'Heat you carry grows 5% a second. Your lamp gets fragile twice as fast.'),
  midnightOil: S('midnightOil', 'Midnight Oil', 'rare', 'post', 3, 'oil', '×3 sparks. Your lamp is always as fragile as a roaring flame.'),
  postageDue: S('postageDue', 'Postage Due', 'uncommon', 'rule', 1, 'due', 'Driving past a window with a flame adds +2 sparks.'),

  secondWind: S('secondWind', 'Second Wind', 'common', 'rule', 2, 'wind2', 'Your first blowout each delivery doesn’t happen.'),
  tempered: S('tempered', 'Tempered Glass', 'uncommon', 'rule', 1, 'glass', 'A big flame never makes the lamp fragile. Sparks cap at 10.'),
  lantern: S('lantern', 'Paper Lantern', 'common', 'rule', 3, 'lantern', 'Crashes and blowouts keep half your heat and sparks.'),

  pennyBlack: S('pennyBlack', 'Penny Black', 'common', 'money', 0, 'penny', '+1 penny every time you post 6+ sparks.'),
  purse: S('purse', 'Ember Purse', 'common', 'money', 4, 'purse', '+1 penny for every window you post at.'),

  carbon: S('carbon', 'Carbon Copy', 'rare', 'rule', 1, 'copy', 'Copies the stamp to its right.'),
};

export const STAMP_IDS = Object.keys(STAMPS) as StampId[];
export const MAX_STAMPS = 5;
export const STAMP_PRICE: Record<Rarity, number> = { common: 4, uncommon: 6, rare: 8 };
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, uncommon: 30, rare: 8 };

export function stampPrice(id: StampId): number {
  return STAMP_PRICE[STAMPS[id].rarity];
}
export function sellPrice(id: StampId): number {
  return Math.max(1, Math.floor(stampPrice(id) / 2));
}

/** Run-long state for the stamps that grow. */
export interface StampState {
  collector: number;
  bonfire: number;
}

export function freshStampState(): StampState {
  return { collector: 1, bonfire: 0 };
}

/**
 * Effective copies of each stamp: the stamp itself plus any Carbon Copy sitting
 * immediately to its left. Returns which album slots act as each id, so the HUD
 * can shake the right ones when they fire.
 */
export function effectiveAlbum(album: readonly StampId[]): { id: StampId; slot: number }[] {
  const out: { id: StampId; slot: number }[] = [];
  album.forEach((id, i) => {
    if (id === 'carbon') {
      const right = album[i + 1];
      if (right && right !== 'carbon') out.push({ id: right, slot: i });
    } else out.push({ id, slot: i });
  });
  return out;
}
