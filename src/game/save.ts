// Tiny versioned local save. Storage failures fall back to memory silently.
const KEY = 'wickshift.save';
const VERSION = 3;

export interface Save {
  v: number;
  /** Best night total. */
  best: number;
  /** Furthest route reached (5+ means Overtime). */
  bestRoute: number;
  /** Biggest single post. */
  bestPost: number;
  nights: number;
  dawns: number;
  muted: boolean;
  reduced: boolean;
  /** Hints and course signposts the player has already learned. */
  hintsDone: string[];
}

export function loadSave(): Save {
  const fresh: Save = {
    v: VERSION,
    best: 0,
    bestRoute: 0,
    bestPost: 0,
    nights: 0,
    dawns: 0,
    muted: false,
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    hintsDone: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<Save>;
    const num = (x: unknown) => (Number.isFinite(x) ? Number(x) : 0);
    // older saves: keep the settings, drop the scores (the game changed)
    if (d.v !== VERSION) return { ...fresh, muted: !!d.muted, reduced: d.reduced ?? fresh.reduced };
    return {
      v: VERSION,
      best: num(d.best),
      bestRoute: num(d.bestRoute),
      bestPost: num(d.bestPost),
      nights: num(d.nights),
      dawns: num(d.dawns),
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
