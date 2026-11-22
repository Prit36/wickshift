// One launch of a build on a level. Headless and deterministic: the same build
// and the same inputs give the same result, so tests can replay solutions.
import * as planck from 'planck';
import { GRID, LAMP_H, LAMP_W, STICK_THICK, WHEEL_R, dirVec } from './parts';
import type { Blueprint, Placed } from './blueprint';
import { pinPos } from './blueprint';
import type { LevelDef, Prop, Zone } from './level';

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
const ERASER_KNOCK_FREE = 18; // ...when an eraser took most of it: rubber soaks up nearly anything
const UMBRELLA_DRAG = 7; // N per m/s of air hitting the canopy face-on
const UMBRELLA_EDGE = 0.6; // share of that drag for air sliding across the canopy (keeps it canopy-up)
const UMBRELLA_SAIL = 0.9; // share of a draught an open umbrella catches
const UMBRELLA_REACH = 0.34; // canopy centre, out from the pin
const BALLOON_LIFT = 9; // N, always on
const BALLOON_R = 0.27;
const HOOK_REACH = 8;
const HOOK_REEL = 1.6; // m/s the thread winds in while latched
const HOOK_MIN = 0.7;
const HOOK_STEADY = 2.5; // angular damping while hanging, so a swing reads as a swing, not a spin
const CANDLE_GAIN = 0.35;
const CANDLE_REACH = 0.8;
export const COIN_R = 0.14;
export const BALLOON_STRING = 1.1;

export interface RunInput {
  drive: boolean;
  rockets: boolean;
  lanterns: boolean;
  /** True on the tick the springs button was pressed. */
  springs: boolean;
  /** Held: umbrellas open. */
  umbrellas: boolean;
  /** True on the tick the hook button was pressed: shoot, or let go. */
  hooks: boolean;
}

export const NO_INPUT: RunInput = { drive: false, rockets: false, lanterns: false, springs: false, umbrellas: false, hooks: false };

export type OutCause = 'knocks' | 'fire' | 'tipped' | 'ink';

export type RunEvent =
  | { type: 'knock'; x: number; y: number; loss: number; lamp: boolean }
  | { type: 'spring'; x: number; y: number; hit: boolean }
  | { type: 'hook'; x: number; y: number; fx: number; fy: number; hit: boolean }
  | { type: 'unhook' }
  | { type: 'candle'; i: number; x: number; y: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'pop'; x: number; y: number; kind: 'balloon' | 'lantern' }
  | { type: 'letter'; x: number; y: number }
  | { type: 'delivered' }
  | { type: 'out'; cause: OutCause; x: number; y: number }
  | { type: 'fell' };

export type Outcome = 'delivered' | 'out' | 'fell' | null;

type Role = 'ground' | 'block' | 'prop' | 'stick' | 'lamp' | 'wheel' | 'rocket' | 'spring' | 'lantern' | 'balloon' | 'hook' | 'umbrella' | 'eraser' | 'coin';
type Tag = { role: Role };
/** Level surfaces a spring can kick off and a hook can catch. */
const isSolid = (t: Tag | null) => t?.role === 'ground' || t?.role === 'block' || t?.role === 'prop';
/** Parts of the build whose bumps shake the lamp. Wheels and erasers soak them up. */
const isFrame = (t: Tag | null) => !!t && ['stick', 'rocket', 'spring', 'lamp', 'hook', 'umbrella', 'coin'].includes(t.role);

interface WheelRig {
  part: Placed;
  body: planck.Body;
  joint: planck.RevoluteJoint;
  key: boolean;
}
/** Something floating on a thread: a sky lantern or a balloon. */
export interface FloatRig {
  part: Placed;
  body: planck.Body;
  local: planck.Vec2;
  joint: planck.Joint;
  popped: boolean;
}
interface PointRig {
  part: Placed;
  local: planck.Vec2;
  dir: planck.Vec2;
  cool: number;
}
export interface HookRig extends PointRig {
  joint: planck.RopeJoint | null;
  /** Where the thread is tied while latched. */
  at: { body: planck.Body; local: planck.Vec2 } | null;
}
export interface PropRig {
  def: Prop;
  body: planck.Body;
}

const V = (x: number, y: number) => new planck.Vec2(x, y);
const inZone = (z: Zone, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

export class Run {
  readonly world: planck.World;
  readonly main: planck.Body;
  readonly wheels: WheelRig[] = [];
  readonly lanterns: FloatRig[] = [];
  readonly balloons: FloatRig[] = [];
  readonly rockets: PointRig[] = [];
  readonly springs: PointRig[] = [];
  readonly hooks: HookRig[] = [];
  readonly umbrellas: PointRig[] = [];
  readonly props: PropRig[] = [];
  readonly ground: planck.Body;
  /** Which candles the lamp has drunk from. */
  candlesUsed: boolean[];
  readonly lampLocal: planck.Vec2;
  flame = 1;
  tick = 0;
  outcome: Outcome = null;
  outCause: OutCause | null = null;
  events: RunEvent[] = [];
  letterGot = false;
  fireUsed = false;
  /** What is working this tick (for drawing and sound). */
  firing = { rockets: false, lanterns: false, drive: false, umbrellas: false };
  /** Ticks the build has sat still. */
  still = 0;
  peakKnock = 0;
  private prevV: planck.Vec2;
  private lampImpact = 0;
  /** Contact impulse this tick on the frame, and on erasers. */
  private frameImp = 0;
  private eraserImp = 0;
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
    this.ground = ground;
    for (const line of level.ground) {
      const pts = [V(line[0][0], level.killY - 20), ...line.map(([x, y]) => V(x, y)), V(line[line.length - 1][0], level.killY - 20)];
      ground.createFixture({ shape: new planck.Chain(pts, false), friction: 0.9, userData: { role: 'ground' } satisfies Tag });
    }
    for (const poly of level.blocks) ground.createFixture({ shape: new planck.Chain(poly.map(([x, y]) => V(x, y)), true), friction: 0.8, userData: { role: 'block' } satisfies Tag });
    for (const def of level.props ?? []) {
      const body = world.createBody({ type: 'dynamic', position: V(def.x, def.y), angle: def.angle ?? 0, angularDamping: def.hinge ? 0 : def.kind === 'reel' ? 0.2 : 0.4, linearDamping: def.hinge ? 0 : 0.05 });
      const shape = def.kind === 'reel' ? new planck.Circle(def.w / 2) : new planck.Box(def.w / 2, def.h / 2);
      const density = def.density ?? (def.kind === 'book' ? 2.5 : def.kind === 'ruler' ? 1.2 : 1.5);
      body.createFixture({ shape, density, friction: def.kind === 'reel' ? 0.9 : 0.7, userData: { role: 'prop' } satisfies Tag });
      if (def.pivot) world.createJoint(new planck.RevoluteJoint({}, ground, body, V(def.x, def.y)));
      if (def.hinge) world.createJoint(new planck.RevoluteJoint({ collideConnected: true }, ground, body, V(def.hinge.x, def.hinge.y)));
      this.props.push({ def, body });
    }
    this.candlesUsed = (level.candles ?? []).map(() => false);
    this.flame = level.startFlame ?? 1;

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
      } else if (p.kind === 'hook') {
        fix(new planck.Box(0.09, 0.06, V(at.x, at.y), ang), 2, 'hook');
        this.hooks.push({ part: p, local: V(at.x, at.y), dir: V(d.x, d.y), cool: 0, joint: null, at: null });
      } else if (p.kind === 'umbrella') {
        const c = V(at.x + d.x * UMBRELLA_REACH, at.y + d.y * UMBRELLA_REACH);
        fix(new planck.Box(0.3, 0.035, c, ang + Math.PI / 2), 0.8, 'umbrella', 0.4);
        this.umbrellas.push({ part: p, local: c, dir: V(d.x, d.y), cool: 0 });
      } else if (p.kind === 'eraser') {
        main.createFixture({ shape: new planck.Box(0.17, 0.11, V(at.x, at.y), 0), density: 1.6, friction: 1, restitution: 0.25, filterGroupIndex: -1, userData: { role: 'eraser' } satisfies Tag });
      } else if (p.kind === 'coin') {
        fix(new planck.Circle(V(at.x, at.y), COIN_R), 0.8 / (Math.PI * COIN_R * COIN_R), 'coin', 0.5);
      } else if (p.kind === 'lantern') {
        const top = V(o.x + at.x, o.y + at.y + 1.0);
        const body = world.createBody({ type: 'dynamic', position: top, angularDamping: 2, fixedRotation: false });
        body.createFixture({ shape: new planck.Box(0.24, 0.3), density: 0.25, friction: 0.3, filterGroupIndex: -1, userData: { role: 'lantern' } satisfies Tag });
        const joint = world.createJoint(new planck.RopeJoint({ maxLength: 0.75, localAnchorA: V(at.x, at.y), localAnchorB: V(0, -0.3), bodyA: main, bodyB: body }))!;
        this.lanterns.push({ part: p, body, local: V(at.x, at.y), joint, popped: false });
      } else if (p.kind === 'balloon') {
        const top = V(o.x + at.x, o.y + at.y + BALLOON_STRING + BALLOON_R);
        const body = world.createBody({ type: 'dynamic', position: top, angularDamping: 3 });
        body.createFixture({ shape: new planck.Circle(BALLOON_R), density: 0.15, friction: 0.2, restitution: 0.4, filterGroupIndex: -1, userData: { role: 'balloon' } satisfies Tag });
        const joint = world.createJoint(new planck.RopeJoint({ maxLength: BALLOON_STRING, localAnchorA: V(at.x, at.y), localAnchorB: V(0, -BALLOON_R), bodyA: main, bodyB: body }))!;
        this.balloons.push({ part: p, body, local: V(at.x, at.y), joint, popped: false });
      }
    }
    this.prevV = V(0, 0);
    world.on('post-solve', (c, imp) => {
      const a = c.getFixtureA().getUserData() as Tag | null;
      const b = c.getFixtureB().getUserData() as Tag | null;
      let sum = 0;
      for (const v of imp.normalImpulses) sum += v;
      if ((isSolid(a) && isFrame(b)) || (isSolid(b) && isFrame(a))) this.frameImp += sum + 1e-6;
      if ((isSolid(a) && b?.role === 'eraser') || (isSolid(b) && a?.role === 'eraser')) this.eraserImp += sum + 1e-6;
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
    const liveLanterns = this.lanterns.filter((l) => !l.popped).length;
    this.firing.lanterns = inp.lanterns && lit && liveLanterns > 0;
    if (this.firing.lanterns) {
      this.fireUsed = true;
      this.drain(LANTERN_BURN * liveLanterns * TICK, 'fire');
    }
    for (const bl of this.balloons) {
      if (bl.popped) continue;
      const v = bl.body.getLinearVelocity();
      bl.body.applyForceToCenter(V(-v.x * LANTERN_DRAG, bl.body.getMass() * GRAVITY + BALLOON_LIFT - v.y * LANTERN_DRAG), true);
    }
    for (const l of this.lanterns) {
      if (l.popped) continue;
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
        const h = this.castSolid(from, to);
        const hit = !!h;
        s.cool = hit ? SPRING_COOLDOWN : 12;
        if (h) {
          this.main.applyLinearImpulse(V(-d.x * SPRING_IMPULSE, -d.y * SPRING_IMPULSE), from, true);
          if (h.body.isDynamic()) h.body.applyLinearImpulse(V(d.x * SPRING_IMPULSE, d.y * SPRING_IMPULSE), h.point, true);
        }
        this.events.push({ type: 'spring', x: to.x, y: to.y, hit });
      }
    }
    // hooks: one tap shoots every hook; the next lets go
    for (const h of this.hooks) if (h.cool > 0) h.cool--;
    if (inp.hooks && this.hooks.length) {
      if (this.hooks.some((h) => h.joint)) {
        for (const h of this.hooks) this.unhook(h);
        this.events.push({ type: 'unhook' });
      } else {
        for (const h of this.hooks) {
          if (h.cool > 0) continue;
          const from = this.main.getWorldPoint(h.local);
          const d = this.main.getWorldVector(h.dir);
          const to = V(from.x + d.x * HOOK_REACH, from.y + d.y * HOOK_REACH);
          const c = this.castSolid(from, to);
          if (c) {
            const len = Math.hypot(c.point.x - from.x, c.point.y - from.y);
            const local = c.body.getLocalPoint(c.point);
            h.joint = this.world.createJoint(new planck.RopeJoint({ maxLength: Math.max(0.3, len), localAnchorA: h.local, localAnchorB: local, bodyA: this.main, bodyB: c.body, collideConnected: true })) as planck.RopeJoint;
            h.at = { body: c.body, local };
          } else h.cool = 12;
          const end = c ? c.point : to;
          this.events.push({ type: 'hook', x: end.x, y: end.y, fx: from.x, fy: from.y, hit: !!c });
        }
      }
    }
    // umbrellas: brake against the air along the way they face, and catch draughts
    this.firing.umbrellas = inp.umbrellas && this.umbrellas.length > 0;
    if (this.firing.umbrellas)
      for (const u of this.umbrellas) {
        const p = this.main.getWorldPoint(u.local);
        const n = this.main.getWorldVector(u.dir);
        const v = this.main.getLinearVelocityFromWorldPoint(p);
        const vn = v.x * n.x + v.y * n.y;
        const tx = v.x - n.x * vn;
        const ty = v.y - n.y * vn;
        this.main.applyForce(V(-(n.x * vn + tx * UMBRELLA_EDGE) * UMBRELLA_DRAG, -(n.y * vn + ty * UMBRELLA_EDGE) * UMBRELLA_DRAG), p, true);
        // a canopy facing the draught catches all of it; edge-on, a third
        for (const w of lvl.wind ?? [])
          if (inZone(w, p.x, p.y)) {
            const wl = Math.hypot(w.fx, w.fy) || 1;
            const k = UMBRELLA_SAIL * (0.3 + 0.7 * Math.abs((n.x * w.fx + n.y * w.fy) / wl));
            this.main.applyForce(V(w.fx * k, w.fy * k), p, true);
          }
      }
    // draughts
    if (lvl.wind)
      for (const w of lvl.wind) {
        for (const l of [...this.lanterns, ...this.balloons]) {
          if (l.popped) continue;
          const p = l.body.getPosition();
          if (inZone(w, p.x, p.y)) l.body.applyForceToCenter(V(w.fx, w.fy), true);
        }
        const mp = this.main.getWorldCenter();
        if (inZone(w, mp.x, mp.y)) this.main.applyForceToCenter(V(w.fx * 0.1, w.fy * 0.1), true);
      }

    const v0 = this.main.getLinearVelocity();
    this.prevV = V(v0.x, v0.y);
    this.lampImpact = 0;
    this.frameImp = 0;
    this.eraserImp = 0;
    for (const h of this.hooks) if (h.joint) h.joint.setMaxLength(Math.max(HOOK_MIN, h.joint.getMaxLength() - HOOK_REEL * TICK));
    const hanging = this.hooks.some((h) => h.joint);
    this.main.setAngularDamping(hanging ? HOOK_STEADY : 0.15);
    this.world.step(TICK);

    // ---- what happened to the lamp
    const v = this.main.getLinearVelocity();
    const dv = Math.hypot(v.x - this.prevV.x, v.y - (this.prevV.y - GRAVITY * TICK));
    const lampHitDv = this.lampImpact / Math.max(0.1, this.main.getMass());
    const lp = this.lampPos();
    if (this.knockCool > 0) this.knockCool--;
    if (live) {
      // whichever took most of the hit decides: rubber, frame, or (nothing on the frame) the wheels
      const rubber = this.eraserImp > 0 && this.eraserImp >= this.frameImp;
      const free = rubber ? ERASER_KNOCK_FREE : this.frameImp > 0 ? KNOCK_FREE : WHEEL_KNOCK_FREE;
      let loss = Math.max(0, dv - free) * KNOCK_LOSS;
      if (rubber && dv > 2.5) this.events.push({ type: 'bounce', x: lp.x, y: lp.y });
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

    // thumbtacks and candle flames pop balloons and tear lanterns
    for (const f of [...this.balloons, ...this.lanterns]) {
      if (f.popped) continue;
      const p = f.body.getPosition();
      const r = f.part.kind === 'balloon' ? BALLOON_R : 0.3;
      const near = (z: Zone) => p.x + r > z.x && p.x - r < z.x + z.w && p.y + r > z.y && p.y - r < z.y + z.h;
      const burnt = (lvl.candles ?? []).some((c, i) => !this.candlesUsed[i] && Math.hypot(p.x - c.x, p.y - (c.y + 0.5)) < r + 0.12);
      if ((lvl.tacks ?? []).some(near) || burnt) {
        f.popped = true;
        this.world.destroyJoint(f.joint);
        this.world.destroyBody(f.body);
        this.events.push({ type: 'pop', x: p.x, y: p.y, kind: f.part.kind === 'balloon' ? 'balloon' : 'lantern' });
      }
    }
    // candles: pass the lamp by one to drink its flame
    if (live)
      (lvl.candles ?? []).forEach((c, i) => {
        if (this.candlesUsed[i] || Math.hypot(lp.x - c.x, lp.y - (c.y + 0.55)) > CANDLE_REACH) return;
        this.candlesUsed[i] = true;
        this.flame = Math.min(1, this.flame + CANDLE_GAIN);
        this.events.push({ type: 'candle', i, x: c.x, y: c.y + 0.55 });
      });

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
      for (const l of [...this.lanterns, ...this.balloons]) if (!l.popped && near(l.body.getPosition().x, l.body.getPosition().y, 0.5)) got = true;
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

  /** Closest level surface (ground, block or prop) on the segment from -> to. */
  private castSolid(from: planck.Vec2, to: planck.Vec2): { body: planck.Body; point: planck.Vec2 } | null {
    let best: { body: planck.Body; point: planck.Vec2 } | null = null;
    this.world.rayCast(from, to, (f, point, _n, fraction) => {
      if (!isSolid(f.getUserData() as Tag | null)) return -1;
      best = { body: f.getBody(), point: V(point.x, point.y) };
      return fraction;
    });
    return best;
  }

  private unhook(h: HookRig): void {
    if (h.joint) this.world.destroyJoint(h.joint);
    h.joint = null;
    h.at = null;
    h.cool = 6;
  }

  /** World position of a latched hook's anchor. */
  hookAnchor(h: HookRig): { x: number; y: number } | null {
    if (!h.at) return null;
    const p = h.at.body.getWorldPoint(h.at.local);
    return { x: p.x, y: p.y };
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
