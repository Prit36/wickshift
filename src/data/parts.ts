// Typed part data shared by the bench (layout, validation, drawing, picking)
// and the simulation (fixtures, joints). Units: metres, radians, y up.
// Every part's local origin is its real attachment point (hub or mount bolt).

export type PartKind = 'keyWheel' | 'reel' | 'spar' | 'fork' | 'runner';
export const PART_KINDS: readonly PartKind[] = ['keyWheel', 'reel', 'spar', 'fork', 'runner'];

export type Pt = readonly [number, number];
export type Solid =
  | { readonly type: 'circle'; readonly x: number; readonly y: number; readonly r: number }
  | { readonly type: 'poly'; readonly pts: readonly Pt[] };

export interface PartDef {
  readonly kind: PartKind;
  readonly label: string;
  /** Stamped tag text used in the drawer. */
  readonly tag: string;
  /** One useful sentence shown when the part is selected. */
  readonly blurb: string;
  readonly density: number;
  readonly friction: number;
  readonly restitution: number;
  /** Wheel radius (wheels only). */
  readonly radius?: number;
  /** Sockets this part offers to children, in its local frame. */
  readonly childSockets: readonly Pt[];
  /** Kinds that can mount on this part's child sockets. */
  readonly accepts: readonly PartKind[];
  /** Allowed orientations (radians, angle of local +x in the chassis frame). */
  readonly rotations: readonly number[];
  /** Collision outline in the local frame (also used for clearance checks). */
  readonly solids: readonly Solid[];
  /** Generous picking radius around the local origin / body centre. */
  readonly pick: { readonly x: number; readonly y: number; readonly r: number };
  /** Whether this part is a ground support (used by clearance + seating). */
  readonly rolling: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Length of the ruler spar from mount bolt to tip socket. */
export const SPAR_LENGTH = 0.78;
/** Fork carrier rest position (fully extended) relative to the fork mount. */
export const FORK_CARRIER: Pt = [0.07, -0.46];
/** Fork suspension travel (carrier moves up along the fork axis). */
export const FORK_TRAVEL = 0.3;

export const PARTS: Readonly<Record<PartKind, PartDef>> = {
  keyWheel: {
    kind: 'keyWheel',
    label: 'Key wheel',
    tag: 'KEY WHEEL',
    blurb: 'The only driven wheel: hold Drive to spend its clockwork wind as torque at this hub.',
    density: 0.62,
    friction: 1.05,
    restitution: 0.05,
    radius: 0.4,
    childSockets: [],
    accepts: [],
    rotations: [0],
    solids: [{ type: 'circle', x: 0, y: 0, r: 0.4 }],
    pick: { x: 0, y: 0, r: 0.5 },
    rolling: true,
  },
  reel: {
    kind: 'reel',
    label: 'Cotton reel',
    tag: 'COTTON REEL',
    blurb: 'A big free-rolling reel: it climbs lips that catch the small wheel, but stands the cart tall.',
    density: 0.3,
    friction: 0.8,
    restitution: 0.04,
    radius: 0.6,
    childSockets: [],
    accepts: [],
    rotations: [0],
    solids: [{ type: 'circle', x: 0, y: 0, r: 0.6 }],
    pick: { x: 0, y: 0, r: 0.66 },
    rolling: true,
  },
  spar: {
    kind: 'spar',
    label: 'Ruler spar',
    tag: 'RULER SPAR',
    blurb: 'A light brass arm with a socket at its tip: rotate it to stretch the wheelbase or raise an axle.',
    density: 0.9,
    friction: 0.35,
    restitution: 0.05,
    childSockets: [[SPAR_LENGTH, 0]],
    accepts: ['keyWheel', 'reel', 'fork', 'runner'],
    rotations: [0, -30, -60, -90, -120, -150, 180].map(deg),
    solids: [
      {
        type: 'poly',
        pts: [
          [-0.05, -0.045],
          [SPAR_LENGTH + 0.05, -0.045],
          [SPAR_LENGTH + 0.05, 0.045],
          [-0.05, 0.045],
        ],
      },
    ],
    pick: { x: SPAR_LENGTH * 0.55, y: 0, r: 0.42 },
    rolling: false,
  },
  fork: {
    kind: 'fork',
    label: 'Leaf fork',
    tag: 'LEAF FORK',
    blurb: 'A sprung nib-steel fork: fit a wheel or the runner to its carrier to soak up a hard landing.',
    density: 1.4,
    friction: 0.4,
    restitution: 0.05,
    childSockets: [FORK_CARRIER],
    accepts: ['keyWheel', 'reel', 'runner'],
    rotations: [0],
    solids: [
      {
        type: 'poly',
        pts: [
          [-0.05, 0.03],
          [0.05, 0.03],
          [0.11, -0.22],
          [0.03, -0.22],
        ],
      },
    ],
    pick: { x: 0.04, y: -0.24, r: 0.34 },
    rolling: false,
  },
  runner: {
    kind: 'runner',
    label: 'Waxed runner',
    tag: 'WAXED RUNNER',
    blurb: 'An envelope-board skid with a curled toe: rigid on the frame, sprung on a fork, slow while it rubs.',
    density: 0.85,
    friction: 0.16,
    restitution: 0.02,
    childSockets: [],
    accepts: [],
    rotations: [0],
    solids: [
      {
        type: 'poly',
        pts: [
          [-0.035, 0.03],
          [0.035, 0.03],
          [0.035, -0.22],
          [-0.035, -0.22],
        ],
      },
      {
        type: 'poly',
        pts: [
          [-0.46, -0.3],
          [0.3, -0.3],
          [0.3, -0.22],
          [-0.46, -0.22],
        ],
      },
      {
        type: 'poly',
        pts: [
          [0.3, -0.3],
          [0.4, -0.275],
          [0.47, -0.19],
          [0.42, -0.15],
          [0.3, -0.22],
        ],
      },
    ],
    pick: { x: -0.05, y: -0.22, r: 0.42 },
    rolling: false,
  },
};

/** Chassis: fixed horizontal frame with five sockets and a built-in lamp rail. */
export const CHASSIS = {
  halfLength: 1.18,
  top: 0.07,
  bottom: -0.15,
  density: 1.05,
  friction: 0.85,
  sockets: [-1.0, -0.5, 0, 0.5, 1.0].map((x) => [x, -0.06] as Pt),
  accepts: ['keyWheel', 'reel', 'spar', 'fork', 'runner'] as readonly PartKind[],
  /** Lamp rail travel range (lamp body centre x in chassis frame). */
  railMin: -0.72,
  railMax: 0.72,
  railY: 0.09,
} as const;

/** Glass lamp riding the rail (its own body in the simulation). */
export const LAMP = {
  width: 0.36,
  height: 0.5,
  /** Lamp body origin sits on the rail; its glass rises above. */
  density: 7.6,
  friction: 0.4,
  /** Top slide speed. With the buffers easing into each stop, end to end takes 36 ticks (0.6 s). */
  slideSpeed: (0.72 * 2) / 0.5,
  /** Rail buffers: speed allowed per metre still to travel, and the arrival speed at a stop. */
  buffer: 9,
  stopSpeed: 0.4,
  maxForce: 60,
  solids: [
    {
      type: 'poly',
      pts: [
        [-0.17, 0.0],
        [0.17, 0.0],
        [0.17, 0.08],
        [0.15, 0.4],
        [0.07, 0.5],
        [-0.07, 0.5],
        [-0.15, 0.4],
        [-0.17, 0.08],
      ],
    },
  ] as readonly Solid[],
} as const;

/** Wheel clearance margin: two rolling parts closer than this rub. */
export const CLEARANCE = 0.03;

export const CHASSIS_SOLID: Solid = {
  type: 'poly',
  pts: [
    [-CHASSIS.halfLength, CHASSIS.bottom],
    [CHASSIS.halfLength, CHASSIS.bottom],
    [CHASSIS.halfLength, CHASSIS.top],
    [-CHASSIS.halfLength, CHASSIS.top],
  ],
};
