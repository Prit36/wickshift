// The bench: a cork board pinned to the start of the level. Drag between pins
// to lay matchsticks, drag parts from the tray onto stick ends, tap a part to
// turn it, tap a stick to pull it out. What you see here is exactly what spawns.
import type { App, Btn, Screen } from './app';
import { hit } from './app';
import type { PointerInfo } from './input';
import type { LevelDef } from '../sim/level';
import { ALL } from '../sim/all-levels';
import { CONTROL_INFO, GRID, PARTS, TRAY_ORDER, floatUp, type PartKind } from '../sim/parts';
import { clone, inArea, left, launchProblem, nodes, partProblem, pinKey, pinPos, removeStick, samePin, stickProblem, type Blueprint, type Pin, type Placed } from '../sim/blueprint';
import { Run } from '../sim/run';
import { C, FONT, BODY } from '../render/palette';
import { button, panel, text, wrapText, fitSize, keycap, star, type Rect } from '../render/ui';
import { drawPart, drawPin, drawStick, drawAim, rr, inked } from '../render/art';
import { drawBackdrop, drawBlueprint, drawLevel, drawLampLight } from '../render/scene';
import { frame, lerpCam, toScreen, toWorld, worldTransform, type Cam } from '../render/view';
import { sfx } from '../audio/sfx';

type Drag =
  | { kind: 'stick'; id: number; from: Pin; to: Pin | null; wx: number; wy: number; sx: number; sy: number }
  | { kind: 'part'; id: number; part: Placed; index: number | null; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { kind: 'tapStick'; id: number; index: number; sx: number; sy: number; moved: boolean }
  | { kind: 'button'; id: number; btn: string };

export interface BenchHost {
  launch(bp: Blueprint): void;
  back(): void;
}

export class Bench implements Screen {
  bp: Blueprint;
  private history: Blueprint[] = [];
  private future: Blueprint[] = [];
  private drag: Drag | null = null;
  private btns: Btn[] = [];
  private chips: { kind: PartKind; r: Rect }[] = [];
  private cam: Cam | null = null;
  private scout = false;
  private toast: { text: string; t: number; bad: boolean } | null = null;
  private com: { x: number; y: number } | null = null;
  private hover: { stick?: number; part?: number; pin?: Pin; chip?: PartKind } = {};
  private newKinds: Set<PartKind>;
  private trayTop = 0;
  private introT = 0;
  /** Seconds left of the opening look at the whole level. */
  private peek = 1.6;

  constructor(
    private app: App,
    readonly level: LevelDef,
    start: Blueprint,
    private host: BenchHost,
  ) {
    this.bp = clone(start);
    const prev = ALL[ALL.indexOf(level) - 1];
    this.newKinds = new Set(TRAY_ORDER.filter((k) => (level.kit[k] ?? 0) > 0 && !(prev?.kit[k] ?? 0)));
    if (level.num === 1) this.newKinds = new Set(['wheel']);
    this.refresh();
  }

  // ---------------------------------------------------------------- editing

  private edit(fn: (b: Blueprint) => void): void {
    this.history.push(clone(this.bp));
    if (this.history.length > 80) this.history.shift();
    this.future = [];
    fn(this.bp);
    this.refresh();
  }

  private undo(): void {
    const b = this.history.pop();
    if (!b) return sfx.deny();
    this.future.push(clone(this.bp));
    this.bp = b;
    sfx.unstick();
    this.refresh();
  }

  private redo(): void {
    const b = this.future.pop();
    if (!b) return sfx.deny();
    this.history.push(clone(this.bp));
    this.bp = b;
    sfx.stick();
    this.refresh();
  }

  private say(textS: string, bad = true): void {
    this.toast = { text: textS, t: 0, bad };
  }

  /** Recompute the balance point (main body plus wheels; lanterns float). */
  private refresh(): void {
    this.com = null;
    if (!this.bp.sticks.length) return;
    try {
      const r = new Run(this.level, this.bp);
      let m = 0;
      let x = 0;
      let y = 0;
      for (const b of [r.main, ...r.wheels.map((w) => w.body)]) {
        const bm = b.getMass();
        const c = b.getWorldCenter();
        m += bm;
        x += c.x * bm;
        y += c.y * bm;
      }
      if (m > 0) this.com = { x: x / m, y: y / m };
    } catch {
      this.com = null;
    }
  }

  private tryLaunch(): void {
    const p = launchProblem(this.bp);
    if (p) {
      sfx.deny();
      this.say(p);
      return;
    }
    sfx.go();
    this.host.launch(clone(this.bp));
  }

  // ---------------------------------------------------------------- geometry

  private benchRect() {
    const o = this.level.origin;
    const a = this.level.area;
    return { x0: o.x - 0.7, x1: o.x + a.cols * GRID + 0.7, y0: o.y - 0.7, y1: o.y + a.rows * GRID + 1.3 };
  }

  private targetCam(): Cam {
    const { W, H, s } = this.app;
    const top = 70 * s + (this.wide() ? 0 : this.stripH());
    const bottom = this.trayH() + 60 * s;
    if (this.scout || this.peek > 0) {
      const v = this.level.view;
      return frame(W, H, v, { x: 16 * s, y: top, w: W - 32 * s, h: H - top - bottom - 10 * s });
    }
    // leave room on the left for the job slip on wide screens
    const slipW = this.wide() ? 300 * s : 0;
    return frame(W, H, this.benchRect(), { x: slipW + 20 * s, y: top, w: W - slipW - 40 * s, h: H - top - bottom - 10 * s }, 260);
  }

  private wide(): boolean {
    return this.app.W > 900 * this.app.s;
  }

  /** Height of the compact job strip used on narrow screens. */
  private stripH(): number {
    const { ctx, W, s } = this.app;
    ctx.font = `600 ${Math.round(17 * s)}px ${BODY}`;
    const words = this.level.ask.split(' ');
    let n = 1;
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > W - 48 * s && line) {
        n++;
        line = w;
      } else line = test;
    }
    return n * 21 * s + 20 * s;
  }

  /** Tray layout: chips in one row, or two on narrow screens. */
  private tray() {
    const { W, s } = this.app;
    const kinds = TRAY_ORDER.filter((k) => (this.level.kit[k] ?? 0) > 0);
    const goW = Math.min(180 * s, Math.max(76, W * 0.2));
    const avail = W - goW - 40 * s;
    const minW = Math.max(56, 80 * s);
    const perRow = Math.max(1, Math.min(kinds.length, Math.floor((avail + 8 * s) / (minW + 8 * s))));
    const rows = Math.ceil(kinds.length / perRow);
    const cw = Math.min(118 * s, (avail - 8 * s) / perRow - 8 * s);
    const ch = Math.max(rows > 1 ? 72 : 0, 102 * s);
    const th = rows * (ch + 8 * s) + 22 * s;
    return { kinds, goW, perRow, rows, cw, ch, th };
  }

  private trayH(): number {
    return this.tray().th;
  }

  private worldAt(sx: number, sy: number) {
    return toWorld(this.cam!, sx, sy);
  }

  /** Pin nearest a world point, in bench pins; null if off the board or not close. */
  private pinAt(wx: number, wy: number, reach = 0.24, clampToArea = false): Pin | null {
    const o = this.level.origin;
    let c = Math.round((wx - o.x) / GRID);
    let r = Math.round((wy - o.y) / GRID);
    if (clampToArea) {
      c = Math.max(0, Math.min(this.level.area.cols, c));
      r = Math.max(0, Math.min(this.level.area.rows, r));
    }
    const p: Pin = [c, r];
    if (!inArea(p, this.level.area)) return null;
    const d = Math.hypot(o.x + c * GRID - wx, o.y + r * GRID - wy);
    return d <= reach ? p : null;
  }

  private partAt(wx: number, wy: number): number | null {
    const o = this.level.origin;
    let best: number | null = null;
    let bd = 0.26;
    this.bp.parts.forEach((p, i) => {
      const a = pinPos(p.at);
      const px = o.x + a.x;
      const py = o.y + a.y + floatUp(p.kind);
      const d = Math.hypot(px - wx, py - wy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private stickAt(wx: number, wy: number): number | null {
    const o = this.level.origin;
    let best: number | null = null;
    let bd = 0.11;
    this.bp.sticks.forEach((s, i) => {
      const a = pinPos(s.a);
      const b = pinPos(s.b);
      const ax = o.x + a.x;
      const ay = o.y + a.y;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / L2));
      const d = Math.hypot(ax + dx * t - wx, ay + dy * t - wy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  // ---------------------------------------------------------------- pointer

  down(p: PointerInfo): void {
    if (this.peek > 0) {
      this.peek = 0;
      return;
    }
    if (this.drag || !this.cam) return;
    const b = hit(this.btns, p.x, p.y);
    if (b) {
      this.drag = { kind: 'button', id: p.id, btn: b.id };
      return;
    }
    const chip = this.chips.find((c) => p.x >= c.r.x && p.x <= c.r.x + c.r.w && p.y >= c.r.y && p.y <= c.r.y + c.r.h);
    if (chip) {
      if (chip.kind === 'stick') {
        sfx.click();
        this.say('Drag from one pin to another to lay a matchstick', false);
        return;
      }
      if (left(this.bp, this.level.kit, chip.kind) <= 0) {
        sfx.deny();
        this.say(`No ${PARTS[chip.kind].name}s left in the kit`);
        return;
      }
      sfx.click();
      this.drag = { kind: 'part', id: p.id, part: { kind: chip.kind as Placed['kind'], at: [0, 0], dir: PARTS[chip.kind].dir }, index: null, sx: p.x, sy: p.y, x: p.x, y: p.y, moved: true };
      return;
    }
    if (this.scout) {
      this.scout = false;
      return;
    }
    const w = this.worldAt(p.x, p.y);
    const pi = this.partAt(w.x, w.y);
    if (p.button === 2) {
      if (pi !== null) {
        this.edit((bp) => bp.parts.splice(pi, 1));
        sfx.unstick();
        return;
      }
      const si = this.stickAt(w.x, w.y);
      if (si !== null) {
        this.edit((bp) => removeStick(bp, si));
        sfx.unstick();
      }
      return;
    }
    if (pi !== null) {
      this.drag = { kind: 'part', id: p.id, part: { ...this.bp.parts[pi] }, index: pi, sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false };
      return;
    }
    const pin = this.pinAt(w.x, w.y);
    if (pin) {
      this.drag = { kind: 'stick', id: p.id, from: pin, to: null, wx: w.x, wy: w.y, sx: p.x, sy: p.y };
      sfx.pin();
      return;
    }
    const si = this.stickAt(w.x, w.y);
    if (si !== null) this.drag = { kind: 'tapStick', id: p.id, index: si, sx: p.x, sy: p.y, moved: false };
  }

  move(p: PointerInfo): void {
    if (!this.cam) return;
    const d = this.drag;
    if (!d) {
      if (p.touch) return;
      const w = this.worldAt(p.x, p.y);
      const chip = this.chips.find((c) => p.x >= c.r.x && p.x <= c.r.x + c.r.w && p.y >= c.r.y && p.y <= c.r.y + c.r.h);
      const part = this.partAt(w.x, w.y) ?? undefined;
      this.hover = { chip: chip?.kind, part, stick: part === undefined ? (this.stickAt(w.x, w.y) ?? undefined) : undefined, pin: this.pinAt(w.x, w.y) ?? undefined };
      return;
    }
    if (d.id !== p.id) return;
    if (d.kind === 'stick') {
      const w = this.worldAt(p.x, p.y);
      d.wx = w.x;
      d.wy = w.y;
      const to = this.pinAt(w.x, w.y, 0.3);
      if (to && (!d.to || !samePin(to, d.to)) && !samePin(to, d.from)) sfx.click();
      d.to = to && !samePin(to, d.from) ? to : null;
    } else if (d.kind === 'part') {
      d.x = p.x;
      d.y = p.y;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 8) d.moved = true;
    } else if (d.kind === 'tapStick') {
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 8) d.moved = true;
    }
  }

  up(p: PointerInfo): void {
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    this.drag = null;
    if (d.kind === 'button') {
      const b = hit(this.btns, p.x, p.y);
      if (b?.id === d.btn) this.press(b.id);
      return;
    }
    if (d.kind === 'stick') {
      if (!d.to) {
        // a tap on a pin that a matchstick runs through pulls that matchstick out
        if (Math.hypot(p.x - d.sx, p.y - d.sy) < 10) {
          const si = this.stickAt(d.wx, d.wy);
          if (si !== null) {
            this.edit((bp) => removeStick(bp, si));
            sfx.unstick();
          }
        }
        return;
      }
      const s = { a: d.from, b: d.to };
      const why = stickProblem(this.bp, this.level.kit, this.level.area, s);
      if (why) {
        sfx.deny();
        this.say(why);
        return;
      }
      this.edit((bp) => bp.sticks.push(s));
      sfx.stick();
      return;
    }
    if (d.kind === 'tapStick') {
      if (d.moved) return;
      this.edit((bp) => removeStick(bp, d.index));
      sfx.unstick();
      return;
    }
    // a part
    if (!d.moved) {
      if (d.index === null) return;
      const part = this.bp.parts[d.index];
      if (PARTS[part.kind].aims) {
        this.edit((bp) => (bp.parts[d.index!].dir = (bp.parts[d.index!].dir + 1) % 8));
        sfx.turn();
      } else {
        this.say(`${PARTS[part.kind].name}: ${PARTS[part.kind].text}`, false);
      }
      return;
    }
    const w = this.worldAt(p.x, p.y);
    const overTray = p.y > this.trayTop;
    const pin = overTray ? null : this.pinAt(w.x, w.y, 0.36);
    if (!pin) {
      if (d.index !== null) {
        this.edit((bp) => bp.parts.splice(d.index!, 1));
        sfx.unstick();
      }
      return;
    }
    const why = partProblem(this.bp, this.level.kit, d.part.kind, pin, d.index !== null ? this.bp.parts[d.index] : undefined);
    if (why) {
      sfx.deny();
      this.say(why);
      return;
    }
    this.edit((bp) => {
      if (d.index !== null) bp.parts[d.index].at = pin;
      else bp.parts.push({ ...d.part, at: pin });
    });
    sfx.pin();
  }

  private press(id: string): void {
    sfx.click();
    if (id === 'go') this.tryLaunch();
    else if (id === 'back') this.host.back();
    else if (id === 'undo') this.undo();
    else if (id === 'redo') this.redo();
    else if (id === 'scout') this.scout = !this.scout;
    else if (id === 'mute') this.app.toggleMute();
    else if (id === 'clear') {
      if (!this.bp.sticks.length && !this.bp.parts.length) return;
      this.edit((bp) => {
        bp.sticks = [];
        bp.parts = [];
      });
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    const inp = this.app.input;
    this.introT += dt;
    if (this.peek > 0) {
      this.peek -= dt;
      if (inp.pressed.length) this.peek = 0;
    }
    for (const k of inp.pressed) {
      if (k === 'Enter' || k === 'g') this.tryLaunch();
      else if (k === 'z' && inp.ctrl) inp.shift ? this.redo() : this.undo();
      else if (k === 'y' && inp.ctrl) this.redo();
      else if (k === 'Tab' || k === 's') this.scout = !this.scout;
      else if (k === 'Escape') this.host.back();
      else if (k === 'm') this.app.toggleMute();
    }
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > 2.4) this.toast = null;
    }
    const target = this.targetCam();
    this.cam = this.cam && this.cam.W === target.W && this.cam.H === target.H ? lerpCam(this.cam, target, 1 - Math.pow(0.0005, dt)) : target;
    this.trayTop = this.app.H - this.trayH();
  }

  draw(): void {
    const { ctx, dpr, W, H, s, t } = this.app;
    const cam = this.cam ?? this.targetCam();
    this.cam = cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop(ctx, cam, t, this.level.world);
    worldTransform(ctx, cam, dpr);
    this.drawBoard(ctx, t, false);
    drawLevel(ctx, this.level, t, { delivered: false, letterGot: false });
    this.drawBoard(ctx, t, true);
    const d = this.drag;
    drawBlueprint(ctx, this.level, this.bp, t, {
      hotStick: d?.kind === 'tapStick' ? d.index : this.hover.stick,
      hotPart: this.hover.part,
      hidePart: d?.kind === 'part' && d.index !== null && d.moved ? d.index : undefined,
    });
    const lamp = this.bp.parts.find((p) => p.kind === 'lamp');
    if (lamp) {
      const a = pinPos(lamp.at);
      drawLampLight(ctx, this.level.origin.x + a.x, this.level.origin.y + a.y + 0.1, 0.25, t);
    }
    this.drawAims(ctx);
    this.drawCom(ctx);
    this.drawDrag(ctx, t);
    this.drawHint(ctx, t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.btns = [];
    this.drawTop(ctx, W, s);
    if (!this.scout && this.wide()) this.drawSlip(ctx, s);
    else if (!this.scout) this.drawStrip(ctx, W, s);
    this.drawTray(ctx, W, H, s, t);
    this.drawToast(ctx, W, s);
    if (!this.scout && !this.bp.sticks.length && !this.drag && this.cam) {
      const p = toScreen(this.cam, this.level.origin.x + 2.5 * GRID, this.level.origin.y + 1.2 * GRID);
      text(ctx, 'DRAG FROM PIN TO PIN', p.x, p.y, 22 * s, C.paper, 'center', 5 * s);
    }
    if (this.scout) text(ctx, 'SCOUTING — tap anywhere to go back to the bench', W / 2, 92 * s, 20 * s, C.paper, 'center', 5 * s);
  }

  private drawBoard(ctx: CanvasRenderingContext2D, t: number, pins: boolean): void {
    const o = this.level.origin;
    const a = this.level.area;
    const pad = 0.3;
    if (pins) return this.drawPins(ctx, t);
    // cork board standing behind the build
    ctx.save();
    ctx.globalAlpha = this.scout ? 0.35 : 0.92;
    rr(ctx, o.x - pad, o.y - pad, a.cols * GRID + pad * 2, a.rows * GRID + pad * 2, 0.08);
    inked(ctx, C.cork, 0.04);
    // cork speckle
    ctx.fillStyle = C.corkDark;
    for (let i = 0; i < 90; i++) {
      const x = o.x - pad + (((i * 0.6180339) % 1) * (a.cols * GRID + pad * 2));
      const y = o.y - pad + (((i * 0.4142135 + 0.3) % 1) * (a.rows * GRID + pad * 2));
      ctx.fillRect(x, y, 0.025, 0.025);
    }
    ctx.restore();
  }

  private drawPins(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.scout) return;
    const o = this.level.origin;
    const a = this.level.area;
    const ns = nodes(this.bp);
    const d = this.drag;
    for (let c = 0; c <= a.cols; c++)
      for (let r = 0; r <= a.rows; r++) {
        const hot = (!!this.hover.pin && this.hover.pin[0] === c && this.hover.pin[1] === r) || (d?.kind === 'stick' && ((d.to && d.to[0] === c && d.to[1] === r) || (d.from[0] === c && d.from[1] === r)));
        if (ns.has(pinKey([c, r]))) continue;
        const x = o.x + c * GRID;
        const y = o.y + r * GRID;
        if (hot) drawPin(ctx, x, y, 0.04, true);
        else {
          ctx.beginPath();
          ctx.arc(x, y, 0.028, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(26,18,51,0.55)';
          ctx.fill();
        }
      }
    // while dragging a part, show every pin it could go on
    if (d?.kind === 'part' && d.moved) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      for (const k of ns) {
        const [c, r] = k.split(',').map(Number);
        const taken = this.bp.parts.some((p, i) => i !== d.index && p.at[0] === c && p.at[1] === r);
        if (taken) continue;
        ctx.beginPath();
        ctx.arc(o.x + c * GRID, o.y + r * GRID, 0.12 + pulse * 0.04, 0, Math.PI * 2);
        ctx.lineWidth = 0.025;
        ctx.strokeStyle = C.fire;
        ctx.stroke();
      }
    }
  }

  /** On an empty bench, a ghost matchstick shows the gesture. */
  private drawHint(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.scout || this.bp.sticks.length || this.drag) return;
    const o = this.level.origin;
    const k = (t % 1.8) / 1.2;
    const grow = Math.min(1, k);
    const a = { x: o.x + GRID, y: o.y };
    const b = { x: o.x + 4 * GRID, y: o.y };
    ctx.save();
    ctx.globalAlpha = k > 1 ? Math.max(0, 1 - (k - 1) * 2) : 0.85;
    drawStick(ctx, a.x, a.y, a.x + (b.x - a.x) * grow, b.y, { ghost: true });
    drawPin(ctx, a.x, a.y, 0.05, true);
    // fingertip
    ctx.beginPath();
    ctx.arc(a.x + (b.x - a.x) * grow, b.y - 0.12, 0.11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,241,207,0.9)';
    ctx.fill();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.restore();
  }

  private drawAims(ctx: CanvasRenderingContext2D): void {
    if (this.scout) return;
    const o = this.level.origin;
    this.bp.parts.forEach((p, i) => {
      if (!PARTS[p.kind].aims) return;
      const a = pinPos(p.at);
      const hot = this.hover.part === i;
      // rockets push the way they point; springs push away from their foot
      const pushDir = p.kind === 'spring' ? (p.dir + 4) % 8 : p.dir;
      drawAim(ctx, o.x + a.x, o.y + a.y, pushDir, hot ? C.fire : 'rgba(255,241,207,0.75)');
    });
  }

  private drawCom(ctx: CanvasRenderingContext2D): void {
    if (!this.com || this.scout) return;
    const { x, y } = this.com;
    const r = 0.09;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = C.cream;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, 0, Math.PI / 2);
    ctx.closePath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.restore();
  }

  private drawDrag(ctx: CanvasRenderingContext2D, t: number): void {
    const d = this.drag;
    if (!d || !this.cam) return;
    const o = this.level.origin;
    if (d.kind === 'stick') {
      const a = pinPos(d.from);
      const end = d.to ? pinPos(d.to) : { x: d.wx - o.x, y: d.wy - o.y };
      const bad = d.to ? stickProblem(this.bp, this.level.kit, this.level.area, { a: d.from, b: d.to }) !== null : false;
      ctx.save();
      ctx.translate(o.x, o.y);
      if (d.to) drawStick(ctx, a.x, a.y, end.x, end.y, { ghost: true, bad });
      else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(end.x, end.y);
        ctx.setLineDash([0.08, 0.06]);
        ctx.lineWidth = 0.03;
        ctx.strokeStyle = C.paper;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }
    if (d.kind === 'part' && d.moved) {
      const w = this.worldAt(d.x, d.y);
      const pin = d.y > this.trayTop ? null : this.pinAt(w.x, w.y, 0.36);
      const ok = pin && !partProblem(this.bp, this.level.kit, d.part.kind, pin, d.index !== null ? this.bp.parts[d.index] : undefined);
      const at = ok && pin ? { x: o.x + pin[0] * GRID, y: o.y + pin[1] * GRID } : w;
      drawPart(ctx, d.part.kind, at.x, at.y + floatUp(d.part.kind), d.part.dir, 0, { t, flame: 1, ghost: !ok, bad: !ok && !!pin });
    }
  }

  // ---------------------------------------------------------------- HUD

  private drawTop(ctx: CanvasRenderingContext2D, W: number, s: number): void {
    const back: Rect = { x: 14 * s, y: 12 * s, w: 110 * s, h: 46 * s };
    button(ctx, back, '◀ JOBS', s, this.hot('back'), C.blue);
    this.btns.push({ id: 'back', r: back });
    const title = `JOB ${this.level.num} · ${this.level.name.toUpperCase()}`;
    const roomy = W > 560 * s;
    const fs = fitSize(ctx, title, W - (roomy ? 420 : 200) * s, 34 * s);
    text(ctx, title, W / 2, 36 * s, fs, C.paper, 'center', 6 * s);
    const mute: Rect = { x: W - 60 * s, y: 12 * s, w: 46 * s, h: 46 * s };
    button(ctx, mute, this.app.save.muted ? '×' : '♪', s, this.hot('mute'), C.inkSoft);
    this.btns.push({ id: 'mute', r: mute });
    // the level's stars, top-right
    const st = this.app.save.levels[this.level.id]?.stars ?? [false, false, false];
    if (roomy) for (let i = 0; i < 3; i++) star(ctx, W - 180 * s + i * 34 * s, 35 * s, 13 * s, st[i], s);
  }

  /** The job slip: what this level asks, and what each star wants. */
  private drawSlip(ctx: CanvasRenderingContext2D, s: number): void {
    const x = 16 * s;
    const y = 76 * s;
    const w = 280 * s;
    const intro = Math.min(1, this.introT / 0.35);
    const ease = 1 - Math.pow(1 - intro, 3);
    ctx.save();
    ctx.translate(-(1 - ease) * 320 * s, 0);
    const h = this.slipHeight(ctx, w, s);
    panel(ctx, { x, y, w, h }, C.paper, s, -0.015);
    let yy = y + 16 * s;
    text(ctx, 'THE JOB', x + 16 * s, yy + 8 * s, 18 * s, C.red, 'left');
    yy += 26 * s;
    yy = wrapText(ctx, this.level.ask, x + 16 * s, yy, w - 32 * s, 16 * s, C.ink);
    yy += 8 * s;
    const lines = ['Deliver the lamp lit', 'Pick up the letter', this.level.star.text];
    const st = this.app.save.levels[this.level.id]?.stars ?? [false, false, false];
    for (let i = 0; i < 3; i++) {
      star(ctx, x + 26 * s, yy + 11 * s, 10 * s, st[i], s);
      yy = wrapText(ctx, lines[i], x + 44 * s, yy + 2 * s, w - 60 * s, 15 * s, C.inkSoft) + 4 * s;
    }
    ctx.restore();
  }

  private drawStrip(ctx: CanvasRenderingContext2D, W: number, s: number): void {
    const h = this.stripH();
    const y = 66 * s;
    panel(ctx, { x: 12 * s, y, w: W - 24 * s, h: h - 6 * s }, C.paper, s);
    wrapText(ctx, this.level.ask, 24 * s, y + 8 * s, W - 48 * s, 17 * s, C.ink, 'left', 1.25);
  }

  private slipHeight(ctx: CanvasRenderingContext2D, w: number, s: number): number {
    // measure by drawing off-screen is overkill; estimate from word wrap
    ctx.font = `600 ${Math.round(16 * s)}px ${BODY}`;
    const lines = (str: string, maxW: number) => {
      let n = 1;
      let line = '';
      for (const word of str.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) {
          n++;
          line = word;
        } else line = test;
      }
      return n;
    };
    let h = 42 * s + lines(this.level.ask, w - 32 * s) * 20 * s + 8 * s;
    ctx.font = `600 ${Math.round(15 * s)}px ${BODY}`;
    for (const l of ['Deliver the lamp lit', 'Pick up the letter', this.level.star.text]) h += lines(l, w - 60 * s) * 18.75 * s + 6 * s;
    return h + 12 * s;
  }

  private hot(id: string): boolean {
    const m = this.app.input.mouse;
    const b = this.btns.find((x) => x.id === id);
    if (this.drag?.kind === 'button') return this.drag.btn === id;
    return !!b && m.x >= b.r.x && m.x <= b.r.x + b.r.w && m.y >= b.r.y && m.y <= b.r.y + b.r.h;
  }

  private drawTray(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, t: number): void {
    const th = this.trayH();
    const y0 = H - th;
    // a strip of kraft paper
    ctx.fillStyle = C.kraft;
    ctx.fillRect(0, y0, W, th);
    ctx.fillStyle = C.kraftDark;
    ctx.fillRect(0, y0, W, 6 * s);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, y0 - 2 * s, W, 4 * s);

    // right: GO lever, and edit buttons above the tray
    const lay = this.tray();
    const goW = lay.goW;
    const go: Rect = { x: W - goW - 16 * s, y: y0 + 16 * s, w: goW, h: Math.min(th - 36 * s, 110 * s) };
    const ready = !launchProblem(this.bp);
    button(ctx, go, 'GO!', s, this.hot('go'), ready ? C.green : C.greenDark, true);
    if (!this.app.input.touchUI) keycap(ctx, 'Enter', go.x + go.w / 2, go.y + go.h + 12 * s, s * 0.8);
    this.btns.push({ id: 'go', r: go });

    const small = (id: string, label: string, i: number, enabled = true) => {
      const r: Rect = { x: W - 16 * s - (i + 1) * 92 * s, y: y0 - 58 * s, w: 84 * s, h: 44 * s };
      button(ctx, r, label, s * 0.8, this.hot(id), C.inkSoft, enabled);
      this.btns.push({ id, r });
    };
    small('scout', this.scout ? 'BENCH' : 'SCOUT', 0);
    small('clear', 'CLEAR', 1, this.bp.sticks.length + this.bp.parts.length > 0);
    small('redo', 'REDO', 2, this.future.length > 0);
    small('undo', 'UNDO', 3, this.history.length > 0);

    // part chips
    this.chips = [];
    const { kinds, cw, ch, perRow } = lay;
    kinds.forEach((k, i) => {
      const r: Rect = { x: 16 * s + (i % perRow) * (cw + 8 * s), y: y0 + 14 * s + Math.floor(i / perRow) * (ch + 8 * s), w: cw, h: ch };
      this.chips.push({ kind: k, r });
      const n = left(this.bp, this.level.kit, k);
      const hot = this.hover.chip === k;
      ctx.save();
      ctx.globalAlpha = n > 0 ? 1 : 0.45;
      rr(ctx, r.x + 3 * s, r.y + 5 * s, r.w, r.h, 10 * s);
      ctx.fillStyle = 'rgba(26,18,51,0.5)';
      ctx.fill();
      rr(ctx, r.x, r.y - (hot ? 3 * s : 0), r.w, r.h, 10 * s);
      ctx.fillStyle = hot ? C.cream : C.paper;
      ctx.fill();
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      // the part itself, at the same look as on the bench
      const ps = Math.min(r.w, r.h) * (k === 'stick' ? 0.5 : k === 'lamp' ? 1.15 : 1.25);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h * 0.42 - (hot ? 3 * s : 0));
      ctx.scale(ps, -ps);
      if (k === 'stick') drawStick(ctx, -0.6, -0.3, 0.6, 0.3);
      else drawPart(ctx, k, 0, k === 'lamp' ? -0.05 : 0, PARTS[k].dir === 6 ? 6 : PARTS[k].dir, 0, { t, flame: 1 });
      ctx.restore();
      const name = PARTS[k].name.toUpperCase();
      text(ctx, name, r.x + r.w / 2, r.y + r.h - 16 * s, fitSize(ctx, name, r.w - 10 * s, 15 * s), C.ink, 'center');
      // count badge
      const bx = r.x + r.w - 6 * s;
      const by = r.y + 6 * s;
      ctx.beginPath();
      ctx.arc(bx, by, 14 * s, 0, Math.PI * 2);
      ctx.fillStyle = n > 0 ? C.red : C.inkSoft;
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
      text(ctx, String(n), bx, by + 1, 17 * s, C.cream, 'center');
      if (this.newKinds.has(k)) {
        rr(ctx, r.x - 6 * s, r.y - 8 * s, 44 * s, 20 * s, 5 * s);
        ctx.fillStyle = C.mustard;
        ctx.fill();
        ctx.lineWidth = 2 * s;
        ctx.stroke();
        text(ctx, 'NEW', r.x + 16 * s, r.y + 2 * s, 15 * s, C.ink, 'center');
      }
      ctx.restore();
    });
    // tooltip for the hovered chip (or the newest part, on wide screens)
    const tip = this.hover.chip ?? (this.drag?.kind === 'part' ? this.drag.part.kind : undefined);
    if (tip) {
      const info = PARTS[tip];
      const ctl = info.control ? CONTROL_INFO[info.control] : null;
      const tw = Math.min(420 * s, W - 32 * s);
      const chip = this.chips.find((c) => c.kind === tip)!;
      const tx = Math.max(16 * s, Math.min(W - tw - 16 * s, chip.r.x));
      const ty = y0 - 70 * s - 58 * s;
      panel(ctx, { x: tx, y: ty, w: tw, h: 64 * s }, C.cream, s);
      text(ctx, info.name.toUpperCase() + (ctl ? `  ·  ${ctl.hold ? 'hold' : 'tap'} ${ctl.key}` : ''), tx + 12 * s, ty + 16 * s, 17 * s, C.red);
      wrapText(ctx, info.text, tx + 12 * s, ty + 28 * s, tw - 24 * s, 13 * s, C.ink, 'left', 1.2);
    }
  }

  private drawToast(ctx: CanvasRenderingContext2D, W: number, s: number): void {
    if (!this.toast) return;
    const k = this.toast.t;
    const a = k > 2 ? 1 - (k - 2) / 0.4 : 1;
    const pop = Math.min(1, k / 0.12);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `700 ${Math.round(22 * s)}px ${FONT}`;
    const w = Math.min(W - 40 * s, ctx.measureText(this.toast.text).width + 40 * s);
    const y = this.trayTop - 130 * s;
    ctx.translate(W / 2, y);
    ctx.scale(0.8 + pop * 0.2, 0.8 + pop * 0.2);
    panel(ctx, { x: -w / 2, y: -22 * s, w, h: 44 * s }, this.toast.bad ? C.red : C.teal, s);
    text(ctx, this.toast.text, 0, 1, fitSize(ctx, this.toast.text, w - 30 * s, 22 * s), C.cream, 'center', 4 * s);
    ctx.restore();
  }

  /** For the camera handoff to the run. */
  get camera(): Cam | null {
    return this.cam;
  }

  screenOf(x: number, y: number) {
    return this.cam ? toScreen(this.cam, x, y) : { x: 0, y: 0 };
  }
}
