// A launch: the build runs on the level while you work its controls. R takes
// you straight back to the bench with the build as it was.
import type { App, Btn, Screen } from './app';
import { hit } from './app';
import type { PointerInfo } from './input';
import type { LevelDef } from '../sim/level';
import { Run, NO_INPUT, TICK, type RunInput, type OutCause, type RunEvent } from '../sim/run';
import { CONTROL_INFO, PARTS, type Control } from '../sim/parts';
import type { Blueprint } from '../sim/blueprint';
import { starsFor, type Stars } from '../sim/stars';
import { C, FONT } from '../render/palette';
import { button, panel, text, fitSize, keycap, star, wrapText, type Rect } from '../render/ui';
import { rr } from '../render/art';
import { drawBackdrop, drawLevel, drawRun, drawLampLight } from '../render/scene';
import { lerpCam, worldTransform, type Cam } from '../render/view';
import { sfx } from '../audio/sfx';

export interface PlayHost {
  rebuild(): void;
  next(): void;
  levels(): void;
  hasNext(): boolean;
  /** Record the result; returns the stars newly earned. */
  record(stars: Stars): boolean[];
}

const CAUSE: Record<OutCause | 'fell', [string, string]> = {
  knocks: ['KNOCKED OUT', 'Too many hard knocks shook the flame out. Land on the wheels, keep the lamp off the walls.'],
  fire: ['BURNED DRY', 'The fire parts burned the last of the oil. Shorter bursts, or fewer of them.'],
  tipped: ['SPILLED', 'Upside down too long and the oil ran out. Try a lower lamp or a wider base.'],
  ink: ['INKED', 'Into the inkwell. Something has to carry you over it.'],
  fell: ['LOST', 'Off the edge of the desk.'],
};

const CONTROL_ORDER: Control[] = ['drive', 'rockets', 'lanterns', 'springs'];

export class Play implements Screen {
  run: Run;
  private acc = 0;
  private cam: Cam;
  private btns: Btn[] = [];
  private pads: { c: Control; x: number; y: number; r: number }[] = [];
  private touchHeld = new Map<number, Control>();
  private springQueued = false;
  private kicks = new Map<number, number>();
  private controls: Control[];
  private endT = -1;
  private result: { stars: Stars; fresh: boolean[]; t: number } | null = null;
  private stampsPlayed = 0;
  private firstFrame = true;
  private wasFiring = { rockets: false, lanterns: false };

  constructor(
    private app: App,
    readonly level: LevelDef,
    readonly bp: Blueprint,
    private host: PlayHost,
    from: Cam | null,
  ) {
    this.run = new Run(level, bp);
    const present = new Set(bp.parts.map((p) => PARTS[p.kind].control).filter((c): c is Control => !!c));
    this.controls = CONTROL_ORDER.filter((c) => present.has(c));
    this.cam = from ?? this.followCam(1);
  }

  // ---------------------------------------------------------------- input

  private inputs(): RunInput {
    const k = this.app.input;
    const held = new Set(this.touchHeld.values());
    const inp: RunInput = {
      drive: k.isHeld(' ') || k.isHeld('d') || k.isHeld('ArrowRight') || held.has('drive'),
      rockets: k.isHeld('w') || k.isHeld('ArrowUp') || held.has('rockets'),
      lanterns: k.isHeld('e') || held.has('lanterns'),
      springs: this.springQueued,
    };
    this.springQueued = false;
    return inp;
  }

  down(p: PointerInfo): void {
    const b = hit(this.btns, p.x, p.y);
    if (b) {
      this.press(b.id);
      return;
    }
    for (const pad of this.pads) {
      if (Math.hypot(p.x - pad.x, p.y - pad.y) <= pad.r * 1.15) {
        if (pad.c === 'springs') this.springQueued = true;
        else this.touchHeld.set(p.id, pad.c);
        return;
      }
    }
  }
  move(p: PointerInfo): void {
    // sliding a thumb between pads switches which one is held
    if (!this.touchHeld.has(p.id)) return;
    for (const pad of this.pads)
      if (pad.c !== 'springs' && Math.hypot(p.x - pad.x, p.y - pad.y) <= pad.r * 1.15) {
        this.touchHeld.set(p.id, pad.c);
        return;
      }
  }
  up(p: PointerInfo): void {
    this.touchHeld.delete(p.id);
  }

  private press(id: string): void {
    sfx.click();
    if (id === 'rebuild') this.host.rebuild();
    else if (id === 'again') this.restart();
    else if (id === 'next') this.host.next();
    else if (id === 'levels') this.host.levels();
    else if (id === 'mute') this.app.toggleMute();
  }

  private restart(): void {
    this.run = new Run(this.level, this.bp);
    this.acc = 0;
    this.endT = -1;
    this.result = null;
    this.stampsPlayed = 0;
    this.kicks.clear();
    this.app.fx.clear();
    sfx.go();
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    const inp = this.app.input;
    for (const k of inp.pressed) {
      if (k === 'r' || k === 'Escape') return this.host.rebuild();
      if (k === 't') return this.restart();
      if (k === 'q' || k === 'ArrowDown') this.springQueued = true;
      if (k === 'm') this.app.toggleMute();
      if (k === 'Enter' && this.result) {
        if (this.result.stars[0] && this.host.hasNext()) this.host.next();
        else this.restart();
        return;
      }
    }
    const r = this.run;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      r.step(r.outcome ? NO_INPUT : this.inputs());
      for (const e of r.events) this.onEvent(e);
    }
    for (const [i, v] of this.kicks) this.kicks.set(i, Math.max(0, v - dt * 4));
    // sound loops
    sfx.rocket(r.firing.rockets);
    sfx.lantern(r.firing.lanterns);
    sfx.drive(r.firing.drive, r.speed);
    if (r.firing.rockets && !this.wasFiring.rockets) sfx.ignite();
    this.wasFiring = { rockets: r.firing.rockets, lanterns: r.firing.lanterns };
    // smoke and sparks from working parts
    const fx = this.app.fx;
    if (r.firing.rockets && !this.app.save.reduced)
      for (const k of r.rockets) {
        const p = r.worldOf(k.local);
        const d = r.main.getWorldVector(k.dir);
        fx.burst(p.x - d.x * 0.25, p.y - d.y * 0.25, 1, 'spark', [C.fire, C.fireOrange], 1.5, 0.05, 0.3, -2);
      }
    sfx.intensity = 1 - r.flame;

    if (r.outcome && this.endT < 0) this.endT = 0;
    if (this.endT >= 0) {
      this.endT += dt;
      const wait = r.outcome === 'delivered' ? 1.1 : 0.9;
      if (!this.result && this.endT > wait) {
        const stars = starsFor(this.level, r, this.bp);
        this.result = { stars, fresh: this.host.record(stars), t: 0 };
        sfx.stopLoops();
      }
    }
    if (this.result) {
      this.result.t += dt;
      const due = Math.floor((this.result.t - 0.35) / 0.32) + 1;
      while (this.stampsPlayed < Math.min(3, due)) {
        if (this.result.stars[this.stampsPlayed]) sfx.stamp(this.stampsPlayed);
        this.stampsPlayed++;
        if (this.stampsPlayed === 3) sfx.fanfare(this.result.stars[0]);
      }
    }
    // camera
    const target = this.followCam(dt);
    this.cam = this.firstFrame ? lerpCam(this.cam, target, 0.08) : lerpCam(this.cam, target, 1 - Math.pow(0.02, dt));
    this.firstFrame = false;
  }

  private followCam(dt: number): Cam {
    const { W, H } = this.app;
    const v = this.level.view;
    // about 13 m across on landscape screens; phones in portrait get a closer view
    const scale = Math.min(110, Math.max(W < H ? 46 : 38, Math.min(W / 13, H / 8.5)));
    const lp = this.run.lampPos();
    const vel = this.run.main.getLinearVelocity();
    let x = lp.x + vel.x * 0.25 + 1.5;
    let y = lp.y + vel.y * 0.15 + 0.5;
    const hw = W / 2 / scale;
    const hh = H / 2 / scale;
    x = v.x1 - v.x0 < hw * 2 ? (v.x0 + v.x1) / 2 : Math.max(v.x0 + hw, Math.min(v.x1 - hw, x));
    y = v.y1 - v.y0 < hh * 2 ? Math.max(v.y0 + hh, (v.y0 + v.y1) / 2) : Math.max(v.y0 + hh, Math.min(v.y1 - hh, y));
    void dt;
    return { x, y, scale, W, H };
  }

  private onEvent(e: RunEvent): void {
    const fx = this.app.fx;
    const r = this.run;
    const lp = r.lampPos();
    switch (e.type) {
      case 'knock':
        sfx.knock(e.loss);
        fx.burst(e.x, e.y + 0.2, Math.min(12, 3 + Math.round(e.loss * 40)), 'spark', [C.fire, C.fireOrange, C.fireHot], 2.5, 0.06, 0.4);
        fx.kick(Math.min(10, e.loss * 60));
        if (e.loss > 0.03) fx.pop(`-${Math.round(e.loss * 100)}%`, e.x, e.y + 0.7, C.red, '', 0.7, 0.9);
        break;
      case 'spring': {
        const i = r.springs.findIndex((s) => Math.hypot(r.worldOf(s.local).x - e.x, r.worldOf(s.local).y - e.y) < 1);
        r.springs.forEach((_, k) => this.kicks.set(k, 1));
        void i;
        sfx.boing(e.hit);
        if (e.hit) fx.burst(e.x, e.y, 6, 'dust', 'rgba(255,241,207,0.6)', 1.5, 0.12, 0.5, 0);
        break;
      }
      case 'letter':
        sfx.letter();
        fx.burst(e.x, e.y, 14, 'paper', [C.cream, C.red, C.mustard], 4, 0.08, 1);
        fx.pop('LETTER!', e.x, e.y + 0.5, C.mustard, '', 0.9);
        break;
      case 'delivered':
        sfx.bell();
        fx.burst(lp.x, lp.y + 0.3, 30, 'paper', [C.red, C.mustard, C.teal, C.pink, C.blue], 6, 0.09, 1.4);
        fx.pop('DELIVERED!', lp.x, lp.y + 1.2, C.mustard, '', 1.3, 1.6);
        break;
      case 'out':
        if (e.cause === 'ink') sfx.splash();
        else sfx.blowout();
        fx.burst(e.x, e.y + 0.3, 14, 'dust', 'rgba(120,110,160,0.7)', 1.2, 0.18, 1.2, -1.5);
        break;
      case 'fell':
        sfx.blowout();
        break;
    }
  }

  // ---------------------------------------------------------------- draw

  draw(): void {
    const { ctx, dpr, W, H, s, t, fx } = this.app;
    const r = this.run;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop(ctx, this.cam, t);
    worldTransform(ctx, this.cam, dpr, fx.shakeOffset(t));
    drawLevel(ctx, this.level, t, { delivered: r.outcome === 'delivered', letterGot: r.letterGot });
    drawRun(ctx, r, t, this.kicks);
    const lp = r.lampPos();
    drawLampLight(ctx, lp.x, lp.y + 0.1, r.flame, t);
    fx.drawWorld(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.drawPops(ctx, this.cam, s);
    this.btns = [];
    this.drawHud(ctx, W, H, s, t);
    if (this.result) this.drawResult(ctx, W, H, s);
  }

  private hot(id: string): boolean {
    const m = this.app.input.mouse;
    const b = this.btns.find((x) => x.id === id);
    return !!b && m.x >= b.r.x && m.x <= b.r.x + b.r.w && m.y >= b.r.y && m.y <= b.r.y + b.r.h;
  }

  private drawHud(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, t: number): void {
    const r = this.run;
    const touch = this.app.input.touchUI;
    // flame gauge
    const gx = 16 * s;
    const gy = 16 * s;
    const gw = Math.min(300 * s, W * 0.42);
    panel(ctx, { x: gx, y: gy, w: gw, h: 58 * s }, C.paper, s);
    const bx = gx + 50 * s;
    const bw = gw - 66 * s;
    const by = gy + 18 * s;
    rr(ctx, bx, by, bw, 22 * s, 8 * s);
    ctx.fillStyle = C.inkSoft;
    ctx.fill();
    const low = r.flame < 0.25;
    const flick = low && Math.sin(t * 20) > 0 ? 0.6 : 1;
    if (r.flame > 0) {
      rr(ctx, bx, by, Math.max(10 * s, bw * r.flame), 22 * s, 8 * s);
      ctx.fillStyle = low ? C.fireRed : C.fire;
      ctx.globalAlpha = flick;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    rr(ctx, bx, by, bw, 22 * s, 8 * s);
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    if (this.level.star.kind === 'flame') {
      const mx = bx + bw * this.level.star.value;
      ctx.beginPath();
      ctx.moveTo(mx, by - 4 * s);
      ctx.lineTo(mx, by + 26 * s);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      star(ctx, mx, by - 6 * s, 7 * s, r.flame >= this.level.star.value, s);
    }
    text(ctx, `${Math.round(r.flame * 100)}%`, bx + bw / 2, by + 12 * s, 17 * s, C.cream, 'center', 4 * s);
    // little lamp icon
    ctx.save();
    ctx.translate(gx + 26 * s, gy + 30 * s);
    ctx.beginPath();
    ctx.moveTo(0, 14 * s);
    ctx.bezierCurveTo(-12 * s, 6 * s, -8 * s, -6 * s, 0, -16 * s);
    ctx.bezierCurveTo(8 * s, -6 * s, 12 * s, 6 * s, 0, 14 * s);
    ctx.fillStyle = r.flame > 0 ? C.fireOrange : C.inkSoft;
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.restore();
    // letter + time chips
    let cx = gx + gw + 12 * s;
    const chip = (label: string, on: boolean) => {
      ctx.font = `700 ${Math.round(18 * s)}px ${FONT}`;
      const w = ctx.measureText(label).width + 24 * s;
      panel(ctx, { x: cx, y: gy + 8 * s, w, h: 42 * s }, on ? C.mustard : C.paper, s);
      text(ctx, label, cx + w / 2, gy + 30 * s, 18 * s, C.ink, 'center');
      cx += w + 10 * s;
    };
    if (W > 600 * s) chip(r.letterGot ? 'LETTER ✓' : 'LETTER', r.letterGot);
    if (this.level.star.kind === 'time' && W > 700 * s) chip(`${r.time.toFixed(1)}s / ${this.level.star.value}s`, r.time <= this.level.star.value);

    // top right: rebuild, run again, mute
    const rb: Rect = { x: W - 16 * s - 150 * s, y: 14 * s, w: 150 * s, h: 48 * s };
    button(ctx, rb, 'REBUILD', s * 0.9, this.hot('rebuild'), C.blue, true, touch ? '' : 'R');
    this.btns.push({ id: 'rebuild', r: rb });
    if (W > 640 * s) {
      const ag: Rect = { x: rb.x - 12 * s - 120 * s, y: 14 * s, w: 120 * s, h: 48 * s };
      button(ctx, ag, 'AGAIN', s * 0.9, this.hot('again'), C.inkSoft, true, touch ? '' : 'T');
      this.btns.push({ id: 'again', r: ag });
    }

    // control pads, bottom right (big for thumbs; labelled with keys for keyboards)
    this.pads = [];
    if (!this.result) {
      const pr = (touch ? 52 : 44) * s;
      const held = new Set(this.touchHeld.values());
      const active: Record<Control, boolean> = { drive: r.firing.drive, rockets: r.firing.rockets, lanterns: r.firing.lanterns, springs: [...this.kicks.values()].some((v) => v > 0.6) };
      this.controls.forEach((c, i) => {
        const x = W - 20 * s - pr - i * (pr * 2 + 16 * s);
        const y = H - 24 * s - pr;
        this.pads.push({ c, x, y, r: pr });
        const on = active[c] || held.has(c);
        const col: Record<Control, string> = { drive: C.teal, rockets: C.red, lanterns: C.pink, springs: C.mustard };
        ctx.beginPath();
        ctx.arc(x + 4 * s, y + 6 * s, pr, 0, Math.PI * 2);
        ctx.fillStyle = C.ink;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + (on ? 3 * s : 0), pr, 0, Math.PI * 2);
        ctx.fillStyle = col[c];
        ctx.fill();
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
        const info = CONTROL_INFO[c];
        text(ctx, info.label, x, y - 6 * s + (on ? 3 * s : 0), fitSize(ctx, info.label, pr * 1.7, 20 * s), C.cream, 'center', 4 * s);
        if (!touch) keycap(ctx, info.key, x, y + 18 * s + (on ? 3 * s : 0), s * 0.85);
        else text(ctx, info.hold ? 'HOLD' : 'TAP', x, y + 16 * s, 13 * s, C.cream, 'center', 3 * s);
      });
    }
    // first-run nudge: nothing pressed yet and nothing moving
    if (!r.outcome && r.time > 1.2 && r.still > 60 && !this.result) {
      const msg = this.controls.length ? `Stuck? Use the controls, or press R to rebuild` : 'Stuck? Press R to rebuild';
      const fs = fitSize(ctx, msg, W - 60 * s, 22 * s);
      text(ctx, msg, W / 2, H * 0.3, fs, C.paper, 'center', 5 * s);
    }
  }

  private drawResult(ctx: CanvasRenderingContext2D, W: number, H: number, s: number): void {
    const res = this.result!;
    const k = Math.min(1, res.t / 0.25);
    const ease = 1 - Math.pow(1 - k, 3);
    ctx.fillStyle = `rgba(10,6,30,${0.45 * ease})`;
    ctx.fillRect(0, 0, W, H);
    const won = res.stars[0];
    const cw = Math.min(520 * s, W - 32 * s);
    const ch = 360 * s;
    const x = (W - cw) / 2;
    const y = (H - ch) / 2 + (1 - ease) * 60 * s;
    panel(ctx, { x, y, w: cw, h: ch }, C.paper, s, won ? -0.01 : 0.01);
    const cause = this.run.outcome === 'fell' ? 'fell' : (this.run.outCause ?? 'knocks');
    const [title, why] = won ? ['DELIVERED!', 'The window is lit.'] : CAUSE[cause];
    text(ctx, title, W / 2, y + 46 * s, fitSize(ctx, title, cw - 40 * s, 52 * s), won ? C.red : C.inkSoft, 'center');
    wrapText(ctx, why, W / 2, y + 80 * s, cw - 60 * s, 16 * s, C.ink, 'center');
    // stars stamp in one at a time
    const labels = ['Delivered lit', 'Picked up the letter', this.level.star.text];
    for (let i = 0; i < 3; i++) {
      const sx = x + cw * (0.2 + i * 0.3);
      const sy = y + 170 * s;
      const at = 0.35 + i * 0.32;
      const lt = res.t - at;
      const on = res.stars[i] && lt > 0;
      const sc = on ? (lt < 0.15 ? 1.8 - (lt / 0.15) * 0.8 : 1) : 1;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(sc, sc);
      ctx.rotate(on ? -0.12 + i * 0.12 : 0);
      star(ctx, 0, 0, 30 * s, on, s);
      ctx.restore();
      if (on && res.fresh[i] && lt > 0.2) text(ctx, 'NEW', sx + 26 * s, sy - 28 * s, 16 * s, C.red, 'center', 3 * s);
      wrapText(ctx, labels[i], sx, sy + 40 * s, cw * 0.28, 13 * s, C.inkSoft, 'center', 1.15);
    }
    // buttons
    const bw = (cw - 64 * s) / 3;
    const by = y + ch - 76 * s;
    const mk = (id: string, label: string, i: number, col: string, key: string) => {
      const r: Rect = { x: x + 16 * s + i * (bw + 16 * s), y: by, w: bw, h: 54 * s };
      button(ctx, r, label, s * 0.85, this.hot(id), col, true, this.app.input.touchUI ? '' : key);
      this.btns.push({ id, r });
    };
    mk('rebuild', 'REBUILD', 0, C.blue, 'R');
    mk('again', 'AGAIN', 1, C.inkSoft, 'T');
    if (won && this.host.hasNext()) mk('next', 'NEXT', 2, C.green, '⏎');
    else if (won) mk('levels', 'JOBS', 2, C.green, '');
    else mk('levels', 'JOBS', 2, C.teal, '');
  }
}
