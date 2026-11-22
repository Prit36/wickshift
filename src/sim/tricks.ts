// Trick families. Postcards level a family up: +50% heat per level, and +1 to any
// sparks the family grants. Levelling a family is how a run gets an identity.

export type Family = 'flip' | 'air' | 'wheelie' | 'landing' | 'grind' | 'smash' | 'hoop' | 'strike';

export const FAMILIES: Family[] = ['flip', 'air', 'wheelie', 'landing', 'grind', 'smash', 'hoop', 'strike'];

export interface FamilyInfo {
  name: string;
  /** The postcard that levels it. */
  postcard: string;
  /** What the postcard shows on its front. */
  scene: string;
  /** Palette key used for its popups and cards. */
  tone: 'pink' | 'teal' | 'mustard' | 'green' | 'blue' | 'red' | 'fireOrange' | 'fire';
}

export const FAMILY_INFO: Record<Family, FamilyInfo> = {
  flip: { name: 'Flips', postcard: 'Greetings from Loop Bay', scene: 'loop', tone: 'pink' },
  air: { name: 'Air', postcard: 'Wish You Were Up Here', scene: 'cloud', tone: 'teal' },
  wheelie: { name: 'Wheelies', postcard: 'Long Road Home', scene: 'road', tone: 'mustard' },
  landing: { name: 'Landings', postcard: 'Soft Landings Spa', scene: 'spa', tone: 'green' },
  grind: { name: 'Grinds', postcard: 'Pencil Pier', scene: 'pier', tone: 'blue' },
  smash: { name: 'Smashes', postcard: 'Sugar Cube City', scene: 'city', tone: 'red' },
  hoop: { name: 'Hoops', postcard: 'The Ring of Fire Circus', scene: 'ring', tone: 'fireOrange' },
  strike: { name: 'Strikes', postcard: 'Matchstick Mountains', scene: 'match', tone: 'fire' },
};

export type Levels = Record<Family, number>;

export function freshLevels(): Levels {
  return { flip: 1, air: 1, wheelie: 1, landing: 1, grind: 1, smash: 1, hoop: 1, strike: 1 };
}

export function levelHeat(lv: number): number {
  return 1 + 0.5 * (lv - 1);
}

/** Base heat for each trick (before levels, repeats and stamps). */
export const HEAT = {
  flip: (n: number) => Math.round(200 * Math.pow(n, 1.6)),
  airPerSec: 70,
  wheeliePerTick: 1.3,
  nosePerTick: 3,
  clean: 40,
  daredevil: 150,
  grindPerSec: 110,
  smashPerCube: 30,
  hoop: 200,
  strike: 80,
  letter: 30,
};
