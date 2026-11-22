import { expect, it } from 'vitest';
import { runBot, botInput } from '../src/sim/bot';
import { Shift, SHIFTS, RESPAWN_SPEED } from '../src/sim/shift';

const SEEDS = Number(process.env.SWEEP ?? 6);

it('respawning at any ground window drives on to the next one', () => {
  const bad: string[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (let shift = 1; shift <= SHIFTS; shift++) {
      const probe = new Shift({ seed: seed * 7, shift, target: 1, stamps: [], parts: [], glasses: 99, rule: null });
      const ground = probe.course.windows.filter((w) => !w.high);
      for (let i = 0; i < ground.length - 1; i++) {
        const w = ground[i];
        const next = ground[i + 1];
        const sh = new Shift({ seed: seed * 7, shift, target: 1, stamps: [], parts: [], glasses: 99, rule: null });
        sh.sim.spawn(w.x, w.y, RESPAWN_SPEED);
        const mem = { flipTarget: null as number | null, a0: 0 };
        let crashed = false;
        for (let t = 0; t < 60 * 40 && sh.sim.pos.x < next.x && !sh.done; t++) {
          sh.step(botInput(sh, {}, mem));
          if (sh.events.some((e) => e.type === 'crash')) {
            crashed = true;
            break;
          }
        }
        if (crashed || sh.sim.pos.x < next.x - 2) bad.push(`seed ${seed * 7} shift ${shift} window@${w.x.toFixed(0)} -> ${crashed ? 'crash' : 'stuck'} at ${sh.sim.pos.x.toFixed(0)}`);
      }
    }
  }
  expect(bad).toEqual([]);
});

it('wide seed sweep: every shift finishes', () => {
  const bad: string[] = [];
  let highs = 0;
  let highReached = 0;
  let runs = 0;
  let flipLoops = 0;
  for (let seed = 1; seed <= SEEDS * 5; seed++) {
    for (let shift = 1; shift <= SHIFTS; shift++) {
      const cfg = { seed: seed * 13 + 5, shift, target: 1, stamps: [], parts: [], glasses: 99, rule: null };
      // a careful driver must always get through; the flipping driver is only used to see high windows get reached
      const careful = runBot(cfg);
      if (!careful.sh.done || careful.crashes > 1) bad.push(`careful seed ${cfg.seed} shift ${shift}: done=${careful.sh.done} crashes=${careful.crashes}@${careful.crashX.join(',')}`);
      const r = runBot(cfg, { flips: true });
      runs++;
      // the flipping bot retries the same flip after each respawn, so it can loop; keep that rare
      if (!r.sh.done) flipLoops++;
      const hw = r.sh.course.windows.filter((w) => w.high);
      highs += hw.length;
      highReached += hw.filter((w) => r.sh.lit.has(w.id)).length;
    }
  }
  if (process.env.SWEEP) console.log(`high windows ${highs}, lit by bot ${highReached}, flip-bot loops ${flipLoops}/${runs}`);
  expect(bad).toEqual([]);
  expect(flipLoops / runs).toBeLessThan(0.02);
  expect(highReached / Math.max(1, highs)).toBeGreaterThan(0.4);
});
