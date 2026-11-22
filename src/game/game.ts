// The night: title → delivery card → drive → results → Night Counter → next delivery ...
// 4 routes × 3 deliveries (Local, Express, Inspection), then dawn (and Overtime).
// This file runs the loop, the modes, sim events → juice, the camera and the world.
// The HUD, the shop and the full-screen cards live in hud.ts, shop.ts and screens.ts.
import { Shift, type ShiftEvent } from '../sim/shift';
import { PARTS, type PartId } from '../sim/rules';
import { TICK } from '../sim/rng';
import { newRun, wages, advance, deliveryConfig, rollOffers, ROUTES, type Run, type Offer } from '../sim/night';
import type { Pose } from '../sim/sim';
import { groundAt, type WindowSpot, type Feature } from '../sim/terrain';
import { WorldArt, worldTransform, toScreen, type Cam, type FeatureState } from '../render/world';
import { drawCartBody, drawWheel, drawStrut, drawLetter, drawHouse, drawFlame, rr, inked, type CartLook } from '../render/art';
import { C } from '../render/palette';
import { familyColour, fmt, inside, type Rect } from '../render/ui';
import { Fx } from './fx';
import { Input } from './input';
import { sfx } from '../audio/sfx';
import { loadSave, writeSave, type Save } from './save';
import { botInput } from '../sim/bot';
import { Tally, FLY, drawTally, type TallyHooks } from './tally';
import { drawHud, drawPads, drawHint, drawWorldLabels, meterY } from './hud';
import { drawShop, shopHit, shopKey } from './shop';
import { drawTitle, drawIntro, drawResults, drawOver, drawDawn, drawPause, drawWaiting } from './screens';

export type Mode = 'title' | 'intro' | 'drive' | 'results' | 'shop' | 'over' | 'dawn';

export interface Hit {
  r: Rect;
  id: string;
}

const AXLE_R = { x: -0.68, y: -0.28 };
const AXLE_F = { x: 0.7, y: -0.28 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Per-frame smoothing factor tuned at 60 Hz, corrected for the real frame time. */
export const ease = (k60: number, dt: number) => 1 - Math.pow(1 - k60, dt * 60);
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), a: lerp(a.a, b.a, t) });

/** Course signposts: shown over a feature until the player has used one. */
export const SIGNS: Record<Feature['kind'] | 'gold' | 'high', string> = {
  striker: 'MATCH STRIP · free speed',
  trap: 'MOUSETRAP · it flings you up',
  rail: 'PENCIL · ride it for a grind',
  tacks: 'TACKS · jump them or lose your flame',
  hoop: 'BURNING HOOP · fly your lamp through',
  stack: 'SUGAR CUBES · smash through',
  gold: 'GOLD POSTBOX · pays pennies',
  high: 'HIGH WINDOW · ×2 sparks',
};

export interface FinishInfo {
  posted: number;
  target: number;
  earned: number;
  lines: [string, number][];
  best: number;
  /** Route and kind of the delivery just finished. */
  route: number;
  kind: string;
}

export class Game {
  ctx: CanvasRenderingContext2D;
  input: Input;
  fx = new Fx();
  mode: Mode = 'title';
  run!: Run;
  shift!: Shift;
  art!: WorldArt;
  cam: Cam = { x: 0, y: 0, ppm: 60, W: 1280, H: 720, dpr: 1 };
  t = 0;
  acc = 0;
  last: number | null = null;
  paused = false;
  hits: Hit[] = [];
  tallies: Tally[] = [];
  shownPosted = 0;
  meterBump = 0;
  offers: Offer[] = [];
  rerolls = 0;
  selected: { kind: 'own' | 'offer'; i: number } | null = null;
  modeT = 0;
  finishInfo: FinishInfo | null = null;
  resultsShown = 0;
  hint: { id: string; text: string; t: number } | null = null;
  seenHints = new Set<string>();
  save: Save;
  mood = 0;
  blinkT = 0;
  sparkAngle = 0;
  letterN = 0;
  flameShown = 0;
  /** Ticks to wait after the finish before the results card. */
  pendingFinish = 0;
  dpr = 1;
  /** Seconds since the previous rendered frame. */
  fdt = 1 / 60;
  /** 0..1 per album slot: how hard that stamp is shaking (it just fired). */
  slotFire = [0, 0, 0, 0, 0];
  /** Hit-stop and slow motion (real seconds left). */
  freezeT = 0;
  slowT = 0;
  overtime = false;
  /** Dev only: let the test bot drive (set from the console as __ws.auto). */
  auto = false;
  botMem = { flipTarget: null as number | null, a0: 0 };
  private tallyHooks: TallyHooks;

  constructor(private canvas: HTMLCanvasElement, stage: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(stage);
    this.save = loadSave();
    sfx.setMuted(this.save.muted);
    this.fx.reduced = this.save.reduced;
    this.input.onFirstGesture = () => sfx.unlock();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      sfx.suspend(document.hidden);
      if (document.hidden && this.mode === 'drive') this.paused = true;
      this.last = null;
    });
    this.tallyHooks = {
      bell: (p) => {
        sfx.bell();
        const wy = this.windowMouthY(p.w);
        this.fx.burst(p.w.x, wy, 20, 'spark', [C.fire, C.fireHot, C.cream], 6, 0.14, 0.7, 3);
        this.fx.ring(p.w.x, wy, C.fire, 3);
        this.fx.kick(3);
        for (const slot of p.result.paid) this.fireSlot(slot);
        if (p.result.pennies > 0) sfx.coin(3);
      },
      step: (_p, s, i) => {
        if (s.slot >= 0) this.fireSlot(s.slot);
        sfx.stampFire(i);
        this.fx.kick(1.5);
      },
      total: (p) => {
        sfx.total(p.scorcher);
        if (p.scorcher) {
          sfx.scorcher();
          const wy = this.windowMouthY(p.w);
          this.fx.burst(p.w.x, wy, 40, 'spark', [C.fire, C.fireHot, C.fireOrange, C.fireRed], 9, 0.18, 1.2, 2);
          this.fx.ring(p.w.x, wy, C.fireOrange, 5);
          this.fx.kick(10);
        }
        if (p.value > this.save.bestPost) {
          this.save.bestPost = p.value;
          writeSave(this.save);
        }
      },
      land: () => {
        this.meterBump = 1;
        sfx.coin(2);
      },
    };
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

  get s(): number {
    return Math.max(0.55, Math.min(1.5, Math.min(this.cam.W / 1280, this.cam.H / 720)));
  }

  newRun(): void {
    this.run = newRun((Date.now() % 100000) + 1);
    this.overtime = false;
    this.save.nights++;
    writeSave(this.save);
    this.startDelivery();
    sfx.setMusic(true);
  }

  startDelivery(): void {
    this.shift = new Shift(deliveryConfig(this.run));
    this.art = new WorldArt(this.shift.course);
    this.tallies = [];
    this.shownPosted = 0;
    this.fx.clear();
    this.finishInfo = null;
    this.pendingFinish = 0;
    this.slotFire = [0, 0, 0, 0, 0];
    this.freezeT = this.slowT = 0;
    if (this.mode !== 'title') this.mode = 'intro';
    this.modeT = 0;
    const p = this.shift.sim.pos;
    this.cam.x = p.x + 3;
    this.cam.y = p.y + 1.5;
    sfx.boss = this.shift.cfg.rule !== null;
    sfx.intensity = 0;
    sfx.grind(false);
    // settle the cart on its wheels before showing it
    for (let i = 0; i < 30; i++) this.shift.sim.step({ gas: false, brake: false }, TICK);
  }

  showHint(id: string, text: string): void {
    if (this.seenHints.has(id) || this.save.hintsDone.includes(id)) return;
    this.seenHints.add(id);
    this.hint = { id, text, t: 0 };
  }

  retireHint(id: string): void {
    if (this.hint?.id === id) this.hint = null;
    this.learn(id);
  }

  learned(key: string): boolean {
    return this.save.hintsDone.includes(key);
  }

  learn(key: string): void {
    if (!this.save.hintsDone.includes(key)) {
      this.save.hintsDone.push(key);
      writeSave(this.save);
    }
  }

  fireSlot(slot: number): void {
    if (slot >= 0 && slot < this.slotFire.length) this.slotFire[slot] = 1;
  }

  /** Flame shown in the lamp: a pilot light when empty, roaring as it nears fragile. */
  flameSize(): number {
    const sh = this.shift;
    if (sh.sim.crashed) return 0;
    if (!sh.flame.alive) return 0.14;
    return 0.3 + 0.7 * Math.min(1, Math.sqrt(sh.flame.carried / Math.max(1, sh.target * 0.6)));
  }

  windowMouthY(w: WindowSpot): number {
    return w.final ? w.y + 2.4 : w.high ? w.y : w.gold ? w.y + 2.2 : w.y + 3.6;
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
      let scale = 1;
      if (this.freezeT > 0) {
        this.freezeT -= dt;
        scale = 0;
      } else if (this.slowT > 0) {
        this.slowT -= dt;
        scale = 0.35;
      }
      this.acc += dt * scale;
      let steps = 0;
      while (this.acc >= TICK && steps < 5) {
        this.tick();
        this.acc -= TICK;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.t += dt;
      this.modeT += dt;
      this.fx.update(dt * Math.max(scale, 0.25));
      this.updateTallies(dt);
      for (let i = 0; i < this.slotFire.length; i++) this.slotFire[i] = Math.max(0, this.slotFire[i] - dt * 2.2);
    }
    const sh = this.shift;
    sfx.intensity += ((this.mode === 'drive' ? sh.fragility() : 0) - sfx.intensity) * ease(0.05, dt);
    sfx.update();
    const running = (this.mode === 'drive' || this.mode === 'title' || this.mode === 'intro') && !this.paused && !sh.sim.crashed;
    sfx.engineUpdate(sh.sim.speed, sh.sim.throttle, running);
    sfx.grind(running && this.mode === 'drive' && sh.sim.railTouch, sh.sim.speed);
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
          this.mode = 'title';
          this.newRun();
        }
        if (k === 'enter' || k === 'post') this.paused = false;
        continue;
      }
      if (this.mode === 'results' && this.finishInfo && this.modeT > 0.6 && (k === 'enter' || k === 'post')) this.afterResults();
      else if (this.mode === 'over' && this.modeT > 0.8 && (k === 'enter' || k === 'r' || k === 'post')) this.toTitle();
      else if (this.mode === 'dawn' && this.modeT > 0.8) {
        if (k === 'enter' || k === 'post') this.startOvertime();
        else if (k === 'r') this.toTitle();
      } else if (this.mode === 'shop') shopKey(this, k);
    }
  }

  private handleClicks(): void {
    for (const c of this.input.takeClicks()) {
      const hit = [...this.hits].reverse().find((h) => inside(h.r, c.x, c.y));
      if (!hit) continue;
      sfx.click();
      this.onHit(hit.id);
    }
  }

  private onHit(id: string): void {
    switch (id) {
      case 'pause':
        this.paused = true;
        this.input.clear();
        return;
      case 'resume':
        this.paused = false;
        this.last = null;
        return;
      case 'restart':
        this.paused = false;
        this.toTitle();
        return;
      case 'mute':
        this.save.muted = !this.save.muted;
        sfx.setMuted(this.save.muted);
        writeSave(this.save);
        return;
      case 'motion':
        this.save.reduced = !this.save.reduced;
        this.fx.reduced = this.save.reduced;
        writeSave(this.save);
        return;
      case 'continue':
        return this.afterResults();
      case 'again':
        return this.toTitle();
      case 'overtime':
        return this.startOvertime();
      case 'go':
        if (this.mode === 'title') this.toIntro();
        return;
    }
    if (this.mode === 'shop') shopHit(this, id);
  }

  private toTitle(): void {
    this.mode = 'title';
    this.newRun();
  }

  private toIntro(): void {
    this.mode = 'intro';
    this.modeT = 0;
    this.input.clear();
  }

  // ---------------------------------------------------------------- simulation tick

  private tick(): void {
    const sh = this.shift;
    const allowMouse = this.input.mouse.y > this.cam.H * 0.18 || this.input.mouse.y < 0;
    const bot = this.auto ? botInput(sh, { flips: true }, this.botMem) : null;
    const gas = bot ? bot.gas : this.input.gas(allowMouse);
    const brake = bot ? bot.brake : this.input.brake(allowMouse);
    if (this.mode === 'title') {
      this.input.takePost();
      sh.sim.step({ gas: false, brake: false }, TICK);
      if (gas && this.modeT > 0.3) this.toIntro();
      return;
    }
    if (this.mode === 'intro') {
      this.input.takePost();
      sh.sim.step({ gas: false, brake: false }, TICK);
      if (gas && this.modeT > 0.6) {
        this.mode = 'drive';
        this.modeT = 0;
        this.retireHint('drive');
      }
      this.showHint('drive', this.input.touchUI ? 'Hold the right pad to drive' : 'Hold → or D to drive');
      return;
    }
    if (this.mode !== 'drive') {
      // keep the world alive behind the results card; freeze it behind full-screen menus
      if (this.mode !== 'results') return;
      if (!sh.done) {
        sh.step({ gas: false, brake: false, post: false });
        this.handleEvents(sh.events);
      } else sh.sim.step({ gas: false, brake: false }, TICK);
      this.input.takePost();
      if (this.pendingFinish > 0) this.pendingFinish--;
      if (!this.finishInfo && this.pendingFinish <= 0 && this.tallies.every((p) => p.landed)) this.enterResults();
      return;
    }
    const post = this.input.takePost() || !!bot?.post;
    sh.step({ gas, brake, post });
    this.handleEvents(sh.events);
    this.ambient();
    if (sh.done) {
      sh.sim.settle();
      this.mode = 'results';
      this.modeT = -1;
      this.pendingFinish = 50;
    }
    // contextual hints
    if (sh.sim.airborne && sh.sim.airTicks > 20) this.showHint('flip', this.input.touchUI ? 'In the air: right pad flips back, left pad flips forward' : 'In the air: → flips back, ← flips forward');
    const w = sh.windowInRange();
    if (w && sh.flame.alive) this.showHint('post', this.input.touchUI ? 'Tap POST to throw your flame into the window!' : 'Press SPACE to throw your flame into the window!');
    if (this.hint?.id === 'flip' && !sh.sim.airborne && sh.tricks > 0) this.retireHint('flip');
  }

  /** Embers off the flame, and Inspector weather. */
  private ambient(): void {
    const sh = this.shift;
    const sim = sh.sim;
    if (sim.crashed) return;
    const fl = this.flameSize();
    const lamp = sim.lampWorld();
    const v = sim.chassis.getLinearVelocity();
    if (sh.flame.alive && Math.random() < 0.1 + fl * 0.5) {
      const life = 0.4 + fl * 0.6;
      this.fx.parts.push({ x: lamp.x + (Math.random() - 0.5) * 0.2, y: lamp.y + 0.6 + fl * 0.5, vx: v.x * 0.2 - 1 - Math.random(), vy: 1 + Math.random() * 1.5, life, max: life, size: 0.05 + fl * 0.07, color: Math.random() < 0.5 ? C.fire : C.fireOrange, kind: 'spark', rot: 0, vr: 0, g: -1 });
    }
    const rule = sh.cfg.rule;
    if (rule === 'wetInk' && sim.grounded && sim.speed > 4 && Math.random() < 0.25) {
      const w = sim.rear.getPosition();
      this.fx.burst(w.x, w.y - sim.spec.wheelR + 0.05, 1, 'dust', ['rgba(47,69,176,0.8)', 'rgba(74,108,240,0.7)'], 2, 0.1, 0.5, 8);
    }
    if (rule === 'coldSnap' && sh.flame.alive && Math.random() < 0.08) {
      this.fx.parts.push({ x: lamp.x, y: lamp.y + 0.9, vx: -1, vy: 0.8, life: 0.8, max: 0.8, size: 0.08, color: 'rgba(190,225,255,0.8)', kind: 'dust', rot: 0, vr: 0, g: -0.5 });
    }
  }

  private handleEvents(events: readonly ShiftEvent[]): void {
    const sh = this.shift;
    for (const e of events) {
      switch (e.type) {
        case 'trick': {
          const p = e.pop;
          for (const slot of p.fired) this.fireSlot(slot);
          if (p.family === 'letter') {
            this.fx.pop(`+${p.heat}`, e.x, e.y + 0.4, p.fired.length ? C.red : C.cream, p.sparks > 0 ? `+${p.sparks} spark` : '', 0.55, 0.7);
            break;
          }
          const big = /Double|Triple|×|Huge|Demolition|Long/.test(p.label) || p.family === 'hoop';
          const sub = `+${fmt(p.heat)} heat${p.sparks > 0 ? `   +${p.sparks} spark${p.sparks > 1 ? 's' : ''}` : p.sparks < 0 ? '   sparks snuffed!' : p.repeat > 0 ? '   (again: worth less)' : ''}`;
          this.fx.pop(p.label, e.x, e.y, familyColour(p.family), sub, big ? 1.25 : 0.95, 1.3);
          sfx.trick(sh.flame.sparks, big);
          const lamp = sh.sim.lampWorld();
          if (p.sparks > 0) this.fx.burst(lamp.x, lamp.y + 0.4, 10 + p.sparks * 4, 'spark', [C.fire, C.fireHot, C.fireOrange], 5, 0.12, 0.6, 4);
          if (big) {
            this.fx.kick(5);
            if (!this.fx.reduced) this.freezeT = Math.max(this.freezeT, 0.07);
          }
          if (p.family === 'grind') this.learn('f:rail');
          if (p.family === 'smash') this.learn('f:stack');
          break;
        }
        case 'letter':
          this.fx.burst(e.x, e.y, 8, 'paper', [C.white, C.cream, C.red], 3, 0.1, 0.8, 6);
          sfx.letter(this.letterN++);
          break;
        case 'post': {
          const lamp = sh.sim.lampWorld();
          this.tallies.push(new Tally(e.window, lamp.x, lamp.y + 0.4, e.result, sh.target));
          this.run.windows++;
          sfx.whoosh();
          this.retireHint('post');
          if (e.window.gold) this.learn('f:gold');
          if (e.window.high) this.learn('f:high');
          if (!this.fx.reduced && !e.auto && (e.airborne || e.result.value >= sh.target * 0.3)) this.slowT = Math.max(this.slowT, 0.45);
          break;
        }
        case 'emptyPost':
          this.fx.pop('No flame to throw!', e.window.x, this.windowMouthY(e.window) + 1.4, C.paper, 'do a trick first', 0.7, 0.9);
          sfx.emptyPost();
          break;
        case 'skip':
          for (const slot of e.slots) this.fireSlot(slot);
          if (e.sparks > 0) {
            this.fx.pop('Postage Due', e.window.x, this.windowMouthY(e.window) + 1, C.mustard, `+${e.sparks} sparks`, 0.8);
            sfx.trick(sh.flame.sparks, false);
          }
          if (sh.flame.alive && !e.window.high) this.showHint('greed', 'Skipped a window: your flame keeps growing… but a big flame is fragile!');
          break;
        case 'land': {
          const k = e.impact / e.tolerance;
          this.fx.burst(e.x, e.y + 0.1, Math.round(4 + k * 10), 'dust', ['rgba(255,241,207,0.8)', 'rgba(243,217,164,0.8)'], 2 + k * 3, 0.18, 0.5, 2);
          this.fx.kick(Math.min(10, e.impact * 0.5));
          sfx.land(e.impact);
          if (k > 0.72 && k <= 1 && sh.flame.alive) this.fx.pop('Close call!', e.x, e.y + 2.6, C.fireOrange, '', 0.7, 0.8);
          break;
        }
        case 'takeoff':
          sfx.takeoff();
          break;
        case 'blowout': {
          const lamp = sh.sim.lampWorld();
          this.fx.burst(lamp.x, lamp.y + 0.5, 24, 'dust', ['rgba(80,70,110,0.7)', 'rgba(140,130,160,0.6)'], 3, 0.3, 1.1, -1);
          this.fx.burst(lamp.x, lamp.y + 0.5, 14, 'spark', [C.fireOrange, C.fireRed], 6, 0.1, 0.5, 6);
          this.fx.pop(e.cause === 'tacks' ? 'Popped!' : e.cause === 'paw' ? 'Swatted!' : 'Blown out!', lamp.x, lamp.y + 1.6, C.fireRed, e.lost ? `lost ${fmt(e.lost)} postage` : '', 1.15, 1.4);
          this.fx.kick(9);
          sfx.blowout();
          this.mood = -1;
          if (e.cause === 'landing') this.showHint('blow', 'A big flame is fragile: land smoothly on downslopes, or post sooner!');
          break;
        }
        case 'saved': {
          for (const slot of e.slots) this.fireSlot(slot);
          this.fx.pop('Second Wind!', e.x, e.y + 0.6, C.teal, 'flame saved', 1.0, 1.2);
          this.fx.ring(e.x, e.y, C.teal, 3);
          sfx.saved();
          break;
        }
        case 'crash': {
          const lamp = sh.sim.lampWorld();
          this.fx.burst(lamp.x, lamp.y, 22, 'glass', ['rgba(200,235,255,0.9)', C.white], 7, 0.12, 1.1, 14);
          this.fx.burst(lamp.x, lamp.y, 12, 'spark', [C.fireOrange, C.fire], 5, 0.1, 0.6, 8);
          const title = e.reason === 'fall' ? 'Into the drawer!' : 'Smashed!';
          this.fx.pop(title, e.x, e.y + 2, C.red, `${sh.glasses} glass${sh.glasses === 1 ? '' : 'es'} left`, 1.2, 1.5);
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
        case 'strike':
          this.fx.burst(e.x, e.y - 0.3, 26, 'spark', [C.fire, C.fireHot, C.fireOrange], 7, 0.1, 0.5, 6);
          this.fx.kick(4);
          sfx.strike();
          this.learn('f:striker');
          break;
        case 'launch':
          this.fx.burst(e.x, e.y + 0.2, 12, 'dust', ['rgba(255,241,207,0.8)'], 4, 0.15, 0.5, 4);
          this.fx.kick(8);
          sfx.snap();
          this.learn('f:trap');
          break;
        case 'hoop':
          this.fx.burst(e.x, e.y, 30, 'spark', [C.fire, C.fireOrange, C.fireRed], 6, 0.14, 0.8, 2);
          this.fx.ring(e.x, e.y, C.fireOrange, 3.5);
          sfx.hoop();
          this.learn('f:hoop');
          break;
        case 'puncture':
          this.fx.burst(e.x, e.y + 0.2, 8, 'dust', ['rgba(255,255,255,0.8)'], 5, 0.08, 0.4, 2);
          sfx.puncture();
          this.learn('f:tacks');
          break;
        case 'smash':
          this.fx.burst(e.x, e.y, 6, 'dust', ['rgba(255,255,255,0.95)', 'rgba(230,225,245,0.9)'], 4, 0.1, 0.6, 10);
          sfx.smash(this.letterN++);
          break;
        case 'paw':
          if (e.phase === 'swat') {
            this.fx.kick(10);
            sfx.meow();
            this.mood = -1;
            break;
          }
          this.fx.burst(e.x, e.y + 0.2, 20, 'dust', ['rgba(255,241,207,0.8)', 'rgba(229,154,90,0.8)'], 6, 0.2, 0.7, 4);
          this.fx.kick(12);
          sfx.paw();
          break;
        case 'finish':
          sfx.fanfare(e.passed);
          break;
      }
    }
  }

  private updateTallies(dt: number): void {
    for (const p of this.tallies) p.update(dt, this.tallyHooks);
    this.tallies = this.tallies.filter((p) => !p.done);
    // the meter counts up only as posts land
    let flying = 0;
    for (const p of this.tallies) if (!p.landed) flying += p.value;
    const target = Math.max(0, this.shift.posted - flying);
    this.shownPosted += (target - this.shownPosted) * Math.min(1, dt * 8);
    if (Math.abs(target - this.shownPosted) < 1) this.shownPosted = target;
    this.meterBump *= Math.pow(0.01, dt);
  }

  // ---------------------------------------------------------------- results, dawn, shop

  private enterResults(): void {
    const sh = this.shift;
    const run = this.run;
    run.total += sh.posted;
    run.bestPost = Math.max(run.bestPost, sh.bestPost);
    if (!sh.passed) {
      this.mode = 'over';
      this.modeT = 0;
      this.recordBest();
      return;
    }
    const lines = wages(run, sh);
    const earned = lines.reduce((a, l) => a + l[1], 0);
    run.pennies += earned;
    this.finishInfo = { posted: sh.posted, target: sh.target, earned, lines, best: sh.bestPost, route: run.route, kind: sh.cfg.kind };
    advance(run);
    this.resultsShown = 0;
    this.modeT = 0;
    this.mode = 'results';
  }

  afterResults(): void {
    if (this.mode !== 'results' || !this.finishInfo) return;
    if (this.run.route > ROUTES && !this.overtime) {
      this.mode = 'dawn';
      this.modeT = 0;
      this.save.dawns++;
      this.recordBest();
      sfx.fanfare(true);
      return;
    }
    this.openShop();
  }

  private startOvertime(): void {
    if (this.mode !== 'dawn') return;
    this.overtime = true;
    this.openShop();
  }

  private recordBest(): void {
    if (this.run.total > this.save.best) this.save.best = this.run.total;
    this.save.bestRoute = Math.max(this.save.bestRoute, this.run.route);
    writeSave(this.save);
  }

  openShop(): void {
    this.mode = 'shop';
    this.modeT = 0;
    this.rerolls = 0;
    this.offers = rollOffers(this.run, 0);
    this.selected = null;
  }

  leaveShop(): void {
    this.mode = 'intro';
    this.startDelivery();
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(pose: Pose): void {
    const sim = this.shift.sim;
    const v = sim.chassis.getLinearVelocity();
    const H = this.cam.H;
    const ground = groundAt(this.shift.course, pose.x) ?? pose.y - 3;
    const height = Math.max(0, pose.y - ground);
    const viewM = Math.max(10.5 + Math.abs(v.x) * 0.22, height * 1.6 + 6);
    // portrait screens see less width: pull back a little
    const aspect = this.cam.W / this.cam.H;
    const ppmT = H / Math.min(24, viewM) * Math.min(1, Math.max(0.55, aspect / 1.4));
    const viewW = this.cam.W / ppmT;
    const lead = Math.max(-2, Math.min(viewW * 0.18, v.x * 0.35));
    const tx = pose.x + lead + Math.min(1.5, viewW * 0.06);
    const ty = Math.max(pose.y - height * 0.45 + 1.2, pose.y - viewM * 0.3);
    const dt = this.fdt;
    this.cam.x += (tx - this.cam.x) * ease(0.08, dt);
    this.cam.y += (ty - this.cam.y) * ease(0.06, dt);
    this.cam.ppm += (ppmT - this.cam.ppm) * ease(0.04, dt);
    if (!Number.isFinite(this.cam.x) || !Number.isFinite(this.cam.y) || !Number.isFinite(this.cam.ppm)) {
      this.cam.x = tx;
      this.cam.y = ty;
      this.cam.ppm = ppmT;
    }
    if (this.mode === 'title' || this.mode === 'intro') {
      this.cam.ppm = (H / 10.5) * Math.min(1, Math.max(0.55, aspect / 1.4));
      this.cam.x = pose.x + Math.min(3.4, (this.cam.W / this.cam.ppm) * 0.15);
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
    const fs: FeatureState = {
      used: sh.used,
      cubes: sim.cubes.map((c) => {
        const p = c.body.getPosition();
        return { x: p.x, y: p.y, a: c.body.getAngle(), hit: c.hit };
      }),
      paw: sh.paw,
      t: this.t,
    };

    this.art.drawBackground(ctx, cam, this.t, this.dpr);
    worldTransform(ctx, cam, sk.x, sk.y);
    const px = 1 / cam.ppm;
    this.drawWindowsBack(ctx);
    this.art.drawStanding(ctx, cam, this.t);
    this.art.drawFeaturesBack(ctx, cam, fs);
    this.art.drawTerrain(ctx, cam, px);
    for (const l of sh.course.letters) {
      if (sh.got.has(l.id) || Math.abs(l.x - cam.x) > cam.W / cam.ppm) continue;
      drawLetter(ctx, l.x, l.y, this.t, l.id);
    }
    this.art.drawFeaturesFront(ctx, cam, fs);
    this.drawWindowsFront(ctx);
    this.drawCart(ctx, P);
    this.art.drawHoopsFront(ctx, cam, fs);
    this.art.drawPaw(ctx, fs, this.t);
    this.fx.drawWorld(ctx);
    this.drawPostEmbers(ctx);

    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawWeather(ctx);
    this.drawSpeedLines(ctx);
    drawWorldLabels(this, ctx, P.chassis);
    this.fx.drawPops(ctx, cam, this.s);
    const s = this.s;
    this.tallies.forEach((p, i) => drawTally(ctx, p, cam.W / 2, meterY(this) + 168 * s + i * 30 * s, meterY(this) + 40 * s, s, this.t, this.fx.reduced));
    if (this.mode === 'drive' || this.mode === 'results' || this.mode === 'intro') drawHud(this, ctx);
    if (this.input.touchUI && (this.mode === 'drive' || this.mode === 'title' || this.mode === 'intro')) drawPads(this, ctx);
    drawHint(this, ctx);
    if (this.mode === 'title') drawTitle(this, ctx);
    if (this.mode === 'intro') drawIntro(this, ctx);
    if (this.mode === 'results') {
      if (this.finishInfo) drawResults(this, ctx);
      else drawWaiting(this, ctx);
    }
    if (this.mode === 'shop') drawShop(this, ctx);
    if (this.mode === 'over') drawOver(this, ctx);
    if (this.mode === 'dawn') drawDawn(this, ctx);
    if (this.paused) drawPause(this, ctx);
  }

  /** Inspector overlays drawn over the world. */
  private drawWeather(ctx: CanvasRenderingContext2D): void {
    const sh = this.shift;
    const rule = sh.cfg.rule;
    const W = this.cam.W;
    const H = this.cam.H;
    if (rule === 'lightsOut' && this.mode !== 'shop') {
      const lamp = sh.sim.lampWorld();
      const sp = toScreen(this.cam, lamp.x, lamp.y + 0.3);
      const r = (2.6 + this.flameSize() * 5) * this.cam.ppm;
      const g = ctx.createRadialGradient(sp.x, sp.y, r * 0.25, sp.x, sp.y, r);
      g.addColorStop(0, 'rgba(6,4,18,0)');
      g.addColorStop(1, 'rgba(6,4,18,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // lit windows still glow through the dark
      for (const w of sh.course.windows) {
        if (!sh.lit.has(w.id) && !w.final) continue;
        const ws = toScreen(this.cam, w.x, this.windowMouthY(w));
        if (ws.x < -200 || ws.x > W + 200) continue;
        const gr = ctx.createRadialGradient(ws.x, ws.y, 0, ws.x, ws.y, 3 * this.cam.ppm);
        gr.addColorStop(0, 'rgba(255,200,90,0.35)');
        gr.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(ws.x - 3 * this.cam.ppm, ws.y - 3 * this.cam.ppm, 6 * this.cam.ppm, 6 * this.cam.ppm);
      }
    } else if (rule === 'coldSnap') {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(190,225,255,0)');
      g.addColorStop(1, 'rgba(190,225,255,0.32)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (rule === 'draught' && !this.fx.reduced) {
      ctx.strokeStyle = 'rgba(255,241,207,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const seed = (i * 7919) % 211;
        const y = ((seed / 211) * H * 0.85 + H * 0.08) | 0;
        const len = 80 + (seed % 7) * 25;
        const x = ((((seed * 13 - this.t * (500 + seed * 3)) % (W + len)) + W + len) % (W + len)) - len;
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + len * 0.3, y - 6, x + len * 0.6, y + 6, x + len, y);
      }
      ctx.stroke();
    }
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D): void {
    if (this.fx.reduced || this.mode !== 'drive') return;
    const v = this.shift.sim.chassis.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    const boosted = this.shift.sim.boostT > 0;
    if (sp < 11 && !boosted) return;
    const k = boosted ? 1 : Math.min(1, (sp - 11) / 6);
    const W = this.cam.W;
    const H = this.cam.H;
    ctx.strokeStyle = boosted ? `rgba(255,210,63,${0.35 * k})` : `rgba(255,241,207,${0.25 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const seed = (i * 7919) % 101;
      const y = ((seed / 101) * H * 0.9 + H * 0.05) | 0;
      const len = 60 + (seed % 5) * 30;
      const x = W - ((this.t * (900 + seed * 6) + seed * 97) % (W + len * 2));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * k, y - (v.y / Math.max(1, Math.abs(v.x))) * len * k * 0.5);
    }
    ctx.stroke();
  }

  private drawCart(ctx: CanvasRenderingContext2D, P: { chassis: Pose; rear: Pose; front: Pose }): void {
    const sh = this.shift;
    const sim = sh.sim;
    const parts = new Set<PartId>(this.run.parts);
    const wheelKind = this.run.parts.find((p) => PARTS[p].slot === 'wheels') ?? null;
    const c = P.chassis;
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
    if (sh.cfg.rule === 'heavySack') {
      // the mail sack strapped on the back
      ctx.beginPath();
      ctx.ellipse(-0.62, 0.42, 0.42, 0.34, -0.2, 0, Math.PI * 2);
      inked(ctx, '#b07a48', 0.05);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-0.68, 0.7, 0.12, 0.14);
      ctx.fillStyle = C.cream;
      ctx.font = '700 0.22px sans-serif';
      ctx.save();
      ctx.scale(1, -1);
      ctx.textAlign = 'center';
      ctx.fillText('MAIL', -0.62, -0.36);
      ctx.restore();
    }
    const fl = this.flameSize();
    this.flameShown += (fl - this.flameShown) * ease(0.12, this.fdt);
    this.blinkT -= this.fdt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
    const v = sim.chassis.getLinearVelocity();
    const frag = sh.fragility();
    let mood = this.mood;
    if (sim.airborne) mood = v.y < -8 && frag > 0.5 ? -0.6 : 0.6;
    this.mood += (0 - this.mood) * ease(0.02, this.fdt);
    const look: CartLook = {
      t: this.t,
      flame: this.flameShown,
      dead: sim.crashed,
      lean: sim.lean,
      sparks: sh.flame.sparks,
      wheels: wheelKind,
      parts,
      airborne: sim.airborne,
      mood,
      blink: this.blinkT < 0,
      cracked: sh.flame.alive ? (frag > 0.85 ? 2 : frag > 0.55 ? 1 : 0) : 0,
    };
    drawCartBody(ctx, look);
    ctx.restore();
    // sparks orbiting the lamp
    if (!sim.crashed && sh.flame.sparks > 1) {
      const lamp = sim.lampWorld();
      const n = Math.min(24, Math.round(sh.flame.sparks) - 1);
      this.sparkAngle += (0.05 + n * 0.004) * this.fdt * 60;
      for (let i = 0; i < n; i++) {
        const a = this.sparkAngle + (i / n) * Math.PI * 2;
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
      if (w.high || w.gold) continue;
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
      const post = this.tallies.find((p) => p.w.id === w.id);
      const litK = post ? Math.min(1, Math.max(0, (post.t - FLY) * 6)) : lit;
      const hot = inRange?.id === w.id && sh.flame.alive && this.mode === 'drive';
      const pulse = hot && !this.fx.reduced ? 1 + Math.sin(this.t * 14) * 0.04 : 1;
      ctx.save();
      if (w.gold) {
        ctx.translate(w.x, w.y);
        ctx.scale(pulse, pulse);
        drawPillarBox(ctx, litK, this.t, hot);
      } else if (w.high) {
        ctx.beginPath();
        ctx.moveTo(w.x, w.y + 1.2);
        ctx.lineTo(w.x, w.y + 30);
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = C.cream;
        ctx.stroke();
        ctx.translate(w.x, w.y - 0.9);
        ctx.rotate(Math.sin(this.t * 1.5 + w.id) * 0.05);
        ctx.scale(pulse, pulse);
        drawHouse(ctx, 1.5, 2.1, litK, this.t, hot, C.mustard);
        // ×2 tag
        ctx.save();
        ctx.translate(0.95, 1.9);
        ctx.rotate(0.2);
        rr(ctx, -0.38, -0.22, 0.76, 0.44, 0.08);
        inked(ctx, C.red, 0.04);
        ctx.scale(1, -1);
        ctx.fillStyle = C.cream;
        ctx.font = '700 0.34px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×2', 0, 0.02);
        ctx.restore();
      } else {
        ctx.translate(w.x, w.y + 2.7);
        ctx.scale(pulse, pulse);
        drawHouse(ctx, 1.6, 2.2, litK, this.t, hot, this.windowTone(w));
      }
      ctx.restore();
    }
  }

  private drawOffice(ctx: CanvasRenderingContext2D, w: WindowSpot): void {
    const x = w.x;
    const y = w.y;
    const lit = this.shift.done ? 1 : 0;
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y);
    ctx.lineTo(x - 4.5, y + 5.5);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x + 4.5, y + 5.5);
    ctx.lineTo(x + 4.5, y);
    ctx.closePath();
    inked(ctx, C.red, 0.1);
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
    rr(ctx, x - 3, y + 4.4, 6, 1.1, 0.15);
    inked(ctx, C.cream, 0.08);
    if (lit) {
      const g = ctx.createRadialGradient(x, y + 2, 0.2, x, y + 2, 6);
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
    for (const p of this.tallies) {
      if (p.t > FLY) continue;
      const k = p.t / FLY;
      const wy = this.windowMouthY(p.w);
      const x = lerp(p.fromX, p.w.x, k);
      const y = lerp(p.fromY, wy, k) + Math.sin(k * Math.PI) * 2;
      drawFlame(ctx, x, y - 0.3, 0.5, this.t);
      this.fx.burst(x, y, 1, 'spark', C.fire, 1, 0.1, 0.3, 0);
    }
  }
}

/** A gold pillar postbox (local coords: base at 0). */
function drawPillarBox(ctx: CanvasRenderingContext2D, lit: number, t: number, hot: boolean): void {
  // base plinth
  rr(ctx, -0.75, 0, 1.5, 0.3, 0.06);
  inked(ctx, '#b8860b', 0.05);
  // body with a domed cap
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.3);
  ctx.lineTo(-0.6, 2.6);
  ctx.arc(0, 2.6, 0.6, Math.PI, 0, true);
  ctx.lineTo(0.6, 0.3);
  ctx.closePath();
  inked(ctx, '#f2b91f', 0.07);
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-0.45, 0.6, 0.1, 2.0);
  // cap band
  ctx.fillStyle = '#b8860b';
  ctx.fillRect(-0.62, 2.5, 1.24, 0.12);
  // slot
  rr(ctx, -0.36, 2.05, 0.72, 0.16, 0.05);
  ctx.fillStyle = lit > 0 ? C.fire : C.ink;
  ctx.fill();
  // coin badge
  ctx.beginPath();
  ctx.arc(0, 1.3, 0.28, 0, Math.PI * 2);
  inked(ctx, '#ffe27a', 0.04);
  ctx.fillStyle = '#b8860b';
  ctx.fillRect(-0.04, 1.12, 0.08, 0.36);
  if (lit > 0) {
    const g = ctx.createRadialGradient(0, 2.1, 0, 0, 2.1, 2.5);
    g.addColorStop(0, `rgba(255,214,90,${0.5 * lit})`);
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-2.5, -0.4, 5, 5);
  }
  if (hot) {
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + 0.5 * Math.sin(t * 10)})`;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(0, 2.1, 1.1, 0, Math.PI * 2);
    ctx.stroke();
  }
}

