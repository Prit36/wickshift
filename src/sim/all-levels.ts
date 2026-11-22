// Every job in play order: the Desk, the Bookshelf, the Mantelpiece.
import { LEVELS as DESK } from './levels';
import { SHELF } from './levels-shelf';
import { MANTEL } from './levels-mantel';
import type { LevelDef } from './level';

export const ALL: LevelDef[] = [...DESK, ...SHELF, ...MANTEL];

export const WORLDS = [
  { name: 'The Desk', blurb: 'Rulers, ink and dominoes' },
  { name: 'The Bookshelf', blurb: 'Drops, swings, balloons, candles' },
  { name: 'The Mantelpiece', blurb: 'Chimney draughts and the old clock' },
];

/** Deliveries in the world before that open the next one. */
export const WORLD_KEY = 3;

export const levelsIn = (w: number): LevelDef[] => ALL.filter((l) => l.world === w);

/** A world opens once enough jobs in the one before are delivered. */
export function worldOpen(w: number, done: (id: string) => boolean): boolean {
  return w === 0 || levelsIn(w - 1).filter((l) => done(l.id)).length >= WORLD_KEY;
}

/** A job opens with its world if it's the first there, or either of the two before it is delivered: one stuck job never walls off the rest. */
export function jobOpen(L: LevelDef, done: (id: string) => boolean): boolean {
  const ls = levelsIn(L.world);
  const i = ls.indexOf(L);
  return worldOpen(L.world, done) && (i <= 0 || done(ls[i - 1].id) || (i > 1 && done(ls[i - 2].id)));
}
