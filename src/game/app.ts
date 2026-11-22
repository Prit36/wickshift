// What every screen can reach: the canvas, input, effects, the save.
import type { Input, PointerSink } from './input';
import type { Fx } from './fx';
import type { Save } from './save';
import type { Rect } from '../render/ui';

export interface App {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  W: number;
  H: number;
  /** UI scale. */
  s: number;
  /** Seconds since boot. */
  t: number;
  input: Input;
  fx: Fx;
  save: Save;
  persist(): void;
  toggleMute(): void;
}

export interface Screen extends PointerSink {
  update(dt: number): void;
  draw(): void;
}

/** A clickable on-screen button, remembered for the frame it was drawn in. */
export interface Btn {
  id: string;
  r: Rect;
}

export const hit = (btns: Btn[], x: number, y: number): Btn | undefined => {
  for (let i = btns.length - 1; i >= 0; i--) {
    const b = btns[i];
    if (x >= b.r.x && x <= b.r.x + b.r.w && y >= b.r.y && y <= b.r.y + b.r.h) return b;
  }
  return undefined;
};
