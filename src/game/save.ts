// Tiny versioned local save. Storage failures fall back to memory silently.
const KEY = 'wickshift.save';
const VERSION = 2;

export interface Save {
  v: number;
  best: number;
  bestShift: number;
  muted: boolean;
  reduced: boolean;
  hintsDone: string[];
}

export function loadSave(): Save {
  const fresh: Save = {
    v: VERSION,
    best: 0,
    bestShift: 0,
    muted: false,
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    hintsDone: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<Save>;
    if (d.v !== VERSION) return fresh;
    return {
      v: VERSION,
      best: Number.isFinite(d.best) ? Number(d.best) : 0,
      bestShift: Number.isFinite(d.bestShift) ? Number(d.bestShift) : 0,
      muted: !!d.muted,
      reduced: !!d.reduced,
      hintsDone: Array.isArray(d.hintsDone) ? d.hintsDone.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return fresh;
  }
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or disabled: keep playing in memory
  }
}
