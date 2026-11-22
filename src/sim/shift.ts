// One shift: a course, a cart, the flame, windows to post at and a target to beat.
// Headless: the game renders it, the tests drive it with a bot.
import { generateCourse, type Course, type WindowSpot } from './terrain';
import { Sim, type DriveInput } from './sim';
import { cartSpecFor, Flame, type PartId, type StampId, type TrickPop } from './rules';
import { TICK } from './rng';

export type SupervisorRule = 'draught' | 'wetInk' | 'shortWick' | null;

export const RULE_TEXT: Record<Exclude<SupervisorRule, null>, { name: string; text: string }> = {
  draught: { name: 'Draught', text: 'A headwind blows down the desk.' },
  wetInk: { name: 'Wet Ink', text: 'Slippery desk: wheels grip less.' },
  shortWick: { name: 'Short Wick', text: 'Fewer windows on this shift.' },
};

export interface ShiftInput extends DriveInput {
  /** Edge-triggered: true on the tick the player pressed Post. */
  post: boolean;
}

export type ShiftEvent =
  | { type: 'trick'; pop: TrickPop; x: number; y: number }
  | { type: 'letter'; id: number; x: number; y: number }
  | { type: 'post'; window: WindowSpot; heat: number; sparks: number; value: number; mult: number; parts: string[]; auto: boolean }
  | { type: 'emptyPost'; window: WindowSpot }
  | { type: 'skip'; window: WindowSpot; sparks: number }
  | { type: 'land'; impact: number; tolerance: number; clean: boolean; x: number; y: number }
  | { type: 'takeoff' }
  | { type: 'crash'; reason: 'lamp' | 'moth' | 'fall'; x: number; y: number; lost: number }
  | { type: 'blowout'; x: number; y: number; lost: number }
  | { type: 'respawn' }
  | { type: 'finish'; posted: number; target: number; passed: boolean };

export interface ShiftConfig {
  seed: number;
  shift: number;
  target: number;
  stamps: StampId[];
  parts: PartId[];
  glasses: number;
  rule: SupervisorRule;
}

const POST_RANGE = 3.4;
const HIGH_BAND = 1.8;
const LAND_SETTLE = 10;
export const RESPAWN_SPEED = 8;

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
  // air tracking
  private airStartTick = 0;
  private airAngle0 = 0;
  private pendingLand: { tick: number; airTicks: number; rot: number; impact: number; clean: boolean } | null = null;
  // ground tricks
  private wheelieTicks = 0;
  private noseTicks = 0;
  private wheelieHeat = 0;
  /** Live trick being performed (for the HUD). */
  live: { label: string; heat: number } | null = null;

  constructor(readonly cfg: ShiftConfig) {
    this.course = generateCourse({ seed: cfg.seed, shift: cfg.shift, sparseWindows: cfg.rule === 'shortWick' });
    const { spec, tolerance } = cartSpecFor(cfg.parts);
    this.tolMul = tolerance;
    this.sim = new Sim(this.course, spec);
    if (cfg.rule === 'wetInk') {
      this.sim.gripMul = 0.55;
      this.sim.spawn(this.course.startX, this.course.startY);
    }
    if (cfg.rule === 'draught') this.sim.wind = -9;
    this.flame = new Flame(new Set(cfg.stamps));
    this.flame.reset(1);
    this.glasses = cfg.glasses;
    this.checkpoint = { x: this.course.startX, y: this.course.startY };
  }

  has(id: StampId): boolean {
    return this.flame.has(id);
  }

  tolerance(): number {
    return this.flame.tolerance(this.tolMul);
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
    return 1 + (this.has('nightOwl') ? this.windowsLit : 0);
  }

  step(input: ShiftInput): void {
    this.events.length = 0;
    if (this.done) return;
    this.tick++;
    const sim = this.sim;

    if (this.crashTimer > 0) {
      sim.step({ gas: false, brake: false }, TICK);
      this.crashTimer--;
      if (this.crashTimer === 0) {
        if (this.glasses <= 0) {
          this.finish(false);
          return;
        }
        sim.spawn(this.checkpoint.x, this.checkpoint.y, RESPAWN_SPEED);
        // the flame was already reset (and Paper Lantern's share kept) at the crash
        this.events.push({ type: 'respawn' });
      }
      return;
    }

    sim.step(input, TICK);
    this.flame.tick(TICK);
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
          this.blowout(pos.x, pos.y + 1);
          continue;
        }
        this.pendingLand = { tick: sim.tick, airTicks, rot: sim.angle - this.airAngle0, impact: e.impact, clean };
      } else if (e.type === 'crash') {
        this.crash(e.reason, e.x, e.y);
        return;
      }
    }

    // Resolve a landing once the cart has settled without crashing.
    if (this.pendingLand && sim.tick - this.pendingLand.tick >= LAND_SETTLE) {
      this.resolveLanding(this.pendingLand);
      this.pendingLand = null;
    }

    if (!sim.airborne) this.groundTricks();
    else {
      const air = (sim.tick - this.airStartTick) * TICK;
      const rot = sim.angle - this.airAngle0;
      const flips = Math.floor((Math.abs(rot) + 0.6) / (Math.PI * 2));
      this.live = { label: flips > 0 ? `${flips > 1 ? flips + '× ' : ''}${rot > 0 ? 'Backflip' : 'Frontflip'}` : 'Air', heat: Math.round(air * 60) };
    }

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
    else if (input.post && !inRange) {
      // nothing in range: ignore
    }
    for (const w of this.course.windows) {
      if (w.final || this.lit.has(w.id) || this.skipped.has(w.id)) continue;
      if (pos.x > w.x + POST_RANGE) {
        this.skipped.add(w.id);
        let sparks = 0;
        if (this.has('postageDue') && this.flame.alive) sparks = this.flame.addSparks(2);
        this.events.push({ type: 'skip', window: w, sparks });
      }
    }

    // Finish line
    const fin = this.course.windows.find((w) => w.final)!;
    if (pos.x >= fin.x - 1.5) {
      if (this.flame.alive) this.post(fin, true);
      this.finish(this.posted >= this.cfg.target);
    }
  }

  private resolveLanding(l: { airTicks: number; rot: number; impact: number; clean: boolean }): void {
    const air = l.airTicks * TICK;
    const x = this.sim.pos.x;
    const y = this.sim.pos.y + 1.4;
    const emit = (pop: TrickPop) => {
      this.tricks++;
      this.events.push({ type: 'trick', pop, x, y });
    };
    const flips = Math.floor((Math.abs(l.rot) + 0.6) / (Math.PI * 2));
    if (flips > 0) {
      const dir = l.rot > 0 ? 'Backflip' : 'Frontflip';
      const name = flips === 1 ? dir : flips === 2 ? `Double ${dir}` : flips === 3 ? `Triple ${dir}` : `${flips}× ${dir}`;
      emit(this.flame.award(name, Math.round(220 * Math.pow(flips, 1.6)), true, name));
    }
    if (air >= 0.55) {
      const label = air >= 2.2 ? 'Huge Air' : air >= 1.3 ? 'Big Air' : 'Air';
      emit(this.flame.award(label, Math.round(air * 70), label !== 'Air', 'Air'));
    }
    if (l.clean && (air >= 0.45 || this.has('rubberStamp'))) {
      if (!this.has('featherweight')) {
        const kindles = air >= 0.8 || this.has('rubberStamp');
        const pop = this.flame.award('Clean Landing', 40, false, 'Clean Landing');
        if (kindles) {
          const add = this.has('rubberStamp') ? 1 : pop.repeat === 0 ? 1 : 0;
          pop.sparks += this.flame.addSparks(add);
        }
        emit(pop);
      }
    }
    this.live = null;
  }

  private groundTricks(): void {
    const sim = this.sim;
    const wheelie = sim.rearTouch && !sim.frontTouch && !sim.bellyTouch && sim.speed > 1;
    const nose = sim.frontTouch && !sim.rearTouch && !sim.bellyTouch && sim.speed > 1;
    if (wheelie) {
      this.wheelieTicks++;
      if (this.wheelieTicks > 20) this.wheelieHeat += 1.3;
    } else if (this.wheelieTicks) this.endWheelie();
    if (nose) {
      this.noseTicks++;
      if (this.noseTicks > 12) this.wheelieHeat += 3;
    } else if (this.noseTicks) this.endWheelie();
    if (this.wheelieTicks > 20) this.live = { label: 'Wheelie', heat: Math.round(this.wheelieHeat) };
    else if (this.noseTicks > 12) this.live = { label: 'Nose Wheelie', heat: Math.round(this.wheelieHeat) };
    else if (!this.pendingLand) this.live = null;
  }

  private endWheelie(): void {
    const sim = this.sim;
    const w = this.wheelieTicks;
    const n = this.noseTicks;
    if (w >= 45 || n >= 30) {
      const label = n >= 30 ? 'Nose Wheelie' : 'Wheelie';
      const pop = this.flame.award(label, Math.round(this.wheelieHeat), true, label);
      this.tricks++;
      this.events.push({ type: 'trick', pop, x: sim.pos.x, y: sim.pos.y + 1.4 });
    }
    this.wheelieTicks = 0;
    this.noseTicks = 0;
    this.wheelieHeat = 0;
  }

  private endGroundTricks(): void {
    if (this.wheelieTicks || this.noseTicks) this.endWheelie();
  }

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
    const heat = Math.round(this.flame.heat);
    const sparks = this.flame.sparks;
    const pv = this.flame.postValue({ high: w.high, airborne: this.sim.airborne });
    this.posted += pv.value;
    this.bestPost = Math.max(this.bestPost, pv.value);
    this.lit.add(w.id);
    this.windowsLit++;
    if (this.has('purse')) this.pennies++;
    this.events.push({ type: 'post', window: w, heat, sparks, value: pv.value, mult: pv.mult, parts: pv.parts, auto });
    this.flame.reset(this.startSparks());
    this.live = null;
  }

  /** A landing too hard for this flame: the combo is lost but the cart drives on. */
  private blowout(x: number, y: number): void {
    const lost = Math.round(this.flame.heat * this.flame.sparks);
    this.events.push({ type: 'blowout', x, y, lost });
    const keep = this.has('lantern') ? this.flame.heat * 0.5 : 0;
    this.flame.reset(this.startSparks());
    this.flame.heat = keep;
    this.pendingLand = null;
    this.live = null;
  }

  private crash(reason: 'lamp' | 'moth' | 'fall', x: number, y: number): void {
    const lost = Math.round(this.flame.heat * this.flame.sparks);
    this.glasses--;
    this.events.push({ type: 'crash', reason, x, y, lost });
    const keep = this.has('lantern') ? this.flame.heat * 0.5 : 0;
    this.flame.reset(this.startSparks());
    this.flame.heat = keep;
    this.pendingLand = null;
    this.wheelieTicks = this.noseTicks = 0;
    this.wheelieHeat = 0;
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
    this.events.push({ type: 'finish', posted: this.posted, target: this.cfg.target, passed });
  }
}

export function targetFor(shift: number): number {
  return [0, 1500, 4000, 8000, 13000, 20000, 28000][shift] ?? Math.round(28000 * Math.pow(1.5, shift - 6));
}

export const SHIFTS = 6;

export function ruleFor(shift: number, seed: number): SupervisorRule {
  if (shift % 3 !== 0) return null;
  const rules: SupervisorRule[] = ['draught', 'wetInk', 'shortWick'];
  return rules[(seed + shift) % rules.length];
}
