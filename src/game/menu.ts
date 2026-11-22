// The job board: pick a level. Each job unlocks when the one before is delivered.
import type { App, Btn, Screen } from './app';
import { hit } from './app';
import type { PointerInfo } from './input';
import { LEVELS } from '../sim/levels';
import type { LevelDef } from '../sim/level';
import { starCount } from '../sim/stars';
import { PARTS, TRAY_ORDER } from '../sim/parts';
import { C, BOOK_TONES } from '../render/palette';
import { button, logo, panel, text, fitSize, star, wrapText, type Rect } from '../render/ui';
import { drawBackdrop } from '../render/scene';
import { drawPart, drawStick } from '../render/art';
import { sfx } from '../audio/sfx';

export interface MenuHost {
  open(level: LevelDef): void;
}

export class Menu implements Screen {
  private btns: Btn[] = [];
  private pressed: string | null = null;
  private t = 0;

  constructor(
    private app: App,
    private host: MenuHost,
  ) {}

  unlocked(i: number): boolean {
    return i === 0 || !!this.app.save.levels[LEVELS[i - 1].id]?.stars[0];
  }

  down(p: PointerInfo): void {
    this.pressed = hit(this.btns, p.x, p.y)?.id ?? null;
  }
  move(): void {}
  up(p: PointerInfo): void {
    const b = hit(this.btns, p.x, p.y);
    if (b && b.id === this.pressed) this.press(b.id);
    this.pressed = null;
  }

  private press(id: string): void {
    if (id === 'mute') {
      sfx.click();
      this.app.toggleMute();
      return;
    }
    const i = Number(id.slice(1));
    if (!this.unlocked(i)) {
      sfx.deny();
      return;
    }
    sfx.go();
    this.host.open(LEVELS[i]);
  }

  update(dt: number): void {
    this.t += dt;
    for (const k of this.app.input.pressed) {
      if (k === 'Enter' || k === ' ') {
        // open the first job without a delivery, or the last one
        let i = LEVELS.findIndex((l, n) => this.unlocked(n) && !this.app.save.levels[l.id]?.stars[0]);
        if (i < 0) i = LEVELS.length - 1;
        this.press('L' + i);
        return;
      }
      if (/^[1-9]$/.test(k) && Number(k) <= LEVELS.length) this.press('L' + (Number(k) - 1));
      if (k === 'm') this.app.toggleMute();
    }
  }

  draw(): void {
    const { ctx, dpr, W, H, s, t } = this.app;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop(ctx, { x: t * 0.3, y: 0, scale: 60, W, H }, t);
    this.btns = [];
    const ls = Math.min(84 * s, W / 11);
    logo(ctx, W / 2, Math.max(70 * s, H * 0.14), ls, t, this.app.save.reduced);
    text(ctx, 'Build it from desk junk. Get the lamp to the window, still lit.', W / 2, Math.max(70 * s, H * 0.14) + ls * 0.95, fitSize(ctx, 'Build it from desk junk. Get the lamp to the window, still lit.', W - 40 * s, 22 * s), C.paper, 'center', 5 * s);

    // job tickets
    const n = LEVELS.length;
    const perRow = W > 980 * s ? n : W > 560 * s ? 3 : 2;
    const cw = Math.min(200 * s, (W - 32 * s - (perRow - 1) * 16 * s) / perRow);
    const chh = cw * 1.3;
    const rows = Math.ceil(n / perRow);
    const top = Math.max(H * 0.3, Math.max(70 * s, H * 0.14) + ls * 1.5);
    const gapY = 20 * s;
    const total = rows * chh + (rows - 1) * gapY;
    const y0 = Math.min(top, H - total - 60 * s);
    LEVELS.forEach((L, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const rowW = inRow * cw + (inRow - 1) * 16 * s;
      const x = (W - rowW) / 2 + (i % perRow) * (cw + 16 * s);
      const y = y0 + row * (chh + gapY);
      const r: Rect = { x, y, w: cw, h: chh };
      this.btns.push({ id: 'L' + i, r });
      this.ticket(r, L, i, s, t);
    });
    const got = LEVELS.reduce((a, l) => a + starCount(this.app.save.levels[l.id]?.stars), 0);
    text(ctx, `★ ${got} / ${n * 3}`, W / 2, H - 28 * s, 24 * s, C.mustard, 'center', 5 * s);
    const mute: Rect = { x: W - 60 * s, y: 12 * s, w: 46 * s, h: 46 * s };
    button(ctx, mute, this.app.save.muted ? '×' : '♪', s, false, C.inkSoft);
    this.btns.push({ id: 'mute', r: mute });
  }

  private ticket(r: Rect, L: LevelDef, i: number, s: number, t: number): void {
    const { ctx } = this.app;
    const open = this.unlocked(i);
    const st = this.app.save.levels[L.id]?.stars ?? [false, false, false];
    const m = this.app.input.mouse;
    const hot = open && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    const lift = hot ? -6 * s : 0;
    const tilt = ((i * 37) % 7) / 7 - 0.5;
    ctx.save();
    ctx.globalAlpha = open ? 1 : 0.55;
    panel(ctx, { x: r.x, y: r.y + lift, w: r.w, h: r.h }, open ? C.paper : C.paperShade, s, tilt * 0.05 + (hot ? Math.sin(t * 6) * 0.01 : 0));
    const tone = BOOK_TONES[i % BOOK_TONES.length];
    ctx.fillStyle = tone;
    ctx.fillRect(r.x + 10 * s, r.y + lift + 10 * s, r.w - 20 * s, 44 * s);
    text(ctx, `JOB ${L.num}`, r.x + r.w / 2, r.y + lift + 33 * s, 26 * s, C.cream, 'center', 5 * s);
    const nm = L.name.toUpperCase();
    text(ctx, nm, r.x + r.w / 2, r.y + lift + 76 * s, fitSize(ctx, nm, r.w - 20 * s, 24 * s), C.ink, 'center');
    // the part this job introduces
    const prev = LEVELS[i - 1];
    const newKind = TRAY_ORDER.find((k) => (L.kit[k] ?? 0) > 0 && !(prev?.kit[k] ?? 0) && k !== 'stick' && k !== 'lamp') ?? 'wheel';
    const ps = r.w * 0.38;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + lift + r.h * 0.6);
    ctx.scale(ps, -ps);
    if (open) drawPart(ctx, newKind as 'wheel', 0, 0, PARTS[newKind].dir, 0, { t, flame: 1 });
    else drawStick(ctx, -0.5, -0.2, 0.5, 0.2);
    ctx.restore();
    if (open) {
      const label = `NEW: ${PARTS[newKind].name}`;
      wrapText(ctx, label, r.x + r.w / 2, r.y + lift + r.h * 0.73, r.w - 20 * s, 13 * s, C.inkSoft, 'center', 1.15);
    } else text(ctx, 'LOCKED', r.x + r.w / 2, r.y + lift + r.h * 0.78, 18 * s, C.inkSoft, 'center');
    for (let k = 0; k < 3; k++) star(ctx, r.x + r.w / 2 + (k - 1) * 30 * s, r.y + lift + r.h - 24 * s, 12 * s, st[k], s);
    ctx.restore();
  }
}
