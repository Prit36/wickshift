// Tick-numbered input scripts: used by tests to reproduce runs exactly.
import type { RouteDef } from '../data/routeTypes';
import type { Blueprint } from '../workshop/blueprint';
import { Sim, type RunInput, type SimEvent } from './sim';

/** [fromTick, drive, lamp] segments; each holds until the next segment. */
export type InputScript = readonly (readonly [number, 0 | 1, -1 | 0 | 1])[];

export function inputAt(script: InputScript, tick: number): RunInput {
  let cur: RunInput = { drive: false, lamp: 0 };
  for (const [t, d, l] of script) {
    if (tick >= t) cur = { drive: d === 1, lamp: l };
    else break;
  }
  return cur;
}

export interface RunSummary {
  outcome: string;
  reason: string;
  ticks: number;
  wind: number;
  cracks: number;
  maxX: number;
  /** Highest chassis centre reached (tells the high counter from the shelf). */
  maxY: number;
  maxPitch: number;
  flatPitch: number;
  everLifted: boolean;
  roller: string | null;
  events: { tick: number; e: SimEvent }[];
  finalX: number;
}

export function runScript(route: RouteDef, bp: Blueprint, script: InputScript, maxTicks = 60 * 60): RunSummary {
  const sim = new Sim(route, bp);
  const events: { tick: number; e: SimEvent }[] = [];
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxPitch = 0;
  let flatPitch = 0;
  while (sim.outcome === 'running' && sim.tick < maxTicks) {
    const ev = sim.step(inputAt(script, sim.tick));
    for (const e of ev) events.push({ tick: sim.tick, e });
    const p = sim.chassisPose();
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxPitch = Math.max(maxPitch, p.a);
    if (p.x < route.start.x + 4) flatPitch = Math.max(flatPitch, p.a);
    if (sim.atRest && sim.tick > 240) {
      const lastMove = events.filter((x) => x.e.type === 'rest').pop();
      if (lastMove && sim.tick - lastMove.tick > 60) break;
    }
  }
  const reason = sim.outcome === 'failed' ? sim.failReason : sim.outcome === 'running' ? sim.describeRest() : '';
  return {
    outcome: sim.outcome,
    reason,
    ticks: sim.tick,
    wind: sim.wind,
    cracks: sim.cracks,
    maxX,
    maxY,
    maxPitch,
    flatPitch,
    everLifted: sim.everLifted,
    roller: sim.rollerPart,
    events,
    finalX: sim.chassisPose().x,
  };
}
