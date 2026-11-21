// Versioned local save. Validated on load; one corrupt route never harms the others.
import { ROUTES } from './data/routes';
import { sanitize, type Blueprint } from './workshop/blueprint';

export const SAVE_KEY = 'wickshift.save';
export const SAVE_VERSION = 1;

export interface Settings {
  sfx: number;
  music: number;
  muted: boolean;
  /** null = follow the system preference */
  reducedMotion: boolean | null;
}

export interface SaveData {
  version: number;
  delivered: Record<string, boolean>;
  marks: Record<string, boolean>;
  builds: Record<string, Blueprint>;
  settings: Settings;
  lastRoute: string;
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    delivered: {},
    marks: {},
    builds: {},
    settings: { sfx: 0.8, music: 0.5, muted: false, reducedMotion: null },
    lastRoute: ROUTES[0]!.id,
  };
}

export interface LoadResult {
  data: SaveData;
  /** Routes whose saved build was corrupt and restored to the starter rig. */
  repaired: string[];
  storageOk: boolean;
}

function num(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}

export function parseSave(raw: string | null): { data: SaveData; repaired: string[] } {
  const data = freshSave();
  const repaired: string[] = [];
  if (!raw) return { data, repaired };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { data, repaired: ['all'] };
  }
  if (!obj || typeof obj !== 'object') return { data, repaired: ['all'] };
  const o = obj as Partial<SaveData>;
  if (o.version !== SAVE_VERSION) return { data, repaired: ['version'] };
  for (const r of ROUTES) {
    if (o.delivered && o.delivered[r.id] === true) data.delivered[r.id] = true;
    if (o.marks && o.marks[r.id] === true) data.marks[r.id] = true;
    const b = o.builds?.[r.id];
    if (b !== undefined) {
      const ok = sanitize(b, r.kit);
      if (ok) data.builds[r.id] = ok;
      else repaired.push(r.id);
    }
  }
  const s = (o.settings ?? {}) as Partial<Settings>;
  data.settings = {
    sfx: num(s.sfx, 0, 1, 0.8),
    music: num(s.music, 0, 1, 0.5),
    muted: s.muted === true,
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : null,
  };
  if (typeof o.lastRoute === 'string' && ROUTES.some((r) => r.id === o.lastRoute)) data.lastRoute = o.lastRoute;
  return { data, repaired };
}

export class SaveStore {
  data: SaveData;
  storageOk = true;
  repaired: string[] = [];
  private timer: number | null = null;

  constructor() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      const probe = '__wickshift_probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    } catch {
      this.storageOk = false;
    }
    const res = parseSave(raw);
    this.data = res.data;
    this.repaired = res.repaired;
  }

  isUnlocked(index: number): boolean {
    if (index === 0) return true;
    const prev = ROUTES[index - 1];
    return !!prev && !!this.data.delivered[prev.id];
  }

  /** Write soon, off the frame loop. */
  scheduleSave(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 120);
  }

  flush(): boolean {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.storageOk) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      this.storageOk = false;
      return false;
    }
  }
}
