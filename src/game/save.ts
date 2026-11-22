// Tiny versioned local save. Storage failures fall back to memory silently.
import type { Blueprint } from '../sim/blueprint';
import type { Stars } from '../sim/stars';

const KEY = 'wickshift.save';
const VERSION = 4;

export interface LevelSave {
  /** Best stars, each kept once earned. */
  stars: Stars;
  /** The last build launched on this level, restored on the bench. */
  build?: Blueprint;
}

export interface Save {
  v: number;
  levels: Record<string, LevelSave>;
  muted: boolean;
  reduced: boolean;
}

function fresh(): Save {
  return {
    v: VERSION,
    levels: {},
    muted: false,
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

const isPin = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n));

function cleanBuild(b: unknown): Blueprint | undefined {
  if (!b || typeof b !== 'object') return undefined;
  const o = b as { sticks?: unknown; parts?: unknown };
  if (!Array.isArray(o.sticks) || !Array.isArray(o.parts)) return undefined;
  const sticks = o.sticks.filter((s): s is Blueprint['sticks'][number] => !!s && isPin((s as { a: unknown }).a) && isPin((s as { b: unknown }).b));
  const kinds = ['lamp', 'wheel', 'key', 'rocket', 'lantern', 'spring'];
  const parts = o.parts.filter((p): p is Blueprint['parts'][number] => !!p && kinds.includes((p as { kind: string }).kind) && isPin((p as { at: unknown }).at) && Number.isInteger((p as { dir: unknown }).dir));
  return { sticks, parts };
}

export function loadSave(): Save {
  const f = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return f;
    const d = JSON.parse(raw) as Partial<Save>;
    if (d.v !== VERSION) return { ...f, muted: !!d.muted, reduced: d.reduced ?? f.reduced };
    const levels: Record<string, LevelSave> = {};
    for (const [id, l] of Object.entries(d.levels ?? {})) {
      const st = Array.isArray(l?.stars) ? (l.stars.slice(0, 3).map(Boolean) as Stars) : ([false, false, false] as Stars);
      while (st.length < 3) st.push(false);
      levels[id] = { stars: st, build: cleanBuild(l?.build) };
    }
    return { v: VERSION, levels, muted: !!d.muted, reduced: !!d.reduced };
  } catch {
    return f;
  }
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or disabled: keep playing in memory
  }
}
