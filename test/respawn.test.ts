// After a crash you respawn at the last ground window. Every one of those must let you drive on.
import { expect, it } from 'vitest';
import { Shift, RESPAWN_SPEED } from '../src/sim/shift';
import { botInput } from '../src/sim/bot';
import { KINDS } from '../src/sim/night';
import { cfg } from './helpers';

it('every ground window is a safe place to respawn', () => {
  const bad: string[] = [];
  for (let route = 1; route <= 4; route++)
    for (const kind of KINDS)
      for (let seed = 1; seed <= 3; seed++) {
        const probe = new Shift(cfg(seed, route, kind));
        const spots = probe.course.windows.filter((w) => !w.final && !w.high);
        for (const w of spots) {
          const sh = new Shift(cfg(seed, route, kind));
          sh.sim.spawn(w.x, w.y, RESPAWN_SPEED);
          const goal = w.x + 25;
          const mem = { flipTarget: null as number | null, a0: 0 };
          let crashed = false;
          for (let t = 0; t < 60 * 20 && !sh.done && sh.sim.pos.x < goal; t++) {
            sh.step(botInput(sh, {}, mem));
            if (sh.events.some((e) => e.type === 'crash')) crashed = true;
          }
          if (crashed || (!sh.done && sh.sim.pos.x < goal)) bad.push(`r${route} ${kind} seed ${seed} window@${w.x.toFixed(0)} crashed=${crashed} x=${sh.sim.pos.x.toFixed(0)}`);
        }
      }
  expect(bad).toEqual([]);
}, 300000);
