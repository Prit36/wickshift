// Keyboard state plus pointer events (mouse, pen, touch) handed to the active screen.

export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  /** 0 primary, 2 secondary (right click). */
  button: number;
  touch: boolean;
}

export interface PointerSink {
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
}

export class Input {
  private held = new Set<string>();
  /** Keys pressed since the last frame (lower-case `KeyboardEvent.key`, ' ' for space). */
  pressed: string[] = [];
  /** Modifier state of the last key press. */
  ctrl = false;
  shift = false;
  mouse = { x: -1, y: -1 };
  touchUI = false;
  sink: PointerSink | null = null;
  onFirstGesture: (() => void) | null = null;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.gesture();
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'Z', 'Y'].includes(e.key)) e.preventDefault();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.ctrl = e.ctrlKey || e.metaKey;
      this.shift = e.shiftKey;
      if (!e.repeat) this.pressed.push(k);
      this.held.add(k);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.held.clear();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const info = (e: PointerEvent): PointerInfo => {
      const r = el.getBoundingClientRect();
      return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, touch: e.pointerType === 'touch' };
    };
    el.addEventListener('pointerdown', (e) => {
      this.gesture();
      if (e.pointerType === 'touch') this.touchUI = true;
      else if (e.pointerType === 'mouse') this.touchUI = false;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // not a live pointer (synthetic event); events still arrive without capture
      }
      const p = info(e);
      this.mouse = { x: p.x, y: p.y };
      this.sink?.down(p);
    });
    el.addEventListener('pointermove', (e) => {
      const p = info(e);
      if (e.pointerType !== 'touch') this.mouse = { x: p.x, y: p.y };
      this.sink?.move(p);
    });
    const up = (e: PointerEvent) => {
      const p = info(e);
      this.sink?.up(p);
      if (e.pointerType === 'touch') this.mouse = { x: -1, y: -1 };
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  isHeld(k: string): boolean {
    return this.held.has(k);
  }

  endFrame(): void {
    this.pressed.length = 0;
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }
}
