// Exploration harness (not an assertion suite): prints outcomes for tuning.
// npx vitest run test/explore.test.ts --disable-console-intercept
import { test } from 'vitest';
import { ENVELOPE_LIP } from '../src/data/routes';
import { runScript, type InputScript } from '../src/sim/replay';
import type { Blueprint } from '../src/workshop/blueprint';

const log = (...a: unknown[]) => process.stdout.write(a.map(String).join(' ') + '\n');
const bp = (k: number, r: number): Blueprint => ({
  placements: [
    { id: 'reel-1', kind: 'reel', parent: 'chassis', socket: r, rot: 0 },
    { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: k, rot: 0 },
  ],
});

test.skipIf(!process.env.EXPLORE)('envelope wind', () => {
  const W = Number(process.env.W ?? 960);
  (ENVELOPE_LIP as { windTicks?: number }).windTicks = W;
  const scripts: [string, InputScript][] = [['full', [[0, 1, 0]]]];
  for (const c0 of [240, 300, 360, 420, 480, 540, 600]) {
    for (const len of [60, 120, 180, 240, 300]) {
      scripts.push([`coast ${c0}+${len}`, [[0, 1, 0], [c0, 0, 0], [c0 + len, 1, 0]]]);
    }
  }
  for (const k of [0, 1]) {
    for (const [name, sc] of scripts) {
      const r = runScript(ENVELOPE_LIP, bp(k, 4), sc);
      if (name === 'full' || r.outcome === 'delivered') log(`W=${W} k${k} ${name.padEnd(14)} ${r.outcome.padEnd(9)} t=${(r.ticks / 60).toFixed(1)} wind=${r.wind.toFixed(2)} maxX=${r.maxX.toFixed(1)}`);
    }
  }
});

test.skipIf(!process.env.EXPLORE)('find failures', async () => {
  const { RULER_RISE } = await import('../src/data/routes');
  const builds: [string, Blueprint][] = [];
  const { findConflicts } = await import('../src/workshop/blueprint');
  for (const k of [0, 1, 2, 3]) for (const r of [2, 3, 4]) if (k !== r && findConflicts(bp(k, r)).length === 0) builds.push([`k${k} r${r}`, bp(k, r)]);
  log('legal builds', builds.map((b) => b[0]).join(' '));
  const scripts: [string, InputScript][] = [
    ['full', [[0, 1, 0]]],
    ['full back', [[0, 1, -1]]],
    ['full fwd', [[0, 1, 1]]],
  ];
  for (const route of [ENVELOPE_LIP, RULER_RISE]) {
    for (const [bn, b] of builds) {
      for (const [sn, sc] of scripts) {
        const r = runScript(route, b, sc);
        const crack = r.events.find((e) => e.e.type === 'crack');
        if (r.outcome !== 'delivered' || r.cracks > 0)
          log(`${route.id} ${bn} ${sn.padEnd(9)} ${r.outcome.padEnd(9)} cracks=${r.cracks} ${r.reason} ${crack ? `crack@${(crack.tick / 60).toFixed(1)}s` : ''}`);
      }
    }
  }
});

test.skipIf(!process.env.EXPLORE)('trace lamp', async () => {
  const { RULER_RISE } = await import('../src/data/routes');
  const { Sim } = await import('../src/sim/sim');
  const { benchPose } = await import('../src/sim/seat');
  const route = process.env.R === 'el' ? ENVELOPE_LIP : RULER_RISE;
  const b = bp(Number(process.env.K ?? 2), Number(process.env.RR ?? 4));
  const sim = new Sim(route, b, benchPose(b, route));
  const lamp = Number(process.env.LAMP ?? 0) as -1 | 0 | 1;
  for (let i = 0; i < 50; i++) {
    const ev = sim.step({ drive: true, lamp });
    const s = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
    const p = sim.chassisPose();
    log(`t${sim.tick} s=${Math.hypot(s[0]!, s[1]!).toFixed(2)} a=${p.a.toFixed(3)} y=${p.y.toFixed(3)} lampX=${sim.lampRailX().toFixed(2)} ${ev.map((e) => e.type).join(',')}`);
  }
});

test.skipIf(!process.env.EXPLORE)('rest pose', async () => {
  const { RULER_RISE } = await import('../src/data/routes');
  const { restPose, benchPose } = await import('../src/sim/seat');
  const { massInfo } = await import('../src/sim/cart');
  const b = bp(2, 4);
  log('com', JSON.stringify(massInfo(b, RULER_RISE.lampStart)));
  log('rest', JSON.stringify(restPose(b, RULER_RISE)), 'bench', JSON.stringify(benchPose(b, RULER_RISE)));
});
