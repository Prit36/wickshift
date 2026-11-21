// Uniform fit: the logical frame is at least 1280×720; controls anchor to its edges.
import type { PartKind } from '../data/parts';
import { PART_KINDS } from '../data/parts';
import type { Kit } from '../workshop/blueprint';
import { INSET } from '../render/palette';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  W: number;
  H: number;
  /** CSS px per logical px. */
  s: number;
  /** Backing pixels per CSS px (capped). */
  dpr: number;
  cssW: number;
  cssH: number;
  compact: boolean;
  drawer: Rect;
  recesses: { kind: PartKind; r: Rect }[];
  trayK: number;
  lever: Rect;
  undo: Rect;
  redo: Rect;
  scout: Rect;
  slip: Rect;
  pause: Rect;
  dial: Rect;
  lampBack: Rect;
  lampFwd: Rect;
  drive: Rect;
  actions: Rect;
}

export const DRAWER_H = 100;

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

export function computeLayout(cssW: number, cssH: number, devicePR: number, kit: Kit): Layout {
  const s = Math.min(cssH / 720, cssW / 1280);
  const W = cssW / s;
  const H = cssH / s;
  const dpr = Math.min(2, devicePR || 1);
  const compact = cssH < 560;
  // Thumb controls must be at least 44 CSS px.
  const thumb = Math.max(86, 48 / s);
  const drawer: Rect = { x: 0, y: H - DRAWER_H, w: W, h: DRAWER_H };
  const kinds = PART_KINDS.filter((k) => kit[k] > 0);
  const widths: Record<PartKind, number> = { keyWheel: 104, reel: 120, spar: 128, fork: 92, runner: 120 };
  const total = kinds.reduce((a, k) => a + widths[k] + 34, 0);
  const left = 230;
  const right = W - 210;
  let x = Math.max(left, (left + right) / 2 - total / 2);
  const recesses = kinds.map((kind) => {
    const r = { x, y: drawer.y + 8, w: widths[kind], h: DRAWER_H - 28 };
    x += widths[kind] + 34;
    return { kind, r };
  });
  const tab = 58;
  return {
    W,
    H,
    s,
    dpr,
    cssW,
    cssH,
    compact,
    drawer,
    recesses,
    trayK: 56,
    lever: { x: W - 150, y: H - 196, w: 120, h: 190 },
    undo: { x: INSET + 4, y: drawer.y + 18, w: tab, h: tab + 6 },
    redo: { x: INSET + 4 + tab + 8, y: drawer.y + 18, w: tab, h: tab + 6 },
    scout: { x: INSET + 4 + (tab + 8) * 2, y: drawer.y + 18, w: tab + 6, h: tab + 6 },
    slip: { x: INSET, y: INSET, w: 300, h: 138 },
    pause: { x: W - INSET - 64, y: INSET - 6, w: 64, h: 74 },
    dial: { x: INSET + 6, y: H - 132, w: 116, h: 116 },
    lampBack: { x: INSET + 140, y: H - thumb - 22, w: thumb, h: thumb },
    lampFwd: { x: INSET + 150 + thumb, y: H - thumb - 22, w: thumb, h: thumb },
    drive: { x: W - INSET - Math.max(132, thumb * 1.3), y: H - Math.max(150, thumb * 1.6) - 16, w: Math.max(132, thumb * 1.3), h: Math.max(150, thumb * 1.6) },
    actions: { x: W - INSET - 230, y: 120, w: 230, h: 300 },
  };
}
