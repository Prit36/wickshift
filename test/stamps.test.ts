// One check for every stamp, so a stamp that silently does nothing fails here.
import { describe, expect, it } from 'vitest';
import { Shift } from '../src/sim/shift';
import { botInput } from '../src/sim/bot';
import { generateCourse } from '../src/sim/terrain';
import { freshStampState, STAMP_IDS, type StampId } from '../src/sim/stamps';
import { cfg, ctx, flame, win } from './helpers';

/** A delivery holding these stamps, with private methods reachable for set-ups. */
function shift(album: StampId[], seed = 1) {
  const sh = new Shift(cfg(seed, 2, 'local', { stamps: album, state: freshStampState() }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sh, p: sh as any };
}

const tested = new Set<StampId>();
function stamp(id: StampId, fn: () => void): void {
  tested.add(id);
  it(id, fn);
}

describe('trick stamps', () => {
  stamp('loop', () => {
    expect(flame(['loop']).award('flip', 'Backflip', 200, 'first').sparks).toBe(2);
    expect(flame().award('flip', 'Backflip', 200, 'first').sparks).toBe(1);
  });
  stamp('grease', () => {
    const p = flame(['grease']).award('grind', 'Grind', 100, 'first');
    expect([p.heat, p.sparks]).toEqual([200, 2]);
  });
  stamp('crumbs', () => {
    const p = flame(['crumbs']).award('smash', 'Smash', 100, 'first', { cubes: 10 });
    expect([p.heat, p.sparks]).toEqual([200, 3]);
  });
  stamp('hoopla', () => {
    expect(flame(['hoopla']).award('hoop', 'Hoop', 200, 1).sparks).toBe(3);
  });
  stamp('kite', () => {
    const p = flame(['kite']).award('air', 'Huge Air', 100, 'first');
    expect([p.heat, p.sparks]).toEqual([200, 3]);
    expect(flame(['kite']).award('air', 'Air', 100, 'first').sparks).toBe(1);
  });
  stamp('tailwind', () => {
    expect(flame(['tailwind']).award('strike', 'Strike', 80, 'first').sparks).toBe(3);
    // the striker strip boosts harder and longer
    const boost = (album: StampId[], seed: number) => {
      const { sh } = shift(album, seed);
      const calls: number[][] = [];
      sh.sim.boost = (v: number, t = 80) => void calls.push([v, t]);
      const mem = { flipTarget: null as number | null, a0: 0 };
      for (let t = 0; t < 60 * 90 && !sh.done && !calls.length; t++) sh.step(botInput(sh, {}, mem));
      return calls[0];
    };
    // the bot sometimes jumps clean over a strip, so find a course where it drives across one
    let seed = 1;
    while (!(generateCourse({ seed, route: 2, kind: 'local' }).features.some((f) => f.kind === 'striker') && boost([], seed))) seed++;
    expect(boost([], seed)).toEqual([16, 80]);
    expect(boost(['tailwind'], seed)).toEqual([19, 110]);
  });
  stamp('redLetter', () => {
    const f = flame(['redLetter']);
    expect(f.letter().heat).toBe(120);
    f.letter();
    f.letter();
    expect(f.letter().sparks).toBe(1);
    expect(f.sparks).toBe(2);
  });
  stamp('daredevil', () => {
    const p = flame(['daredevil']).award('landing', 'Daredevil', 150, 'first');
    expect([p.heat, p.sparks]).toEqual([450, 3]);
  });
  stamp('backhand', () => {
    const f = flame(['backhand']);
    const p = f.award('flip', 'Backflip', 200, 'first');
    expect([p.heat, p.sparks]).toEqual([400, 2]);
    f.award('flip', 'Frontflip', 200, 'first');
    expect(f.sparks).toBe(1);
  });
  stamp('sorter', () => {
    const f = flame(['sorter']);
    f.award('flip', 'Backflip', 200, 'first');
    expect(f.award('flip', 'Backflip', 200, 'first').heat).toBe(200);
  });
});

describe('post stamps', () => {
  const posted = (album: StampId[], heat: number, sparks: number, c = ctx()) => {
    const f = flame(album);
    f.heat = heat;
    f.sparks = sparks;
    return f.post(c).value;
  };
  stamp('wax', () => expect(posted(['wax'], 100, 1)).toBe(400));
  stamp('bigEnvelope', () => expect(posted(['bigEnvelope'], 100, 1)).toBe(350));
  stamp('pigeonhole', () => {
    expect(posted(['pigeonhole'], 100, 1, ctx({ windowsLit: 3 }))).toBe(280);
    expect(posted(['pigeonhole'], 100, 1)).toBe(100);
  });
  stamp('airmail', () => {
    expect(posted(['airmail'], 100, 2, ctx({ airborne: true }))).toBe(400);
    expect(posted(['airmail'], 100, 2)).toBe(200);
  });
  stamp('expressSeal', () => {
    expect(posted(['expressSeal'], 100, 2, ctx({ high: true }))).toBe(600);
    expect(posted(['expressSeal'], 100, 2)).toBe(200);
  });
  stamp('assorted', () => {
    const f = flame(['assorted']);
    for (const fam of ['flip', 'air', 'grind'] as const) f.award(fam, fam, 100, 0);
    expect(f.post(ctx()).steps).toHaveLength(0);
    f.award('hoop', 'Hoop', 100, 0);
    expect(f.post(ctx()).value).toBe(800);
  });
  stamp('purist', () => {
    const f = flame(['purist']);
    f.award('flip', 'Backflip', 100, 0);
    f.award('flip', 'Frontflip', 100, 0);
    expect(f.post(ctx()).value).toBe(600);
    f.award('air', 'Air', 100, 0);
    expect(f.post(ctx()).value).toBe(300);
  });
  stamp('doubleWick', () => {
    expect(posted(['doubleWick'], 10, 10)).toBe(200);
    expect(posted(['doubleWick'], 10, 9)).toBe(90);
    // a Wax Seal in front can carry you over the line
    expect(posted(['wax', 'doubleWick'], 10, 7)).toBe(200);
  });
  stamp('lastPost', () => {
    expect(posted(['lastPost'], 100, 1, ctx({ final: true }))).toBe(300);
    expect(posted(['lastPost'], 100, 1)).toBe(100);
  });
  stamp('moonlighter', () => expect(posted(['moonlighter'], 100, 1, ctx({ pennies: 9 }))).toBe(300));
  stamp('midnightOil', () => {
    expect(posted(['midnightOil'], 100, 1)).toBe(300);
    expect(flame(['midnightOil']).fragility(1e9)).toBe(1);
  });
});

describe('stamps that grow', () => {
  stamp('collector', () => {
    const st = freshStampState();
    st.collector = 3;
    const f = flame(['collector'], undefined, st);
    f.heat = 10;
    expect(f.post(ctx()).value).toBe(40);
    // posting 8+ sparks grows it
    const { sh, p } = shift(['collector']);
    sh.flame.heat = 10;
    sh.flame.sparks = 8;
    p.post(win(), false);
    expect(sh.cfg.state.collector).toBe(2);
    sh.flame.heat = 10;
    p.post(win({ id: 901 }), false);
    expect(sh.cfg.state.collector).toBe(2);
  });
  stamp('bonfire', () => {
    const st = freshStampState();
    st.bonfire = 2;
    const f = flame(['bonfire'], undefined, st);
    f.heat = 100;
    f.sparks = 2;
    expect(f.post(ctx()).value).toBe(300);
    const clean = shift(['bonfire']);
    clean.p.finish(true);
    expect(clean.sh.cfg.state.bonfire).toBe(1);
    const broke = shift(['bonfire']);
    broke.sh.glassesBroken = 1;
    broke.p.finish(true);
    expect(broke.sh.cfg.state.bonfire).toBe(0);
  });
  stamp('nightOwl', () => {
    const { sh, p } = shift(['nightOwl']);
    sh.flame.heat = 10;
    p.post(win(), false);
    expect(sh.flame.sparks).toBe(2);
    sh.flame.heat = 10;
    p.post(win({ id: 901 }), false);
    expect(sh.flame.sparks).toBe(3);
  });
});

describe('risk and safety', () => {
  stamp('hotPotato', () => {
    const f = flame(['hotPotato']);
    f.heat = 100;
    f.tick(1, false);
    expect(f.heat).toBeCloseTo(105);
    f.heat = 150;
    f.sparks = 2;
    expect(f.fragility(1000)).toBe(1);
    const plain = flame();
    plain.heat = 150;
    plain.sparks = 2;
    expect(plain.fragility(1000)).toBeCloseTo(0.5);
  });
  stamp('postageDue', () => {
    const { sh } = shift(['postageDue']);
    const w = sh.course.windows.find((x) => !x.final)!;
    sh.flame.heat = 50;
    sh.sim.spawn(w.x + 4, w.y);
    sh.step({ gas: false, brake: false, post: false });
    const skip = sh.events.find((e) => e.type === 'skip');
    expect(skip && skip.type === 'skip' && skip.sparks).toBe(2);
    expect(sh.flame.sparks).toBe(3);
  });
  stamp('secondWind', () => {
    const { sh, p } = shift(['secondWind']);
    sh.flame.heat = 100;
    p.blowout(0, 0, 'landing');
    expect(sh.flame.heat).toBe(100);
    p.blowout(0, 0, 'landing');
    expect(sh.flame.heat).toBe(0);
  });
  stamp('tempered', () => {
    const f = flame(['tempered']);
    f.heat = 1e6;
    expect(f.fragility(100)).toBe(0);
    f.addSparks(50);
    expect(f.sparks).toBe(10);
  });
  stamp('lantern', () => {
    const { sh, p } = shift(['lantern']);
    sh.flame.heat = 100;
    sh.flame.sparks = 4;
    p.blowout(0, 0, 'tacks');
    expect([sh.flame.heat, sh.flame.sparks]).toEqual([50, 3]);
    const plain = shift([]);
    plain.sh.flame.heat = 100;
    plain.p.blowout(0, 0, 'tacks');
    expect(plain.sh.flame.heat).toBe(0);
  });
});

describe('money and rule benders', () => {
  stamp('pennyBlack', () => {
    const f = flame(['pennyBlack']);
    f.heat = 1;
    f.sparks = 6;
    expect(f.post(ctx()).pennies).toBe(1);
    f.sparks = 5;
    expect(f.post(ctx()).pennies).toBe(0);
  });
  stamp('purse', () => {
    const f = flame(['purse']);
    f.heat = 1;
    expect(f.post(ctx()).pennies).toBe(1);
    expect(f.post(ctx({ gold: true })).pennies).toBe(2);
  });
  stamp('carbon', () => {
    expect(flame(['carbon', 'loop']).award('flip', 'Backflip', 200, 'first').sparks).toBe(3);
    expect(flame(['carbon', 'loop']).count('loop')).toBe(2);
    expect(flame(['loop', 'carbon']).count('loop')).toBe(1);
  });

  it('the gold postbox pays more for a bigger flame, up to 4', () => {
    const f = flame();
    f.heat = 1;
    expect(f.post(ctx({ gold: true })).pennies).toBe(1);
    f.sparks = 7;
    expect(f.post(ctx({ gold: true })).pennies).toBe(3);
    f.sparks = 30;
    expect(f.post(ctx({ gold: true })).pennies).toBe(4);
  });
});

it('every stamp has a check', () => {
  expect([...tested].sort()).toEqual([...STAMP_IDS].sort());
});
