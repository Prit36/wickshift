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

export type StarKind = 'flame' | 'time' | 'max' | 'nofire' | 'candles';

/** Something loose in the level: a book to shove, a ruler on a pivot, a cotton reel. */
export interface Prop {
  kind: 'book' | 'ruler' | 'reel';
  /** Centre. */
  x: number;
  y: number;
  /** Size (a reel uses w as its diameter). */
  w: number;
  h: number;
  angle?: number;
  /** Mass per square metre; books are heavy, rulers light. */
  density?: number;
  /** Pinned to the level at its centre, free to turn (a see-saw). */
  pivot?: boolean;
  /** Pinned to the level at this point instead, free to turn (a drawbridge). */
  hinge?: { x: number; y: number };
}

export interface LevelDef {
  id: string;
  num: number;
  /** 0-based world (page on the job board). */
  world: number;
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
  props?: Prop[];
  /** The part this job is about, shown on its ticket (default: the newest part in its kit). */
  feature?: PartKind;
  /** Flame at launch, when the wick starts low (default full). */
  startFlame?: number;
  /** Rows of thumbtacks: they pop balloons and tear lanterns that touch them. */
  tacks?: Zone[];
  /** Candle stubs standing on the desk (x, y of the base). Pass the lamp by one to top up its flame. */
  candles?: { x: number; y: number }[];
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
