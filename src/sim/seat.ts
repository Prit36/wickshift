// Where the cart rests on the flat bench platform: the pose the clamp holds and
// the pose tick 0 starts from, so dispatch adds no impulse.
import { CHASSIS_SOLID, type Solid } from '../data/parts';
import type { RouteDef } from '../data/routeTypes';
import type { Xf } from '../core/geom';
import { checkLaunch, layout, type Blueprint } from '../workshop/blueprint';
import { massInfo } from './cart';

function rot(a: number, x: number, y: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
}

function minY(solids: readonly Solid[], a: number): number {
  let m = Infinity;
  for (const s of solids) {
    if (s.type === 'circle') m = Math.min(m, rot(a, s.x, s.y)[1] - s.r);
    else for (const p of s.pts) m = Math.min(m, rot(a, p[0], p[1])[1]);
  }
  return m;
}

/** Level seat: lowest support touching the platform (used while the moth holds an unfinished cart). */
export function levelPose(bp: Blueprint, route: RouteDef): Xf {
  const solids: Solid[] = [CHASSIS_SOLID];
  for (const lp of layout(bp).values()) solids.push(...lp.solids);
  return { x: route.start.x, y: route.start.groundY - minY(solids, 0) + 0.003, a: 0 };
}

/** Resting pose of a rigid cart on flat ground: local minimum of COM height. */
export function restPose(bp: Blueprint, route: RouteDef): Xf {
  const solids: Solid[] = [CHASSIS_SOLID];
  for (const lp of layout(bp).values()) solids.push(...lp.solids);
  const com = massInfo(bp, route.lampStart);
  const h = (a: number) => rot(a, com.cx, com.cy)[1] - minY(solids, a);
  const step = 0.0005;
  let a = 0;
  let best = h(0);
  const dir = h(step) < best ? 1 : h(-step) < best ? -1 : 0;
  if (dir !== 0) {
    for (let i = 0; i < 2400; i++) {
      const n = a + dir * step;
      const v = h(n);
      if (v > best - 1e-9) break;
      best = v;
      a = n;
    }
  }
  return { x: route.start.x, y: route.start.groundY - minY(solids, a) + 0.003, a };
}

export function benchPose(bp: Blueprint, route: RouteDef): Xf {
  return checkLaunch(bp, route.kit).ok ? restPose(bp, route) : levelPose(bp, route);
}
