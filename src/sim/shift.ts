// One delivery: a course, a cart, the flame, windows to post at and a target to beat.
// Headless: the game renders it, the tests drive it with a bot.
import { generateCourse, groundAt, TRAP_VX, TRAP_VY, type Course, type DeliveryKind, type Feature, type WindowSpot } from './terrain';
import { Sim, type DriveInput } from './sim';
import { cartSpecFor, Flame, type PartId, type PostResult, type TrickPop } from './rules';
import type { StampId, StampState } from './stamps';
import { HEAT, type Levels } from './tricks';
import { Rng, TICK } from './rng';

export type InspectorId = 'cat' | 'draught' | 'wetInk' | 'lightsOut' | 'shortWick' | 'heavySack' | 'coldSnap' | 'tackStorm';

export const INSPECTORS: Record<InspectorId, { name: string; text: string }> = {
  cat: { name: 'The Cat', text: 'A paw swats at you and puts out your flame. Watch for its shadow.' },
  draught: { name: 'Draught', text: 'A headwind blows down the desk.' },
  wetInk: { name: 'Wet Ink', text: 'Slippery desk: your wheels grip less.' },
  lightsOut: { name: 'Lights Out', text: 'Pitch dark. Your flame is your headlight.' },
  shortWick: { name: 'Short Wick', text: 'Half the windows are boarded up.' },
  heavySack: { name: 'Heavy Sack', text: 'A heavy mail sack: lower jumps, slower spins.' },
  coldSnap: { name: 'Cold Snap', text: 'Heat you carry cools 7% a second. Post often!' },
  tackStorm: { name: 'Tack Storm', text: 'Somebody spilled the thumbtacks.' },
};
export const INSPECTOR_IDS = Object.keys(INSPECTORS) as InspectorId[];

export interface ShiftInput extends DriveInput {
  /** Edge-triggered: true on the tick the player pressed Post. */
  post: boolean;
}

export type ShiftEvent =
  | { type: 'trick'; pop: TrickPop; x: number; y: number }
  | { type: 'letter'; id: number; x: number; y: number }
  | { type: 'post'; window: WindowSpot; result: PostResult; auto: boolean; airborne: boolean }
  | { type: 'emptyPost'; window: WindowSpot }
  | { type: 'skip'; window: WindowSpot; sparks: number; slots: number[] }
  | { type: 'land'; impact: number; tolerance: number; clean: boolean; x: number; y: number }
  | { type: 'takeoff' }
  | { type: 'crash'; reason: 'lamp' | 'moth' | 'fall'; x: number; y: number; lost: number }
  | { type: 'blowout'; x: number; y: number; lost: number; cause: 'landing' | 'tacks' | 'paw' }
  | { type: 'saved'; x: number; y: number; slots: number[] }
  | { type: 'respawn' }
  | { type: 'strike'; x: number; y: number }
  | { type: 'launch'; x: number; y: number }
  | { type: 'hoop'; id: number; x: number; y: number }
  | { type: 'puncture'; x: number; y: number }
  | { type: 'smash'; x: number; y: number }
  | { type: 'paw'; phase: 'slam' | 'swat'; x: number; y: number }
  | { type: 'finish'; posted: number; target: number; passed: boolean };

export interface ShiftConfig {
  seed: number;
  route: number;
  kind: DeliveryKind;
  target: number;
  stamps: StampId[];
  parts: PartId[];
  levels: Levels;
  glasses: number;
  rule: InspectorId | null;
  state: StampState;
  /** Pennies held when the delivery starts (Moonlighter). */
  pennies: number;
}

const POST_RANGE = 3.4;
const HIGH_BAND = 1.8;
const LAND_SETTLE = 10;
export const RESPAWN_SPEED = 8;

/** The cat's paw state machine (Inspector: The Cat). */
export interface Paw {
  phase: 'idle' | 'warn' | 'slam' | 'hold' | 'lift';
  t: number;
  x: number;
  ground: number;
  y: number;
}

export class Shift {
  readonly course: Course;
  readonly sim: Sim;
  readonly flame: Flame;
  readonly tolMul: number;
  posted = 0;
  glasses: number;
  pennies = 0;
  tick = 0;
  events: ShiftEvent[] = [];
  lit = new Set<number>();
  skipped = new Set<number>();
  got = new Set<number>();
  done = false;
  passed = false;
  /** Ticks until respawn after a crash; 0 when driving. */
  crashTimer = 0;
  checkpoint: { x: number; y: number };
  windowsLit = 0;
  bestPost = 0;
  tricks = 0;
  glassesBroken = 0;
  blowouts = 0;
  secondWindUsed = false;
  // feature state
  used = new Set<number>();
  private lastLamp: { x: number; y: number };
  // air tracking
  private airStartTick = 0;
  private airAngle0 = 0;
  private pendingLand: { tick: number; airTicks: number; rot: number; impact: number; clean: boolean; tol: number } | null = null;
  // ground tricks
  private wheelieTicks = 0;
  private noseTicks = 0;
  private wheelieHeat = 0;
  private railTicks = 0;
  private railGone = 0;
  private smashN = 0;
  private smashIdle = 0;
  paw: Paw | null = null;
  private rng: Rng;
  /** Live trick being performed (for the HUD). */
  live: { label: string; heat: number } | null = null;

  constructor(readonly cfg: ShiftConfig) {
    this.course = generateCourse({ seed: cfg.seed, route: cfg.route, kind: cfg.kind, sparseWindows: cfg.rule === 'shortWick', tackStorm: cfg.rule === 'tackStorm' });
    const { spec, tolerance } = cartSpecFor(cfg.parts, cfg.rule === 'heavySack');
    this.tolMul = tolerance;
    this.sim = new Sim(this.course, spec);
    if (cfg.rule === 'wetInk') {
      this.sim.gripMul = 0.5;
      this.sim.spawn(this.course.startX, this.course.startY);
    }
    if (cfg.rule === 'draught') this.sim.wind = -9;
    this.flame = new Flame(cfg.stamps, cfg.levels, cfg.state);
    this.flame.reset(1);
    this.glasses = cfg.glasses;
    this.checkpoint = { x: this.course.startX, y: this.course.startY };
    this.lastLamp = this.sim.lampWorld();
    this.rng = new Rng(cfg.seed * 31 + cfg.route * 7 + 3);
    if (cfg.rule === 'cat') {
      this.sim.enablePaw();
      this.paw = { phase: 'idle', t: 2.5, x: 0, ground: 0, y: 40 };
    }
  }

  has(id: StampId): boolean {
    return this.flame.has(id);
  }

  get target(): number {
    return this.cfg.target;
  }

  tolerance(): number {
    return this.flame.tolerance(this.tolMul, this.cfg.target);
  }

  fragility(): number {
    return this.flame.fragility(this.cfg.target);
  }

  /** Window the cart is currently in range of (and not yet lit), if any. */
  windowInRange(): WindowSpot | null {
    const p = this.sim.pos;
    const lamp = this.sim.lampWorld();
    for (const w of this.course.windows) {
      if (this.lit.has(w.id) || w.final) continue;
      if (Math.abs(p.x - w.x) > POST_RANGE) continue;
      if (w.high && Math.abs(lamp.y - w.y) > HIGH_BAND) continue;
      return w;
    }
    return null;
  }

  private startSparks(): number {
    return 1 + this.flame.count('nightOwl') * this.windowsLit;
  }

  step(input: ShiftInput): void {
    this.events.length = 0;
    if (this.done) return;
    this.tick++;
    const sim = this.sim;
    this.stepPaw();

    if (this.crashTimer > 0) {
      sim.step({ gas: false, brake: false }, TICK);
      this.crashTimer--;
      if (this.crashTimer === 0) {
        if (this.glasses <= 0) {
          // the post already in the bag still counts: meeting the target secures the delivery
          this.finish(this.posted >= this.cfg.target);
          return;
        }
        sim.spawn(this.checkpoint.x, this.checkpoint.y, RESPAWN_SPEED);
        // re-arm traps, strips and tacks ahead of the checkpoint
        for (const f of this.course.features) if (f.kind !== 'hoop' && f.kind !== 'stack' && featureX(f) > this.checkpoint.x) this.used.delete(f.id);
        this.lastLamp = sim.lampWorld();
        this.events.push({ type: 'respawn' });
      }
      return;
    }

    sim.step(input, TICK);
    this.flame.tick(TICK, this.cfg.rule === 'coldSnap');
    const pos = sim.pos;

    for (const e of sim.events) {
      if (e.type === 'takeoff') {
        this.airStartTick = sim.tick - 5;
        this.airAngle0 = sim.angle;
        this.endGroundTricks();
        this.events.push({ type: 'takeoff' });
      } else if (e.type === 'land') {
        const airTicks = sim.tick - this.airStartTick;
        const tol = this.tolerance();
        const clean = !e.belly && e.impact < tol * 0.55;
        this.events.push({ type: 'land', impact: e.impact, tolerance: tol, clean, x: e.x, y: e.y });
        if (e.impact > tol && this.flame.alive) {
          this.blowout(pos.x, pos.y + 1, 'landing');
          continue;
        }
        this.pendingLand = { tick: sim.tick, airTicks, rot: sim.angle - this.airAngle0, impact: e.impact, clean, tol };
      } else if (e.type === 'crash') {
        this.crash(e.reason, e.x, e.y);
        return;
      } else if (e.type === 'swat') {
        this.endGroundTricks();
        this.pendingLand = null;
        this.airStartTick = sim.tick;
        this.airAngle0 = sim.angle;
        if (this.flame.alive) this.blowout(e.x, e.y + 1, 'paw');
        this.events.push({ type: 'paw', phase: 'swat', x: e.x, y: e.y });
      } else if (e.type === 'smash') {
        this.smashN++;
        this.smashIdle = 0;
        this.events.push({ type: 'smash', x: e.x, y: e.y });
      }
    }

    // Resolve a landing once the cart has settled without crashing.
    if (this.pendingLand && sim.tick - this.pendingLand.tick >= LAND_SETTLE) {
      this.resolveLanding(this.pendingLand);
      this.pendingLand = null;
    }

    this.features(input);

    if (!sim.airborne) this.groundTricks();
    else {
      const air = (sim.tick - this.airStartTick) * TICK;
      const rot = sim.angle - this.airAngle0;
      const flips = Math.floor((Math.abs(rot) + 0.6) / (Math.PI * 2));
      this.live = { label: flips > 0 ? `${flips > 1 ? flips + '× ' : ''}${rot > 0 ? 'Backflip' : 'Frontflip'}` : 'Air', heat: Math.round(air * HEAT.airPerSec) };
    }
    // smashes resolve once the cubes stop coming
    if (this.smashN > 0 && ++this.smashIdle > 30) this.endSmash();

    // Letters
    const lamp = sim.lampWorld();
    for (const l of this.course.letters) {
      if (this.got.has(l.id)) continue;
      const dx = l.x - pos.x;
      if (Math.abs(dx) > 1.6) continue;
      if (Math.hypot(dx, l.y - pos.y) < 1.15 || Math.hypot(l.x - lamp.x, l.y - lamp.y) < 0.9) {
        this.got.add(l.id);
        const pop = this.flame.letter();
        this.events.push({ type: 'letter', id: l.id, x: l.x, y: l.y });
        this.events.push({ type: 'trick', pop, x: l.x, y: l.y });
      }
    }

    // Windows
    const inRange = this.windowInRange();
    if (input.post && inRange) this.post(inRange, false);
    for (const w of this.course.windows) {
      if (w.final || this.lit.has(w.id) || this.skipped.has(w.id)) continue;
      if (pos.x > w.x + POST_RANGE) {
        this.skipped.add(w.id);
        let sparks = 0;
        let slots: number[] = [];
        if (this.has('postageDue') && this.flame.alive) {
          sparks = this.flame.addSparks(2 * this.flame.count('postageDue'));
          slots = this.flame.slots('postageDue');
        }
        this.events.push({ type: 'skip', window: w, sparks, slots });
      }
    }

    // Finish line
    const fin = this.course.windows.find((w) => w.final)!;
    if (pos.x >= fin.x - 1.5) {
      this.endGroundTricks();
      if (this.smashN) this.endSmash();
      if (this.flame.alive) this.post(fin, true);
      this.finish(this.posted >= this.cfg.target);
    }
    this.lastLamp = lamp;
  }

  // ---------------------------------------------------------------- course features

  private features(input: ShiftInput): void {
    const sim = this.sim;
    const pos = sim.pos;
    const lamp = sim.lampWorld();
    for (const f of this.course.features) {
      if (this.used.has(f.id)) continue;
      switch (f.kind) {
        case 'striker':
          if (sim.grounded && !sim.railTouch && pos.x >= f.x0 && pos.x <= f.x1) {
            this.used.add(f.id);
            const tw = this.flame.count('tailwind');
            sim.boost(16 + tw * 3, 80 + tw * 30);
            this.events.push({ type: 'strike', x: pos.x, y: pos.y });
            this.emit(this.flame.award('strike', 'Strike', HEAT.strike, 'first'), pos.x, pos.y + 1.4);
          }
          break;
        case 'trap':
          if (sim.grounded && !sim.railTouch && pos.x >= f.x - 0.2 && pos.x < f.x + 1.4) {
            this.used.add(f.id);
            this.endGroundTricks();
            sim.launch(TRAP_VX, TRAP_VY);
            this.airStartTick = sim.tick - 5;
            this.airAngle0 = sim.angle;
            this.events.push({ type: 'launch', x: f.x, y: f.y });
          }
          break;
        case 'tacks': {
          for (const w of [sim.rear, sim.front]) {
            const wp = w.getPosition();
            if (wp.x < f.x0 || wp.x > f.x1) continue;
            const g = groundAt(this.course, wp.x);
            if (g === null || wp.y - sim.spec.wheelR - g > 0.12) continue;
            this.used.add(f.id);
            this.events.push({ type: 'puncture', x: wp.x, y: g });
            if (this.flame.alive) this.blowout(pos.x, pos.y + 1, 'tacks');
            sim.hop();
            break;
          }
          break;
        }
        case 'hoop': {
          if (Math.abs(f.x - lamp.x) > 3) break;
          const a = this.lastLamp;
          if (a.x < f.x && lamp.x >= f.x) {
            const k = (f.x - a.x) / Math.max(1e-6, lamp.x - a.x);
            const y = a.y + (lamp.y - a.y) * k;
            if (Math.abs(y - f.y) < f.r * 0.92) {
              this.used.add(f.id);
              this.events.push({ type: 'hoop', id: f.id, x: f.x, y: f.y });
              this.emit(this.flame.award('hoop', 'Hoop', HEAT.hoop, 1), f.x, f.y + 1.2);
            }
          }
          break;
        }
        default:
          break;
      }
    }
    void input;
  }

  private stepPaw(): void {
    const p = this.paw;
    const body = this.sim.paw;
    if (!p || !body) return;
    p.t -= TICK;
    const sim = this.sim;
    const go = (phase: Paw['phase'], t: number) => {
      p.phase = phase;
      p.t = t;
    };
    let ty = p.y;
    switch (p.phase) {
      case 'idle':
        ty = p.ground + 30;
        if (p.t <= 0 && this.crashTimer === 0 && !this.done) {
          // aim ahead of the cart, on solid desk, not on the sorting office
          const v = Math.max(4, sim.speed);
          const x = sim.pos.x + v * 1.25 + this.rng.range(-1, 2.5);
          const g = groundAt(this.course, x);
          const fin = this.course.endX;
          if (g !== null && x < fin - 12 && x > this.course.startX + 25) {
            p.x = x;
            p.ground = g;
            p.y = g + 14;
            go('warn', 1.05);
          } else p.t = 0.4;
        }
        break;
      case 'warn':
        ty = p.ground + 14;
        if (p.t <= 0) {
          go('slam', 0.16);
        }
        break;
      case 'slam':
        ty = p.ground + 0.56;
        if (p.t <= 0) {
          this.events.push({ type: 'paw', phase: 'slam', x: p.x, y: p.ground });
          go('hold', 0.55);
        }
        break;
      case 'hold':
        ty = p.ground + 0.56;
        if (p.t <= 0) go('lift', 0.5);
        break;
      case 'lift':
        ty = p.ground + 16;
        if (p.t <= 0) go('idle', this.rng.range(1.8, 3.2));
        break;
    }
    // drive the kinematic paw towards its target height
    const cur = body.getPosition();
    if (p.phase === 'warn' || p.phase === 'idle') {
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setPosition({ x: p.x, y: ty });
      p.y = ty;
    } else {
      const speed = p.phase === 'slam' ? 90 : p.phase === 'lift' ? 30 : 0;
      const dy = ty - cur.y;
      const vy = Math.abs(dy) < speed * TICK ? dy / TICK : Math.sign(dy) * speed;
      body.setLinearVelocity({ x: 0, y: vy });
      p.y = cur.y;
    }
  }

  // ---------------------------------------------------------------- tricks

  private emit(pop: TrickPop, x: number, y: number): void {
    this.tricks++;
    this.events.push({ type: 'trick', pop, x, y });
  }

  private resolveLanding(l: { airTicks: number; rot: number; impact: number; clean: boolean; tol: number }): void {
    const air = l.airTicks * TICK;
    const x = this.sim.pos.x;
    const y = this.sim.pos.y + 1.4;
    const flips = Math.floor((Math.abs(l.rot) + 0.6) / (Math.PI * 2));
    if (flips > 0) {
      const dir = l.rot > 0 ? 'Backflip' : 'Frontflip';
      const name = flips === 1 ? dir : flips === 2 ? `Double ${dir}` : flips === 3 ? `Triple ${dir}` : `${flips}× ${dir}`;
      this.emit(this.flame.award('flip', name, HEAT.flip(flips), 'first'), x, y);
    }
    if (air >= 0.55) {
      const label = air >= 2.2 ? 'Huge Air' : air >= 1.3 ? 'Big Air' : 'Air';
      this.emit(this.flame.award('air', label, Math.round(air * HEAT.airPerSec), label !== 'Air' ? 'first' : 0), x, y);
    }
    const k = l.impact / l.tol;
    if (air >= 0.5 && k >= 0.72 && k <= 1) {
      this.emit(this.flame.award('landing', 'Daredevil', HEAT.daredevil, 'first'), x, y);
    } else if (l.clean && air >= 0.45) {
      this.emit(this.flame.award('landing', 'Clean Landing', HEAT.clean, air >= 0.8 ? 'first' : 0), x, y);
    }
    this.live = null;
  }

  private groundTricks(): void {
    const sim = this.sim;
    // grinding a pencil rail
    if (sim.railTouch) {
      this.railTicks++;
      this.railGone = 0;
      this.live = { label: 'Grind', heat: Math.round((this.railTicks * TICK) * HEAT.grindPerSec) };
    } else if (this.railTicks && ++this.railGone > 6) this.endGrind();
    const wheelie = sim.rearTouch && !sim.frontTouch && !sim.bellyTouch && sim.speed > 1;
    const nose = sim.frontTouch && !sim.rearTouch && !sim.bellyTouch && sim.speed > 1;
    if (wheelie) {
      this.wheelieTicks++;
      if (this.wheelieTicks > 20) this.wheelieHeat += HEAT.wheeliePerTick;
    } else if (this.wheelieTicks) this.endWheelie();
    if (nose) {
      this.noseTicks++;
      if (this.noseTicks > 12) this.wheelieHeat += HEAT.nosePerTick;
    } else if (this.noseTicks) this.endWheelie();
    if (this.wheelieTicks > 20) this.live = { label: 'Wheelie', heat: Math.round(this.wheelieHeat) };
    else if (this.noseTicks > 12) this.live = { label: 'Nose Wheelie', heat: Math.round(this.wheelieHeat) };
    else if (!this.pendingLand && !this.railTicks) this.live = null;
  }

  private endGrind(): void {
    const t = this.railTicks * TICK;
    this.railTicks = 0;
    this.railGone = 0;
    if (t >= 0.35) this.emit(this.flame.award('grind', t >= 1.6 ? 'Long Grind' : 'Grind', Math.round(t * HEAT.grindPerSec), 'first'), this.sim.pos.x, this.sim.pos.y + 1.4);
    if (this.live?.label === 'Grind') this.live = null;
  }

  private endSmash(): void {
    const n = this.smashN;
    this.smashN = 0;
    this.smashIdle = 0;
    this.emit(this.flame.award('smash', n >= 8 ? 'Demolition' : 'Smash', n * HEAT.smashPerCube, 'first', { cubes: n }), this.sim.pos.x, this.sim.pos.y + 1.6);
  }

  private endWheelie(): void {
    const sim = this.sim;
    const w = this.wheelieTicks;
    const n = this.noseTicks;
    if (w >= 45 || n >= 30) {
      const label = n >= 30 ? 'Nose Wheelie' : 'Wheelie';
      this.emit(this.flame.award('wheelie', label, Math.round(this.wheelieHeat), 'first'), sim.pos.x, sim.pos.y + 1.4);
    }
    this.wheelieTicks = 0;
    this.noseTicks = 0;
    this.wheelieHeat = 0;
  }

  private endGroundTricks(): void {
    if (this.wheelieTicks || this.noseTicks) this.endWheelie();
    if (this.railTicks) this.endGrind();
  }

  // ---------------------------------------------------------------- posting and losing

  private post(w: WindowSpot, auto: boolean): void {
    if (!this.flame.alive) {
      if (!auto) this.events.push({ type: 'emptyPost', window: w });
      return;
    }
    this.endGroundTricks();
    if (this.pendingLand) {
      this.resolveLanding(this.pendingLand);
      this.pendingLand = null;
    }
    const result = this.flame.post({
      high: w.high,
      airborne: this.sim.airborne,
      final: w.final,
      gold: w.gold,
      windowsLit: this.windowsLit,
      pennies: this.cfg.pennies + this.pennies,
    });
    this.posted += result.value;
    this.pennies += result.pennies;
    this.bestPost = Math.max(this.bestPost, result.value);
    const finalSparks = result.steps.length ? result.steps[result.steps.length - 1].sparks : result.sparks;
    if (this.has('collector') && finalSparks >= 8) this.cfg.state.collector += this.flame.count('collector');
    this.lit.add(w.id);
    this.windowsLit++;
    this.events.push({ type: 'post', window: w, result, auto, airborne: this.sim.airborne });
    this.flame.reset(this.startSparks());
    this.live = null;
  }

  /** Lose the flame but keep driving. */
  private blowout(x: number, y: number, cause: 'landing' | 'tacks' | 'paw'): void {
    if (this.has('secondWind') && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.events.push({ type: 'saved', x, y, slots: this.flame.slots('secondWind') });
      return;
    }
    const lost = this.flame.carried;
    this.blowouts++;
    this.events.push({ type: 'blowout', x, y, lost, cause });
    this.douse();
    this.pendingLand = null;
    this.live = null;
  }

  /** Reset the flame, keeping Paper Lantern's share. */
  private douse(): void {
    const keepHeat = this.has('lantern') ? this.flame.heat * 0.5 : 0;
    const keepSparks = this.has('lantern') ? Math.floor(this.flame.sparks / 2) : 0;
    this.flame.reset(this.startSparks());
    this.flame.heat = keepHeat;
    this.flame.addSparks(keepSparks);
  }

  private crash(reason: 'lamp' | 'moth' | 'fall', x: number, y: number): void {
    const lost = this.flame.carried;
    this.glasses--;
    this.glassesBroken++;
    this.events.push({ type: 'crash', reason, x, y, lost });
    this.douse();
    this.pendingLand = null;
    this.wheelieTicks = this.noseTicks = 0;
    this.wheelieHeat = 0;
    this.railTicks = 0;
    this.smashN = 0;
    this.live = null;
    this.sim.crashed = true;
    if (reason !== 'fall') this.sim.scatter();
    this.crashTimer = 75;
    // respawn at the most recent ground window behind the cart (or the start)
    let cp = { x: this.course.startX, y: this.course.startY };
    for (const w of this.course.windows) if (!w.final && !w.high && w.x < x - 1) cp = { x: w.x, y: w.y };
    this.checkpoint = cp;
  }

  private finish(passed: boolean): void {
    this.done = true;
    this.passed = passed;
    if (passed && this.glassesBroken === 0 && this.has('bonfire')) this.cfg.state.bonfire += this.flame.count('bonfire');
    this.events.push({ type: 'finish', posted: this.posted, target: this.cfg.target, passed });
  }
}

function featureX(f: Feature): number {
  switch (f.kind) {
    case 'striker':
    case 'tacks':
      return f.x0;
    case 'rail':
      return f.x0;
    default:
      return f.x;
  }
}
