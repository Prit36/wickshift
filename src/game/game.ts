// The night: title → shift → results → counter (shop) → next shift ... → dawn.
import { Shift, targetFor, ruleFor, SHIFTS, RULE_TEXT, type ShiftEvent } from '../sim/shift';
import { STAMPS, PARTS, MAX_STAMPS, BASE_TOLERANCE, type StampId, type PartId } from '../sim/rules';
import { TICK } from '../sim/rng';
import { newRun, wages, rollOffers, priceOf, rerollCost, buyOffer, type Run, type Offer } from '../sim/night';
import type { Pose } from '../sim/sim';
import { groundAt, type WindowSpot } from '../sim/terrain';
import { WorldArt, worldTransform, toScreen, type Cam } from '../render/world';
import { drawCartBody, drawWheel, drawStrut, drawLetter, drawHouse, drawFlame, rr, inked, type CartLook } from '../render/art';
import { C, BODY } from '../render/palette';
import { panel, button, text, wrapText, fmt, inside, coin, drawStamp, drawTag, logo, type Rect } from '../render/ui';
import { Fx } from './fx';
import { Input } from './input';
import { sfx } from '../audio/sfx';
import { loadSave, writeSave, type Save } from './save';
import { botInput } from '../sim/bot';

type Mode = 'title' | 'intro' | 'drive' | 'results' | 'shop' | 'over' | 'dawn';

interface PostSeq {
  t: number;
  w: WindowSpot;
  fromX: number;
  fromY: number;
  heat: number;
  sparks: number;
  value: number;
  parts: string[];
  shown: number;
  sparkI: number;
  partI: number;
  landed: boolean;
  bell: boolean;
  /** 0..1 while the total flies up to the meter. */
  fly: number;
}

interface Hit {
  r: Rect;
  id: string;
}

const AXLE_R = { x: -0.68, y: -0.28 };
const AXLE_F = { x: 0.7, y: -0.28 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Per-frame smoothing factor tuned at 60 Hz, corrected for the real frame time. */
const ease = (k60: number, dt: number) => 1 - Math.pow(1 - k60, dt * 60);
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), a: lerp(a.a, b.a, t) });

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private fx = new Fx();
  private mode: Mode = 'title';
  private run!: Run;
  shift!: Shift;
  private art!: WorldArt;
  private cam: Cam = { x: 0, y: 0, ppm: 60, W: 1280, H: 720, dpr: 1 };
  private t = 0;
  private acc = 0;
  private last: number | null = null;
  private paused = false;
  private hits: Hit[] = [];
  private posts: PostSeq[] = [];
  private shownPosted = 0;
  private meterBump = 0;
  private offers: Offer[] = [];
  private rerolls = 0;
  private selected: { kind: 'own' | 'offer'; i: number } | null = null;
  private modeT = 0;
  private finishInfo: { posted: number; target: number; passed: boolean; earned: number; lines: [string, number][] } | null = null;
  private hint: { id: string; text: string; t: number } | null = null;
  private seenHints = new Set<string>();
  private save: Save;
  private mood = 0;
  private blinkT = 0;
  private sparkAngle = 0;
  private lastLetterN = 0;
  private flameShown = 0;
  private pendingFinish = 0;
  private dpr = 1;
  /** Seconds since the previous rendered frame. */
  private fdt = 1 / 60;
  /** Dev only: let the test bot drive (set from the console as __ws.auto). */
  auto = false;
  private botMem = { flipTarget: null as number | null, a0: 0 };

  constructor(private canvas: HTMLCanvasElement, stage: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(stage);
    this.save = loadSave();
    sfx.setMuted(this.save.muted);
    this.fx.reduced = this.save.reduced;
    this.input.onFirstGesture = () => {
      sfx.unlock();
    };
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      sfx.suspend(document.hidden);
      if (document.hidden && this.mode === 'drive') this.paused = true;
      this.last = null;
    });
    this.resize();
    this.newRun();
    this.mode = 'title';
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    const frame = (now: number) => {
      this.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Dev only: advance the game by `sec` seconds of 60 Hz frames synchronously. */
  devRun(sec: number): void {
    let now = performance.now();
    this.last = now;
    now += 1000 / 60;
    for (let i = 0; i < Math.round(sec * 60); i++) {
      this.frame(now);
      now += 1000 / 60;
    }
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.cam.W = W;
    this.cam.H = H;
    this.cam.dpr = this.dpr;
  }

  private get s(): number {
    return Math.max(0.55, Math.min(1.5, Math.min(this.cam.W / 1280, this.cam.H / 720)));
  }

  private newRun(): void {
    this.run = newRun((Date.now() % 100000) + 1);
    this.startShift();
    sfx.setMusic(true);
  }

  private startShift(): void {
    const r = this.run;
    this.shift = new Shift({ seed: r.seed, shift: r.shift, target: targetFor(r.shift), stamps: r.stamps, parts: r.parts, glasses: r.glassesMax, rule: ruleFor(r.shift, r.seed) });
    this.art = new WorldArt(this.shift.course);
    this.posts = [];
    this.shownPosted = 0;
    this.fx.clear();

    this.finishInfo = null;
    this.pendingFinish = 0;
    this.mode = r.shift === 1 && this.mode === 'title' ? 'title' : 'intro';
    this.modeT = 0;
    const p = this.shift.sim.pos;
    this.cam.x = p.x + 3;
    this.cam.y = p.y + 1.5;
    // settle the cart on its wheels before showing it
    for (let i = 0; i < 30; i++) this.shift.sim.step({ gas: false, brake: false }, TICK);
  }

  private showHint(id: string, text: string): void {
    if (this.seenHints.has(id) || this.save.hintsDone.includes(id)) return;
    this.seenHints.add(id);
    this.hint = { id, text, t: 0 };
  }
  private retireHint(id: string): void {
    if (this.hint?.id === id) this.hint = null;
    if (!this.save.hintsDone.includes(id)) {
      this.save.hintsDone.push(id);
      writeSave(this.save);
    }
  }

  // ---------------------------------------------------------------- frame

  private frame(now: number): void {
    if (this.last === null) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (!(dt > 0)) dt = 0;
    this.fdt = dt;
    this.handleKeys();
    this.handleClicks();
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= TICK && steps < 5) {
        this.tick();
        this.acc -= TICK;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.t += dt;
      this.modeT += dt;
      this.fx.update(dt);
      this.updatePosts(dt);
    }
    sfx.update();
    sfx.engineUpdate(this.shift.sim.speed, this.shift.sim.throttle, (this.mode === 'drive' || this.mode === 'title' || this.mode === 'intro') && !this.paused && !this.shift.sim.crashed);
    this.render(Math.min(1, this.acc / TICK));
  }

  private handleKeys(): void {
    for (const k of this.input.takePressed()) {
      if (k === 'm') {
        this.save.muted = !this.save.muted;
        sfx.setMuted(this.save.muted);
        writeSave(this.save);
      }
      if (k === 'pause' && this.mode === 'drive') {
        this.paused = !this.paused;
        this.input.clear();
        this.last = null;
        continue;
      }
      if (this.paused) {
        if (k === 'r') {
          this.paused = false;
          this.newRun();
        }
        if (k === 'enter' || k === 'post') this.paused = false;
        continue;
      }
      if (this.mode === 'results' && this.modeT > 0.6 && (k === 'enter' || k === 'post')) this.afterResults();
      else if ((this.mode === 'over' || this.mode === 'dawn') && this.modeT > 0.8 && (k === 'enter' || k === 'r' || k === 'post')) {
        this.mode = 'title';
        this.newRun();
      } else if (this.mode === 'shop') this.shopKey(k);
    }
  }

  private handleClicks(): void {
    const clicks = this.input.takeClicks();
    for (const c of clicks) {
      const hit = [...this.hits].reverse().find((h) => inside(h.r, c.x, c.y));
      if (!hit) continue;
      sfx.click();
      this.onHit(hit.id);
    }
  }

  private onHit(id: string): void {
    if (id === 'pause') {
      this.paused = true;
      this.input.clear();
      return;
    }
    if (id === 'resume') {
      this.paused = false;
      this.last = null;
      return;
    }
    if (id === 'restart') {
      this.paused = false;
      this.mode = 'title';
      this.newRun();
      return;
    }
    if (id === 'mute') {
      this.save.muted = !this.save.muted;
      sfx.setMuted(this.save.muted);
      writeSave(this.save);
      return;
    }
    if (id === 'motion') {
      this.save.reduced = !this.save.reduced;
      this.fx.reduced = this.save.reduced;
      writeSave(this.save);
      return;
    }
    if (id === 'continue') return this.afterResults();
    if (id === 'again') {
      this.mode = 'title';
      this.newRun();
      return;
    }
    if (id === 'next') return this.leaveShop();
    if (id === 'reroll') return this.reroll();
    if (id.startsWith('offer:')) {
      const i = Number(id.slice(6));
      if (this.selected?.kind === 'offer' && this.selected.i === i) this.buy(i);
      else this.selected = { kind: 'offer', i };
      return;
    }
    if (id.startsWith('buy:')) return this.buy(Number(id.slice(4)));
    if (id.startsWith('own:')) {
      const i = Number(id.slice(4));
      this.selected = this.selected?.kind === 'own' && this.selected.i === i ? null : { kind: 'own', i };
      return;
    }
    if (id.startsWith('sell:')) return this.sell(Number(id.slice(5)));
  }

  // ---------------------------------------------------------------- simulation tick

  private tick(): void {
    const sh = this.shift;
    const driving = this.mode === 'drive';
    const allowMouse = this.input.mouse.y > this.cam.H * 0.18 || this.input.mouse.y < 0;
    const bot = this.auto ? botInput(sh, { flips: true }, this.botMem) : null;
    const gas = bot ? bot.gas : this.input.gas(allowMouse);
    const brake = bot ? bot.brake : this.input.brake(allowMouse);
    if ((this.mode === 'title' || this.mode === 'intro') && (gas || brake) && this.modeT > 0.3) {
      this.mode = 'drive';
      this.modeT = 0;
      this.retireHint('drive');
    }
    if (this.mode === 'title' || this.mode === 'intro') {
      this.input.takePost();
      sh.sim.step({ gas: false, brake: false }, TICK);
      if (this.mode === 'title' || this.run.shift === 1) this.showHint('drive', this.input.touchUI ? 'Hold the right pad to drive' : 'Hold → or D to drive');
      return;
    }
    if (!driving) {
      // keep the world alive behind the result card, freeze it behind full-screen menus
      if (this.mode !== 'results') return;
      if (!sh.done) sh.step({ gas: false, brake: false, post: false });
      else sh.sim.step({ gas: false, brake: false }, TICK);
      this.input.takePost();
      if (this.pendingFinish > 0 && --this.pendingFinish === 0) this.enterResults();
      return;
    }
    const post = this.input.takePost() || !!bot?.post;
    sh.step({ gas, brake, post });
    this.handleEvents(sh.events);
    // embers stream off a big flame
    const fl = sh.flame.size;
    if (!sh.sim.crashed && sh.flame.alive && Math.random() < 0.15 + fl * 0.6) {
      const lamp = sh.sim.lampWorld();
      const v = sh.sim.chassis.getLinearVelocity();
      this.fx.parts.push({ x: lamp.x + (Math.random() - 0.5) * 0.2, y: lamp.y + 0.7 + fl * 0.5, vx: v.x * 0.2 - 1 - Math.random(), vy: 1 + Math.random() * 1.5, life: 0.5 + fl * 0.5, max: 0.5 + fl * 0.5, size: 0.06 + fl * 0.06, color: Math.random() < 0.5 ? C.fire : C.fireOrange, kind: 'spark', rot: 0, vr: 0, g: -1 });
    }
    if (sh.done && this.pendingFinish === 0) {
      this.pendingFinish = 1;
      sh.sim.settle();
    }
    if (this.pendingFinish > 0) {
      this.mode = 'results';
      this.modeT = -1;
      this.pendingFinish = 70;
    }
    // contextual hints
    if (sh.sim.airborne && sh.sim.airTicks > 20) this.showHint('flip', this.input.touchUI ? 'In the air: right pad flips back, left pad flips forward' : 'In the air: → flips back, ← flips forward');
    const w = sh.windowInRange();
    if (w && sh.flame.alive) this.showHint('post', this.input.touchUI ? 'Tap POST to light the window with your flame!' : 'Press SPACE to post your flame into the window!');
    if (this.hint?.id === 'flip' && !sh.sim.airborne && sh.tricks > 0) this.retireHint('flip');
  }

  private handleEvents(events: readonly ShiftEvent[]): void {
    const sh = this.shift;
    for (const e of events) {
      switch (e.type) {
        case 'trick': {
          const p = e.pop;
          if (p.label === 'Letter') {
            this.fx.pop(`+${p.heat}`, e.x, e.y + 0.4, C.cream, p.sparks > 0 ? '+1 spark' : '', 0.6, 0.7);
            break;
          }
          const big = p.label.includes('flip') || p.label.includes('Huge');
          const col = p.label.includes('flip') ? C.pink : p.label.includes('Air') ? C.teal : p.label.includes('Wheelie') ? C.mustard : C.green;
          const sub = `+${fmt(p.heat)} heat${p.sparks > 0 ? `  +${p.sparks} spark${p.sparks > 1 ? 's' : ''}` : p.sparks < 0 ? '  sparks snuffed!' : p.repeat > 0 ? '  (again)' : ''}`;
          this.fx.pop(p.label, e.x, e.y, col, sub, big ? 1.25 : 0.95, 1.3);
          sfx.trick(sh.flame.sparks, big);
          const lamp = sh.sim.lampWorld();
          if (p.sparks > 0) this.fx.burst(lamp.x, lamp.y + 0.4, 14, 'spark', [C.fire, C.fireHot, C.fireOrange], 5, 0.12, 0.6, 4);
          if (big) this.fx.kick(4);
          break;
        }
        case 'letter':
          this.fx.burst(e.x, e.y, 8, 'paper', [C.white, C.cream, C.red], 3, 0.1, 0.8, 6);
          sfx.letter(this.lastLetterN++);
          break;
        case 'post': {
          const lamp = sh.sim.lampWorld();
          this.posts.push({ t: 0, w: e.window, fromX: lamp.x, fromY: lamp.y + 0.4, heat: e.heat, sparks: e.sparks, value: e.value, parts: e.parts, shown: e.heat, sparkI: 0, partI: 0, landed: false, bell: false, fly: 0 });
          this.run.windows++;
          sfx.whoosh();
          this.retireHint('post');
          break;
        }
        case 'emptyPost':
          this.fx.pop('No flame to post!', e.window.x, e.window.y + 3.2, C.paper, 'do a trick first', 0.7, 0.9);
          sfx.emptyPost();
          break;
        case 'skip':
          if (e.sparks > 0) {
            this.fx.pop('Postage Due', e.window.x, e.window.y + 3.4, C.mustard, `+${e.sparks} sparks`, 0.8);
            sfx.trick(sh.flame.sparks, false);
          }
          if (sh.flame.alive) this.showHint('greed', 'Skipped a window: your flame keeps growing… but a big flame blows out on hard landings!');
          break;
        case 'land': {
          const k = e.impact / e.tolerance;
          this.fx.burst(e.x, e.y + 0.1, Math.round(4 + k * 10), 'dust', ['rgba(255,241,207,0.8)', 'rgba(243,217,164,0.8)'], 2 + k * 3, 0.18, 0.5, 2);
          this.fx.kick(Math.min(10, e.impact * 0.5));
          sfx.land(e.impact);
          if (k > 0.8 && k <= 1 && sh.flame.alive) this.fx.pop('Close call!', e.x, e.y + 2.6, C.fireOrange, '', 0.7, 0.8);
          if (this.hint?.id === 'flip' && sh.tricks > 0) this.retireHint('flip');
          break;
        }
        case 'takeoff':
          sfx.takeoff();
          break;
        case 'blowout': {
          const lamp = sh.sim.lampWorld();
          this.fx.burst(lamp.x, lamp.y + 0.5, 24, 'dust', ['rgba(80,70,110,0.7)', 'rgba(140,130,160,0.6)'], 3, 0.3, 1.1, -1);
          this.fx.burst(lamp.x, lamp.y + 0.5, 14, 'spark', [C.fireOrange, C.fireRed], 6, 0.1, 0.5, 6);
          this.fx.pop('Blown out!', lamp.x, lamp.y + 1.6, C.fireRed, e.lost ? `-${fmt(e.lost)} postage` : '', 1.15, 1.4);
          this.fx.kick(9);
          sfx.blowout();
          this.mood = -1;
          this.showHint('blow', 'Bigger flames are fragile: land on downslopes, or post sooner!');
          break;
        }
        case 'crash': {
          const lamp = sh.sim.lampWorld();

          this.fx.burst(lamp.x, lamp.y, 22, 'glass', ['rgba(200,235,255,0.9)', C.white], 7, 0.12, 1.1, 14);
          this.fx.burst(lamp.x, lamp.y, 12, 'spark', [C.fireOrange, C.fire], 5, 0.1, 0.6, 8);
          this.fx.pop(e.reason === 'fall' ? 'Into the drawer!' : 'Smashed!', e.x, e.y + 2, C.red, `${sh.glasses} glass${sh.glasses === 1 ? '' : 'es'} left`, 1.2, 1.5);
          this.fx.kick(14);
          sfx.crash();
          this.mood = -1;
          break;
        }
        case 'respawn': {
          const p = sh.sim.pos;
          this.fx.ring(p.x, p.y + 0.3, C.fire, 2.5);

          this.mood = 0;
          break;
        }
        case 'finish':
          sfx.fanfare(e.passed);
          break;
      }
    }
  }

  private updatePosts(dt: number): void {
    const FLY = 0.32;
    for (const p of this.posts) {
      p.t += dt;
      if (p.t >= FLY && !p.bell) {
        p.bell = true;
        sfx.bell();
        const wy = p.w.high ? p.w.y : p.w.y + 3.6;
        this.fx.burst(p.w.x, wy, 20, 'spark', [C.fire, C.fireHot, C.cream], 6, 0.14, 0.7, 3);
        this.fx.ring(p.w.x, wy, C.fire, 3);
        this.fx.kick(3);
      }
      const tally = p.t - FLY - 0.15;
      const per = Math.max(0.05, Math.min(0.11, 0.9 / p.sparks));
      while (tally > 0 && p.sparkI < p.sparks && tally > p.sparkI * per) {
        p.sparkI++;
        p.shown = p.heat * p.sparkI;
        sfx.spark(p.sparkI);
      }
      const t2 = tally - p.sparks * per;
      while (p.sparkI >= p.sparks && t2 > 0 && p.partI < p.parts.length && t2 > p.partI * 0.22) {
        p.partI++;
        sfx.stamp();
        p.shown = p.value;
      }
      if (p.sparkI >= p.sparks && p.partI >= p.parts.length) p.shown = p.value;
      const done = t2 - p.parts.length * 0.22;
      p.fly = done > 0.45 ? Math.min(1, (done - 0.45) / 0.35) : 0;
      if (p.fly >= 1 && !p.landed) {
        p.landed = true;
        this.meterBump = 1;
        sfx.coin(2);
      }
    }
    this.posts = this.posts.filter((p) => p.t < 4);
    // the meter counts up only as posts land
    let landed = 0;
    for (const p of this.posts) if (!p.landed) landed += p.value;
    const target = Math.max(0, this.shift.posted - landed);
    this.shownPosted += (target - this.shownPosted) * Math.min(1, dt * 8);
    if (Math.abs(target - this.shownPosted) < 1) this.shownPosted = target;
    this.meterBump *= Math.pow(0.01, dt);
  }

  // ---------------------------------------------------------------- results & shop

  private enterResults(): void {
    const sh = this.shift;
    const target = sh.cfg.target;
    const passed = sh.passed;
    this.run.total += sh.posted;
    this.run.bestPost = Math.max(this.run.bestPost, sh.bestPost);
    if (!passed) {
      this.mode = 'over';
      this.modeT = 0;
      this.recordBest();
      return;
    }
    const lines = wages(sh);
    const earned = lines.reduce((a, l) => a + l[1], 0);
    this.run.pennies += earned;
    this.finishInfo = { posted: sh.posted, target, passed, earned, lines };
    this.modeT = 0;
    this.mode = 'results';
  }

  private afterResults(): void {
    if (this.mode !== 'results' || !this.finishInfo) return;
    if (this.run.shift >= SHIFTS) {
      this.mode = 'dawn';
      this.modeT = 0;
      this.recordBest();
      sfx.fanfare(true);
      return;
    }
    this.openShop();
  }

  private recordBest(): void {
    if (this.run.total > this.save.best) this.save.best = this.run.total;
    this.save.bestShift = Math.max(this.save.bestShift, this.run.shift - (this.mode === 'over' ? 1 : 0));
    writeSave(this.save);
  }

  private openShop(): void {
    this.mode = 'shop';
    this.modeT = 0;
    this.rerolls = 0;
    this.rollOffers();
    this.selected = { kind: 'offer', i: 0 };
  }

  private rollOffers(): void {
    this.offers = rollOffers(this.run, this.rerolls);
  }

  private priceOf(o: Offer): number {
    return priceOf(o);
  }

  private rerollCost(): number {
    return rerollCost(this.rerolls);
  }

  private reroll(): void {
    if (this.run.pennies < this.rerollCost()) return sfx.deny();
    this.run.pennies -= this.rerollCost();
    this.rerolls++;
    this.rollOffers();
    this.selected = { kind: 'offer', i: 0 };
    sfx.coin(0);
  }

  private buy(i: number): void {
    const o = this.offers[i];
    if (!o || o.sold) return;
    if (!buyOffer(this.run, o)) {
      sfx.deny();
      this.fx.kick(3);
      return;
    }
    this.selected = null;
    sfx.coin(3);
    sfx.stamp();
  }

  private sell(i: number): void {
    const id = this.run.stamps[i];
    if (!id) return;
    this.run.stamps.splice(i, 1);
    this.run.pennies += Math.floor(STAMPS[id].price / 2);
    this.selected = null;
    sfx.coin(1);
  }

  private leaveShop(): void {
    this.run.shift++;
    this.mode = 'intro';
    this.startShift();
  }

  private shopKey(k: string): void {
    if (k === 'enter') return this.leaveShop();
    if (k === 'r') return this.reroll();
    const n = Number(k);
    if (n >= 1 && n <= this.offers.length) {
      if (this.selected?.kind === 'offer' && this.selected.i === n - 1) this.buy(n - 1);
      else this.selected = { kind: 'offer', i: n - 1 };
    }
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(pose: Pose): void {
    const sim = this.shift.sim;
    const v = sim.chassis.getLinearVelocity();
    const H = this.cam.H;
    const ground = groundAt(this.shift.course, pose.x) ?? pose.y - 3;
    const height = Math.max(0, pose.y - ground);
    const viewM = Math.max(10.5 + Math.abs(v.x) * 0.22, height * 1.6 + 6);
    const ppmT = H / Math.min(24, viewM);
    const lead = Math.max(-2, Math.min(this.cam.W / ppmT * 0.18, v.x * 0.35));
    const tx = pose.x + lead + 1.5;
    const ty = Math.max(pose.y - height * 0.45 + 1.2, pose.y - viewM * 0.3);
    const dt = this.fdt;
    const k = this.mode === 'title' ? 1 : ease(0.08, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * ease(0.06, dt);
    this.cam.ppm += (ppmT - this.cam.ppm) * ease(0.04, dt);
    if (!Number.isFinite(this.cam.x) || !Number.isFinite(this.cam.y) || !Number.isFinite(this.cam.ppm)) {
      this.cam.x = tx;
      this.cam.y = ty;
      this.cam.ppm = ppmT;
    }
    if (this.mode === 'title' || this.mode === 'intro') {
      this.cam.ppm = H / 10.5;
      this.cam.x = pose.x + 3.4;
      this.cam.y = pose.y + 1.6;
    }
  }

  // ---------------------------------------------------------------- render

  private render(alpha: number): void {
    const ctx = this.ctx;
    const sh = this.shift;
    const sim = sh.sim;
    const cur = sim.pose();
    const prev = sim.prevPose ?? cur;
    const P = {
      chassis: lerpPose(prev.chassis, cur.chassis, alpha),
      rear: lerpPose(prev.rear, cur.rear, alpha),
      front: lerpPose(prev.front, cur.front, alpha),
    };
    if (!this.paused) this.updateCamera(P.chassis);
    const cam = this.cam;
    const sk = this.fx.shakeOffset(this.t);
    this.hits = [];

    this.art.drawBackground(ctx, cam, this.t, this.dpr);
    worldTransform(ctx, cam, sk.x, sk.y);
    const px = 1 / cam.ppm;
    this.drawWindowsBack(ctx);
    this.art.drawStanding(ctx, cam, this.t);
    this.art.drawTerrain(ctx, cam, px);
    // letters
    for (const l of sh.course.letters) {
      if (sh.got.has(l.id) || Math.abs(l.x - cam.x) > cam.W / cam.ppm) continue;
      drawLetter(ctx, l.x, l.y, this.t, l.id);
    }
    this.drawWindowsFront(ctx);
    this.drawCart(ctx, P);
    this.fx.drawWorld(ctx);
    this.drawPostEmbers(ctx);

    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSpeedLines(ctx);
    this.drawWorldLabels(ctx, P);
    this.fx.drawPops(ctx, cam, this.s);
    this.drawPostTallies(ctx);
    if (this.mode === 'drive' || this.mode === 'results' || this.mode === 'intro') this.drawHud(ctx);
    if (this.input.touchUI && (this.mode === 'drive' || this.mode === 'title' || this.mode === 'intro')) this.drawPads(ctx);
    this.drawHint(ctx);
    if (this.mode === 'title') this.drawTitle(ctx);
    if (this.mode === 'intro') this.drawIntro(ctx);
    if (this.mode === 'results' && this.finishInfo) this.drawResults(ctx);
    if (this.mode === 'shop') this.drawShop(ctx);
    if (this.mode === 'over') this.drawOver(ctx);
    if (this.mode === 'dawn') this.drawDawn(ctx);
    if (this.paused) this.drawPause(ctx);
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D): void {
    if (this.fx.reduced || this.mode !== 'drive') return;
    const v = this.shift.sim.chassis.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    if (sp < 11) return;
    const k = Math.min(1, (sp - 11) / 6);
    const W = this.cam.W;
    const H = this.cam.H;
    ctx.strokeStyle = `rgba(255,241,207,${0.25 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const seed = (i * 7919) % 101;
      const y = ((seed / 101) * H * 0.9 + H * 0.05) | 0;
      const len = 60 + (seed % 5) * 30;
      const x = W - (((this.t * (900 + seed * 6)) + seed * 97) % (W + len * 2));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * k, y - (v.y / Math.max(1, Math.abs(v.x))) * len * k * 0.5);
    }
    ctx.stroke();
  }

  private drawCart(ctx: CanvasRenderingContext2D, P: { chassis: Pose; rear: Pose; front: Pose }): void {
    const sh = this.shift;
    const sim = sh.sim;
    const parts = new Set(this.run.parts);
    const wheelKind = this.run.parts.find((p) => PARTS[p].slot === 'wheels') ?? null;
    const c = P.chassis;
    // contact shadow
    const g = groundAt(sh.course, c.x);
    if (g !== null) {
      const h = Math.max(0, c.y - g);
      ctx.fillStyle = `rgba(26,18,51,${Math.max(0, 0.35 - h * 0.04)})`;
      ctx.beginPath();
      ctx.ellipse(c.x, g + 0.02, 1.2 + h * 0.1, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const cos = Math.cos(c.a);
    const sin = Math.sin(c.a);
    const wp = (o: { x: number; y: number }) => ({ x: c.x + o.x * cos - o.y * sin, y: c.y + o.x * sin + o.y * cos });
    const soft = parts.has('bedspring');
    if (!sim.crashed || sh.crashTimer === 0) {
      const ar = wp(AXLE_R);
      const af = wp(AXLE_F);
      drawStrut(ctx, ar.x, ar.y + 0.12, P.rear.x, P.rear.y, soft);
      drawStrut(ctx, af.x, af.y + 0.12, P.front.x, P.front.y, soft);
    }
    for (const w of [P.rear, P.front]) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.a);
      drawWheel(ctx, sim.spec.wheelR, wheelKind);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    const flame = sh.flame;
    const target = sim.crashed ? 0 : flame.size;
    this.flameShown += (target - this.flameShown) * ease(0.12, this.fdt);
    this.blinkT -= this.fdt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
    const v = sim.chassis.getLinearVelocity();
    let mood = this.mood;
    if (sim.airborne) mood = v.y < -8 && flame.size > 0.5 ? -0.6 : 0.6;
    this.mood += (0 - this.mood) * ease(0.02, this.fdt);
    const look: CartLook = {
      t: this.t,
      flame: this.flameShown,
      dead: sim.crashed,
      lean: sim.lean,
      sparks: flame.sparks,
      wheels: wheelKind,
      parts,
      airborne: sim.airborne,
      mood,
      blink: this.blinkT < 0,
      cracked: flame.size > 0.85 ? 2 : flame.size > 0.55 ? 1 : 0,
    };
    drawCartBody(ctx, look);
    ctx.restore();
    // sparks orbiting the lamp
    if (!sim.crashed && flame.sparks > 1) {
      const lamp = sim.lampWorld();
      const n = flame.sparks - 1;
      this.sparkAngle += (0.05 + n * 0.004) * this.fdt * 60;
      for (let i = 0; i < Math.min(n, 24); i++) {
        const a = this.sparkAngle + (i / Math.min(n, 24)) * Math.PI * 2;
        const r = 0.75 + 0.12 * Math.sin(this.t * 5 + i);
        const x = lamp.x + Math.cos(a) * r;
        const y = lamp.y + 0.35 + Math.sin(a) * r * 0.75;
        ctx.beginPath();
        ctx.arc(x, y, 0.09, 0, Math.PI * 2);
        ctx.fillStyle = C.fireHot;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,200,60,0.35)';
        ctx.fill();
      }
    }
  }

  private windowTone(w: WindowSpot): string {
    const tones = [C.teal, C.blue, C.red, C.pink, C.green];
    return tones[w.id % tones.length];
  }

  private drawWindowsBack(ctx: CanvasRenderingContext2D): void {
    const sh = this.shift;
    const cam = this.cam;
    for (const w of sh.course.windows) {
      if (Math.abs(w.x - cam.x) > cam.W / cam.ppm + 6) continue;
      if (w.final) {
        this.drawOffice(ctx, w);
        continue;
      }
      if (w.high) continue;
      // post
      ctx.fillStyle = C.ink;
      ctx.fillRect(w.x - 0.09, w.y - 0.3, 0.18, 3.1);
      ctx.fillStyle = C.mustardDark;
      ctx.fillRect(w.x - 0.04, w.y - 0.3, 0.08, 3.1);
    }
  }

  private drawWindowsFront(ctx: CanvasRenderingContext2D): void {
    const sh = this.shift;
    const cam = this.cam;
    const inRange = sh.windowInRange();
    for (const w of sh.course.windows) {
      if (w.final || Math.abs(w.x - cam.x) > cam.W / cam.ppm + 6) continue;
      const lit = sh.lit.has(w.id) ? 1 : 0;
      const post = this.posts.find((p) => p.w.id === w.id);
      const litK = post ? Math.min(1, Math.max(0, (post.t - 0.32) * 6)) : lit;
      const hot = inRange?.id === w.id && sh.flame.alive && this.mode === 'drive';
      ctx.save();
      if (w.high) {
        // hanging by a string
        ctx.beginPath();
        ctx.moveTo(w.x, w.y + 1.2);
        ctx.lineTo(w.x, w.y + 30);
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = C.cream;
        ctx.stroke();
        ctx.translate(w.x, w.y - 0.9);
        ctx.rotate(Math.sin(this.t * 1.5 + w.id) * 0.05);
        const sc = 1 + (hot ? Math.sin(this.t * 14) * 0.04 : 0);
        ctx.scale(sc, sc);
        drawHouse(ctx, 1.5, 2.1, litK, this.t, hot, C.mustard);
      } else {
        ctx.translate(w.x, w.y + 2.7);
        const sc = 1 + (hot ? Math.sin(this.t * 14) * 0.04 : 0);
        ctx.scale(sc, sc);
        drawHouse(ctx, 1.6, 2.2, litK, this.t, hot, this.windowTone(w));
      }
      ctx.restore();
    }
  }

  private drawOffice(ctx: CanvasRenderingContext2D, w: WindowSpot): void {
    const x = w.x;
    const y = w.y;
    const lit = this.shift.done ? 1 : 0;
    // building
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y);
    ctx.lineTo(x - 4.5, y + 5.5);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x + 4.5, y + 5.5);
    ctx.lineTo(x + 4.5, y);
    ctx.closePath();
    inked(ctx, C.red, 0.1);
    // roof trim
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 5.3);
    ctx.lineTo(x, y + 8.3);
    ctx.lineTo(x + 5, y + 5.3);
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = C.ink;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineWidth = 0.18;
    ctx.strokeStyle = C.cream;
    ctx.stroke();
    // sign board
    rr(ctx, x - 3, y + 4.4, 6, 1.1, 0.15);
    inked(ctx, C.cream, 0.08);
    // big door/window
    const g = ctx.createRadialGradient(x, y + 2, 0.2, x, y + 2, 6);
    if (lit) {
      g.addColorStop(0, 'rgba(255,214,90,0.7)');
      g.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 6, y - 4, 12, 12);
    }
    ctx.beginPath();
    ctx.moveTo(x - 1.6, y);
    ctx.lineTo(x - 1.6, y + 2.4);
    ctx.arc(x, y + 2.4, 1.6, Math.PI, 0, true);
    ctx.lineTo(x + 1.6, y);
    ctx.closePath();
    inked(ctx, lit ? C.fire : C.ink, 0.1);
    for (const dx of [-3.3, 3.3]) {
      rr(ctx, x + dx - 0.6, y + 1.8, 1.2, 1.5, 0.2);
      inked(ctx, lit ? C.fire : C.inkSoft, 0.08);
    }
  }

  private drawPostEmbers(ctx: CanvasRenderingContext2D): void {
    for (const p of this.posts) {
      if (p.t > 0.32) continue;
      const k = p.t / 0.32;
      const wy = p.w.high ? p.w.y : p.w.y + 3.6;
      const x = lerp(p.fromX, p.w.x, k);
      const y = lerp(p.fromY, wy, k) + Math.sin(k * Math.PI) * 2;
      drawFlame(ctx, x, y - 0.3, 0.5, this.t);
      this.fx.burst(x, y, 1, 'spark', C.fire, 1, 0.1, 0.3, 0);
    }
  }

  private drawWorldLabels(ctx: CanvasRenderingContext2D, P: { chassis: Pose }): void {
    const sh = this.shift;
    const s = this.s;
    if (this.mode !== 'drive' && this.mode !== 'results') return;
    // sign on the sorting office
    const fin = sh.course.windows.find((w) => w.final);
    if (fin && Math.abs(fin.x - this.cam.x) < this.cam.W / this.cam.ppm) {
      const sp = toScreen(this.cam, fin.x, fin.y + 4.95);
      text(ctx, 'SORTING OFFICE', sp.x, sp.y, this.cam.ppm * 0.75, C.red, 'center');
    }
    // flame readout over the cart
    const flame = sh.flame;
    if (!sh.sim.crashed && flame.alive) {
      const sp = toScreen(this.cam, P.chassis.x, P.chassis.y + 2.0);
      const fragile = 1 - sh.tolerance() / (BASE_TOLERANCE * sh.tolMul);
      const col = fragile > 0.3 ? C.fireRed : fragile > 0.15 ? C.fireOrange : C.fire;
      const wob = fragile > 0.3 && !this.fx.reduced ? Math.sin(this.t * 30) * 2 * s : 0;
      text(ctx, fmt(flame.heat), sp.x + wob, sp.y, 34 * s, col, 'center', 7 * s);
      text(ctx, `${flame.sparks} spark${flame.sparks > 1 ? 's' : ''}`, sp.x, sp.y + 26 * s, 17 * s, C.fireHot, 'center', 5 * s);
      if (sh.live && sh.live.heat > 0) text(ctx, sh.live.label.toUpperCase(), sp.x, sp.y - 30 * s, 20 * s, C.cream, 'center', 5 * s);
    } else if (sh.live && !sh.sim.crashed) {
      const sp = toScreen(this.cam, P.chassis.x, P.chassis.y + 2.0);
      text(ctx, sh.live.label.toUpperCase(), sp.x, sp.y, 22 * s, C.cream, 'center', 5 * s);
    }
    // post prompt over the window in range
    const w = sh.windowInRange();
    if (w && this.mode === 'drive') {
      const wy = w.high ? w.y + 2.0 : w.y + 5.8;
      const sp = toScreen(this.cam, w.x, wy);
      const bounce = this.fx.reduced ? 0 : Math.abs(Math.sin(this.t * 8)) * 6 * s;
      if (flame.alive) {
        const pv = flame.postValue({ high: w.high, airborne: sh.sim.airborne });
        const key = this.input.touchUI ? 'TAP POST' : 'SPACE';
        const r = { x: sp.x - 95 * s, y: sp.y - 40 * s - bounce, w: 190 * s, h: 62 * s };
        panel(ctx, r, C.mustard, s * 0.8);
        text(ctx, `POST! · ${key}`, sp.x, r.y + 20 * s, 22 * s, C.ink, 'center');
        text(ctx, `= ${fmt(pv.value)}${pv.mult > 1 ? `  (×${pv.mult})` : ''}`, sp.x, r.y + 44 * s, 20 * s, C.redDark, 'center');
      }
    }
  }

  private drawPostTallies(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    for (const p of this.posts) {
      if (p.t < 0.32 || p.landed) continue;
      // the tally sits under the meter so the camera can keep driving
      const sp = { x: this.cam.W / 2, y: 150 * s };
      if (p.fly > 0) {
        const k = p.fly * p.fly;
        const x = lerp(sp.x, this.cam.W / 2, k);
        const y = lerp(sp.y + 22 * s, 48 * s, k) - Math.sin(p.fly * Math.PI) * 60 * s;
        text(ctx, `+${fmt(p.value)}`, x, y, (40 - 16 * k) * s, C.fire, 'center', 6 * s);
        continue;
      }
      const intro = Math.min(1, (p.t - 0.32) / 0.15);
      const sc = this.fx.reduced ? 1 : 0.6 + intro * 0.4 + (p.sparkI > 0 ? Math.sin(p.t * 40) * 0.015 : 0);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.scale(sc, sc);
      ctx.rotate(-0.03);
      const r = { x: -120 * s, y: -46 * s, w: 240 * s, h: 92 * s };
      panel(ctx, r, C.cream, s);
      text(ctx, `${fmt(p.heat)} heat`, 0, -26 * s, 18 * s, C.inkSoft, 'center');
      // spark pips
      const n = p.sparks;
      const pipW = Math.min(16 * s, (200 * s) / Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const x = -((n - 1) * pipW) / 2 + i * pipW;
        ctx.beginPath();
        ctx.arc(x, -8 * s, Math.min(6 * s, pipW * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = i < p.sparkI ? C.fire : 'rgba(26,18,51,0.2)';
        ctx.fill();
        if (i < p.sparkI) {
          ctx.lineWidth = 1.5 * s;
          ctx.strokeStyle = C.fireOrange;
          ctx.stroke();
        }
      }
      text(ctx, fmt(p.shown), 0, 22 * s, 36 * s, C.red, 'center', 5 * s);
      for (let i = 0; i < p.partI; i++) text(ctx, p.parts[i], 0, 60 * s + i * 24 * s, 18 * s, C.mustard, 'center', 5 * s);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- HUD

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const sh = this.shift;
    const target = sh.cfg.target;
    // postage meter, top centre
    const mw = Math.min(W - 280 * s, 560 * s);
    const mx = W / 2 - mw / 2;
    const my = 14 * s;
    const bump = this.meterBump * 6 * s;
    panel(ctx, { x: mx, y: my - bump / 2, w: mw, h: 64 * s + bump }, C.cream, s);
    text(ctx, `SHIFT ${this.run.shift}/${SHIFTS}`, mx + 14 * s, my + 18 * s, 18 * s, C.redDark);
    const posted = this.shownPosted;
    const met = posted >= target;
    text(ctx, `${fmt(posted)} / ${fmt(target)}`, mx + mw - 14 * s, my + 18 * s, 22 * s, met ? C.greenDark : C.ink, 'right');
    // bar
    const bx = mx + 14 * s;
    const by = my + 34 * s;
    const bw = mw - 28 * s;
    const bh = 18 * s;
    rr(ctx, bx, by, bw, bh, 6 * s);
    ctx.fillStyle = 'rgba(26,18,51,0.12)';
    ctx.fill();
    const k = Math.min(1, posted / target);
    if (k > 0) {
      rr(ctx, bx, by, Math.max(bh, bw * k), bh, 6 * s);
      ctx.fillStyle = met ? C.green : C.fire;
      ctx.fill();
    }
    // projected: what posting now would add (ghost)
    const ghost = sh.flame.alive ? Math.min(1, (posted + sh.flame.heat * sh.flame.sparks) / target) : 0;
    if (ghost > k) {
      ctx.fillStyle = 'rgba(255,138,31,0.35)';
      ctx.fillRect(bx + bw * k, by + 3 * s, bw * (ghost - k), bh - 6 * s);
    }
    rr(ctx, bx, by, bw, bh, 6 * s);
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    // course strip: where the windows are
    const course = sh.course;
    const span = course.endX - course.startX;
    const cy = my + 64 * s + 14 * s;
    ctx.fillStyle = 'rgba(255,241,207,0.35)';
    ctx.fillRect(bx, cy - 1 * s, bw, 3 * s);
    for (const w of course.windows) {
      const x = bx + ((w.x - course.startX) / span) * bw;
      const lit = sh.lit.has(w.id);
      const skipped = sh.skipped.has(w.id);
      ctx.beginPath();
      if (w.final) ctx.rect(x - 6 * s, cy - 8 * s, 12 * s, 14 * s);
      else {
        ctx.moveTo(x - 5 * s, cy + 5 * s);
        ctx.lineTo(x - 5 * s, cy - 2 * s);
        ctx.lineTo(x, cy - (w.high ? 11 : 7) * s);
        ctx.lineTo(x + 5 * s, cy - 2 * s);
        ctx.lineTo(x + 5 * s, cy + 5 * s);
        ctx.closePath();
      }
      ctx.fillStyle = lit ? C.fire : skipped ? 'rgba(26,18,51,0.6)' : w.final ? C.red : w.high ? C.mustard : C.cream;
      ctx.fill();
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    }
    const cxp = bx + Math.max(0, Math.min(1, (sh.sim.pos.x - course.startX) / span)) * bw;
    ctx.beginPath();
    ctx.arc(cxp, cy, 6 * s, 0, Math.PI * 2);
    ctx.fillStyle = C.red;
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();

    // glasses, top left
    for (let i = 0; i < this.run.glassesMax; i++) {
      const x = 26 * s + i * 34 * s;
      const y = 30 * s;
      const ok = i < sh.glasses;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = ok ? 1 : 0.35;
      ctx.beginPath();
      ctx.moveTo(-8 * s, 14 * s);
      ctx.bezierCurveTo(-16 * s, 4 * s, -12 * s, -8 * s, -6 * s, -16 * s);
      ctx.lineTo(6 * s, -16 * s);
      ctx.bezierCurveTo(12 * s, -8 * s, 16 * s, 4 * s, 8 * s, 14 * s);
      ctx.closePath();
      ctx.fillStyle = ok ? 'rgba(200,235,255,0.5)' : 'rgba(26,18,51,0.5)';
      ctx.fill();
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      if (ok) {
        ctx.beginPath();
        ctx.moveTo(0, 10 * s);
        ctx.quadraticCurveTo(-6 * s, 2 * s, 0, -8 * s);
        ctx.quadraticCurveTo(6 * s, 2 * s, 0, 10 * s);
        ctx.fillStyle = C.fire;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-6 * s, -6 * s);
        ctx.lineTo(4 * s, 2 * s);
        ctx.lineTo(-2 * s, 8 * s);
        ctx.strokeStyle = C.cream;
        ctx.lineWidth = 2 * s;
        ctx.stroke();
      }
      ctx.restore();
    }
    // pause button and pennies, top right
    const pr = { x: W - 56 * s, y: 12 * s, w: 44 * s, h: 44 * s };
    panel(ctx, pr, C.cream, s * 0.8);
    ctx.fillStyle = C.ink;
    ctx.fillRect(pr.x + 14 * s, pr.y + 12 * s, 6 * s, 20 * s);
    ctx.fillRect(pr.x + 25 * s, pr.y + 12 * s, 6 * s, 20 * s);
    this.hits.push({ r: pr, id: 'pause' });
    coin(ctx, W - 130 * s, 34 * s, 13 * s);
    text(ctx, `${this.run.pennies}`, W - 110 * s, 35 * s, 26 * s, C.mustard, 'left', 5 * s);
    // owned stamps
    this.run.stamps.forEach((id, i) => {
      const r = { x: W - 64 * s - i * 40 * s - 30 * s, y: 64 * s, w: 34 * s, h: 40 * s };
      drawStamp(ctx, r, STAMPS[id], s * 0.35, false, this.t, (i % 2 ? 0.05 : -0.05));
    });
    if (sh.cfg.rule) {
      const rt = RULE_TEXT[sh.cfg.rule];
      text(ctx, `SUPERVISOR: ${rt.name.toUpperCase()}`, 16 * s, 66 * s, 16 * s, C.pink, 'left', 4 * s);
    }
  }

  private drawPads(ctx: CanvasRenderingContext2D): void {
    const s = Math.max(0.8, this.s);
    const W = this.cam.W;
    const H = this.cam.H;
    const r = 52 * s;
    const pads = this.input.pads;
    pads.brake = { x: 30 * s + r, y: H - 30 * s - r, r };
    pads.gas = { x: W - 30 * s - r, y: H - 30 * s - r, r };
    pads.post = { x: W - 30 * s - r * 3.4, y: H - 30 * s - r * 0.9, r: r * 0.8 };
    const draw = (z: 'gas' | 'brake' | 'post', label: string, col: string) => {
      const p = pads[z];
      const held = this.input.isTouchHeld(z);
      ctx.globalAlpha = held ? 0.95 : 0.7;
      ctx.beginPath();
      ctx.arc(p.x + 4 * s, p.y + 5 * s, p.r, 0, Math.PI * 2);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y + (held ? 3 * s : 0), p.r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      text(ctx, label, p.x, p.y + (held ? 3 * s : 0), p.r * 0.5, C.cream, 'center', 4 * s);
      ctx.globalAlpha = 1;
    };
    draw('brake', '◀', C.blue);
    draw('gas', '▶', C.red);
    if (this.mode === 'drive') draw('post', 'POST', C.mustardDark);
  }

  private drawHint(ctx: CanvasRenderingContext2D): void {
    if (!this.hint || this.mode === 'shop' || this.paused) return;
    this.hint.t += this.fdt;
    if (this.hint.t > 9 && this.hint.id !== 'drive') {
      this.retireHint(this.hint.id);
      return;
    }
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    ctx.font = `600 ${Math.round(20 * s)}px ${BODY}`;
    const tw = ctx.measureText(this.hint.text).width;
    const w = tw + 40 * s;
    const y = this.input.touchUI ? H - 200 * s : H - 90 * s;
    const bob = this.fx.reduced ? 0 : Math.sin(this.t * 3) * 3 * s;
    panel(ctx, { x: W / 2 - w / 2, y: y + bob, w, h: 46 * s }, C.paper, s, -0.01);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.hint.text, W / 2, y + bob + 24 * s);
  }

  // ---------------------------------------------------------------- overlays

  private dim(ctx: CanvasRenderingContext2D, a: number): void {
    ctx.fillStyle = `rgba(14,10,40,${a})`;
    ctx.fillRect(0, 0, this.cam.W, this.cam.H);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    logo(ctx, W / 2, H * 0.2, Math.min(110 * s, W / 11), this.t, this.fx.reduced);
    text(ctx, 'NIGHT RUN', W / 2, H * 0.2 + 82 * s, 30 * s, C.mustard, 'center', 6 * s);
    const lines = ['Pull tricks to grow your lamp’s flame.', 'Post it into the dark windows to score.', 'Bigger flame, bigger postage — but it blows out on hard landings.'];
    lines.forEach((l, i) => text(ctx, l, W / 2, H * 0.2 + 122 * s + i * 26 * s, 20 * s, C.cream, 'center', 5 * s, BODY, 600));
    if (this.save.best > 0) text(ctx, `Best night: ${fmt(this.save.best)}  ·  furthest shift: ${this.save.bestShift}`, W / 2, H - 30 * s, 17 * s, C.paper, 'center', 4 * s, BODY, 600);
    text(ctx, `M: sound ${this.save.muted ? 'off' : 'on'}`, 16 * s, H - 24 * s, 15 * s, C.paper, 'left', 4 * s, BODY, 600);
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    const sh = this.shift;
    const w = 420 * s;
    const h = sh.cfg.rule ? 170 * s : 120 * s;
    const r = { x: W / 2 - w / 2, y: H * 0.2, w, h };
    panel(ctx, r, C.cream, s, -0.015);
    text(ctx, `SHIFT ${this.run.shift}`, W / 2, r.y + 34 * s, 40 * s, C.red, 'center');
    text(ctx, `Post ${fmt(sh.cfg.target)} before the sorting office`, W / 2, r.y + 74 * s, 20 * s, C.ink, 'center', 0, BODY, 600);
    if (sh.cfg.rule) {
      const rt = RULE_TEXT[sh.cfg.rule];
      text(ctx, `SUPERVISOR — ${rt.name.toUpperCase()}`, W / 2, r.y + 112 * s, 22 * s, C.pink, 'center', 4 * s);
      text(ctx, rt.text, W / 2, r.y + 140 * s, 18 * s, C.inkSoft, 'center', 0, BODY, 600);
    }
    text(ctx, this.input.touchUI ? 'Hold ▶ to go' : 'Hold → to go', W / 2, r.y + h + 34 * s, 22 * s, C.mustard, 'center', 5 * s);
  }

  private drawResults(ctx: CanvasRenderingContext2D): void {
    const f = this.finishInfo!;
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    const k = Math.min(1, this.modeT / 0.3);
    this.dim(ctx, 0.45 * k);
    const w = 440 * s;
    const h = (230 + f.lines.length * 30) * s;
    const r = { x: W / 2 - w / 2, y: H / 2 - h / 2 + (1 - k) * 60 * s, w, h };
    panel(ctx, r, C.cream, s, 0.01);
    text(ctx, 'SHIFT DELIVERED', W / 2, r.y + 36 * s, 38 * s, C.greenDark, 'center');
    text(ctx, `${fmt(f.posted)} posted of ${fmt(f.target)}`, W / 2, r.y + 76 * s, 22 * s, C.ink, 'center', 0, BODY, 600);
    let y = r.y + 116 * s;
    f.lines.forEach(([label, n], i) => {
      const show = this.modeT > 0.35 + i * 0.18;
      if (!show) return;
      text(ctx, label, r.x + 40 * s, y, 20 * s, C.inkSoft, 'left', 0, BODY, 600);
      coin(ctx, r.x + w - 70 * s, y, 10 * s);
      text(ctx, `+${n}`, r.x + w - 52 * s, y + 1, 22 * s, C.ink, 'left');
      y += 30 * s;
    });
    const br = { x: W / 2 - 150 * s, y: r.y + h - 76 * s, w: 300 * s, h: 56 * s };
    const last = this.run.shift >= SHIFTS;
    button(ctx, br, last ? 'SEE THE DAWN' : 'TO THE COUNTER', s, inside(br, this.input.mouse.x, this.input.mouse.y), C.red, true, this.input.touchUI ? '' : '⏎');
    this.hits.push({ r: br, id: 'continue' });
  }

  private drawShop(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    const t = this.t;
    this.dim(ctx, 0.7);
    // counter top
    ctx.fillStyle = '#7a3f2e';
    ctx.fillRect(0, H * 0.74, W, H * 0.26);
    ctx.fillStyle = '#a0583c';
    ctx.fillRect(0, H * 0.74, W, 12 * s);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, H * 0.74 + 12 * s, W, 4 * s);
    text(ctx, 'THE NIGHT COUNTER', W / 2, 44 * s, 46 * s, C.mustard, 'center', 8 * s);
    text(ctx, `Shift ${this.run.shift + 1} needs ${fmt(targetFor(this.run.shift + 1))} postage`, W / 2, 82 * s, 19 * s, C.cream, 'center', 4 * s, BODY, 600);
    // pennies
    coin(ctx, W - 120 * s, 44 * s, 16 * s);
    text(ctx, `${this.run.pennies}`, W - 96 * s, 46 * s, 34 * s, C.mustard, 'left', 6 * s);

    // offers
    const stamps = this.offers.filter((o) => o.kind === 'stamp');
    const parts = this.offers.filter((o) => o.kind === 'part');
    const sw = Math.min(150 * s, (W - 80 * s) / 6);
    const shh = sw * 1.2;
    const tw = Math.min(250 * s, (W - 80 * s) / 3.6);
    const th = 120 * s;
    const total = stamps.length * (sw + 22 * s) + parts.length * (tw + 22 * s);
    let x = W / 2 - total / 2;
    const y = 120 * s;
    let sel: { title: string; body: string; price: number; i: number; owned?: boolean } | null = null;
    this.offers.forEach((o, i) => {
      const isStamp = o.kind === 'stamp';
      const r = isStamp ? { x, y, w: sw, h: shh } : { x, y: y + (shh - th) / 2, w: tw, h: th };
      x += (isStamp ? sw : tw) + 22 * s;
      if (o.sold) {
        text(ctx, 'SOLD', r.x + r.w / 2, r.y + r.h / 2, 30 * s, 'rgba(255,241,207,0.4)', 'center');
        return;
      }
      const hot = inside(r, this.input.mouse.x, this.input.mouse.y) || (this.selected?.kind === 'offer' && this.selected.i === i);
      const tilt = ((i * 53) % 7) / 7 - 0.5;
      if (isStamp) drawStamp(ctx, r, STAMPS[o.id as StampId], s, hot, t, tilt * 0.08);
      else drawTag(ctx, r, PARTS[o.id as PartId], s, hot, t, tilt * 0.05);
      const price = this.priceOf(o);
      const can = this.run.pennies >= price;
      coin(ctx, r.x + r.w / 2 - 14 * s, r.y + r.h + 26 * s, 12 * s);
      text(ctx, `${price}`, r.x + r.w / 2 + 2 * s, r.y + r.h + 27 * s, 24 * s, can ? C.mustard : C.fireRed, 'left', 5 * s);
      if (!this.input.touchUI) text(ctx, `${i + 1}`, r.x + 8 * s, r.y - 10 * s, 16 * s, C.paper, 'left', 4 * s);
      this.hits.push({ r, id: `offer:${i}` });
      if (hot) {
        const d = isStamp ? STAMPS[o.id as StampId] : PARTS[o.id as PartId];
        sel = { title: d.name, body: d.text, price, i };
      }
    });
    // owned stamps album
    const ay = H * 0.74 + 26 * s;
    text(ctx, `YOUR STAMPS ${this.run.stamps.length}/${MAX_STAMPS}`, 30 * s, ay, 18 * s, C.cream, 'left', 4 * s);
    for (let i = 0; i < MAX_STAMPS; i++) {
      const r = { x: 30 * s + i * 76 * s, y: ay + 18 * s, w: 64 * s, h: 76 * s };
      const id = this.run.stamps[i];
      if (!id) {
        rr(ctx, r.x, r.y, r.w, r.h, 6 * s);
        ctx.setLineDash([6 * s, 5 * s]);
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = 'rgba(255,241,207,0.4)';
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const hot = inside(r, this.input.mouse.x, this.input.mouse.y) || (this.selected?.kind === 'own' && this.selected.i === i);
      drawStamp(ctx, r, STAMPS[id], s * 0.55, hot, t, (i % 2 ? 0.04 : -0.04));
      this.hits.push({ r, id: `own:${i}` });
      if (hot) sel = { title: STAMPS[id].name, body: STAMPS[id].text, price: Math.floor(STAMPS[id].price / 2), i, owned: true };
    }
    // cart parts fitted
    const px0 = 30 * s + MAX_STAMPS * 76 * s + 30 * s;
    text(ctx, 'YOUR CART', px0, ay, 18 * s, C.cream, 'left', 4 * s);
    const fitted = this.run.parts.map((p) => PARTS[p].name);
    if (this.run.glassesMax > 3) fitted.push(`${this.run.glassesMax} lamp glasses`);
    text(ctx, fitted.length ? fitted.join(' · ') : 'Stock matchbox cart', px0, ay + 30 * s, 17 * s, C.paper, 'left', 0, BODY, 600);

    // detail card for the hovered/selected thing
    const selRef = this.selected;
    if (!sel && selRef) {
      if (selRef.kind === 'offer' && this.offers[selRef.i] && !this.offers[selRef.i].sold) {
        const o = this.offers[selRef.i];
        const d = o.kind === 'stamp' ? STAMPS[o.id as StampId] : PARTS[o.id as PartId];
        sel = { title: d.name, body: d.text, price: this.priceOf(o), i: selRef.i };
      } else if (selRef.kind === 'own' && this.run.stamps[selRef.i]) {
        const d = STAMPS[this.run.stamps[selRef.i]];
        sel = { title: d.name, body: d.text, price: Math.floor(d.price / 2), i: selRef.i, owned: true };
      }
    }
    const dy = y + shh + 58 * s;
    const dw = Math.min(560 * s, W - 60 * s);
    const dr = { x: W / 2 - dw / 2, y: dy, w: dw, h: 108 * s };
    if (sel) {
      const S = sel as { title: string; body: string; price: number; i: number; owned?: boolean };
      panel(ctx, dr, C.paper, s, 0.005);
      text(ctx, S.title.toUpperCase(), dr.x + 18 * s, dr.y + 22 * s, 24 * s, C.red);
      wrapText(ctx, S.body, dr.x + 18 * s, dr.y + 40 * s, dw - 210 * s, 18 * s, C.ink);
      const br = { x: dr.x + dw - 170 * s, y: dr.y + 30 * s, w: 150 * s, h: 50 * s };
      if (S.owned) {
        button(ctx, br, `SELL +${S.price}`, s, inside(br, this.input.mouse.x, this.input.mouse.y), C.blue);
        this.hits.push({ r: br, id: `sell:${S.i}` });
      } else {
        const o = this.offers[S.i];
        const full = o.kind === 'stamp' && this.run.stamps.length >= MAX_STAMPS;
        const can = this.run.pennies >= S.price && !full;
        button(ctx, br, full ? 'ALBUM FULL' : `BUY ${S.price}`, s, inside(br, this.input.mouse.x, this.input.mouse.y), C.green, can);
        this.hits.push({ r: br, id: `buy:${S.i}` });
      }
    } else {
      text(ctx, this.input.touchUI ? 'Tap a stamp or part to read it, tap again to buy.' : 'Click a stamp or part to read it, click again to buy.', W / 2, dr.y + 50 * s, 19 * s, C.paper, 'center', 4 * s, BODY, 600);
    }
    // reroll & next
    const rr2 = { x: W - 470 * s, y: H - 84 * s, w: 200 * s, h: 56 * s };
    const can = this.run.pennies >= this.rerollCost();
    button(ctx, rr2, `REROLL ${this.rerollCost()}`, s, inside(rr2, this.input.mouse.x, this.input.mouse.y), C.blue, can, this.input.touchUI ? '' : 'R');
    this.hits.push({ r: rr2, id: 'reroll' });
    const nr = { x: W - 250 * s, y: H - 84 * s, w: 220 * s, h: 56 * s };
    button(ctx, nr, 'NEXT SHIFT', s, inside(nr, this.input.mouse.x, this.input.mouse.y), C.red, true, this.input.touchUI ? '' : '⏎');
    this.hits.push({ r: nr, id: 'next' });
  }

  private drawOver(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    const sh = this.shift;
    const k = Math.min(1, this.modeT / 0.4);
    this.dim(ctx, 0.6 * k);
    const w = 480 * s;
    const h = 300 * s;
    const r = { x: W / 2 - w / 2, y: H / 2 - h / 2 + (1 - k) * 60 * s, w, h };
    panel(ctx, r, C.cream, s, -0.012);
    text(ctx, 'THE POST IS LATE', W / 2, r.y + 40 * s, 42 * s, C.red, 'center');
    const why = sh.glasses <= 0 ? 'Every lamp glass is broken.' : `Shift ${this.run.shift} needed ${fmt(sh.cfg.target)} — you posted ${fmt(sh.posted)}.`;
    text(ctx, why, W / 2, r.y + 86 * s, 20 * s, C.ink, 'center', 0, BODY, 600);
    text(ctx, `Night total ${fmt(this.run.total)}  ·  best single post ${fmt(this.run.bestPost)}`, W / 2, r.y + 126 * s, 18 * s, C.inkSoft, 'center', 0, BODY, 600);
    text(ctx, `Windows lit ${this.run.windows}  ·  best night ${fmt(this.save.best)}`, W / 2, r.y + 154 * s, 18 * s, C.inkSoft, 'center', 0, BODY, 600);
    const br = { x: W / 2 - 140 * s, y: r.y + h - 90 * s, w: 280 * s, h: 58 * s };
    button(ctx, br, 'NEW NIGHT', s, inside(br, this.input.mouse.x, this.input.mouse.y), C.red, true, this.input.touchUI ? '' : 'R');
    this.hits.push({ r: br, id: 'again' });
  }

  private drawDawn(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    const k = Math.min(1, this.modeT / 1.2);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(255,170,120,${0.75 * k})`);
    g.addColorStop(1, `rgba(255,220,140,${0.85 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    logo(ctx, W / 2, H * 0.2, Math.min(90 * s, W / 12), this.t, this.fx.reduced);
    text(ctx, 'DAWN — EVERY WINDOW LIT', W / 2, H * 0.2 + 80 * s, 34 * s, C.cream, 'center', 7 * s);
    text(ctx, `Night total ${fmt(this.run.total)}`, W / 2, H * 0.48, 48 * s, C.red, 'center', 8 * s);
    text(ctx, `Best single post ${fmt(this.run.bestPost)}  ·  windows lit ${this.run.windows}  ·  best night ${fmt(this.save.best)}`, W / 2, H * 0.48 + 50 * s, 19 * s, C.ink, 'center', 0, BODY, 600);
    const br = { x: W / 2 - 140 * s, y: H * 0.66, w: 280 * s, h: 58 * s };
    button(ctx, br, 'ANOTHER NIGHT', s, inside(br, this.input.mouse.x, this.input.mouse.y), C.red, true, this.input.touchUI ? '' : '⏎');
    this.hits.push({ r: br, id: 'again' });
  }

  private drawPause(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const W = this.cam.W;
    const H = this.cam.H;
    this.hits = [];
    this.dim(ctx, 0.6);
    const w = 360 * s;
    const h = 380 * s;
    const r = { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h };
    panel(ctx, r, C.cream, s, 0.01);
    text(ctx, 'PAUSED', W / 2, r.y + 40 * s, 42 * s, C.red, 'center');
    const items: [string, string, string][] = [
      ['resume', 'RESUME', C.green],
      ['mute', this.save.muted ? 'SOUND: OFF' : 'SOUND: ON', C.blue],
      ['motion', this.save.reduced ? 'MOTION: REDUCED' : 'MOTION: FULL', C.teal],
      ['restart', 'NEW NIGHT', C.red],
    ];
    items.forEach(([id, label, col], i) => {
      const br = { x: W / 2 - 130 * s, y: r.y + 84 * s + i * 68 * s, w: 260 * s, h: 52 * s };
      button(ctx, br, label, s, inside(br, this.input.mouse.x, this.input.mouse.y), col);
      this.hits.push({ r: br, id });
    });
  }
}
