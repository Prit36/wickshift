// The job board: three worlds of jobs, one page each. A job opens when either of
// the two before it is delivered; a world opens after three deliveries in the last.
import type { App, Btn, Screen } from './app';
import { hit } from './app';
import type { PointerInfo } from './input';
import { ALL, WORLDS, WORLD_KEY, levelsIn, jobOpen, worldOpen } from '../sim/all-levels';
import type { LevelDef } from '../sim/level';
import { starCount } from '../sim/stars';
import { PARTS, TRAY_ORDER, type PartKind } from '../sim/parts';
import { C, BOOK_TONES } from '../render/palette';
import { button, logo, panel, text, fitSize, star, wrapText, type Rect } from '../render/ui';
import { drawBackdrop } from '../render/scene';
import { drawPart, drawStick } from '../render/art';
import { sfx } from '../audio/sfx';

export interface MenuHost {
  open(level: LevelDef): void;
}

const WORLD_TONES = [C.red, C.teal, C.mustard];

export class Menu implements Screen {
  private btns: Btn[] = [];
  private pressed: string | null = null;
  private t = 0;
  /** The world page on show; starts where the player has work to do. */
  private world: number;

  constructor(
    private app: App,
    private host: MenuHost,
  ) {
    this.world = this.frontier().world;
  }

  private done = (id: string): boolean => !!this.app.save.levels[id]?.stars[0];

  /** The first open job without a delivery, or the last job. */
  private frontier(): LevelDef {
    return ALL.find((l) => jobOpen(l, this.done) && !this.done(l.id)) ?? ALL[ALL.length - 1];
  }

  /** Back to the page with the next thing to do (after a delivery, say). */
  refresh(): void {
    this.world = this.frontier().world;
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
    if (id.startsWith('W')) {
      const w = Number(id.slice(1));
      if (w === this.world) return;
      sfx.click();
      this.world = w;
      return;
    }
    const L = ALL.find((l) => l.id === id.slice(1));
    if (!L || !jobOpen(L, this.done)) {
      sfx.deny();
      return;
    }
    sfx.go();
    this.host.open(L);
  }

  update(dt: number): void {
    this.t += dt;
    for (const k of this.app.input.pressed) {
      if (k === 'Enter' || k === ' ') {
        this.press('L' + this.frontier().id);
        return;
      }
      const page = levelsIn(this.world);
      if (/^[1-9]$/.test(k) && Number(k) <= page.length) this.press('L' + page[Number(k) - 1].id);
      if ((k === 'ArrowRight' || k === ']') && this.world < WORLDS.length - 1) this.press('W' + (this.world + 1));
      if ((k === 'ArrowLeft' || k === '[') && this.world > 0) this.press('W' + (this.world - 1));
      if (k === 'm') this.app.toggleMute();
    }
  }

  draw(): void {
    const { ctx, dpr, W, H, s, t } = this.app;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop(ctx, { x: t * 0.3, y: 0, scale: 60, W, H }, t, this.world);
    this.btns = [];
    const short = H < 560 * s;
    const ly = short ? 44 * s : Math.max(64 * s, H * 0.11);
    const ls = Math.min(short ? 56 * s : 80 * s, W / 11);
    logo(ctx, W / 2, ly, ls, t, this.app.save.reduced);
    let y = ly + ls * 0.75;
    if (!short) {
      const sub = 'Build it from desk junk. Get the lamp to the window, still lit.';
      text(ctx, sub, W / 2, y, fitSize(ctx, sub, W - 40 * s, 20 * s), C.paper, 'center', 5 * s);
      y += 30 * s;
    }

    // world tabs
    const tabW = Math.min(230 * s, (W - 32 * s - 2 * 10 * s) / WORLDS.length);
    const tabH = 58 * s;
    const tabsX = (W - (tabW * WORLDS.length + 10 * s * (WORLDS.length - 1))) / 2;
    WORLDS.forEach((wd, w) => {
      const r: Rect = { x: tabsX + w * (tabW + 10 * s), y, w: tabW, h: tabH };
      this.btns.push({ id: 'W' + w, r });
      this.tab(r, w, wd.name, s);
    });
    y += tabH + 14 * s;

    // job tickets on this page
    const page = levelsIn(this.world);
    const n = page.length;
    const perRow = W > 1000 * s ? n : W > 560 * s ? 3 : 2;
    const rows = Math.ceil(n / perRow);
    const gapX = 14 * s;
    const gapY = 14 * s;
    const room = H - y - 52 * s;
    const byW = (W - 32 * s - (perRow - 1) * gapX) / perRow;
    const byH = (room - (rows - 1) * gapY) / rows / 1.3;
    const cw = Math.max(80 * s, Math.min(196 * s, byW, byH));
    const chh = cw * 1.3;
    const total = rows * chh + (rows - 1) * gapY;
    const y0 = y + Math.max(0, (room - total) / 2) * 0.4;
    const open = worldOpen(this.world, this.done);
    page.forEach((L, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const rowW = inRow * cw + (inRow - 1) * gapX;
      const r: Rect = { x: (W - rowW) / 2 + (i % perRow) * (cw + gapX), y: y0 + row * (chh + gapY), w: cw, h: chh };
      this.btns.push({ id: 'L' + L.id, r });
      this.ticket(r, L, cw / 196);
    });
    if (!open) {
      const need = WORLD_KEY - levelsIn(this.world - 1).filter((l) => this.done(l.id)).length;
      const msg = `Deliver ${need} more in ${WORLDS[this.world - 1].name} to open ${WORLDS[this.world].name}`;
      const fy = y0 + total / 2;
      const bw = Math.min(W - 40 * s, 520 * s);
      panel(ctx, { x: (W - bw) / 2, y: fy - 34 * s, w: bw, h: 68 * s }, C.ink, s, -0.01);
      text(ctx, msg, W / 2, fy, fitSize(ctx, msg, bw - 30 * s, 20 * s), C.cream, 'center');
    }

    const got = ALL.reduce((a, l) => a + starCount(this.app.save.levels[l.id]?.stars), 0);
    text(ctx, `★ ${got} / ${ALL.length * 3}`, W / 2, H - 26 * s, 22 * s, C.mustard, 'center', 5 * s);
    const mute: Rect = { x: W - 58 * s, y: 10 * s, w: 46 * s, h: 46 * s };
    button(ctx, mute, this.app.save.muted ? '×' : '♪', s, false, C.inkSoft);
    this.btns.push({ id: 'mute', r: mute });
  }

  private tab(r: Rect, w: number, name: string, s: number): void {
    const { ctx } = this.app;
    const on = w === this.world;
    const open = worldOpen(w, this.done);
    const ls = levelsIn(w);
    const got = ls.reduce((a, l) => a + starCount(this.app.save.levels[l.id]?.stars), 0);
    ctx.save();
    ctx.globalAlpha = open || on ? 1 : 0.6;
    panel(ctx, { x: r.x, y: r.y + (on ? 0 : 4 * s), w: r.w, h: r.h - (on ? 0 : 4 * s) }, on ? WORLD_TONES[w] : C.paperShade, s, 0);
    const label = name.replace('The ', '').toUpperCase();
    text(ctx, label, r.x + r.w / 2, r.y + r.h * 0.38, fitSize(ctx, label, r.w - 16 * s, 19 * s), on ? C.cream : C.ink, 'center', on ? 4 * s : 0);
    const sub = open ? `★ ${got}/${ls.length * 3}` : 'LOCKED';
    text(ctx, sub, r.x + r.w / 2, r.y + r.h * 0.74, 14 * s, on ? C.cream : C.inkSoft, 'center');
    ctx.restore();
  }

  private ticket(r: Rect, L: LevelDef, k: number): void {
    const { ctx, s, t } = this.app;
    const open = jobOpen(L, this.done);
    const st = this.app.save.levels[L.id]?.stars ?? [false, false, false];
    const m = this.app.input.mouse;
    const hot = open && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    const lift = hot ? -6 * s : 0;
    const tilt = ((L.num * 37) % 7) / 7 - 0.5;
    const u = k * s; // ticket-local scale
    ctx.save();
    ctx.globalAlpha = open ? 1 : 0.55;
    panel(ctx, { x: r.x, y: r.y + lift, w: r.w, h: r.h }, open ? C.paper : C.paperShade, s, tilt * 0.05 + (hot ? Math.sin(t * 6) * 0.01 : 0));
    ctx.fillStyle = BOOK_TONES[(L.num - 1) % BOOK_TONES.length];
    ctx.fillRect(r.x + 10 * u, r.y + lift + 10 * u, r.w - 20 * u, 44 * u);
    text(ctx, `JOB ${L.num}`, r.x + r.w / 2, r.y + lift + 33 * u, 26 * u, C.cream, 'center', 5 * u);
    const nm = L.name.toUpperCase();
    text(ctx, nm, r.x + r.w / 2, r.y + lift + 76 * u, fitSize(ctx, nm, r.w - 20 * u, 22 * u), C.ink, 'center');
    // the part this job introduces, or the one it's about
    const seen = new Set(ALL.slice(0, ALL.indexOf(L)).flatMap((l) => Object.keys(l.kit).filter((q) => (l.kit[q as PartKind] ?? 0) > 0)));
    const kinds = TRAY_ORDER.filter((q) => (L.kit[q] ?? 0) > 0 && q !== 'stick' && q !== 'lamp');
    const fresh = kinds.filter((q) => !seen.has(q)).at(-1);
    const firstSeen = (q: PartKind) => ALL.findIndex((l) => (l.kit[q] ?? 0) > 0);
    const kind: PartKind = L.feature ?? fresh ?? [...kinds].sort((a, b) => firstSeen(b) - firstSeen(a))[0] ?? 'key';
    const isNew = !seen.has(kind);
    const ps = r.w * 0.36;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + lift + r.h * 0.58);
    ctx.scale(ps, -ps);
    if (open) drawPart(ctx, kind as Exclude<PartKind, 'stick'>, 0, kind === 'balloon' ? -0.15 : 0, PARTS[kind].dir, 0, { t, flame: 1 });
    else drawStick(ctx, -0.5, -0.2, 0.5, 0.2);
    ctx.restore();
    if (open) {
      const label = isNew ? `NEW: ${PARTS[kind].name}` : L === levelsIn(L.world).at(-1) && L.world > 0 ? 'WORLD FINALE' : `MORE: ${PARTS[kind].name}`;
      wrapText(ctx, label, r.x + r.w / 2, r.y + lift + r.h * 0.72, r.w - 20 * u, Math.max(10, 13 * u), C.inkSoft, 'center', 1.15);
    } else text(ctx, 'LOCKED', r.x + r.w / 2, r.y + lift + r.h * 0.78, 18 * u, C.inkSoft, 'center');
    for (let q = 0; q < 3; q++) star(ctx, r.x + r.w / 2 + (q - 1) * 30 * u, r.y + lift + r.h - 24 * u, 12 * u, st[q], u);
    ctx.restore();
  }
}
