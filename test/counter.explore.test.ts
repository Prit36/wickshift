// The Night Counter tuning harness (the shipped route is NIGHT_COUNTER in routes.ts; defaults here match it with STEP=0.2 DEN=4.5 DAMP=3 LAMP=0.72): EXPLORE=1 npx vitest run test/counter.explore.test.ts --disable-console-intercept
import { test } from 'vitest';
import type { RouteDef, TerrainPiece } from '../src/data/routeTypes';
import type { Pt } from '../src/data/parts';
import { Sim } from '../src/sim/sim';
import type { Blueprint, Placement } from '../src/workshop/blueprint';
import { findConflicts } from '../src/workshop/blueprint';
import { ENVELOPE_LIP } from '../src/data/routes';

const log = (...a: unknown[]) => process.stdout.write(a.map(String).join(' ') + '\n');
const P = (id: string, kind: Placement['kind'], parent: string, socket: number, rot = 0): Placement => ({ id, kind, parent, socket, rot });
const nums = (k: string, d: string) => (process.env[k] ?? d).split(',').map(Number);
const deg = (d: number) => (d * Math.PI) / 180;

export const CB: Record<string, Blueprint> = {
  'long k0 s4r': { placements: [P('k', 'keyWheel', 'chassis', 0), P('sp', 'spar', 'chassis', 4, 0), P('r', 'reel', 'sp', 0)] },
  'long s0k s4r': { placements: [P('sb', 'spar', 'chassis', 0, deg(180)), P('k', 'keyWheel', 'sb', 0), P('sp', 'spar', 'chassis', 4, 0), P('r', 'reel', 'sp', 0)] },
  'long k1 s4r': { placements: [P('k', 'keyWheel', 'chassis', 1), P('sp', 'spar', 'chassis', 4, 0), P('r', 'reel', 'sp', 0)] },
  'long k0 s4k?': { placements: [P('r', 'reel', 'chassis', 0), P('sp', 'spar', 'chassis', 4, 0), P('k', 'keyWheel', 'sp', 0)] },
  'compact k0 s4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('s', 'runner', 'chassis', 4)] },
  'compact k1 s3': { placements: [P('k', 'keyWheel', 'chassis', 1), P('s', 'runner', 'chassis', 3)] },
  'compact k0 r4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('r', 'reel', 'chassis', 4)] },
  'compact k1 r4': { placements: [P('k', 'keyWheel', 'chassis', 1), P('r', 'reel', 'chassis', 4)] },
};

export interface CounterShape {
  near: number;
  far: number;
  density: number;
  /** Pivot height (top of the pencil). */
  py?: number;
  damping?: number;
}

const E = (k: string, d: number) => Number(process.env[k] ?? d);

/**
 * Ruler on a pencil: the near end rests on the bench, the far end lifts to the
 * night counter's lip. Dipped, it rests on the lower shelf, which runs under the
 * counter to a curled flap hung from the counter's end; both levels meet on the
 * floor past the flap.
 */
export function counterRoute(s: CounterShape): RouteDef {
  const { near, far, density } = s;
  const py = s.py ?? E('PY', 0.8);
  const nearX = 4.5; // the ruler's near tip on the bench
  const a0 = Math.asin(py / near);
  const px = nearX + near * Math.cos(a0);
  const xEnd = px + far * Math.cos(a0);
  const yEndTop = py + far * Math.sin(a0) + 0.1;
  const xf = xEnd + E('GAP', 0.05);
  const yc = yEndTop + E('STEP', 0.2);
  const yLow = yc - E('CLEAR', 1.8);
  const lower = -Math.asin((py - yLow) / far);
  const counterEnd = xf + E('CLEN', 5);
  // Drape: smoothstep from the counter top down to the floor.
  const D = yc - yLow - 0.03;
  const Lx = E('FLX', 4.5);
  const line: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    line.push([u * Lx, -D * (3 * u * u - 2 * u * u * u) - 0.025]);
  }
  const wallX = counterEnd + Lx + E('RUN', 7);
  const pieces: TerrainPiece[] = [
    { id: 'desk', name: 'desk', material: 'desk', pts: [[-14, -6], [wallX + 4, -6], [wallX + 4, -1.6], [-14, -1.6]] },
    { id: 'bench', name: 'bench block', material: 'book', pts: [[-9, -1.6], [nearX + 1.2, -1.6], [nearX + 1.2, 0], [-9, 0]] },
    { id: 'wedge', name: 'card wedge', material: 'card', pts: [[nearX - 1.4, 0], [nearX + 0.3, 0], [nearX + 0.3, 0.12]] },
    // Eraser under the pencil.
    { id: 'eraser', name: 'eraser', material: 'card', pts: [[px - 0.35, yLow], [px + 0.35, yLow], [px + 0.35, py - 0.44], [px - 0.35, py - 0.44]] },
    { id: 'shelf', name: 'lower shelf', material: 'shelf', pts: [[nearX + 1.2, -1.6], [wallX, -1.6], [wallX, yLow], [nearX + 1.2, yLow]] },
    { id: 'counter', name: 'night counter', material: 'shelf', pts: [[xf + 0.2, yc - 0.15], [counterEnd, yc - 0.15], [counterEnd, yc], [xf + 0.2, yc]] },
    { id: 'wall', name: 'parcel stack', material: 'card', pts: [[wallX, yLow], [wallX + 2.2, yLow], [wallX + 2.2, yLow + 2.4], [wallX, yLow + 2.4]] },
  ];
  const L = near + far;
  return {
    ...ENVELOPE_LIP,
    id: 'counter-test',
    windTicks: 960,
    pieces,
    seesaw: { id: 'ruler', name: 'ruler', pivot: [px, py], length: L, thickness: 0.1, offset: (far - near) / 2, angle0: a0, density, lowerAngle: lower, upperAngle: a0, damping: s.damping ?? E('DAMP', 3) },
    roller: { x: xf + 0.2, y: yc - 0.1, r: 0.2 },
    flap: { id: 'flap', name: 'curled flap', hinge: [counterEnd, yc], line, thickness: 0.05, density: E('FDEN', 0.6), maxLift: 1.2 },
    arch: { x: wallX - 2.6, y: yLow + 0.8, w: 1.4, h: 1.6 },
    killY: -5,
    bounds: { x0: -8, x1: wallX + 2, y0: -3, y1: 5 },
    lampStart: E('LAMP', 0.72),
  };
}

export function runCounter(route: RouteDef, bp: Blueprint, lamp: -1 | 0 | 1 = 0, maxTicks = 60 * 40, pol?: number[], lpol?: number[]) {
  let high = false;
  const sim = new Sim(route, bp);
  let dipTick = -1;
  let maxY = -9;
  let waiting = false;
  let done = false;
  const px = route.seesaw!.pivot[0];
  while (sim.outcome === 'running' && sim.tick < maxTicks) {
    let inp: { drive: boolean; lamp: -1 | 0 | 1 } = { drive: true, lamp };
    if (pol && !done) {
      if (!waiting && sim.chassisPose().x > px + pol[0]!) waiting = true;
      if (waiting && sim.seesaw!.getAngle() <= route.seesaw!.lowerAngle + 0.02 && Math.abs(sim.seesaw!.getAngularVelocity()) < 0.05) { waiting = false; done = true; }
      if (waiting) inp = { drive: false, lamp: pol[1] as -1 | 0 | 1 };
    }
    if (lpol && !pol) inp = { drive: true, lamp: (sim.chassisPose().x > route.roller!.x - lpol[0]! ? lpol[2] : lpol[1]) as -1 | 0 | 1 };
    sim.step(inp);
    const pp = sim.chassisPose();
    if (pp.x > route.roller!.x + 1.5 && pp.y > route.roller!.y) high = true;
    const a = sim.seesaw!.getAngle();
    if (dipTick < 0 && a < route.seesaw!.angle0 - 0.05) dipTick = sim.tick;
    maxY = Math.max(maxY, sim.chassisPose().y);
    if (sim.atRest && sim.tick > 300) break;
  }
  const p = sim.chassisPose();
  const level = sim.outcome === 'delivered' ? (high ? 'HIGH' : 'low') : '';
  return { sim, dipTick, level, x: p.x };
}

test.skipIf(!process.env.EXPLORE)('counter sweep', () => {
  for (const [n, b] of Object.entries(CB)) if (findConflicts(b).length) log('ILLEGAL', n, findConflicts(b).map((c) => c.reason).join(','));
  const builds = (process.env.B ?? Object.keys(CB).join(',')).split(',');
  for (const near of nums('NEAR', '5'))
  for (const far of nums('FAR', '3.4'))
    for (const density of nums('DEN', '4,4.5,5'))
      for (const L of nums('LAMPS', '0.72')) {
        process.env.LAMP = String(L);
        const route = counterRoute({ near, far, density });
        const pol = process.env.POL?.split(',').map(Number);
        const cells = builds.map((b) => {
          const r = runCounter(route, CB[b]!, 0, 60 * 40, b.startsWith('compact') ? pol : undefined, process.env.LPOL?.split(',').map(Number));
          const tag = r.sim.outcome === 'delivered' ? `${r.level}${r.sim.rollerPart ? '*' : ''}${r.sim.cracks ? 'C' : ''}` : r.sim.outcome === 'failed' ? 'X' : `-${r.x.toFixed(0)}`;
          return tag.padEnd(9);
        });
        log(`near${near} far${far} den${density} L${L} d${process.env.DAMP ?? 3} | ${cells.join('')}`);
      }
  log('builds:', builds.join(' | '));
});

test.skipIf(!process.env.TRACE)('counter trace', () => {
  const near = Number(process.env.NEAR ?? 5);
  const route = counterRoute({ near, far: Number(process.env.FAR ?? 3.4), density: Number(process.env.DEN ?? 4.5) });
  const sim = new Sim(route, CB[process.env.TRACE!]!);
  // POL="D,lamp": release drive once the chassis is D past the pivot, hold the lamp,
  // and drive again once the ruler has reached its lower stop.
  const pol = process.env.POL?.split(',').map(Number);
  const px = route.seesaw!.pivot[0];
  let waiting = false;
  let done = false;
  for (let i = 0; i < 60 * 14 && sim.outcome === 'running'; i++) {
    let inp: { drive: boolean; lamp: -1 | 0 | 1 } = { drive: true, lamp: Number(process.env.TL ?? 0) as -1 | 0 | 1 };
    if (pol && !done) {
      const x = sim.chassisPose().x;
      if (!waiting && x > px + pol[0]!) waiting = true;
      if (waiting && sim.seesaw!.getAngle() <= route.seesaw!.lowerAngle + 0.02) { waiting = false; done = true; log('-- resume at', sim.tick); }
      if (waiting) inp = { drive: false, lamp: pol[1] as -1 | 0 | 1 };
    }
    const lp2 = process.env.LPOL?.split(',').map(Number);
    if (lp2 && !pol) inp = { drive: true, lamp: (sim.chassisPose().x > route.roller!.x - lp2[0]! ? lp2[2] : lp2[1]) as -1 | 0 | 1 };
    const ev = sim.step(inp);
    if (i % 15 !== 0 && !ev.length) continue;
    const p = sim.chassisPose();
    const tc = (sim as unknown as { tickContacts: { part: string; terrain: string }[] }).tickContacts;
    const touch = [...new Set(tc.map((c) => `${c.part}/${c.terrain}`))].join(' ');
    log(`t${sim.tick} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} a=${((p.a * 180) / Math.PI).toFixed(0)} v=${sim.rig.chassis.getLinearVelocity().x.toFixed(2)} ruler=${((sim.seesaw!.getAngle() * 180) / Math.PI).toFixed(1)} wind=${sim.wind.toFixed(2)} ${touch} ${ev.map((e) => e.type).join(',')}`);
  }
  log(sim.outcome, sim.failReason || sim.describeRest());
});

test.skipIf(!process.env.MATRIX)('counter policy matrix', () => {
  const route = counterRoute({ near: E('NEAR', 5), far: E('FAR', 3.4), density: E('DEN', 4.5), damping: E('DAMP', 3) });
  const pols: Record<string, [(-1 | 0 | 1), number[] | undefined, number[] | undefined]> = {
    'full L0': [0, undefined, undefined],
    'full L-': [-1, undefined, undefined],
    'full L+': [1, undefined, undefined],
    'back>fwd': [0, undefined, [2.5, -1, 1]],
    'wait L+': [0, [1.0, 1], undefined],
    'wait L0': [0, [1.0, 0], undefined],
    'wait1.6 L+': [0, [1.6, 1], undefined],
  };
  const builds = CB;
  for (const [n, b] of Object.entries(CB)) if (findConflicts(b).length) log('ILLEGAL', n, findConflicts(b).map((c) => c.reason).join(','));
  log('build'.padEnd(16) + Object.keys(pols).map((k) => k.padEnd(11)).join(''));
  for (const [n, b] of Object.entries(builds)) {
    const why: string[] = [];
    const cells = Object.entries(pols).map(([pn, [l, pol, lpol]]) => {
      const r = runCounter(route, b, l, 60 * 40, pol, lpol);
      const tag = r.sim.outcome === 'delivered' ? `${r.level}${r.sim.rollerPart ? '*' : ''}${r.sim.cracks ? 'C' : ''}` : r.sim.outcome === 'failed' ? 'X' : `-${r.x.toFixed(0)}`;
      if (process.env.WHY && (r.sim.cracks || r.sim.outcome !== 'delivered')) {
        const d = r.sim.decisive;
        why.push(`   ${pn}: ${r.sim.outcome} ${r.sim.cracks ? `crack@${d?.part}(${d?.x.toFixed(1)},${d?.y.toFixed(1)})` : ''} ${r.sim.outcome === 'running' ? r.sim.describeRest() : r.sim.failReason}`);
      }
      return tag.padEnd(11);
    });
    log(n.padEnd(16) + cells.join(''));
    for (const w of why) log(w);
  }
});
