// Blotter Drop tuning harness: EXPLORE=1 npx vitest run test/blotter.explore.test.ts --disable-console-intercept
import { test } from 'vitest';
import type { RouteDef } from '../src/data/routeTypes';
import type { Pt } from '../src/data/parts';
import { Sim } from '../src/sim/sim';
import { CART_TUNING } from '../src/sim/cart';
import type { Blueprint, Placement } from '../src/workshop/blueprint';
import { findConflicts } from '../src/workshop/blueprint';
import { ENVELOPE_LIP } from '../src/data/routes';

const log = (...a: unknown[]) => process.stdout.write(a.map(String).join(' ') + '\n');
const P = (id: string, kind: Placement['kind'], parent: string, socket: number, rot = 0): Placement => ({ id, kind, parent, socket, rot });

export const BUILDS: Record<string, Blueprint> = {
  'rigid k0r4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('r', 'reel', 'chassis', 4)] },
  'rigid k1r4': { placements: [P('k', 'keyWheel', 'chassis', 1), P('r', 'reel', 'chassis', 4)] },
  'shoe k0 f4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('f', 'fork', 'chassis', 4), P('s', 'runner', 'f', 0)] },
  'shoe k0 f3': { placements: [P('k', 'keyWheel', 'chassis', 0), P('f', 'fork', 'chassis', 3), P('s', 'runner', 'f', 0)] },
  'shoe k2 r0 f4': { placements: [P('r', 'reel', 'chassis', 0), P('k', 'keyWheel', 'chassis', 2), P('f', 'fork', 'chassis', 4), P('s', 'runner', 'f', 0)] },
  'direct k0 s4': { placements: [P('k', 'keyWheel', 'chassis', 0), P('s', 'runner', 'chassis', 4)] },
  'shoe rear f0 k4': { placements: [P('f', 'fork', 'chassis', 0), P('s', 'runner', 'f', 0), P('k', 'keyWheel', 'chassis', 4)] },
  'shoe rear f0 k3': { placements: [P('f', 'fork', 'chassis', 0), P('s', 'runner', 'f', 0), P('k', 'keyWheel', 'chassis', 3)] },
  'shoe rear f1 k4': { placements: [P('f', 'fork', 'chassis', 1), P('s', 'runner', 'f', 0), P('k', 'keyWheel', 'chassis', 4)] },
  'direct rear s0 k4': { placements: [P('s', 'runner', 'chassis', 0), P('k', 'keyWheel', 'chassis', 4)] },
  'sprung key f0 r4': { placements: [P('f', 'fork', 'chassis', 0), P('k', 'keyWheel', 'f', 0), P('r', 'reel', 'chassis', 4)] },
};

export interface Shape {
  lipX: number;
  kick: number; // curl rise just before the edge
  drop: number; // sheet top to blotter
  rc: number; // radius of the curled edge
  ang: number; // chute angle below horizontal (rad)
  fillet: number; // horizontal length of the concave run-in
  hill: number; // extra fall along the long landing
  hillLen: number;
  approach: number; // fall of the approach before the lip
}

/** Sheet top profile from the bench to the blotter foot. */
export function curlDrop(s: Shape): { sheet: Pt[]; landing: Pt[] } {
  const { lipX, kick, drop, rc, ang, fillet, hill, hillLen, approach } = s;
  const sheet: Pt[] = [
    [-9, 0],
    [3.4, 0],
  ];
  const yTop = -approach;
  if (approach > 0) sheet.push([6, -approach * 0.35], [8.5, -approach * 0.9], [9.5, yTop]);
  if (kick > 0) sheet.push([lipX - 1.3, yTop], [lipX - 0.7, yTop + kick * 0.25], [lipX - 0.3, yTop + kick * 0.75]);
  else sheet.push([lipX - 0.6, yTop]);
  const top = yTop + kick;
  for (let i = 0; i <= 6; i++) {
    const phi = (ang * i) / 6;
    sheet.push([lipX + rc * Math.sin(phi), top - rc + rc * Math.cos(phi)]);
  }
  const E = sheet[sheet.length - 1]!;
  const footY = yTop - drop;
  // Tangent from E at angle -ang meets the blotter line.
  const cx = E[0] + (E[1] - footY) / Math.tan(ang);
  const C: Pt = [cx, footY];
  const F: Pt = [cx + fillet, footY - 0.02];
  const B0: Pt = [E[0] + (C[0] - E[0]) * 0.55, E[1] + (C[1] - E[1]) * 0.55];
  sheet.push(B0);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const x = (1 - t) ** 2 * B0[0] + 2 * (1 - t) * t * C[0] + t * t * F[0];
    const y = (1 - t) ** 2 * B0[1] + 2 * (1 - t) * t * C[1] + t * t * F[1];
    sheet.push([x, y]);
  }
  const landing: Pt[] = [F];
  for (let i = 1; i <= 8; i++) {
    const u = i / 8;
    landing.push([F[0] + u * hillLen, F[1] - hill * (1 - (1 - u) ** 2)]);
  }
  landing.push([F[0] + hillLen + 30, F[1] - hill]);
  return { sheet, landing };
}

export function blotterRoute(s: Shape): RouteDef & { lipX: number } {
  const { sheet, landing } = curlDrop(s);
  const all = [...sheet, ...landing.slice(1)];
  const D = -2.6;
  const last = all[all.length - 1]!;
  const pts: Pt[] = [[all[0]![0], D], [last[0], D], ...[...all].reverse()];
  const pieces = [{ id: 'all', name: 'blotter', material: 'blotter' as const, pts }];
  return {
    ...ENVELOPE_LIP,
    id: 'blotter-test',
    windTicks: 960,
    pieces,
    arch: { x: last[0] - 6, y: last[1] + 0.8, w: 1.4, h: 1.6 },
    killY: -8,
    bounds: { x0: -8, x1: last[0], y0: -5, y1: 5 },
    lipX: s.lipX,
    lampStart: Number(process.env.LAMP ?? 0),
  };
}

export function runPolicy(route: RouteDef & { lipX: number }, bp: Blueprint, coastFrom: number, coastTo: number, maxTicks = 60 * 40) {
  const sim = new Sim(route, bp);
  let peak = 0;
  let peakTick = 0;
  let forkMax = 0;
  let lipSpeed = 0;
  let crackAt = '';
  let lipPassed = false;
  while (sim.outcome === 'running' && sim.tick < maxTicks) {
    const x = sim.chassisPose().x;
    const drive = !(x > coastFrom && x < coastTo);
    const ev = sim.step({ drive, lamp: 0 });
    const win = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
    const s = Math.hypot(win[0]!, win[1]!);
    if (sim.tick > 20 && s > peak) {
      peak = s;
      peakTick = sim.tick;
    }
    for (const f of sim.rig.forks) forkMax = Math.max(forkMax, f.joint.getJointTranslation());
    if (!lipPassed && x > route.lipX) {
      lipPassed = true;
      lipSpeed = sim.rig.chassis.getLinearVelocity().length();
    }
    for (const e of ev) if (e.type === 'crack' || e.type === 'snuff') crackAt += `${e.type}@${e.x.toFixed(1)}(${e.power.toFixed(1)}) `;
    if (sim.atRest && sim.tick > 300) break;
  }
  return { sim, peak, peakTick, forkMax, lipSpeed, crackAt };
}

const nums = (k: string, d: string) => (process.env[k] ?? d).split(',').map(Number);

test.skipIf(!process.env.EXPLORE)('blotter sweep', () => {
  for (const name of Object.keys(BUILDS)) {
    const c = findConflicts(BUILDS[name]!);
    if (c.length) log('ILLEGAL', name, c.map((x) => x.reason).join(','));
  }
  const only = process.env.ONLY?.split(',');
  const coasts = nums('COAST', '9,11');
  for (const K of nums('FK', '260'))
    for (const C of nums('FC', '9'))
     for (const PRE of nums('PRE', '0'))
      for (const drop of nums('DROP', '1.0'))
        for (const kick of nums('KICK', '0.12'))
          for (const rc of nums('RC', '0.4'))
            for (const angD of nums('ANG', '55'))
              for (const approach of nums('APP', '0.3')) {
                (CART_TUNING as { forkK: number }).forkK = K;
                (CART_TUNING as { forkC: number }).forkC = C;
                (CART_TUNING as { forkPreload: number }).forkPreload = PRE;
                (CART_TUNING as { forkRebound: number }).forkRebound = Number(process.env.FR ?? 8);
                const shape: Shape = { lipX: 13, kick, drop, rc, ang: (angD * Math.PI) / 180, fillet: Number(process.env.FIL ?? 1.2), hill: 0.4, hillLen: 8, approach };
                const route = blotterRoute(shape);
                log(`--- K${K} C${C} P${PRE} drop ${drop} kick ${kick} rc ${rc} ang ${angD} app ${approach}`);
                for (const [name, bp] of Object.entries(BUILDS)) {
                  if (only && !only.includes(name)) continue;
                  const policies: [string, number, number][] = [['full', 999, 999], ...coasts.map((c) => [`coast ${c}`, c, 16] as [string, number, number])];
                  for (const [cn, c0, c1] of policies) {
                    const r = runPolicy(route, bp, c0, c1);
                    log(
                      `${name.padEnd(17)} ${cn.padEnd(9)} ${r.sim.outcome.padEnd(9)} cracks=${r.sim.cracks} peak=${r.peak.toFixed(2)}@${(r.peakTick / 60).toFixed(1)}s lipV=${r.lipSpeed.toFixed(2)} fork=${r.forkMax.toFixed(3)} x=${r.sim.chassisPose().x.toFixed(1)} ${r.crackAt}${r.sim.outcome === 'failed' ? r.sim.failReason : r.sim.outcome === 'running' ? r.sim.describeRest() : ''}`,
                    );
                  }
                }
              }
});

test.skipIf(!process.env.TRACE)('blotter trace', () => {
  (CART_TUNING as { forkK: number }).forkK = Number(process.env.FK ?? 600);
  (CART_TUNING as { forkC: number }).forkC = Number(process.env.FC ?? 20);
  (CART_TUNING as { forkPreload: number }).forkPreload = Number(process.env.PRE ?? 15);
  (CART_TUNING as { forkRebound: number }).forkRebound = Number(process.env.FR ?? 8);
  const shape: Shape = { lipX: 13, kick: Number(process.env.KICK ?? 0), drop: Number(process.env.DROP ?? 0.45), rc: Number(process.env.RC ?? 0.45), ang: (Number(process.env.ANG ?? 80) * Math.PI) / 180, fillet: Number(process.env.FIL ?? 0.4), hill: Number(process.env.HILL ?? 0.4), hillLen: 8, approach: Number(process.env.APP ?? 0.3) };
  const route = { ...blotterRoute(shape), lampStart: Number(process.env.LAMP ?? 0) };
  const c0 = Number(process.env.COAST ?? 999);
  const sim = new Sim(route, BUILDS[process.env.TRACE!]!);
  while (sim.tick < 60 * 12 && sim.outcome === 'running') {
    const x0 = sim.chassisPose().x;
    const ev = sim.step({ drive: !(x0 > c0 && x0 < 16), lamp: 0 });
    const x = sim.chassisPose().x;
    if (x < 12.5 || x > 17) continue;
    const lv = sim.rig.lamp.getLinearVelocity();
    const win = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow;
    const d = win[win.length - 1]!;
    const tc = (sim as unknown as { tickContacts: { part: string; impulse: number; terrain: string }[] }).tickContacts;
    const parts = new Map<string, number>();
    for (const c of tc) parts.set(c.part, (parts.get(c.part) ?? 0) + c.impulse);
    log(
      `t${sim.tick} x=${x.toFixed(2)} a=${((sim.chassisPose().a * 180) / Math.PI).toFixed(0)} lv=(${lv.x.toFixed(1)},${lv.y.toFixed(1)}) dv=${Math.hypot(d.x, d.y).toFixed(2)} fork=${sim.rig.forks.map((f) => f.joint.getJointTranslation().toFixed(3)).join(',')} ${[...parts].map(([p, i]) => `${p}:${i.toFixed(1)}`).join(' ')} ${ev.map((e) => e.type).join(',')}`,
    );
  }
});

test.skipIf(!process.env.GRID)('blotter grid', () => {
  const builds = (process.env.B ?? 'rigid k0r4,shoe k0 f4,shoe k0 f3,shoe rear f0 k4,shoe rear f1 k4,sprung key f0 r4,direct k0 s4').split(',');
  for (const K of nums('FK', '150,300'))
    for (const C of nums('FC', '3,8'))
      for (const PRE of nums('PRE', '8,16'))
        for (const angD of nums('ANG', '55'))
          for (const drop of nums('DROP', '1.0'))
            for (const L of nums('LAMP', '-0.72,0')) {
              (CART_TUNING as { forkK: number }).forkK = K;
              (CART_TUNING as { forkC: number }).forkC = C;
              (CART_TUNING as { forkPreload: number }).forkPreload = PRE;
                (CART_TUNING as { forkRebound: number }).forkRebound = Number(process.env.FR ?? 8);
              const route = { ...blotterRoute({ lipX: 13, kick: Number(process.env.KICK ?? 0.12), drop, rc: Number(process.env.RC ?? 0.4), ang: (angD * Math.PI) / 180, fillet: Number(process.env.FIL ?? 1.2), hill: Number(process.env.HILL ?? 0.4), hillLen: 8, approach: Number(process.env.APP ?? 0.3) }), lampStart: L };
              const cells = builds.map((b) => {
                const r = runPolicy(route, BUILDS[b]!, 999, 999);
                const tag = r.sim.outcome === 'delivered' ? (r.sim.cracks ? 'C' : 'ok') : r.sim.outcome === 'failed' ? 'X' : '-';
                return `${tag}${r.peak.toFixed(1)}/${r.forkMax.toFixed(2)}`;
              });
              const coast = runPolicy(route, BUILDS[process.env.CB ?? "rigid k0r4"]!, Number(process.env.COAST ?? 11), 16);
              log(`K${K} C${C} P${PRE} ang${angD} d${drop} L${L} | ${cells.map((c) => c.padEnd(12)).join('')} | coast ${coast.sim.outcome === "delivered" ? (coast.sim.cracks ? "C" : "ok") : "-"}${coast.peak.toFixed(1)} lipV ${coast.lipSpeed.toFixed(2)} / ${coast.sim.outcome === "running" ? coast.sim.describeRest() : ""}`);
            }
});

test.skipIf(!process.env.REAL)('blotter real route', async () => {
  const { BLOTTER_DROP } = await import('../src/data/routes');
  const builds = ['rigid k0r4', 'rigid k1r4', 'shoe rear f0 k4', 'shoe rear f1 k4', 'direct rear s0 k4', 'sprung key f0 r4', 'shoe k0 f4', 'direct k0 s4'];
  // [name, coastFromX, lampFwdFromX, lampTicks]
  const pols: [string, number, number, number][] = [
    ['full', 999, 999, 0],
    ['full lamp0', 999, 8, 15],
    ['coast8', 8, 999, 0],
    ['coast8 lamp0', 8, 8, 15],
    ['coast10 lamp0', 10, 8, 15],
    ['coast6 lamp0', 6, 6, 15],
    ['full lamp+', 999, 8, 22],
  ];
  for (const b of builds) {
    if (findConflicts(BUILDS[b]!).length) {
      log(b, 'ILLEGAL');
      continue;
    }
    for (const [pn, cx, lx, lt] of pols) {
      const sim = new Sim(BLOTTER_DROP, BUILDS[b]!);
      let peak = 0;
      let fork = 0;
      let tCoast = -1;
      let tLamp = -1;
      let lampLeft = lt;
      let crack = '';
      while (sim.outcome === 'running' && sim.tick < 60 * 40) {
        const x = sim.chassisPose().x;
        const coast = x > cx && x < 16;
        if (coast && tCoast < 0) tCoast = sim.tick;
        let lamp: -1 | 0 | 1 = 0;
        if (x > lx && lampLeft > 0) {
          if (tLamp < 0) tLamp = sim.tick;
          lamp = 1;
          lampLeft--;
        }
        const ev = sim.step({ drive: !coast, lamp });
        for (const e of ev) if (e.type === 'crack' || e.type === 'snuff') crack += `${e.type}@${e.x.toFixed(1)} `;
        const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow.reduce((a, d) => [a[0] + d.x, a[1] + d.y], [0, 0]);
        if (sim.tick > 20) peak = Math.max(peak, Math.hypot(w[0]!, w[1]!));
        for (const f of sim.rig.forks) fork = Math.max(fork, f.joint.getJointTranslation());
        if (sim.atRest && sim.tick > 300) break;
      }
      log(
        `${b.padEnd(18)} ${pn.padEnd(14)} ${sim.outcome.padEnd(9)} cracks=${sim.cracks} peak=${peak.toFixed(2)} fork=${fork.toFixed(2)} tCoast=${tCoast} tLamp=${tLamp} t=${sim.tick} wind=${sim.wind.toFixed(2)} ${crack}${sim.outcome === 'failed' ? sim.failReason : sim.outcome === 'running' ? sim.describeRest() : ''}`,
      );
    }
  }
});

test.skipIf(!process.env.STALL)('where it stalls', async () => {
  const { BLOTTER_DROP } = await import('../src/data/routes');
  const sim = new Sim(BLOTTER_DROP, BUILDS[process.env.STALL!]!);
  let lastX = -99;
  for (let i = 0; i < 900; i++) {
    sim.step({ drive: true, lamp: 0 });
    const p = sim.chassisPose();
    if (i % 30 === 0 || Math.abs(p.x - lastX) > 2) {
      const tc = (sim as unknown as { tickContacts: { part: string; terrain: string; nx: number; ny: number; x: number; y: number }[] }).tickContacts;
      log(`t${sim.tick} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} a=${((p.a * 180) / Math.PI).toFixed(1)} v=${sim.rig.chassis.getLinearVelocity().x.toFixed(2)} ${tc.map((c) => `${c.part}/${c.terrain}@${c.x.toFixed(2)},${c.y.toFixed(2)} n(${c.nx.toFixed(2)},${c.ny.toFixed(2)})`).join(' ')}`);
      lastX = p.x;
    }
  }
});

test.skipIf(!process.env.SCRIPTS)('blotter scripts', async () => {
  const { BLOTTER_DROP } = await import('../src/data/routes');
  const { runScript } = await import('../src/sim/replay');
  const k0r4 = BUILDS['rigid k0r4']!;
  for (const c of [180, 200, 220, 240, 260]) {
    for (const back of [330, 360, 400, 450]) {
      const r = runScript(BLOTTER_DROP, k0r4, [[0, 1, 0], [c, 0, 1], [c + 15, 0, 0], [back, 1, 0]]);
      log(`coast@${c} lamp0 resume@${back}: ${r.outcome} cracks=${r.cracks} wind=${r.wind.toFixed(2)} t=${r.ticks} ${r.reason}`);
    }
  }
  for (const c of [180, 200, 220, 240]) {
    const r = runScript(BLOTTER_DROP, k0r4, [[0, 1, 0], [c, 1, 1], [c + 15, 1, 0]]);
    log(`full lamp0@${c}: ${r.outcome} cracks=${r.cracks} ${r.reason}`);
    const r2 = runScript(BLOTTER_DROP, k0r4, [[0, 1, 0], [c, 0, 0], [400, 1, 0]]);
    log(`coast@${c} lamp back: ${r2.outcome} cracks=${r2.cracks} ${r2.reason}`);
  }
});

test.skipIf(!process.env.ENTRY)('landing entry velocity', async () => {
  const { BLOTTER_DROP } = await import('../src/data/routes');
  for (const b of ['rigid k0r4', 'shoe rear f0 k4']) {
    const sim = new Sim(BLOTTER_DROP, BUILDS[b]!);
    const hist: string[] = [];
    while (sim.tick < 900 && sim.outcome === 'running') {
      const v = sim.rig.lamp.getLinearVelocity();
      const a = sim.chassisPose().a;
      const ev = sim.step({ drive: true, lamp: 0 });
      hist.push(`t${sim.tick} x=${sim.chassisPose().x.toFixed(2)} lampV=(${v.x.toFixed(2)},${v.y.toFixed(2)}) a=${((a * 180) / Math.PI).toFixed(0)} ${ev.map((e) => e.type).join(',')}`);
      if (sim.chassisPose().x > 16) break;
    }
    log('==', b);
    hist.forEach((h, i) => {
      if (/crack|snuff|knock/.test(h)) for (const k of hist.slice(Math.max(0, i - 3), i + 1)) log(k);
    });
  }
});
