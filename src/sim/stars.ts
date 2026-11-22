// The three stars of a job: delivered, the letter, and the level's own challenge.
import type { LevelDef } from './level';
import type { Run } from './run';
import { used, type Blueprint } from './blueprint';

export type Stars = [boolean, boolean, boolean];

export function starsFor(L: LevelDef, r: Run, bp: Blueprint): Stars {
  const ok = r.outcome === 'delivered';
  if (!ok) return [false, false, false];
  const s = L.star;
  let third = false;
  if (s.kind === 'flame') third = r.flame >= s.value - 1e-9;
  else if (s.kind === 'time') third = r.time <= s.value;
  else if (s.kind === 'max' && s.part) third = used(bp)[s.part] <= s.value;
  return [true, r.letterGot, third];
}

export const starCount = (s: Stars | undefined): number => (s ? s.filter(Boolean).length : 0);
