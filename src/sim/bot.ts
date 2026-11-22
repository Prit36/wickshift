// A simple driver used by the tests to prove courses are passable and to
// calibrate shift targets. It plays through the same Shift API as the game.
import { groundAt } from './terrain';
import { GRAVITY } from './sim';
import { Shift, type ShiftConfig, type ShiftInput } from './shift';

export interface BotOpts {
  /** Attempt backflips on jumps with enough air. */
  flips?: boolean;
  /** Post at every window instead of greedily skipping. */
  postEvery?: boolean;
  maxTicks?: number;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function botInput(sh: Shift, opts: BotOpts, mem: { flipTarget: number | null; a0: number }): ShiftInput {
  const sim = sh.sim;
  const p = sim.pos;
  const ahead = p.x + Math.max(0.5, sim.speed * 0.25);
  const g1 = groundAt(sh.course, ahead - 0.6);
  const g2 = groundAt(sh.course, ahead + 0.6);
  const slope = g1 !== null && g2 !== null ? Math.atan2(g2 - g1, 1.2) : 0;
  let gas = true;
  let brake = false;
  if (sim.airborne) {
    const height = p.y - (groundAt(sh.course, p.x) ?? sh.course.killY);
    void height;
    if (opts.flips && mem.flipTarget === null && sim.airTicks === 6 && sh.crashTimer === 0) {
      const v = sim.chassis.getLinearVelocity();
      // predict when the ballistic arc meets the desk
      let tLand = 3;
      for (let t = 0.05; t < 3; t += 0.03) {
        const x = p.x + v.x * t;
        const y = p.y + v.y * t - 0.5 * GRAVITY * t * t;
        const g = groundAt(sh.course, x);
        if (g !== null && y - 0.5 < g) {
          tLand = t;
          break;
        }
      }
      const turns = Math.floor((tLand * sim.spec.airRot * 0.92 - 0.4) / (Math.PI * 2));
      if (turns >= 1) mem.flipTarget = sim.angle + Math.PI * 2 * Math.min(turns, 2) - 0.25;
    }
    if (mem.flipTarget !== null) {
      const remaining = mem.flipTarget - sim.angle;
      if (remaining > 0.9) {
        gas = true;
      } else {
        mem.flipTarget = null;
        mem.a0 = 1;
      }
    }
    if (mem.flipTarget === null) {
      const rel = wrap(sim.angle - slope);
      gas = rel < -0.12;
      brake = rel > 0.12;
    }
  } else {
    mem.flipTarget = null;
    const rel = wrap(sim.angle - slope);
    if (rel > 0.5) gas = false;
    if (rel > 0.75) brake = true;
    if (rel < -0.6) gas = true;
  }
  const w = sh.windowInRange();
  const post = !!w && sh.flame.alive && (opts.postEvery || sh.flame.sparks >= 3 || w.high);
  return { gas, brake, post };
}

export function runBot(cfg: ShiftConfig, opts: BotOpts = {}): { sh: Shift; ticks: number; crashes: number; reasons: string[]; crashX: number[] } {
  const sh = new Shift(cfg);
  const mem = { flipTarget: null as number | null, a0: 0 };
  let crashes = 0;
  const reasons: string[] = [];
  const crashX: number[] = [];
  const max = opts.maxTicks ?? 60 * 240;
  let stuck = 0;
  let lastX = 0;
  let t = 0;
  for (; t < max && !sh.done; t++) {
    const inp = botInput(sh, opts, mem);
    sh.step(inp);
    for (const e of sh.events) if (e.type === 'crash' || e.type === 'blowout') {
      if (e.type === 'blowout') { reasons.push('B'); continue; }
      crashes++;
      reasons.push(e.reason[0]);
      crashX.push(Math.round(e.x));
    }
    if (t % 120 === 0) {
      if (Math.abs(sh.sim.pos.x - lastX) < 0.5 && sh.crashTimer === 0) stuck++;
      else stuck = 0;
      lastX = sh.sim.pos.x;
      if (stuck > 5) break;
    }
  }
  return { sh, ticks: t, crashes, reasons, crashX };
}
