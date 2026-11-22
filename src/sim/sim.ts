// Cart physics. Planck world with the course as static chains and a two-wheel
// cart: a matchbox chassis, a lamp and a moth on top (both fragile), wheel joints
// with springs, rear-wheel drive and direct air control.
// Course features live here too: one-way pencil rails, knock-over sugar cubes,
// and (for one Inspector) a kinematic cat's paw.
import * as planck from 'planck';
import { groundAt, railAt, type Course, type Feature } from './terrain';

export const GRAVITY = 15;

export interface CartSpec {
  wheelR: number;
  frontR: number;
  wheelFriction: number;
  torque: number;
  /** Wheel motor speed (rad/s) at full throttle. */
  spin: number;
  /** Target spin rate in the air (rad/s). */
  airRot: number;
  airAccel: number;
  suspHz: number;
  suspDamp: number;
  restitution: number;
  /** Chassis density multiplier (Heavy Sack). */
  heavy: number;
}

export const BASE_CART: CartSpec = {
  wheelR: 0.42,
  frontR: 0.42,
  wheelFriction: 1.5,
  torque: 26,
  spin: 36,
  airRot: 8.5,
  airAccel: 0.22,
  suspHz: 4.2,
  suspDamp: 0.55,
  restitution: 0.05,
  heavy: 1,
};

export interface DriveInput {
  gas: boolean;
  brake: boolean;
}

export type SimEvent =
  | { type: 'takeoff' }
  | { type: 'land'; impact: number; belly: boolean; x: number; y: number; rail: boolean }
  | { type: 'crash'; reason: 'lamp' | 'moth' | 'fall'; x: number; y: number }
  | { type: 'smash'; x: number; y: number }
  /** The cat's paw hit the cart: knocked back, not broken. */
  | { type: 'swat'; x: number; y: number };

type Role = 'chassis' | 'lamp' | 'moth' | 'wheelR' | 'wheelF' | 'ground' | 'rail' | 'cube' | 'paw';
interface Tag {
  role: Role;
  id?: number;
}

const CH_HW = 0.95;
const CH_HH = 0.17;
export const LAMP_OFF = { x: 0.12, y: 0.62 };
export const MOTH_OFF = { x: -0.5, y: 0.5 };
const AXLE_R = { x: -0.68, y: -0.28 };
const AXLE_F = { x: 0.7, y: -0.28 };
export const CUBE = 0.5;

export interface Pose {
  x: number;
  y: number;
  a: number;
}

export interface CartPose {
  chassis: Pose;
  rear: Pose;
  front: Pose;
}

type Rail = Extract<Feature, { kind: 'rail' }>;

export class Sim {
  readonly world: planck.World;
  chassis!: planck.Body;
  rear!: planck.Body;
  front!: planck.Body;
  jr!: planck.WheelJoint;
  jf!: planck.WheelJoint;
  spec: CartSpec;
  tick = 0;
  events: SimEvent[] = [];
  /** Ticks since any support (wheel or belly) touched the ground. */
  airTicks = 0;
  rearTouch = false;
  frontTouch = false;
  bellyTouch = false;
  /** A wheel is on a pencil rail. */
  railTouch = false;
  airborne = false;
  crashed = false;
  private fragileHit: { reason: 'lamp' | 'moth'; x: number; y: number } | null = null;
  private pawHit: { x: number; y: number } | null = null;
  /** Ticks during which the paw passes through the cart (after a swat). */
  pawGrace = 0;
  private prevVel = new planck.Vec2(0, 0);
  prevPose: CartPose | null = null;
  /** Live tilt input in the air, -1..1, for the lamp-on-rail animation. */
  lean = 0;
  throttle = 0;
  /** World-space wind pushing the cart (Inspector rule). */
  wind = 0;
  gripMul = 1;
  /** Ticks of striker boost left. */
  boostT = 0;
  private rails: Rail[] = [];
  /** Per rail: is the cart riding on top of it, or passing underneath? */
  private railMode = new Map<number, 'top' | 'under'>();
  cubes: { body: planck.Body; hit: boolean; stack: number }[] = [];
  /** Cubes struck this step, thrown once the world step is done. */
  private struck: number[] = [];
  paw: planck.Body | null = null;

  constructor(readonly course: Course, spec: CartSpec) {
    this.spec = spec;
    this.world = new planck.World({ gravity: new planck.Vec2(0, -GRAVITY) });
    for (const isl of course.islands) {
      const bottom = course.killY - 4;
      const verts = [new planck.Vec2(isl[0].x, bottom), ...isl.map((p) => new planck.Vec2(p.x, p.y)), new planck.Vec2(isl[isl.length - 1].x, bottom)];
      const body = this.world.createBody({ type: 'static' });
      body.createFixture({ shape: new planck.Chain(verts, false), friction: 1, userData: { role: 'ground' } satisfies Tag });
    }
    for (const f of course.features) {
      if (f.kind === 'rail') {
        this.rails.push(f);
        const body = this.world.createBody({ type: 'static' });
        body.createFixture({ shape: new planck.Edge(new planck.Vec2(f.x0, f.y0), new planck.Vec2(f.x1, f.y1)), friction: 0.7, userData: { role: 'rail', id: f.id } satisfies Tag });
      } else if (f.kind === 'stack') {
        for (let c = 0; c < f.cols; c++)
          for (let r = 0; r < f.rows; r++) {
            const body = this.world.createBody({ type: 'dynamic', position: new planck.Vec2(f.x + c * CUBE * 1.02 + CUBE / 2, f.y + r * CUBE * 1.0 + CUBE / 2 + 0.005), allowSleep: true, awake: false });
            body.createFixture({ shape: new planck.Box(CUBE / 2, CUBE / 2), density: 0.22, friction: 0.6, userData: { role: 'cube', id: this.cubes.length } satisfies Tag });
            this.cubes.push({ body, hit: false, stack: f.id });
          }
      }
    }
    this.world.on('begin-contact', (c) => this.onBegin(c));
    this.world.on('pre-solve', (c) => this.onPreSolve(c));
    this.spawn(course.startX, course.startY);
  }

  private static tags(c: planck.Contact): [Tag | null, Tag | null] {
    return [c.getFixtureA().getUserData() as Tag | null, c.getFixtureB().getUserData() as Tag | null];
  }

  private isCart(t: Tag | null): boolean {
    return !!t && (t.role === 'chassis' || t.role === 'lamp' || t.role === 'moth' || t.role === 'wheelR' || t.role === 'wheelF');
  }

  private onPreSolve(c: planck.Contact): void {
    const [a, b] = Sim.tags(c);
    if (!a || !b) return;
    // struck sugar cubes pass through the cart: we throw them ourselves
    const cube = a.role === 'cube' ? a : b.role === 'cube' ? b : null;
    if (cube) {
      if (this.isCart(cube === a ? b : a) && this.cubes[cube.id!]?.hit) c.setEnabled(false);
      return;
    }
    const paw = a.role === 'paw' ? a : b.role === 'paw' ? b : null;
    if (paw) {
      if (this.pawGrace > 0 && this.isCart(paw === a ? b : a)) c.setEnabled(false);
      return;
    }
    const rail = a.role === 'rail' ? a : b.role === 'rail' ? b : null;
    if (!rail) return;
    const other = rail === a ? b : a;
    if (this.isCart(other) && this.railMode.get(rail.id!) !== 'top') c.setEnabled(false);
  }

  private onBegin(c: planck.Contact): void {
    const [a, b] = Sim.tags(c);
    if (!a || !b) return;
    // sugar cubes knocked by the cart
    const cube = a.role === 'cube' ? a : b.role === 'cube' ? b : null;
    if (cube) {
      const other = cube === a ? b : a;
      const cb = this.cubes[cube.id!];
      if (this.isCart(other) && cb && !cb.hit) {
        cb.hit = true;
        this.struck.push(cube.id!);
        const p = cb.body.getPosition();
        this.events.push({ type: 'smash', x: p.x, y: p.y });
      }
      return;
    }
    const pawTag = a.role === 'paw' ? a : b.role === 'paw' ? b : null;
    if (pawTag) {
      const other = pawTag === a ? b : a;
      if (this.isCart(other) && this.pawGrace <= 0 && !this.pawHit && other.role !== 'wheelR' && other.role !== 'wheelF') {
        const p = this.chassis.getPosition();
        this.pawHit = { x: p.x, y: p.y };
      }
      return;
    }
    const solid = (t: Tag) => t.role === 'ground' || (t.role === 'rail' && this.railMode.get(t.id!) === 'top');
    const surf = solid(a) ? a : solid(b) ? b : null;
    if (!surf) return;
    const pair = surf === a ? b : a;
    if (pair.role === 'lamp' || pair.role === 'moth') {
      const p = pair.role === 'lamp' ? this.chassis.getWorldPoint(new planck.Vec2(LAMP_OFF.x, LAMP_OFF.y)) : this.chassis.getWorldPoint(new planck.Vec2(MOTH_OFF.x, MOTH_OFF.y));
      if (!this.fragileHit) this.fragileHit = { reason: pair.role, x: p.x, y: p.y };
    }
  }

  /** (Re)build the cart standing on the ground at x. */
  spawn(x: number, yHint: number, vx = 0): void {
    this.pawHit = null;
    this.pawGrace = 0;
    for (const b of [this.chassis, this.rear, this.front]) if (b) this.world.destroyBody(b);
    const s = this.spec;
    const gy = groundAt(this.course, x) ?? yHint;
    const gyR = groundAt(this.course, x + AXLE_R.x) ?? gy;
    const gyF = groundAt(this.course, x + AXLE_F.x) ?? gy;
    const ang = Math.atan2(gyF - gyR, AXLE_F.x - AXLE_R.x);
    const lift = Math.max(s.wheelR, s.frontR) - AXLE_R.y + 0.05;
    const cx = x;
    const cy = (gyR + gyF) / 2 + lift;
    const ch = this.world.createBody({ type: 'dynamic', position: new planck.Vec2(cx, cy), angle: ang, angularDamping: 0.6 });
    ch.createFixture({ shape: new planck.Box(CH_HW, CH_HH), density: 3.2 * s.heavy, friction: 0.5, userData: { role: 'chassis' } satisfies Tag });
    ch.createFixture({ shape: new planck.Circle(new planck.Vec2(LAMP_OFF.x, LAMP_OFF.y), 0.27), density: 1.2, friction: 0.4, userData: { role: 'lamp' } satisfies Tag });
    ch.createFixture({ shape: new planck.Circle(new planck.Vec2(MOTH_OFF.x, MOTH_OFF.y), 0.25), density: 0.8, friction: 0.4, userData: { role: 'moth' } satisfies Tag });
    this.chassis = ch;
    const mkWheel = (off: { x: number; y: number }, r: number, role: 'wheelR' | 'wheelF'): [planck.Body, planck.WheelJoint] => {
      const p = ch.getWorldPoint(new planck.Vec2(off.x, off.y));
      const w = this.world.createBody({ type: 'dynamic', position: p, angularDamping: 0.15 });
      w.createFixture({ shape: new planck.Circle(r), density: 1.6, friction: s.wheelFriction * this.gripMul, restitution: s.restitution, userData: { role } satisfies Tag });
      const axis = ch.getWorldVector(new planck.Vec2(0, 1));
      const j = this.world.createJoint(
        new planck.WheelJoint({ frequencyHz: s.suspHz, dampingRatio: s.suspDamp, enableMotor: role === 'wheelR', maxMotorTorque: s.torque, motorSpeed: 0 }, ch, w, p, axis),
      ) as planck.WheelJoint;
      return [w, j];
    };
    [this.rear, this.jr] = mkWheel(AXLE_R, s.wheelR, 'wheelR');
    [this.front, this.jf] = mkWheel(AXLE_F, s.frontR, 'wheelF');
    if (vx) {
      for (const b of [this.chassis, this.rear, this.front]) b.setLinearVelocity(new planck.Vec2(vx * Math.cos(ang), vx * Math.sin(ang)));
      this.rear.setAngularVelocity(-vx / s.wheelR);
      this.front.setAngularVelocity(-vx / s.frontR);
    }
    this.airTicks = 0;
    this.airborne = false;
    this.crashed = false;
    this.fragileHit = null;
    this.boostT = 0;
    this.railMode.clear();
    this.prevVel = new planck.Vec2(0, 0);
    this.prevPose = null;
  }

  pose(): CartPose {
    const p = (b: planck.Body): Pose => ({ x: b.getPosition().x, y: b.getPosition().y, a: b.getAngle() });
    return { chassis: p(this.chassis), rear: p(this.rear), front: p(this.front) };
  }

  get speed(): number {
    return this.chassis.getLinearVelocity().x;
  }
  get pos(): planck.Vec2 {
    return this.chassis.getPosition();
  }
  get angle(): number {
    return this.chassis.getAngle();
  }
  lampWorld(): { x: number; y: number } {
    const p = this.chassis.getWorldPoint(new planck.Vec2(LAMP_OFF.x, LAMP_OFF.y));
    return { x: p.x, y: p.y };
  }
  suspension(): { rear: number; front: number } {
    return { rear: this.jr.getJointTranslation(), front: this.jf.getJointTranslation() };
  }
  get grounded(): boolean {
    return this.rearTouch || this.frontTouch || this.bellyTouch;
  }

  private touching(b: planck.Body): { any: boolean; rail: boolean } {
    let any = false;
    let rail = false;
    for (let e = b.getContactList(); e; e = e.next) {
      const c = e.contact;
      if (!c.isTouching() || !c.isEnabled()) continue;
      const fa = c.getFixtureA().getUserData() as Tag | null;
      const fb = c.getFixtureB().getUserData() as Tag | null;
      const o = fa && this.isCart(fa) ? fb : fa;
      if (!o) continue;
      if (o.role === 'ground' || o.role === 'paw') any = true;
      if (o.role === 'rail' && this.railMode.get(o.id!) === 'top') {
        any = true;
        rail = true;
      }
    }
    return { any, rail };
  }
  private bellyTouching(): boolean {
    for (let e = this.chassis.getContactList(); e; e = e.next) {
      const c = e.contact;
      if (!c.isTouching() || !c.isEnabled()) continue;
      const fa = c.getFixtureA().getUserData() as Tag | null;
      const fb = c.getFixtureB().getUserData() as Tag | null;
      const g = (t: Tag | null) => !!t && (t.role === 'ground' || t.role === 'paw' || (t.role === 'rail' && this.railMode.get(t.id!) === 'top'));
      if ((fa?.role === 'chassis' && g(fb)) || (fb?.role === 'chassis' && g(fa))) return true;
    }
    return false;
  }

  /** Decide, per rail, whether the cart is up on it or passing below. */
  private updateRails(): void {
    const p = this.chassis.getPosition();
    for (const r of this.rails) {
      const y = railAt(r, Math.max(r.x0, Math.min(r.x1, p.x)))!;
      if (p.x < r.x0 - 1.2 || p.x > r.x1 + 1.2) {
        this.railMode.delete(r.id);
        continue;
      }
      // lowest point of either wheel
      const low = Math.min(this.rear.getPosition().y - this.spec.wheelR, this.front.getPosition().y - this.spec.frontR);
      const mode = this.railMode.get(r.id);
      if (mode === 'top') continue;
      if (low > y - 0.08) this.railMode.set(r.id, 'top');
      else this.railMode.set(r.id, 'under');
    }
  }

  step(input: DriveInput, dt: number): void {
    this.events.length = 0;
    if (this.crashed) {
      this.world.step(dt);
      this.tick++;
      return;
    }
    this.prevPose = this.pose();
    this.updateRails();
    const s = this.spec;
    const grounded = this.grounded;
    const boost = this.boostT > 0;
    if (boost) this.boostT--;
    // Drive
    if (input.gas && !input.brake) {
      this.jr.enableMotor(true);
      this.jr.setMaxMotorTorque(s.torque * (boost ? 1.8 : 1));
      this.jr.setMotorSpeed(-s.spin * (boost ? 1.45 : 1));
      this.jf.enableMotor(false);
      this.throttle = Math.min(1, this.throttle + 0.1);
    } else if (input.brake) {
      const v = this.speed;
      this.jr.enableMotor(true);
      this.jf.enableMotor(true);
      if (v > 1.2) {
        this.jr.setMaxMotorTorque(s.torque * 0.8);
        this.jf.setMaxMotorTorque(s.torque * 0.8);
        this.jr.setMotorSpeed(0);
        this.jf.setMotorSpeed(0);
      } else {
        // creep backwards
        this.jr.setMaxMotorTorque(s.torque * 0.5);
        this.jr.setMotorSpeed(s.spin * 0.3);
        this.jf.enableMotor(false);
      }
      this.throttle = Math.max(-1, this.throttle - 0.1);
    } else {
      this.jr.enableMotor(false);
      this.jf.enableMotor(false);
      this.throttle *= 0.9;
    }
    // Air control: gas tips the nose up (backflip), brake tips it down.
    const tilt = (input.gas ? 1 : 0) - (input.brake ? 1 : 0);
    this.lean += (tilt - this.lean) * 0.25;
    if (!grounded && this.airTicks > 2) {
      const w = this.chassis.getAngularVelocity();
      if (tilt !== 0) {
        const target = tilt * s.airRot;
        this.chassis.setAngularVelocity(w + (target - w) * s.airAccel);
      }
    } else if (grounded && tilt !== 0) {
      // A little body English on the ground helps wheelies and holding the nose down.
      this.chassis.applyTorque(tilt * 9 * s.heavy, true);
    }
    if (this.wind !== 0) this.chassis.applyForceToCenter(new planck.Vec2(this.wind, 0), true);

    const v0 = this.chassis.getLinearVelocity();
    this.prevVel = new planck.Vec2(v0.x, v0.y);
    this.world.step(dt);
    this.tick++;

    // throw struck cubes up and ahead, and pay a little speed for each
    if (this.struck.length) {
      const v = this.chassis.getLinearVelocity();
      for (const id of this.struck) {
        const cb = this.cubes[id].body;
        const h = Math.sin(id * 12.9898 + 4.1) * 0.5 + 0.5;
        const h2 = Math.sin(id * 78.233 + 1.3) * 0.5 + 0.5;
        cb.setAwake(true);
        cb.setLinearVelocity(new planck.Vec2(v.x * (0.9 + h * 0.5) + 1, 4 + h2 * 5 + Math.max(0, v.y)));
        cb.setAngularVelocity((h - 0.5) * 18);
      }
      this.setAll(v.x * Math.pow(0.985, this.struck.length), v.y);
      this.struck.length = 0;
    }
    const tr = this.touching(this.rear);
    const tf = this.touching(this.front);
    this.rearTouch = tr.any;
    this.frontTouch = tf.any;
    this.railTouch = tr.rail || tf.rail;
    this.bellyTouch = this.bellyTouching();
    const nowGrounded = this.grounded;
    if (nowGrounded) {
      if (this.airborne) {
        const p = this.chassis.getPosition();
        const x = p.x;
        let g1 = groundAt(this.course, x - 0.3) ?? p.y;
        let g2 = groundAt(this.course, x + 0.3) ?? p.y;
        if (this.railTouch) {
          const r = this.rails.find((r) => x >= r.x0 - 1 && x <= r.x1 + 1);
          if (r) {
            g1 = railAt(r, Math.max(r.x0, Math.min(r.x1, x - 0.3)))!;
            g2 = railAt(r, Math.max(r.x0, Math.min(r.x1, x + 0.3)))!;
          }
        }
        const nx = -(g2 - g1);
        const ny = 0.6;
        const nl = Math.hypot(nx, ny);
        const impact = Math.max(0, -(this.prevVel.x * nx + this.prevVel.y * ny) / nl);
        const belly = this.bellyTouch && !(this.rearTouch && this.frontTouch);
        this.events.push({ type: 'land', impact, belly, x, y: Math.min(g1, g2), rail: this.railTouch });
      }
      this.airTicks = 0;
      this.airborne = false;
    } else {
      this.airTicks++;
      if (!this.airborne && this.airTicks >= 5) {
        this.airborne = true;
        this.events.push({ type: 'takeoff' });
      }
    }

    if (this.pawGrace > 0) this.pawGrace--;
    if (this.pawHit) {
      const h = this.pawHit;
      this.pawHit = null;
      this.pawGrace = 70;
      this.fragileHit = null;
      // bounced back and up, a little spin
      this.setAll(-5, 6);
      this.chassis.setAngularVelocity(1.2);
      this.events.push({ type: 'swat', x: h.x, y: h.y });
    } else if (this.fragileHit) {
      this.crashed = true;
      this.events.push({ type: 'crash', reason: this.fragileHit.reason, x: this.fragileHit.x, y: this.fragileHit.y });
      this.fragileHit = null;
    } else if (this.chassis.getPosition().y < this.course.killY) {
      this.crashed = true;
      const p = this.chassis.getPosition();
      this.events.push({ type: 'crash', reason: 'fall', x: p.x, y: p.y });
    }
  }

  private setAll(vx: number, vy: number): void {
    for (const b of [this.chassis, this.rear, this.front]) b.setLinearVelocity(new planck.Vec2(vx, vy));
  }

  /** Mousetrap: fling the cart on a fixed arc. */
  launch(vx: number, vy: number): void {
    this.setAll(vx, vy);
    this.chassis.setAngularVelocity(0);
    this.airborne = true;
    this.airTicks = 5;
    this.events.push({ type: 'takeoff' });
  }

  /** Striker strip: kick the cart up to at least `v` along its heading. */
  boost(v: number, ticks = 80): void {
    const a = this.angle;
    const cur = this.chassis.getLinearVelocity();
    const along = cur.x * Math.cos(a) + cur.y * Math.sin(a);
    if (along < v) this.setAll(v * Math.cos(a), v * Math.sin(a));
    this.rear.setAngularVelocity(-v / this.spec.wheelR);
    this.front.setAngularVelocity(-v / this.spec.frontR);
    this.boostT = ticks;
  }

  /** Thumbtack: a jolt up and a loss of speed. */
  hop(): void {
    const v = this.chassis.getLinearVelocity();
    this.setAll(v.x * 0.6, Math.max(v.y, 0) + 4.5);
    this.chassis.setAngularVelocity(this.chassis.getAngularVelocity() + 1.5);
  }

  /** The cat's paw: a kinematic block an Inspector moves around. */
  enablePaw(): planck.Body {
    if (this.paw) return this.paw;
    const b = this.world.createBody({ type: 'kinematic', position: new planck.Vec2(0, this.course.maxY + 40) });
    b.createFixture({ shape: new planck.Box(0.9, 0.55), friction: 0.8, userData: { role: 'paw' } satisfies Tag });
    b.createFixture({ shape: new planck.Box(0.6, 6, new planck.Vec2(0, 6.4), 0), friction: 0.8, userData: { role: 'paw' } satisfies Tag });
    this.paw = b;
    return b;
  }

  /** Roll gently to a stop (after the shift ends) without nose-diving. */
  settle(): void {
    for (const b of [this.chassis, this.rear, this.front]) b.setLinearDamping(2.2);
    this.jr.enableMotor(false);
    this.jf.enableMotor(false);
  }

  /** Blow the cart apart a little for the crash beat. */
  scatter(): void {
    for (const j of [this.jr, this.jf]) this.world.destroyJoint(j);
    this.rear.applyLinearImpulse(new planck.Vec2(-1.2, 2.5), this.rear.getPosition(), true);
    this.front.applyLinearImpulse(new planck.Vec2(1.5, 2.8), this.front.getPosition(), true);
  }
}
