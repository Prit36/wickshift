import { test } from 'vitest';
import { ENVELOPE_LIP } from '../src/data/routes';
import { Sim } from '../src/sim/sim';
import { massInfo } from '../src/sim/cart';
import { restPose } from '../src/sim/seat';
import { CB } from './counter.explore.test';
const log = (s: string) => process.stdout.write(s + '\n');
const FLOOR = { ...ENVELOPE_LIP, pieces: [{ id: 'f', name: 'blotter', material: 'blotter' as const, pts: [[-20, -3], [60, -3], [60, 0], [-20, 0]] as [number, number][] }], arch: { x: 55, y: 1, w: 1.4, h: 1.6 } };
test.skipIf(!process.env.EXPLORE)('mass and lamp metric', () => {
  for (const [n, b] of Object.entries(CB)) {
    const m = [-0.72, 0, 0.72].map((l) => massInfo(b, l));
    log(`${n.padEnd(14)} mass ${m[0]!.mass.toFixed(2)} cx back ${m[0]!.cx.toFixed(2)} mid ${m[1]!.cx.toFixed(2)} fwd ${m[2]!.cx.toFixed(2)}`);
  }
  // Lamp reversed mid-rail at rest, and run end to end.
  const bp = { placements: [{ id: 'k', kind: 'keyWheel' as const, parent: 'chassis', socket: 0, rot: 0 }, { id: 'r', kind: 'reel' as const, parent: 'chassis', socket: 4, rot: 0 }] };
  for (const script of [[1, -1, 1, -1], [1, 1, -1, -1]]) {
    const route = { ...FLOOR, lampStart: 0 };
    const sim = new Sim(route, bp, restPose(bp, route), 0);
    let peak = 0;
    const evs: string[] = [];
    for (let i = 0; i < 240; i++) {
      const ev = sim.step({ drive: false, lamp: script[Math.floor(i / 12) % 4] as -1 | 1 });
      for (const e of ev) evs.push(e.type);
      const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
      peak = Math.max(peak, Math.hypot(w[0]!, w[1]!));
    }
    log(`lamp ${script.join('')} peak ${peak.toFixed(2)} cracks ${sim.cracks} events ${[...new Set(evs)].join(',')} knocks ${evs.filter((e) => e === 'knock').length}`);
  }
});
test.skipIf(!process.env.EXPLORE)('rolling load', () => {
  const builds = { wheels: CB['compact k0 r4']!, runner: { placements: [{ id: 'runner-1', kind: 'runner' as const, parent: 'chassis', socket: 0, rot: 0 }, { id: 'k', kind: 'keyWheel' as const, parent: 'chassis', socket: 4, rot: 0 }] } };
  for (const [n, bp] of Object.entries(builds)) {
    const route = { ...FLOOR, lampStart: 0 };
    const sim = new Sim(route, bp, restPose(bp, route), 0);
    const xs: number[] = [];
    for (let i = 0; i < 480; i++) {
      sim.step({ drive: true, lamp: 0 });
      const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
      if (i > 120) xs.push(Math.hypot(w[0]!, w[1]!));
    }
    xs.sort((a, b) => a - b);
    log(`${n} rolling p50 ${xs[xs.length >> 1]!.toFixed(2)} p95 ${xs[Math.floor(xs.length * 0.95)]!.toFixed(2)} max ${xs[xs.length - 1]!.toFixed(2)} over1.0 ${xs.filter((x) => x > 1).length}/${xs.length}`);
  }
});
