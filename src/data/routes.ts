// Route definitions: authored terrain pieces shared by the collider, the
// drawing and the slip's side profile.
import type { Pt } from './parts';
import type { RouteDef, TerrainPiece, Material } from './routeTypes';
import type { Blueprint } from '../workshop/blueprint';

const DESK_Y = -1.6;
const DESK_BASE = -4.5;

/** Closed outline from a left-to-right top profile down to a base line. */
function slab(id: string, name: string, material: Material, top: Pt[], base = DESK_BASE, extra: Partial<TerrainPiece> = {}): TerrainPiece {
  const first = top[0]!;
  const last = top[top.length - 1]!;
  const pts: Pt[] = [[first[0], base], [last[0], base], ...[...top].reverse()];
  return { id, name, material, pts, ...extra };
}

function box(id: string, name: string, material: Material, x0: number, y0: number, x1: number, y1: number, extra: Partial<TerrainPiece> = {}): TerrainPiece {
  return {
    id,
    name,
    material,
    pts: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    ...extra,
  };
}

const keyAndReel = (keySocket: number, reelSocket: number): Blueprint => ({
  placements: [
    { id: 'reel-1', kind: 'reel', parent: 'chassis', socket: reelSocket, rot: 0 },
    ...(keySocket >= 0 ? [{ id: 'keyWheel-1', kind: 'keyWheel' as const, parent: 'chassis', socket: keySocket, rot: 0 }] : []),
  ],
});

export const ENVELOPE_LIP: RouteDef = {
  id: 'envelope-lip',
  index: 0,
  name: 'Envelope Lip',
  note: 'Shallow descent, one folded seam, long runout.',
  mark: { id: 'wind', name: 'Wind in hand', condition: 'Arrive with a quarter of the spring left' },
  kit: { keyWheel: 1, reel: 1, spar: 0, fork: 0, runner: 0 },
  // Half-built: the free reel is fitted at the nose; the key wheel waits in the drawer.
  starter: keyAndReel(-1, 4),
  start: { x: 0, groundY: 0 },
  lampStart: 0,
  // Full throttle arrives near 19%; letting it roll down the slope or along the flat keeps a quarter.
  windTicks: 860,
  pieces: [
    slab('desk', 'desk', 'desk', [
      [-14, DESK_Y],
      [60, DESK_Y],
    ], -6),
    slab('bench', 'bench block', 'book', [
      [-9, 0],
      [3.2, 0],
    ], DESK_Y),
    slab('descent', 'letter slope', 'paper', [
      [3.2, 0],
      [5.5, -0.12],
      [9, -0.55],
      [12.5, -0.95],
      [14.5, -1.0],
    ], DESK_Y),
    // The envelope lies flat; its folded seam is the one curb on this route.
    slab('env-a', 'envelope', 'envelope', [
      [14.4, -1.005],
      [23.9, -1.0],
      [24.02, -0.9],
      [24.16, -0.86],
      [24.4, -0.85],
      [30.5, -0.85],
      [33.5, -0.9],
      [52, -0.9],
    ], DESK_Y, { name: 'envelope seam' }),
    box('wall', 'parcel stack', 'card', 50.2, -0.9, 52, 1.5),
  ],
  arch: { x: 48.7, y: -0.1, w: 1.4, h: 1.6 },
  killY: -5,
  drawers: [],
  bounds: { x0: -8, x1: 53, y0: -3.5, y1: 4.5 },
  peek: [24.2, -1.0],
};

// Ruler Rise: a brass ruler leans on an ink tin. Rear-heavy short carts lift their nose.
const RULER_FOOT = 7.0;
const TIN_X0 = 11.8;
const TIN_TOP = 2.3;
export const RULER_RISE: RouteDef = {
  id: 'ruler-rise',
  index: 1,
  name: 'Ruler Rise',
  note: 'Steep brass climb onto an ink tin.',
  mark: { id: 'short', name: 'Short order', condition: 'Deliver without fitting a ruler spar' },
  kit: { keyWheel: 1, reel: 1, spar: 2, fork: 0, runner: 0 },
  starter: keyAndReel(1, 4),
  start: { x: 0, groundY: 0 },
  lampStart: -0.72,
  pieces: [
    slab('desk', 'desk', 'desk', [
      [-14, DESK_Y],
      [60, DESK_Y],
    ], -6),
    slab('bench', 'bench block', 'book', [
      [-9, 0],
      [3.4, 0],
      [4.2, -0.06],
      [RULER_FOOT + 0.4, -0.06],
    ], DESK_Y),
    // A folded card wedge eases the cart onto the ruler's foot.
    {
      id: 'wedge',
      name: 'card wedge',
      material: 'card',
      pts: [
        [RULER_FOOT - 1.6, -0.06],
        [RULER_FOOT + 0.6, -0.06],
        [RULER_FOOT + 0.6, 0.3],
      ],
    },
    // The ruler: a thin brass plank from the bench edge up to the tin rim.
    {
      id: 'ruler',
      name: 'ruler',
      material: 'brass',
      pts: [
        [RULER_FOOT, -0.06],
        [TIN_X0 + 0.25, TIN_TOP],
        [TIN_X0 + 0.25, TIN_TOP + 0.08],
        [RULER_FOOT - 0.25, -0.02],
      ],
    },
    slab('tin', 'ink tin', 'tin', [
      [TIN_X0, TIN_TOP],
      [TIN_X0 + 0.1, TIN_TOP + 0.09],
      [TIN_X0 + 3.4, TIN_TOP + 0.09],
      [TIN_X0 + 3.5, TIN_TOP],
    ], DESK_Y),
    slab('stack', 'letter stack', 'paper', [
      [TIN_X0 + 3.5, TIN_TOP - 0.05],
      [TIN_X0 + 6.5, 0.9],
      [TIN_X0 + 10.5, 0.15],
      [TIN_X0 + 12.5, -0.1],
      [46, -0.1],
    ], DESK_Y),
    box('wall', 'parcel stack', 'card', 44.2, -0.1, 46.4, 2.3),
  ],
  // The window opens 3.3 m before the stack: the longest legal nose reaches 3.0 m ahead of the lamp.
  arch: { x: 41.6, y: 0.7, w: 1.4, h: 1.6 },
  killY: -5,
  drawers: [],
  bounds: { x0: -8, x1: 47, y0: -3.5, y1: 5.5 },
  peek: [10.5, 1.0],
};

// Blotter Drop: the top sheet of a paper stack curls over its edge into a short
// drop; a long blotter takes the landing. A lamp riding at the back meets the
// rear support's landing, so a rigid rear wheel cracks the glass.
const LIP_X = 13;
const SHEET_Y = 0;
const DROP = 0.6;
const KICK = 0.12;

/** Curled sheet edge: a small rise, a rounded roll-over and a concave run-in to the blotter. */
function curledEdge(): { sheet: Pt[]; foot: Pt } {
  const rc = 0.5;
  const ang = (85 * Math.PI) / 180;
  const pts: Pt[] = [
    [LIP_X - 1.3, SHEET_Y],
    [LIP_X - 0.7, SHEET_Y + KICK * 0.25],
    [LIP_X - 0.3, SHEET_Y + KICK * 0.75],
  ];
  const top = SHEET_Y + KICK;
  for (let i = 0; i <= 6; i++) {
    const phi = (ang * i) / 6;
    pts.push([LIP_X + rc * Math.sin(phi), top - rc + rc * Math.cos(phi)]);
  }
  const E = pts[pts.length - 1]!;
  const footY = SHEET_Y - DROP;
  const cx = E[0] + (E[1] - footY) / Math.tan(ang);
  const F: Pt = [cx + 1.2, footY - 0.02];
  const B0: Pt = [E[0] + (cx - E[0]) * 0.55, E[1] + (footY - E[1]) * 0.55];
  pts.push(B0);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    pts.push([(1 - t) ** 2 * B0[0] + 2 * (1 - t) * t * cx + t * t * F[0], (1 - t) ** 2 * B0[1] + 2 * (1 - t) * t * footY + t * t * F[1]]);
  }
  return { sheet: pts, foot: F };
}

const EDGE = curledEdge();
const FOOT = EDGE.foot;
const LAND_LEN = 8;
const LAND_FALL = 0.4;
const RUNOUT_Y = FOOT[1] - LAND_FALL;
const landing: Pt[] = [];
for (let i = 0; i <= 8; i++) {
  const u = i / 8;
  landing.push([FOOT[0] + u * LAND_LEN, FOOT[1] - LAND_FALL * (1 - (1 - u) ** 2)]);
}
const BLOTTER_END = 34;

export const BLOTTER_DROP: RouteDef = {
  id: 'blotter-drop',
  index: 2,
  name: 'Blotter Drop',
  note: 'A curled sheet, a short drop, a long blotter landing.',
  mark: { id: 'clear', name: 'Clear glass', condition: 'Arrive without a crack' },
  kit: { keyWheel: 1, reel: 1, spar: 2, fork: 1, runner: 1 },
  starter: keyAndReel(0, 4),
  start: { x: 0, groundY: 0 },
  // The lamp rides at the back: the rear support takes the landing under it.
  lampStart: -0.72,
  // A shoe scrubs on the long runout; the spring covers it once the lamp moves forward.
  windTicks: 1080,
  pieces: [
    slab('desk', 'desk', 'desk', [
      [-14, DESK_Y],
      [60, DESK_Y],
    ], -6),
    slab('bench', 'bench block', 'book', [
      [-9, 0],
      [3.2, 0],
    ], DESK_Y),
    // The paper stack: flat top sheet, then the curl over the edge.
    slab('sheet', 'curled sheet', 'paper', [[3.2, 0], ...EDGE.sheet], DESK_Y),
    slab('blotter', 'blotter', 'blotter', [...landing, [BLOTTER_END, RUNOUT_Y]], DESK_Y),
    box('wall', 'parcel stack', 'card', BLOTTER_END - 2.2, RUNOUT_Y, BLOTTER_END + 0.2, RUNOUT_Y + 2.4),
  ],
  arch: { x: BLOTTER_END - 4.8, y: RUNOUT_Y + 0.8, w: 1.4, h: 1.6 },
  killY: -5,
  drawers: [],
  bounds: { x0: -8, x1: BLOTTER_END + 1, y0: -3.5, y1: 4.5 },
  landing: { fromX: LIP_X - 5, toX: LIP_X + 4, focus: [LIP_X + 1.6, SHEET_Y - DROP] },
  peek: [LIP_X + 0.6, SHEET_Y - 0.3],
};

// The Night Counter: a brass ruler balanced on a pencil. Its near end rests on
// the bench; its far end lifts to the lip of the high counter, where an ink
// roller spins in a bracket. A front reel mounts that lip before the ruler goes,
// and the cart rides the counter and down the curled flap. A runner's toe cannot
// mount it: the cart parks on the far arm, its weight passes the pencil, and the
// ruler lowers it onto the shelf beneath the counter, out under the flap.
const NC_NEAR_TIP = 4.5; // the ruler's near end on the bench
const NC_NEAR = 5.0; // pivot to near end
const NC_FAR = 3.4; // pivot to far end
const NC_PY = 0.8; // top of the pencil
const NC_A0 = Math.asin(NC_PY / NC_NEAR);
const NC_PX = NC_NEAR_TIP + NC_NEAR * Math.cos(NC_A0);
const NC_LIP = NC_PX + NC_FAR * Math.cos(NC_A0) + 0.05; // counter lip, just past the raised end
const NC_TOP = NC_PY + NC_FAR * Math.sin(NC_A0) + 0.1 + 0.2; // counter top: a small step above the ruler
const NC_LOW = NC_TOP - 1.8; // the lower shelf: a cart's height and a little under the counter
const NC_END = NC_LIP + 5; // counter end, where the flap hangs
const NC_FLAP_X = 4.5; // flap's horizontal reach
const NC_WALL = NC_END + NC_FLAP_X + 7;

/** The flap's drape: a smoothstep from the counter top down to the shelf. */
function flapLine(): Pt[] {
  const D = NC_TOP - NC_LOW - 0.03;
  const line: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    line.push([u * NC_FLAP_X, -D * (3 * u * u - 2 * u * u * u) - 0.025]);
  }
  return line;
}

export const NIGHT_COUNTER: RouteDef = {
  id: 'night-counter',
  index: 3,
  name: 'The Night Counter',
  note: 'A ruler on a pencil: the high counter, or the shelf under it.',
  mark: { id: 'blue', name: 'Blue post', condition: 'Touch the high ink roller and deliver' },
  kit: { keyWheel: 1, reel: 1, spar: 2, fork: 1, runner: 1 },
  // A compact runner: its toe cannot mount the lip, so a first run rides the dip.
  starter: {
    placements: [
      { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 0, rot: 0 },
      { id: 'runner-1', kind: 'runner', parent: 'chassis', socket: 4, rot: 0 },
    ],
  },
  start: { x: 0, groundY: 0 },
  // The lamp rides forward: over the front support on the climb.
  lampStart: 0.72,
  windTicks: 960,
  pieces: [
    slab('desk', 'desk', 'desk', [
      [-14, DESK_Y],
      [NC_WALL + 4, DESK_Y],
    ], -6),
    slab('bench', 'bench block', 'book', [
      [-9, 0],
      [NC_NEAR_TIP + 1.2, 0],
    ], DESK_Y),
    // A folded card eases the cart onto the ruler's resting tip.
    {
      id: 'wedge',
      name: 'card wedge',
      material: 'card',
      pts: [
        [NC_NEAR_TIP - 1.4, 0],
        [NC_NEAR_TIP + 0.3, 0],
        [NC_NEAR_TIP + 0.3, 0.12],
      ],
    },
    // The eraser the pencil lies on.
    box('eraser', 'eraser', 'card', NC_PX - 0.35, NC_LOW, NC_PX + 0.35, NC_PY - 0.44, { noProfile: true }),
    // The low way is a blotter pad on the lower shelf: a lighter, separate surface from the desk.
    slab('shelf', 'lower shelf', 'blotter', [
      [NC_NEAR_TIP + 1.2, NC_LOW],
      [NC_WALL, NC_LOW],
    ], DESK_Y),
    box('counter', 'night counter', 'shelf', NC_LIP + 0.2, NC_TOP - 0.15, NC_END, NC_TOP),
    box('wall', 'parcel stack', 'card', NC_WALL, NC_LOW, NC_WALL + 2.2, NC_LOW + 2.4),
  ],
  seesaw: {
    id: 'ruler',
    name: 'ruler',
    pivot: [NC_PX, NC_PY],
    length: NC_NEAR + NC_FAR,
    thickness: 0.1,
    offset: (NC_FAR - NC_NEAR) / 2,
    angle0: NC_A0,
    density: 4.5,
    lowerAngle: -Math.asin((NC_PY - NC_LOW) / NC_FAR),
    upperAngle: NC_A0,
    damping: 3,
  },
  roller: { x: NC_LIP + 0.2, y: NC_TOP - 0.1, r: 0.2 },
  flap: { id: 'flap', name: 'curled flap', hinge: [NC_END, NC_TOP], line: flapLine(), thickness: 0.05, density: 0.6, maxLift: 1.2 },
  arch: { x: NC_WALL - 2.6, y: NC_LOW + 0.8, w: 1.4, h: 1.6 },
  killY: -5,
  drawers: [],
  bounds: { x0: -8, x1: NC_WALL + 1, y0: -3, y1: 5 },
  peek: [NC_LIP - 0.4, NC_TOP - 0.5],
};

export const ROUTES: readonly RouteDef[] = [ENVELOPE_LIP, RULER_RISE, BLOTTER_DROP, NIGHT_COUNTER];
