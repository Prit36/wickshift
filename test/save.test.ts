// Save repair: a bad save never blocks play, and one corrupt route never harms the others.
import { describe, expect, test } from 'vitest';
import { NIGHT_COUNTER, ROUTES } from '../src/data/routes';
import { SAVE_VERSION, freshSave, parseSave } from '../src/save';
import { LONG_RIG } from './fixtures';

describe('save repair', () => {
  test('missing, garbage and non-object saves load fresh', () => {
    expect(parseSave(null)).toEqual({ data: freshSave(), repaired: [] });
    expect(parseSave('{not json')).toEqual({ data: freshSave(), repaired: ['all'] });
    expect(parseSave('42')).toEqual({ data: freshSave(), repaired: ['all'] });
    expect(parseSave('null')).toEqual({ data: freshSave(), repaired: ['all'] });
  });

  test('a different version starts fresh and says why', () => {
    expect(parseSave(JSON.stringify({ ...freshSave(), version: SAVE_VERSION + 1 })).repaired).toEqual(['version']);
  });

  test('one corrupt build is restored to the starter; the rest of the save survives', () => {
    const raw = {
      ...freshSave(),
      delivered: { 'envelope-lip': true, 'ruler-rise': 'yes', ghost: true },
      marks: { 'blotter-drop': true },
      builds: {
        'night-counter': LONG_RIG,
        // Three key wheels where the kit has one.
        'envelope-lip': { placements: [0, 1, 2].map((s) => ({ id: `k${s}`, kind: 'keyWheel', parent: 'chassis', socket: s, rot: 0 })) },
        'ruler-rise': { placements: 'oops' },
      },
      settings: { sfx: 7, music: -1, muted: 'no', reducedMotion: true },
      lastRoute: 'nowhere',
    };
    const { data, repaired } = parseSave(JSON.stringify(raw));
    expect(repaired.sort()).toEqual(['envelope-lip', 'ruler-rise']);
    expect(data.builds[NIGHT_COUNTER.id]).toEqual(LONG_RIG);
    expect(data.builds['envelope-lip']).toBeUndefined();
    expect(data.delivered).toEqual({ 'envelope-lip': true });
    expect(data.marks).toEqual({ 'blotter-drop': true });
    expect(data.settings).toEqual({ sfx: 1, music: 0, muted: false, reducedMotion: true });
    expect(data.lastRoute).toBe(ROUTES[0]!.id);
  });

  test('a clean save round-trips exactly', () => {
    const d = freshSave();
    for (const r of ROUTES) d.delivered[r.id] = true;
    d.marks[NIGHT_COUNTER.id] = true;
    d.builds[NIGHT_COUNTER.id] = LONG_RIG;
    d.lastRoute = NIGHT_COUNTER.id;
    expect(parseSave(JSON.stringify(d))).toEqual({ data: d, repaired: [] });
  });
});
