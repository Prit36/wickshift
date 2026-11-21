// Acceptance checks that need a controlled rig rather than a whole route.
import { describe, expect, test } from 'vitest';
import * as planck from 'planck';
import type { RouteDef } from '../src/data/routeTypes';
import { BLOTTER_DROP, ENVELOPE_LIP } from '../src/data/routes';
import { FORK_TRAVEL } from '../src/data/parts';
import { TICK } from '../src/core/clock';
import { GRAVITY, Sim } from '../src/sim/sim';
import { restPose } from '../src/sim/seat';
import type { Blueprint, Placement } from '../src/workshop/blueprint';

const P = (id: string, kind: Placement['kind'], parent: string, socket: number): Placement => ({ id, kind, parent, socket, rot: 0 });
const DIRECT_RUNNER: Blueprint = { placements: [P('runner-1', 'runner', 'chassis', 0), P('keyWheel-1', 'keyWheel', 'chassis', 4)] };
const SPRUNG_SHOE: Blueprint = {
  placements: [P('fork-1', 'fork', 'chassis', 0), P('runner-1', 'runner', 'fork-1', 0), P('keyWheel-1', 'keyWheel', 'chassis', 4)],
};

/** A flat blotter floor with nothing else on it. */
const FLOOR: RouteDef = {
  ...ENVELOPE_LIP,
  id: 'rig',
  pieces: [{ id: 'floor', name: 'blotter', material: 'blotter', pts: [[-20, -3], [60, -3], [60, 0], [-20, 0]] }],
  arch: { x: 55, y: 1, w: 1.4, h: 1.6 },
  killY: -10,
};

interface DropResult {
  /** Peak windowed change in lamp velocity (m/s over 5 ticks), the crack metric. */
  peakDv: number;
  /** Peak lamp deceleration from the same window (m/s²). */
  peakDecel: number;
  /** Peak single-tick lamp deceleration (m/s²). */
  peakTickDecel: number;
  forkTravel: number;
  cracks: number;
  /** Peak single-tick deceleration of the lamp body itself (m/s²), net of gravity. */
  lampBodyDecel: number;
}

/**
 * Drop a cart tail-first (frame pitched `pitchDeg` nose-up in the world) from
 * 0.25 m with every body moving at (vx, -vy) and the lamp held at `lamp`. The
 * rear support touches first, as it does when it comes off the curl on the route.
 */
function drop(bp: Blueprint, lamp: number, vx: number, vy: number, pitchDeg = 4): DropResult {
  const route = { ...FLOOR, lampStart: lamp };
  const rest = restPose(bp, route);
  const a = (pitchDeg * Math.PI) / 180;
  const sim = new Sim(route, bp, { x: 0, y: rest.y + 0.25 + 1.3 * Math.abs(Math.sin(a)), a }, lamp);
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) b.setLinearVelocity(new planck.Vec2(vx, -vy));
  (sim as unknown as { prevLampV: planck.Vec2 }).prevLampV = new planck.Vec2(vx, -vy);
  let peakDv = 0;
  let peakTick = 0;
  let forkTravel = 0;
  let lampBodyDecel = 0;
  let lv = sim.rig.lamp.getLinearVelocity().clone();
  for (let i = 0; i < 90; i++) {
    sim.step({ drive: false, lamp: 0 });
    const nv = sim.rig.lamp.getLinearVelocity();
    lampBodyDecel = Math.max(lampBodyDecel, Math.hypot(nv.x - lv.x, nv.y - lv.y - GRAVITY * TICK) / TICK);
    lv = nv.clone();
    const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow;
    const sum = w.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
    peakDv = Math.max(peakDv, Math.hypot(sum[0]!, sum[1]!));
    const last = w[w.length - 1]!;
    peakTick = Math.max(peakTick, Math.hypot(last.x, last.y));
    for (const f of sim.rig.forks) forkTravel = Math.max(forkTravel, f.joint.getJointTranslation());
  }
  return { peakDv, peakDecel: peakDv / (5 * TICK), peakTickDecel: peakTick / TICK, forkTravel, cracks: sim.cracks, lampBodyDecel };
}

const fmt = (r: DropResult) =>
  `Δv ${r.peakDv.toFixed(2)} m/s (avg ${r.peakDecel.toFixed(0)} m/s², tick peak ${r.peakTickDecel.toFixed(0)} m/s²; lamp body tick peak ${r.lampBodyDecel.toFixed(0)} m/s²), fork ${(r.forkTravel * 100).toFixed(1)} cm, cracks ${r.cracks}`;

describe('Blotter Drop: direct runner vs sprung shoe', () => {
  // Matched entry between the route's rear touchdowns (the shoe build arrives near
  // 1.9 m/s down, a rigid rear support near 3.4): 2.2 along, 2.2 down, tail first,
  // lamp at the rear stop where the route starts it.
  const VX = 2.2;
  const VY = 2.2;
  const LAMP = BLOTTER_DROP.lampStart;

  test('at matched entry speed and lamp position the leaf takes the sting out', () => {
    const direct = drop(DIRECT_RUNNER, LAMP, VX, VY);
    const sprung = drop(SPRUNG_SHOE, LAMP, VX, VY);
    console.log(`direct runner: ${fmt(direct)}\nsprung shoe:   ${fmt(sprung)}`);
    expect(direct.peakDv).toBeGreaterThanOrEqual(3.6);
    expect(direct.cracks).toBe(1);
    expect(sprung.peakDv).toBeLessThan(3.0);
    expect(sprung.cracks).toBe(0);
    expect(direct.forkTravel).toBe(0);
    // The leaf visibly works through its stroke without bottoming.
    expect(sprung.forkTravel).toBeGreaterThan(FORK_TRAVEL * 0.25);
    expect(sprung.forkTravel).toBeLessThanOrEqual(FORK_TRAVEL + 0.02);
  });

  test('the ordering holds for ±10% entry speed and ±0.1 m of lamp', () => {
    for (const k of [0.9, 1, 1.1])
      for (const dl of [0, 0.1]) {
        const direct = drop(DIRECT_RUNNER, LAMP + dl, VX * k, VY * k);
        const sprung = drop(SPRUNG_SHOE, LAMP + dl, VX * k, VY * k);
        expect(sprung.peakDv).toBeLessThan(direct.peakDv - 0.8);
      }
  });
});

describe('Fork preload keeps the bench pose exact', () => {
  test('a fitted fork does not settle or knock after dispatch, at any lamp position', () => {
    for (const lamp of [-0.72, 0, 0.72])
      for (const bp of [SPRUNG_SHOE, { placements: [P('keyWheel-1', 'keyWheel', 'chassis', 0), P('fork-1', 'fork', 'chassis', 4), P('runner-1', 'runner', 'fork-1', 0)] }]) {
        const route = { ...FLOOR, lampStart: lamp };
        const sim = new Sim(route, bp, restPose(bp, route), lamp);
        let travel = 0;
        for (let i = 0; i < 60; i++) {
          sim.step({ drive: false, lamp: 0 });
          for (const f of sim.rig.forks) travel = Math.max(travel, f.joint.getJointTranslation());
        }
        expect(travel).toBeLessThan(0.012);
        expect(sim.cracks).toBe(0);
      }
  });
});

describe('Impact grouping', () => {
  test('a second hard landing, after the cart has settled, snuffs the lamp', () => {
    const route = { ...FLOOR, lampStart: -0.72 };
    const rest = restPose(DIRECT_RUNNER, route);
    const a = (4 * Math.PI) / 180;
    const sim = new Sim(route, DIRECT_RUNNER, { x: 0, y: rest.y + 0.25 + 1.3 * Math.sin(a), a }, -0.72);
    const kick = () => {
      for (let b = sim.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) b.setLinearVelocity(new planck.Vec2(2.2, -2.2));
    };
    kick();
    (sim as unknown as { prevLampV: planck.Vec2 }).prevLampV = new planck.Vec2(2.2, -2.2);
    for (let i = 0; i < 120; i++) sim.step({ drive: false, lamp: 0 });
    expect(sim.cracks).toBe(1);
    expect(sim.lit).toBe(true);
    // Lift the settled cart and drop it again.
    for (let b = sim.world.getBodyList(); b; b = b.getNext())
      if (b.isDynamic()) b.setPosition(new planck.Vec2(b.getPosition().x, b.getPosition().y + 0.3));
    kick();
    (sim as unknown as { prevLampV: planck.Vec2 }).prevLampV = new planck.Vec2(2.2, -2.2);
    for (let i = 0; i < 60; i++) sim.step({ drive: false, lamp: 0 });
    expect(sim.cracks).toBe(2);
    expect(sim.lit).toBe(false);
  });

  test('sliding and reversing the lamp is never a blow to the glass', () => {
    for (const bp of [DIRECT_RUNNER, SPRUNG_SHOE]) {
      const route = { ...FLOOR, lampStart: 0 };
      const sim = new Sim(route, bp, restPose(bp, route), 0);
      const pattern = [1, -1, 1, 1, -1, -1, 1, -1] as const;
      for (let i = 0; i < 8 * 14; i++) sim.step({ drive: false, lamp: pattern[Math.floor(i / 14)]! });
      expect(sim.cracks).toBe(0);
    }
  });

  test('a runner scraping along a flat never adds cracks', () => {
    const route = { ...FLOOR, lampStart: 0 };
    const sim = new Sim(route, DIRECT_RUNNER, restPose(DIRECT_RUNNER, route), 0);
    for (let i = 0; i < 60 * 8; i++) sim.step({ drive: true, lamp: 0 });
    expect(sim.cracks).toBe(0);
    expect(sim.lit).toBe(true);
  });
});
