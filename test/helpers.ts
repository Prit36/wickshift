import type { ShiftConfig } from '../src/sim/shift';
import type { DeliveryKind } from '../src/sim/terrain';
import { targetFor, KINDS } from '../src/sim/night';
import { freshLevels } from '../src/sim/tricks';
import { freshStampState } from '../src/sim/stamps';

/** A delivery config with nothing bought, a real target and plenty of glasses unless overridden. */
export function cfg(seed: number, route: number, kind: DeliveryKind, over: Partial<ShiftConfig> = {}): ShiftConfig {
  return {
    seed,
    route,
    kind,
    target: targetFor(route, KINDS.indexOf(kind)),
    stamps: [],
    parts: [],
    levels: freshLevels(),
    glasses: 99,
    rule: null,
    state: freshStampState(),
    pennies: 0,
    ...over,
  };
}

import { Flame, type PostCtx } from '../src/sim/rules';
import type { StampId } from '../src/sim/stamps';
import type { WindowSpot } from '../src/sim/terrain';

/** A fresh flame holding these stamps. */
export const flame = (album: StampId[] = [], levels = freshLevels(), state = freshStampState()): Flame => {
  const f = new Flame(album, levels, state);
  f.reset(1);
  return f;
};

/** A plain ground window posted at standing still. */
export const ctx = (over: Partial<PostCtx> = {}): PostCtx => ({ high: false, airborne: false, final: false, gold: false, windowsLit: 0, pennies: 0, ...over });

export const win = (over: Partial<WindowSpot> = {}): WindowSpot => ({ id: 900, x: 0, y: 0, high: false, final: false, gold: false, ...over });
