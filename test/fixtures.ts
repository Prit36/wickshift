// Blueprints and input scripts shared by the replay, clock and save tests.
import { NIGHT_COUNTER } from '../src/data/routes';
import type { InputScript } from '../src/sim/replay';
import type { Blueprint } from '../src/workshop/blueprint';

/** Fork on the rear socket carrying the runner; the key wheel drives from the nose. */
export const SPRUNG_SHOE: Blueprint = {
  placements: [
    { id: 'fork-1', kind: 'fork', parent: 'chassis', socket: 0, rot: 0 },
    { id: 'runner-1', kind: 'runner', parent: 'fork-1', socket: 0, rot: 0 },
    { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 4, rot: 0 },
  ],
};
/** Full throttle with the lamp back for the drop, then forward on the runout so the shoe stops scrubbing. */
export const SHOE_RUN: InputScript = [
  [0, 1, 0],
  [1000, 1, 1],
];
/** Coast from tick 220, centre the lamp while coasting, drive again after the landing. */
export const COAST_OVER_LIP: InputScript = [
  [0, 1, 0],
  [220, 0, 1],
  [235, 0, 0],
  [400, 1, 0],
];
/** Key wheel at the tail, a spar out of the nose carrying the reel. */
export const LONG_RIG: Blueprint = {
  placements: [
    { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 0, rot: 0 },
    { id: 'spar-1', kind: 'spar', parent: 'chassis', socket: 4, rot: 0 },
    { id: 'reel-1', kind: 'reel', parent: 'spar-1', socket: 0, rot: 0 },
  ],
};
/** The route's starter: key wheel at the tail, the runner at the nose. */
export const COMPACT_RUNNER: Blueprint = NIGHT_COUNTER.starter;
