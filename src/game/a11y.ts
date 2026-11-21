// Named, focusable controls mirrored over the painted interface. Pointer input
// goes to the canvas; keyboard activation (Enter/Space) arrives here.
import type { Rect } from './layout';

export interface Control {
  id: string;
  label: string;
  rect: Rect;
  enabled: boolean;
  /** Arrow-key group: arrows move focus within the same group. */
  group?: string;
  onActivate: () => void;
  pressed?: boolean;
}

export class A11yLayer {
  readonly root: HTMLDivElement;
  readonly live: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private controls = new Map<string, Control>();
  private order: string[] = [];
  onFocusChange: ((id: string | null) => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'a11y-layer';
    host.appendChild(this.root);
    this.live = document.createElement('div');
    this.live.className = 'sr-only';
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'status');
    host.appendChild(this.live);
  }

  sync(list: Control[], s: number): void {
    const keep = new Set(list.map((c) => c.id));
    for (const [id, b] of this.buttons) {
      if (!keep.has(id)) {
        const hadFocus = document.activeElement === b;
        b.remove();
        this.buttons.delete(id);
        this.controls.delete(id);
        if (hadFocus) this.onFocusChange?.(null);
      }
    }
    this.order = [];
    list.forEach((c, i) => {
      let b = this.buttons.get(c.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.dataset.id = c.id;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          const ctl = this.controls.get(c.id);
          if (ctl && ctl.enabled) ctl.onActivate();
        });
        b.addEventListener('focus', () => this.onFocusChange?.(c.id));
        b.addEventListener('blur', () => {
          window.setTimeout(() => {
            if (!this.root.contains(document.activeElement)) this.onFocusChange?.(null);
          }, 0);
        });
        this.buttons.set(c.id, b);
      }
      // Keep DOM order equal to tab order.
      if (this.root.children[i] !== b) this.root.insertBefore(b, this.root.children[i] ?? null);
      this.controls.set(c.id, c);
      this.order.push(c.id);
      if (b.getAttribute('aria-label') !== c.label) b.setAttribute('aria-label', c.label);
      b.setAttribute('aria-disabled', c.enabled ? 'false' : 'true');
      if (c.pressed !== undefined) b.setAttribute('aria-pressed', c.pressed ? 'true' : 'false');
      const st = b.style;
      const l = `${c.rect.x * s}px`;
      const t = `${c.rect.y * s}px`;
      const w = `${Math.max(1, c.rect.w * s)}px`;
      const h = `${Math.max(1, c.rect.h * s)}px`;
      if (st.left !== l) st.left = l;
      if (st.top !== t) st.top = t;
      if (st.width !== w) st.width = w;
      if (st.height !== h) st.height = h;
    });
  }

  focused(): string | null {
    const a = document.activeElement as HTMLElement | null;
    if (a && this.root.contains(a)) return a.dataset.id ?? null;
    return null;
  }

  focus(id: string): boolean {
    const b = this.buttons.get(id);
    if (!b) return false;
    b.focus({ preventScroll: true });
    return true;
  }

  has(id: string): boolean {
    return this.buttons.has(id);
  }

  /** Move focus within the focused control's group. */
  moveInGroup(dir: 1 | -1): boolean {
    const cur = this.focused();
    if (!cur) return false;
    const g = this.controls.get(cur)?.group;
    if (!g) return false;
    const same = this.order.filter((id) => this.controls.get(id)?.group === g);
    const i = same.indexOf(cur);
    if (i < 0 || same.length < 2) return false;
    const next = same[(i + dir + same.length) % same.length]!;
    return this.focus(next);
  }

  control(id: string): Control | undefined {
    return this.controls.get(id);
  }

  announce(text: string): void {
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 30);
  }

  count(): number {
    return this.buttons.size;
  }
}
