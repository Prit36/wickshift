// Keyboard, mouse and multi-touch mapped onto three actions: gas, brake, post.

export type Zone = 'gas' | 'brake' | 'post';

export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, Zone>();
  private postQueued = false;
  private pressedQueue: string[] = [];
  touchUI = false;
  /** Screen rects for touch pads, set by the HUD each frame. */
  pads: Record<Zone, { x: number; y: number; r: number }> = {
    brake: { x: 0, y: 0, r: 0 },
    gas: { x: 0, y: 0, r: 0 },
    post: { x: 0, y: 0, r: 0 },
  };
  /** Pointer clicks for UI: consumed by the game each frame. */
  clicks: { x: number; y: number }[] = [];
  mouse = { x: -1, y: -1 };
  private mouseGas = false;
  private mouseBrake = false;
  onFirstGesture: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.gesture();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
      const k = norm(e.key);
      if (!e.repeat) {
        this.pressedQueue.push(k);
        if (k === 'post') this.postQueued = true;
      }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(norm(e.key)));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      this.gesture();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (e.pointerType === 'touch') {
        this.touchUI = true;
        const z = this.zoneAt(x, y);
        if (z) {
          this.touches.set(e.pointerId, z);
          if (z === 'post') this.postQueued = true;
          this.pressedQueue.push(z);
        } else this.clicks.push({ x, y });
        el.setPointerCapture?.(e.pointerId);
      } else {
        this.clicks.push({ x, y });
        if (e.button === 0) this.mouseGas = true;
        if (e.button === 2) this.mouseBrake = true;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
      else {
        if (e.button === 0) this.mouseGas = false;
        if (e.button === 2) this.mouseBrake = false;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => {
      this.touches.delete(e.pointerId);
      this.mouseGas = this.mouseBrake = false;
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        const z = this.zoneAt(this.mouse.x, this.mouse.y);
        if (z && z !== 'post') this.touches.set(e.pointerId, z);
      }
    });
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      f();
    }
  }

  private zoneAt(x: number, y: number): Zone | null {
    if (!this.touchUI) return null;
    for (const z of ['post', 'brake', 'gas'] as Zone[]) {
      const p = this.pads[z];
      if (p.r > 0 && Math.hypot(x - p.x, y - p.y) < p.r * 1.35) return z;
    }
    // Fallback halves of the screen for driving
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (y > h * 0.35) return x < w * 0.5 ? 'brake' : 'gas';
    return null;
  }

  clear(): void {
    this.keys.clear();
    this.touches.clear();
    this.mouseGas = this.mouseBrake = false;
    this.postQueued = false;
  }

  /** Mouse buttons only drive while `allowMouseDrive` (not over menus). */
  gas(allowMouse = true): boolean {
    return this.keys.has('gas') || [...this.touches.values()].includes('gas') || (allowMouse && this.mouseGas);
  }
  brake(allowMouse = true): boolean {
    return this.keys.has('brake') || [...this.touches.values()].includes('brake') || (allowMouse && this.mouseBrake);
  }
  takePost(): boolean {
    const p = this.postQueued;
    this.postQueued = false;
    return p;
  }
  takePressed(): string[] {
    const q = this.pressedQueue;
    this.pressedQueue = [];
    return q;
  }
  takeClicks(): { x: number; y: number }[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }
  isTouchHeld(z: Zone): boolean {
    return [...this.touches.values()].includes(z) || (z === 'gas' && this.keys.has('gas')) || (z === 'brake' && this.keys.has('brake'));
  }
}

function norm(key: string): string {
  switch (key) {
    case 'ArrowRight':
    case 'd':
    case 'D':
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'gas';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'brake';
    case ' ':
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'post';
    case 'Escape':
    case 'p':
    case 'P':
      return 'pause';
    case 'Enter':
      return 'enter';
    case 'r':
    case 'R':
      return 'r';
    case 'm':
    case 'M':
      return 'm';
    default:
      return key.length === 1 ? key.toLowerCase() : key;
  }
}
