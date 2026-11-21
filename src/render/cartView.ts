// A drawable frame of the cart, built either from the bench blueprint (tick 0
// pose) or from interpolated simulation bodies. Drawing never touches physics.
import type * as planck from 'planck';
import { CHASSIS, FORK_TRAVEL, PARTS, type PartKind } from '../data/parts';
import { apply, compose, lerp, lerpAngle, type Xf } from '../core/geom';
import { layout, type Blueprint } from '../workshop/blueprint';
import type { Sim } from '../sim/sim';
import type { Camera } from './camera';
import { drawChassis, drawLamp, drawPart, type LampLook } from './partsArt';
import { C } from './palette';

export interface PartFrame {
  id: string;
  kind: PartKind;
  pose: Xf;
  spin: number;
  compress: number;
}

export interface CartFrame {
  chassis: Xf;
  lamp: Xf;
  parts: PartFrame[];
}

export function frameFromBench(bp: Blueprint, pose: Xf, lampX: number): CartFrame {
  const parts: PartFrame[] = [];
  for (const lp of layout(bp).values()) {
    parts.push({
      id: lp.p.id,
      kind: lp.p.kind,
      pose: compose(pose, lp.xf),
      spin: pose.a,
      compress: 0,
    });
  }
  const [lx, ly] = apply(pose, [lampX, CHASSIS.railY]);
  return { chassis: pose, lamp: { x: lx, y: ly, a: pose.a }, parts };
}

export type Snap = Map<planck.Body, Xf>;
export interface SimSnap {
  bodies: Snap;
  forks: Map<string, number>;
}

export function snapSim(sim: Sim): SimSnap {
  const bodies: Snap = new Map();
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) {
    if (!b.isDynamic()) continue;
    const p = b.getPosition();
    bodies.set(b, { x: p.x, y: p.y, a: b.getAngle() });
  }
  const forks = new Map<string, number>();
  for (const f of sim.rig.forks) forks.set(f.id, f.joint.getJointTranslation());
  return { bodies, forks };
}

export function lerpXf(a: Xf | undefined, b: Xf, t: number): Xf {
  if (!a) return b;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), a: lerpAngle(a.a, b.a, t) };
}

export function frameFromSim(sim: Sim, prev: SimSnap, cur: SimSnap, alpha: number): CartFrame {
  const bx = (b: planck.Body): Xf => lerpXf(prev.bodies.get(b), cur.bodies.get(b) ?? { x: 0, y: 0, a: 0 }, alpha);
  const chassis = bx(sim.rig.chassis);
  const lamp = bx(sim.rig.lamp);
  const parts: PartFrame[] = [];
  for (const lp of sim.rig.laid.values()) {
    const body = sim.rig.bodyOf.get(lp.p.id)!;
    const local = sim.rig.localXf.get(lp.p.id)!;
    const bxf = bx(body);
    let compress = 0;
    if (lp.p.kind === 'fork') {
      const t = lerp(prev.forks.get(lp.p.id) ?? 0, cur.forks.get(lp.p.id) ?? 0, alpha);
      compress = Math.max(0, Math.min(1, t / FORK_TRAVEL));
    }
    parts.push({ id: lp.p.id, kind: lp.p.kind, pose: compose(bxf, local), spin: bxf.a, compress });
  }
  return { chassis, lamp, parts };
}

export interface CartLook {
  lamp: Omit<LampLook, 'k'>;
  res: number;
  stripePart: string | null;
  selected: string | null;
  hidden?: string | null;
  /** Draw the moth (callback so poses stay in the game layer). */
  moth?: (ctx: CanvasRenderingContext2D, seat: { x: number; y: number; a: number }) => void;
}

const ORDER: Record<PartKind, number> = { spar: 0, fork: 1, runner: 3, reel: 4, keyWheel: 5 };

function at(ctx: CanvasRenderingContext2D, cam: Camera, xf: Xf): void {
  ctx.translate(cam.sx(xf.x), cam.sy(xf.y));
  ctx.rotate(-xf.a);
}

export function drawCart(ctx: CanvasRenderingContext2D, cam: Camera, f: CartFrame, look: CartLook): void {
  const k = cam.ppm;
  const sorted = [...f.parts].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const drawOne = (p: PartFrame) => {
    if (look.hidden === p.id) return;
    ctx.save();
    if (p.kind === 'keyWheel' || p.kind === 'reel') {
      ctx.translate(cam.sx(p.pose.x), cam.sy(p.pose.y));
    } else {
      at(ctx, cam, p.pose);
    }
    drawPart(ctx, p.kind, { k, spin: p.spin, compress: p.compress, stripe: look.stripePart === p.id, res: look.res });
    if (look.selected === p.id) selectionRing(ctx, p.kind, k);
    ctx.restore();
  };
  for (const p of sorted) if (ORDER[p.kind] < 2) drawOne(p);
  ctx.save();
  at(ctx, cam, f.chassis);
  drawChassis(ctx, k);
  if (look.stripePart === 'chassis') {
    ctx.fillStyle = C.blue;
    ctx.fillRect(0.6 * k, -CHASSIS.top * k + 2, 0.3 * k, (CHASSIS.top - CHASSIS.bottom) * k - 4);
  }
  ctx.restore();
  for (const p of sorted) if (ORDER[p.kind] >= 2) drawOne(p);
  if (look.moth) {
    const seat = apply(f.chassis, [-1.0, CHASSIS.top]);
    look.moth(ctx, { x: seat[0], y: seat[1], a: f.chassis.a });
  }
  ctx.save();
  at(ctx, cam, f.lamp);
  drawLamp(ctx, { k, ...look.lamp });
  ctx.restore();
}

/** Selection: a cut-paper dashed outline (shape, not just colour). */
function selectionRing(ctx: CanvasRenderingContext2D, kind: PartKind, k: number): void {
  const def = PARTS[kind];
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(def.pick.x * k, -def.pick.y * k, def.pick.r * k * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
