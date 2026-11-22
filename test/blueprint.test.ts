import { describe, expect, it } from 'vitest';
import { emptyBlueprint, launchProblem, partProblem, removeStick, stickProblem, type Blueprint } from '../src/sim/blueprint';
import { build } from './play';

const kit = { stick: 3, lamp: 1, wheel: 2, rocket: 1 };
const area = { cols: 6, rows: 3 };

describe('bench rules', () => {
  it('lays matchsticks between pins, up to three across and one up', () => {
    const b = emptyBlueprint();
    expect(stickProblem(b, kit, area, { a: [0, 0], b: [3, 1] })).toBeNull();
    expect(stickProblem(b, kit, area, { a: [0, 0], b: [3, 2] })).toBe('Too long for a matchstick');
    expect(stickProblem(b, kit, area, { a: [0, 0], b: [0, 0] })).toBe('Too short');
    expect(stickProblem(b, kit, area, { a: [5, 0], b: [7, 0] })).toBe('Off the bench');
  });

  it('refuses duplicates and sticks beyond the kit', () => {
    const b = build(['0,0 3,0 6,0', '3,0 3,1'], []);
    expect(stickProblem(b, kit, area, { a: [3, 0], b: [0, 0] })).toBe('Already there');
    expect(stickProblem(b, kit, area, { a: [0, 1], b: [1, 1] })).toBe('No matchsticks left');
  });

  it('pins parts only to free stick ends', () => {
    const b = build(['0,0 3,0'], ['lamp@0,0']);
    expect(partProblem(b, kit, 'wheel', [1, 0])).toBe('Pin it to the end of a matchstick');
    expect(partProblem(b, kit, 'wheel', [0, 0])).toBe('That pin is taken');
    expect(partProblem(b, kit, 'wheel', [3, 0])).toBeNull();
    expect(partProblem(b, kit, 'lamp', [3, 0])).toMatch(/left/);
  });

  it('launches only a lamp-connected build', () => {
    expect(launchProblem(emptyBlueprint())).toBe('Pin the lamp on first');
    const loose: Blueprint = build(['0,0 3,0', '5,2 6,2'], ['lamp@0,0']);
    expect(launchProblem(loose)).toMatch(/joined/);
    expect(launchProblem(build(['0,0 3,0'], ['lamp@0,0']))).toBeNull();
  });

  it('pulling a stick drops the parts that were on it', () => {
    const b = build(['0,0 3,0', '3,0 3,1'], ['lamp@3,1', 'wheel@0,0']);
    removeStick(b, 1);
    expect(b.parts.map((p) => p.kind)).toEqual(['wheel']);
  });
});
