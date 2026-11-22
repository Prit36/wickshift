// Test helpers: write builds tersely and replay a timed input script on a level.
import { Run, NO_INPUT, type RunInput } from '../src/sim/run';
import type { Blueprint, Pin, Placed } from '../src/sim/blueprint';
import type { LevelDef } from '../src/sim/level';
import { PARTS } from '../src/sim/parts';

/** Build from a path of pins ("0,0 3,0 3,1") per stick chain, and parts as "lamp@3,1 rocket@3,0>0". */
export function build(chains: string[], parts: string[]): Blueprint {
  const pin = (s: string): Pin => s.split(',').map(Number) as Pin;
  const sticks = [];
  for (const c of chains) {
    const pins = c.trim().split(/\s+/).map(pin);
    for (let i = 1; i < pins.length; i++) sticks.push({ a: pins[i - 1], b: pins[i] });
  }
  const placed: Placed[] = parts.map((s) => {
    const [kind, rest] = s.split('@');
    const [at, dir] = rest.split('>');
    const k = kind as Placed['kind'];
    return { kind: k, at: pin(at), dir: dir !== undefined ? Number(dir) : PARTS[k].dir };
  });
  return { sticks, parts: placed };
}

/** Script: [fromSecond, toSecond, controls] ranges; 'springs' fires once at fromSecond. */
export type Script = [number, number, (keyof RunInput)[]][];

export function play(level: LevelDef, bp: Blueprint, script: Script = [], maxSec = 40): Run {
  const run = new Run(level, bp);
  const max = Math.round(maxSec * 60);
  let after = 0;
  for (let t = 0; t < max; t++) {
    const s = t / 60;
    const inp: RunInput = { ...NO_INPUT };
    for (const [a, b, keys] of script) {
      for (const k of keys) {
        if (k === 'springs') {
          if (t === Math.round(a * 60)) inp.springs = true;
        } else if (s >= a && s < b) inp[k] = true;
      }
    }
    run.step(inp);
    if (run.outcome) after++;
    if (after > 30) break;
  }
  return run;
}

export const describeRun = (r: Run) =>
  `${r.outcome ?? 'none'}${r.outCause ? '(' + r.outCause + ')' : ''} flame=${r.flame.toFixed(2)} t=${r.time.toFixed(1)}s letter=${r.letterGot} lamp=(${r.lampPos().x.toFixed(1)},${r.lampPos().y.toFixed(1)}) peak=${r.peakKnock.toFixed(2)}`;

/** Closed-loop play: a policy reads the run each tick, like a player watching the screen. */
export function playBy(level: LevelDef, bp: Blueprint, pol: (r: Run) => Partial<RunInput>, maxSec = 40): Run {
  const run = new Run(level, bp);
  let after = 0;
  for (let t = 0; t < maxSec * 60 && after <= 30; t++) {
    run.step({ ...NO_INPUT, ...pol(run) });
    if (run.outcome) after++;
  }
  return run;
}

/** Fires `key` for `sec` seconds each time the front wheel gets within `dist` of the next obstacle at `xs`. */
export function nearObstacle(xs: number[], dist: number, key: keyof RunInput, sec: number): (r: Run) => Partial<RunInput> {
  let on = -1;
  return (r) => {
    const fx = Math.max(...r.wheels.map((w) => w.body.getPosition().x)) + 0.25;
    const next = xs.find((h) => h > fx - 0.55) ?? Infinity;
    const close = next - fx < dist;
    if (close && (on < 0 || r.tick - on > sec * 60 + 60)) on = r.tick;
    const fire = on >= 0 && r.tick - on < Math.max(1, sec * 60);
    return { drive: true, [key]: key === 'springs' ? r.tick === on : fire };
  };
}

/** Drive; shoot the hook once the lamp passes `latchX`; let go once past the anchor by `past` and no longer rising fast, or once over `overX` (a player lets go over the landing). */
export function hookSwing(latchX: number, past: number, overX = Infinity, extra: (r: Run) => Partial<RunInput> = () => ({})): (r: Run) => Partial<RunInput> {
  let shot = false;
  let done = false;
  return (r) => {
    const base = { drive: true, ...extra(r) };
    const p = r.lampPos();
    const h = r.hooks[0];
    if (!shot && p.x >= latchX) {
      shot = true;
      return { ...base, hooks: true };
    }
    const an = h?.joint ? r.hookAnchor(h) : null;
    const v = r.main.getLinearVelocity();
    if (!done && an && ((p.x > an.x + past && v.x > 0 && v.y < 0.5) || p.x > overX)) {
      done = true;
      return { ...base, hooks: true };
    }
    return base;
  };
}

/** Swing a row of gaps: shoot once the lamp passes latch[i]; let go once past the anchor by `past` and no longer rising, or past over[i]. */
export function hookSwings(latch: number[], past: number, over: number[]): (r: Run) => Partial<RunInput> {
  let i = 0;
  return (r) => {
    const p = r.lampPos();
    const h = r.hooks.find((q) => q.joint);
    const k = i >> 1;
    if (k < latch.length) {
      if (i % 2 === 0 && p.x > latch[k]) {
        i++;
        return { drive: true, hooks: true };
      }
      const an = h ? r.hookAnchor(h) : null;
      const v = r.main.getLinearVelocity();
      if (i % 2 === 1 && an && ((p.x > an.x + past && v.x > 0 && v.y < 0.5) || p.x > over[k])) {
        i++;
        return { drive: true, hooks: true };
      }
    }
    return { drive: true };
  };
}

/** Fire `key` for `sec` once the front wheel comes within `dist` of each edge in turn. */
export function atEdges(xs: number[], dist: number, key: keyof RunInput, sec: number): (r: Run) => Partial<RunInput> {
  let i = 0;
  let on = -1;
  return (r) => {
    const fx = Math.max(...r.wheels.map((q) => q.body.getPosition().x));
    if (i < xs.length && fx > xs[i] - dist) {
      i++;
      on = r.tick;
    }
    return { drive: true, [key]: on >= 0 && r.tick - on < sec * 60 };
  };
}
