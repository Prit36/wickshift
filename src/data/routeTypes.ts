import type { Pt } from './parts';
import type { Blueprint, Kit } from '../workshop/blueprint';

export type Material = 'desk' | 'paper' | 'envelope' | 'brass' | 'tin' | 'blotter' | 'card' | 'book' | 'shelf';

export interface TerrainPiece {
  readonly id: string;
  readonly material: Material;
  /** Closed outline, counter-clockwise, world metres (y up). */
  readonly pts: readonly Pt[];
  /** Name used in measured observations ("caught the {name}"). */
  readonly name: string;
  readonly friction?: number;
  /** Drawn in front of the cart (e.g. a curled flap edge). */
  readonly front?: boolean;
  /** Pieces that the slip's mini profile should ignore (e.g. hidden supports). */
  readonly noProfile?: boolean;
}

export interface SeesawDef {
  readonly id: string;
  readonly name: string;
  /** World pivot (top of the pencil). */
  readonly pivot: Pt;
  readonly length: number;
  readonly thickness: number;
  /** Plank centre offset from the pivot along the plank (m). */
  readonly offset: number;
  readonly angle0: number;
  readonly density: number;
  readonly lowerAngle: number;
  readonly upperAngle: number;
  /** Angular damping on the plank: a heavier value makes the dip a steady tilt. */
  readonly damping?: number;
}

/**
 * A sheet hinged along its top edge that drapes down to the floor. Its centreline
 * is authored in the hinge frame at rest; it can be lifted, never pushed below rest.
 */
export interface FlapDef {
  readonly id: string;
  readonly name: string;
  readonly hinge: Pt;
  /** Centreline from the hinge (first point [0,0]) to the free edge, hinge frame. */
  readonly line: readonly Pt[];
  readonly thickness: number;
  readonly density: number;
  /** Highest lift above rest (rad). */
  readonly maxLift: number;
}

export interface RollerDef {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface MarkDef {
  readonly id: 'wind' | 'short' | 'clear' | 'blue';
  readonly name: string;
  readonly condition: string;
}

export interface RouteDef {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly mark: MarkDef;
  readonly kit: Kit;
  readonly starter: Blueprint;
  /** Chassis start x and the bench platform top. */
  readonly start: { readonly x: number; readonly groundY: number };
  /** Lamp starting position on the rail (chassis frame x). */
  readonly lampStart: number;
  /** Ticks of engaged drive in a full spring on this route (defaults to SIM_TUNING.windTicks). */
  readonly windTicks?: number;
  readonly pieces: readonly TerrainPiece[];
  readonly seesaw?: SeesawDef;
  readonly roller?: RollerDef;
  readonly flap?: FlapDef;
  /** Receiving window opening (sensor box), world metres. */
  readonly arch: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Lamp below this height has fallen into a drawer. */
  readonly killY: number;
  /** Drawer openings (drawn as dark slots). */
  readonly drawers: readonly { readonly x0: number; readonly x1: number; readonly y: number }[];
  readonly bounds: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  /** Optional landing framing: when the cart passes `fromX`, include `focus` in view. */
  readonly landing?: { readonly fromX: number; readonly toX: number; readonly focus: Pt };
  /** Where Scout's quick look (hold V) points. */
  readonly peek: Pt;
  /** Short course note printed on the route slip. */
  readonly note: string;
}
