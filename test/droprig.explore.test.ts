// Drop rig: identical entry velocity and lamp position, flat floor.
// GRID=1 npx vitest run test/droprig.explore.test.ts --disable-console-intercept
import { test } from 'vitest';
import * as planck from 'planck';
import type { RouteDef } from '../src/data/routeTypes';
import { Sim } from '../src/sim/sim';
import { CART_TUNING } from '../src/sim/cart';
import { restPose } from '../src/sim/seat';
import type { Blueprint, Placement } from '../src/workshop/blueprint';
import { ENVELOPE_LIP } from '../src/data/routes';

const log = (...a: unknown[]) => process.stdout.write(a.map(String).join(' ') + '\n');
const P = (id: string, kind: Placement['kind'], parent: string, socket: number, rot = 0): Placement => ({ id, kind, parent, socket, rot });
const nums = (k: string, d: string) => (process.env[k] ?? d).split(',').map(Number);

export const RIG_BUILDS: Record<string, Blueprint> = {
  'direct s0 k4': { placements: [P('s', 'runner', 'chassis', 0), P('k', 'keyWheel', 'chassis', 4)] },
  'shoe f0 k4': { placements: [P('f', 'fork', 'chassis', 0), P('s', 'runner', 'f', 0), P('k', 'keyWheel', 'chassis', 4)] },
  'direct k0 s4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('s', 'runner', 'chassis', 4)] },
  'shoe k0 f4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('f', 'fork', 'chassis', 4), P('s', 'runner', 'f', 0)] },
  'rigid k0 r4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('r', 'reel', 'chassis', 4)] },
};

const FLOOR: RouteDef = {
  ...ENVELOPE_LIP,
  id: 'rig',
  pieces: [{ id: 'floor', name: 'blotter', material: 'blotter', pts: [[-20, -3], [60, -3], [60, 0], [-20, 0]] }],
  arch: { x: 55, y: 1, w: 1.4, h: 1.6 },
  killY: -10,
};

/** Drop a cart from `h` metres with (vx, -vy) on every body; returns peak lamp Δv and fork travel. */
export function dropRig(bp: Blueprint, lamp: number, vx: number, vy: number, pitch = 0, h = 0.25) {
  const route = { ...FLOOR, lampStart: lamp };
  const rest = restPose(bp, route);
  const sim = new Sim(route, bp, { x: 0, y: rest.y + h + 1.3 * Math.abs(Math.sin(pitch)), a: pitch }, lamp);
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) b.setLinearVelocity(new planck.Vec2(vx, -vy));
  (sim as unknown as { prevLampV: planck.Vec2 }).prevLampV = new planck.Vec2(vx, -vy);
  let peak = 0;
  let fork = 0;
  for (let i = 0; i < 90; i++) {
    sim.step({ drive: false, lamp: 0 });
    const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
    peak = Math.max(peak, Math.hypot(w[0]!, w[1]!));
    for (const f of sim.rig.forks) fork = Math.max(fork, f.joint.getJointTranslation());
  }
  return { peak, fork, cracks: sim.cracks };
}

test.skipIf(!process.env.GRID)('drop rig grid', () => {
  const builds = (process.env.B ?? 'direct s0 k4,shoe f0 k4,direct k0 s4,shoe k0 f4,rigid k0 r4').split(',');
  const lamps = nums('LAMP', '-0.72,0');
  for (const K of nums('FK', '80,150'))
    for (const C of nums('FC', '2,4'))
      for (const PRE of nums('PRE', '20'))
        for (const vy of nums('VY', '2.5,3,3.5,4'))
          for (const pitch of nums('PITCH', '0')) {
            if (process.env.FK) (CART_TUNING as { forkK: number }).forkK = K;
            if (process.env.FC) (CART_TUNING as { forkC: number }).forkC = C;
            if (process.env.PRE) (CART_TUNING as { forkPreload: number }).forkPreload = PRE;
            const cells: string[] = [];
            for (const L of lamps)
              for (const b of builds) {
                const r = dropRig(RIG_BUILDS[b]!, L, Number(process.env.VX ?? 2.5), vy, (pitch * Math.PI) / 180);
                cells.push(`${r.peak.toFixed(1)}/${r.fork.toFixed(2)}`.padEnd(9));
              }
            log(`K${K} C${C} P${PRE} vy${vy} p${pitch} | ${cells.join(' ')}`);
          }
});

test.skipIf(!process.env.STATIC)('static fork load', () => {
  for (const PRE of nums('PRE', '0,20')) {
    (CART_TUNING as { forkPreload: number }).forkPreload = PRE;
    for (const L of [-0.72, 0, 0.72])
      for (const b of ['shoe f0 k4', 'shoe k0 f4']) {
        const route = { ...FLOOR, lampStart: L };
        const bp = RIG_BUILDS[b]!;
        const sim = new Sim(route, bp, restPose(bp, route), L);
        let fork = 0;
        let peak = 0;
        let knocks = 0;
        for (let i = 0; i < 60; i++) {
          const ev = sim.step({ drive: false, lamp: 0 });
          knocks += ev.filter((e) => e.type === 'knock').length;
          for (const f of sim.rig.forks) fork = Math.max(fork, f.joint.getJointTranslation());
          const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
          if (i > 6) peak = Math.max(peak, Math.hypot(w[0]!, w[1]!));
        }
        log(`P${PRE} L${L} ${b} fork=${fork.toFixed(3)} knocks=${knocks} peak=${peak.toFixed(2)}`);
      }
  }
});
