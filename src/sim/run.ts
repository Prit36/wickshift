// One launch of a build on a level. Headless and deterministic: the same build
// and the same inputs give the same result, so tests can replay solutions.
import * as planck from 'planck';
import { GRID, LAMP_H, LAMP_W, STICK_THICK, WHEEL_R, dirVec } from './parts';
import type { Blueprint, Placed } from './blueprint';
import { pinPos } from './blueprint';
import type { LevelDef, Zone } from './level';

export const TICK = 1 / 60;
export const GRAVITY = 10;

// Tuning
const KEY_SPEED = 22; // rad/s
const KEY_TORQUE = 4.2;
const ROCKET_FORCE = 34;
const ROCKET_BURN = 0.15; // flame per second, per rocket
const LANTERN_LIFT = 14;
const LANTERN_BURN = 0.025;
const LANTERN_DRAG = 0.6;
const SPRING_IMPULSE = 5.2;
const SPRING_REACH = 0.62;
const SPRING_COOLDOWN = 40;
const KNOCK_FREE = 2.4; // m/s of sudden velocity change the lamp shrugs off
const WHEEL_KNOCK_FREE = 5.6; // ...when only the wheels took the hit: land on your wheels
const KNOCK_LOSS = 0.13; // flame lost per m/s above that
const LAMP_KNOCK_FREE = 0.9; // when the lamp itself hits something
const TIP_ANGLE = 1.95; // radians from upright before oil spills
const TIP_BURN = 0.55;
const LAMP_LIFT = 0.05; // lamp centre sits a little above its pin

export interface RunInput {
  drive: boolean;
  rockets: boolean;
  lanterns: boolean;
  /** True on the tick the springs button was pressed. */
  springs: boolean;
}

export const NO_INPUT: RunInput = { drive: false, rockets: false, lanterns: false, springs: false };

export type OutCause = 'knocks' | 'fire' | 'tipped' | 'ink';

export type RunEvent =
  | { type: 'knock'; x: number; y: number; loss: number; lamp: boolean }
  | { type: 'spring'; x: number; y: number; hit: boolean }
  | { type: 'letter'; x: number; y: number }
  | { type: 'delivered' }
  | { type: 'out'; cause: OutCause; x: number; y: number }
  | { type: 'fell' };

export type Outcome = 'delivered' | 'out' | 'fell' | null;

type Tag = { role: 'ground' | 'block' | 'stick' | 'lamp' | 'wheel' | 'rocket' | 'spring' | 'lantern' };

interface WheelRig {
  part: Placed;
  body: planck.Body;
  joint: planck.RevoluteJoint;
  key: boolean;
}
interface LanternRig {
  part: Placed;
  body: planck.Body;
  local: planck.Vec2;
}
interface PointRig {
  part: Placed;
  local: planck.Vec2;
  dir: planck.Vec2;
  cool: number;
}

const V = (x: number, y: number) => new planck.Vec2(x, y);
const inZone = (z: Zone, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

export class Run {
  readonly world: planck.World;
  readonly main: planck.Body;
  readonly wheels: WheelRig[] = [];
  readonly lanterns: LanternRig[] = [];
  readonly rockets: PointRig[] = [];
  readonly springs: PointRig[] = [];
  readonly lampLocal: planck.Vec2;
  flame = 1;
  tick = 0;
  outcome: Outcome = null;
  outCause: OutCause | null = null;
  events: RunEvent[] = [];
  letterGot = false;
  fireUsed = false;
  /** What is working this tick (for drawing and sound). */
  firing = { rockets: false, lanterns: false, drive: false };
  /** Ticks the build has sat still. */
  still = 0;
  peakKnock = 0;
  private prevV: planck.Vec2;
  private lampImpact = 0;
  private frameHit = false;
  private knockCool = 0;
  private lastDrain: OutCause = 'knocks';

  constructor(
    readonly level: LevelDef,
    readonly bp: Blueprint,
  ) {
    const world = new planck.World({ gravity: V(0, -GRAVITY) });
    this.world = world;
    // ---- the level
    const ground = world.createBody({ type: 'static' });
    for (const line of level.ground) {
      const pts = [V(line[0][0], level.killY - 20), ...line.map(([x, y]) => V(x, y)), V(line[line.length - 1][0], level.killY - 20)];
      ground.createFixture({ shape: new planck.Chain(pts, false), friction: 0.9, userData: { role: 'ground' } satisfies Tag });
    }
    for (const poly of level.blocks) ground.createFixture({ shape: new planck.Chain(poly.map(([x, y]) => V(x, y)), true), friction: 0.8, userData: { role: 'block' } satisfies Tag });

    // ---- the build, at its bench position
    const o = level.origin;
    const main = world.createBody({ type: 'dynamic', position: V(o.x, o.y), angularDamping: 0.15 });
    this.main = main;
    const fix = (shape: planck.Shape, density: number, role: Tag['role'], friction = 0.6) =>
      main.createFixture({ shape, density, friction, filterGroupIndex: -1, userData: { role } satisfies Tag });
    for (const s of bp.sticks) {
      const a = pinPos(s.a);
      const b = pinPos(s.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      fix(new planck.Box(len / 2 + STICK_THICK / 2, STICK_THICK / 2, V((a.x + b.x) / 2, (a.y + b.y) / 2), Math.atan2(b.y - a.y, b.x - a.x)), 2.2, 'stick');
    }
    const lamp = bp.parts.find((p) => p.kind === 'lamp');
    const lp = lamp ? pinPos(lamp.at) : { x: 0, y: 0 };
    this.lampLocal = V(lp.x, lp.y + LAMP_LIFT);
    if (lamp) fix(new planck.Box(LAMP_W / 2, LAMP_H / 2, this.lampLocal, 0), 1 / (LAMP_W * LAMP_H), 'lamp', 0.5);

    for (const p of bp.parts) {
      const at = pinPos(p.at);
      const d = dirVec(p.dir);
      const ang = (p.dir * Math.PI) / 4;
      if (p.kind === 'rocket') {
        fix(new planck.Box(0.2, 0.065, V(at.x, at.y), ang), 4, 'rocket');
        this.rockets.push({ part: p, local: V(at.x, at.y), dir: V(d.x, d.y), cool: 0 });
      } else if (p.kind === 'spring') {
        fix(new planck.Box(0.1, 0.06, V(at.x + d.x * 0.1, at.y + d.y * 0.1), ang), 2, 'spring');
        this.springs.push({ part: p, local: V(at.x, at.y), dir: V(d.x, d.y), cool: 0 });
      } else if (p.kind === 'wheel' || p.kind === 'key') {
        const wpos = V(o.x + at.x, o.y + at.y);
        const body = world.createBody({ type: 'dynamic', position: wpos, angularDamping: 0.05 });
        body.createFixture({ shape: new planck.Circle(WHEEL_R), density: 1.3, friction: 1.0, filterGroupIndex: -1, userData: { role: 'wheel' } satisfies Tag });
        const joint = world.createJoint(new planck.RevoluteJoint({ enableMotor: false, maxMotorTorque: KEY_TORQUE, motorSpeed: 0 }, main, body, wpos)) as planck.RevoluteJoint;
        this.wheels.push({ part: p, body, joint, key: p.kind === 'key' });
      } else if (p.kind === 'lantern') {
        const top = V(o.x + at.x, o.y + at.y + 1.0);
        const body = world.createBody({ type: 'dynamic', position: top, angularDamping: 2, fixedRotation: false });
        body.createFixture({ shape: new planck.Box(0.24, 0.3), density: 0.25, friction: 0.3, filterGroupIndex: -1, userData: { role: 'lantern' } satisfies Tag });
        world.createJoint(new planck.RopeJoint({ maxLength: 0.75, localAnchorA: V(at.x, at.y), localAnchorB: V(0, -0.3), bodyA: main, bodyB: body }));
        this.lanterns.push({ part: p, body, local: V(at.x, at.y) });
      }
    }
    this.prevV = V(0, 0);
    world.on('post-solve', (c, imp) => {
      const a = c.getFixtureA().getUserData() as Tag | null;
      const b = c.getFixtureB().getUserData() as Tag | null;
      const solid = (t: Tag | null) => t?.role === 'ground' || t?.role === 'block';
      const frame = (t: Tag | null) => t?.role === 'stick' || t?.role === 'rocket' || t?.role === 'spring' || t?.role === 'lamp';
      if ((solid(a) && frame(b)) || (solid(b) && frame(a))) this.frameHit = true;
      if (a?.role !== 'lamp' && b?.role !== 'lamp') return;
      let n = 0;
      for (const v of imp.normalImpulses) n += v;
      this.lampImpact = Math.max(this.lampImpact, n);
    });
  }

  // ---------------------------------------------------------------- queries

  lampPos(): { x: number; y: number; a: number } {
    const p = this.main.getWorldPoint(this.lampLocal);
    return { x: p.x, y: p.y, a: this.main.getAngle() };
  }

  worldOf(local: planck.Vec2): { x: number; y: number } {
    const p = this.main.getWorldPoint(local);
    return { x: p.x, y: p.y };
  }

  get speed(): number {
    return this.main.getLinearVelocity().length();
  }

  // ---------------------------------------------------------------- step

  step(input: RunInput): void {
    this.events.length = 0;
    this.tick++;
    const live = this.outcome === null;
    const lit = live && this.flame > 0;
    const inp = live ? input : NO_INPUT;
    const lvl = this.level;

    // clockwork
    this.firing.drive = inp.drive && this.wheels.some((w) => w.key);
    for (const w of this.wheels) {
      if (!w.key) continue;
      w.joint.enableMotor(inp.drive);
      w.joint.setMotorSpeed(inp.drive ? -KEY_SPEED : 0);
    }
    // rockets
    this.firing.rockets = inp.rockets && lit && this.rockets.length > 0;
    if (this.firing.rockets) {
      this.fireUsed = true;
      for (const r of this.rockets) {
        const d = this.main.getWorldVector(r.dir);
        this.main.applyForce(V(d.x * ROCKET_FORCE, d.y * ROCKET_FORCE), this.main.getWorldPoint(r.local), true);
      }
      this.drain(ROCKET_BURN * this.rockets.length * TICK, 'fire');
    }
    // lanterns
    this.firing.lanterns = inp.lanterns && lit && this.lanterns.length > 0;
    if (this.firing.lanterns) {
      this.fireUsed = true;
      this.drain(LANTERN_BURN * this.lanterns.length * TICK, 'fire');
    }
    for (const l of this.lanterns) {
      const b = l.body;
      const m = b.getMass();
      // paper: floats on its own weight, lifts when heated, drags through air
      const lift = m * GRAVITY * 1.15 + (this.firing.lanterns ? LANTERN_LIFT : 0);
      const v = b.getLinearVelocity();
      b.applyForceToCenter(V(-v.x * LANTERN_DRAG, lift - v.y * LANTERN_DRAG), true);
    }
    // springs
    for (const s of this.springs) if (s.cool > 0) s.cool--;
    if (inp.springs) {
      for (const s of this.springs) {
        if (s.cool > 0) continue;
        const from = this.main.getWorldPoint(s.local);
        const d = this.main.getWorldVector(s.dir);
        const to = V(from.x + d.x * SPRING_REACH, from.y + d.y * SPRING_REACH);
        let hit = false;
        this.world.rayCast(from, to, (f) => {
          const t = f.getUserData() as Tag | null;
          if (t?.role === 'ground' || t?.role === 'block') {
            hit = true;
            return 0;
          }
          return -1;
        });
        s.cool = hit ? SPRING_COOLDOWN : 12;
        if (hit) this.main.applyLinearImpulse(V(-d.x * SPRING_IMPULSE, -d.y * SPRING_IMPULSE), from, true);
        this.events.push({ type: 'spring', x: to.x, y: to.y, hit });
      }
    }
    // draughts
    if (lvl.wind)
      for (const w of lvl.wind) {
        for (const l of this.lanterns) {
          const p = l.body.getPosition();
          if (inZone(w, p.x, p.y)) l.body.applyForceToCenter(V(w.fx, w.fy), true);
        }
        const mp = this.main.getWorldCenter();
        if (inZone(w, mp.x, mp.y)) this.main.applyForceToCenter(V(w.fx * 0.1, w.fy * 0.1), true);
      }

    const v0 = this.main.getLinearVelocity();
    this.prevV = V(v0.x, v0.y);
    this.lampImpact = 0;
    this.frameHit = false;
    this.world.step(TICK);

    // ---- what happened to the lamp
    const v = this.main.getLinearVelocity();
    const dv = Math.hypot(v.x - this.prevV.x, v.y - (this.prevV.y - GRAVITY * TICK));
    const lampHitDv = this.lampImpact / Math.max(0.1, this.main.getMass());
    const lp = this.lampPos();
    if (this.knockCool > 0) this.knockCool--;
    if (live) {
      let loss = Math.max(0, dv - (this.frameHit ? KNOCK_FREE : WHEEL_KNOCK_FREE)) * KNOCK_LOSS;
      const lampLoss = Math.max(0, lampHitDv - LAMP_KNOCK_FREE) * KNOCK_LOSS * 1.6;
      const lampHit = lampLoss > loss;
      loss = Math.max(loss, lampLoss);
      if (loss > 0.002) {
        this.peakKnock = Math.max(this.peakKnock, loss);
        this.drain(loss, 'knocks');
        if (this.knockCool === 0 || loss > 0.08) {
          this.events.push({ type: 'knock', x: lp.x, y: lp.y, loss, lamp: lampHit });
          this.knockCool = 10;
        }
      }
      // oil spills when the lamp hangs upside down
      let a = this.main.getAngle() % (Math.PI * 2);
      if (a > Math.PI) a -= Math.PI * 2;
      if (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > TIP_ANGLE) this.drain(TIP_BURN * TICK, 'tipped');
      if (lvl.ink?.some((z) => inZone(z, lp.x, lp.y))) this.drain(1, 'ink');
    }

    // letter
    if (!this.letterGot && live) {
      const L = lvl.letter;
      const near = (x: number, y: number, r: number) => Math.hypot(x - L.x, y - L.y) < r;
      let got = near(lp.x, lp.y, 0.55);
      for (const w of this.wheels) if (near(w.body.getPosition().x, w.body.getPosition().y, 0.5)) got = true;
      for (const s of this.bp.sticks) {
        const a = this.worldOf(V(s.a[0] * GRID, s.a[1] * GRID));
        const b = this.worldOf(V(s.b[0] * GRID, s.b[1] * GRID));
        if (near((a.x + b.x) / 2, (a.y + b.y) / 2, 0.45) || near(a.x, a.y, 0.4) || near(b.x, b.y, 0.4)) got = true;
      }
      for (const l of this.lanterns) if (near(l.body.getPosition().x, l.body.getPosition().y, 0.5)) got = true;
      if (got) {
        this.letterGot = true;
        this.events.push({ type: 'letter', x: L.x, y: L.y });
      }
    }

    // outcome
    if (live) {
      if (this.flame <= 0) {
        this.outcome = 'out';
        this.outCause = this.lastDrain;
        this.events.push({ type: 'out', cause: this.lastDrain, x: lp.x, y: lp.y });
      } else if (inZone(lvl.window, lp.x, lp.y)) {
        this.outcome = 'delivered';
        this.events.push({ type: 'delivered' });
      } else if (lp.y < lvl.killY) {
        this.outcome = 'fell';
        this.events.push({ type: 'fell' });
      }
    }
    const moving = this.speed > 0.12 || Math.abs(this.main.getAngularVelocity()) > 0.2;
    this.still = moving ? 0 : this.still + 1;
  }

  private drain(amount: number, cause: OutCause): void {
    if (amount <= 0 || this.flame <= 0) return;
    this.flame = Math.max(0, this.flame - amount);
    this.lastDrain = cause;
  }

  /** Seconds since launch. */
  get time(): number {
    return this.tick * TICK;
  }
}
