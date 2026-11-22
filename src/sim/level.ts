// What a level is made of. The levels themselves live in levels.ts.
import type { Area, Blueprint, Kit } from './blueprint';
import type { PartKind } from './parts';

export type Pt = [number, number];

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Wind extends Zone {
  /** Push on paper parts (lanterns) and a tenth of it on everything else, in newtons. */
  fx: number;
  fy: number;
}

export type StarKind = 'flame' | 'time' | 'max';

export interface LevelDef {
  id: string;
  num: number;
  name: string;
  /** Shown on the level slip: the question this level asks. */
  ask: string;
  area: Area;
  /** World position of pin (0,0), the bench's bottom-left pin. */
  origin: { x: number; y: number };
  /** Top surfaces, left to right; drawn filled down to the floor. */
  ground: Pt[][];
  /** Closed shapes: shelves, walls, ceilings. */
  blocks: Pt[][];
  /** Ink: touching it with the lamp puts the flame out. */
  ink?: Zone[];
  wind?: Wind[];
  window: Zone;
  letter: { x: number; y: number };
  kit: Kit;
  starter?: Blueprint;
  /** Third star: keep this much flame, beat this time, or use at most `value` of `part`. */
  star: { kind: StarKind; value: number; part?: PartKind; text: string };
  /** Below this the lamp is lost. */
  killY: number;
  /** Camera limits. */
  view: { x0: number; x1: number; y0: number; y1: number };
}
