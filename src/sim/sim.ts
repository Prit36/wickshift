// Cart physics. Planck world with the course as static chains and a two-wheel
// cart: a matchbox chassis, a lamp and a moth on top (both fragile), wheel joints
// with springs, rear-wheel drive and direct air control.
import * as planck from 'planck';
import { groundAt, type Course } from './terrain';

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
};

export interface DriveInput {
  gas: boolean;
  brake: boolean;
}

export type SimEvent =
  | { type: 'takeoff' }
  | { type: 'land'; impact: number; belly: boolean; x: number; y: number }
  | { type: 'crash'; reason: 'lamp' | 'moth' | 'fall'; x: number; y: number };

interface Tag {
  role: 'chassis' | 'lamp' | 'moth' | 'wheelR' | 'wheelF' | 'ground';
}

const CH_HW = 0.95;
const CH_HH = 0.17;
export const LAMP_OFF = { x: 0.12, y: 0.62 };
export const MOTH_OFF = { x: -0.5, y: 0.5 };
const AXLE_R = { x: -0.68, y: -0.28 };
const AXLE_F = { x: 0.7, y: -0.28 };

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
  airborne = false;
  crashed = false;
  private fragileHit: { reason: 'lamp' | 'moth'; x: number; y: number } | null = null;
  private prevVel = new planck.Vec2(0, 0);
  prevPose: CartPose | null = null;
  /** Live tilt input in the air, -1..1, for the lamp-on-rail animation. */
  lean = 0;
  throttle = 0;
  /** World-space wind pushing the cart (Supervisor rule). */
  wind = 0;
  gripMul = 1;

  constructor(readonly course: Course, spec: CartSpec) {
    this.spec = spec;
    this.world = new planck.World({ gravity: new planck.Vec2(0, -GRAVITY) });
    for (const isl of course.islands) {
      const bottom = course.killY - 4;
      const verts = [
        new planck.Vec2(isl[0].x, bottom),
        ...isl.map((p) => new planck.Vec2(p.x, p.y)),
        new planck.Vec2(isl[isl.length - 1].x, bottom),
      ];
      const body = this.world.createBody({ type: 'static' });
      body.createFixture({ shape: new planck.Chain(verts, false), friction: 1, userData: { role: 'ground' } satisfies Tag });
    }
    this.world.on('begin-contact', (c) => this.onBegin(c));
    this.spawn(course.startX, course.startY);
  }

  private onBegin(c: planck.Contact): void {
    const a = c.getFixtureA().getUserData() as Tag | null;
    const b = c.getFixtureB().getUserData() as Tag | null;
    if (!a || !b) return;
    const pair = a.role === 'ground' ? b : b.role === 'ground' ? a : null;
    if (!pair) return;
    if (pair.role === 'lamp' || pair.role === 'moth') {
      const p = pair.role === 'lamp' ? this.chassis.getWorldPoint(new planck.Vec2(LAMP_OFF.x, LAMP_OFF.y)) : this.chassis.getWorldPoint(new planck.Vec2(MOTH_OFF.x, MOTH_OFF.y));
      if (!this.fragileHit) this.fragileHit = { reason: pair.role, x: p.x, y: p.y };
    }
  }

  /** (Re)build the cart standing on the ground at x. */
  spawn(x: number, yHint: number, vx = 0): void {
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
    ch.createFixture({ shape: new planck.Box(CH_HW, CH_HH), density: 3.2, friction: 0.5, userData: { role: 'chassis' } satisfies Tag });
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

  private touching(b: planck.Body): boolean {
    for (let e = b.getContactList(); e; e = e.next) {
      const c = e.contact;
      if (!c.isTouching()) continue;
      const o = e.other?.getFixtureList()?.getUserData() as Tag | null;
      if (o && o.role === 'ground') return true;
    }
    return false;
  }
  private bellyTouching(): boolean {
    for (let e = this.chassis.getContactList(); e; e = e.next) {
      const c = e.contact;
      if (!c.isTouching()) continue;
      const fa = c.getFixtureA().getUserData() as Tag | null;
      const fb = c.getFixtureB().getUserData() as Tag | null;
      if ((fa?.role === 'chassis' && fb?.role === 'ground') || (fb?.role === 'chassis' && fa?.role === 'ground')) return true;
    }
    return false;
  }

  step(input: DriveInput, dt: number): void {
    this.events.length = 0;
    if (this.crashed) {
      this.world.step(dt);
      this.tick++;
      return;
    }
    this.prevPose = this.pose();
    const s = this.spec;
    const grounded = this.rearTouch || this.frontTouch || this.bellyTouch;
    // Drive
    if (input.gas && !input.brake) {
      this.jr.enableMotor(true);
      this.jr.setMaxMotorTorque(s.torque);
      this.jr.setMotorSpeed(-s.spin);
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
      this.chassis.applyTorque(tilt * 9, true);
    }
    if (this.wind !== 0) this.chassis.applyForceToCenter(new planck.Vec2(this.wind, 0), true);

    const v0 = this.chassis.getLinearVelocity();
    this.prevVel = new planck.Vec2(v0.x, v0.y);
    this.world.step(dt);
    this.tick++;

    this.rearTouch = this.touching(this.rear);
    this.frontTouch = this.touching(this.front);
    this.bellyTouch = this.bellyTouching();
    const nowGrounded = this.rearTouch || this.frontTouch || this.bellyTouch;
    if (nowGrounded) {
      if (this.airborne) {
        const p = this.chassis.getPosition();
        const x = p.x;
        const g1 = groundAt(this.course, x - 0.3) ?? p.y;
        const g2 = groundAt(this.course, x + 0.3) ?? p.y;
        const nx = -(g2 - g1);
        const ny = 0.6;
        const nl = Math.hypot(nx, ny);
        const impact = Math.max(0, -(this.prevVel.x * nx + this.prevVel.y * ny) / nl);
        const belly = this.bellyTouch && !(this.rearTouch && this.frontTouch);
        this.events.push({ type: 'land', impact, belly, x, y: Math.min(g1, g2) });
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

    if (this.fragileHit) {
      this.crashed = true;
      this.events.push({ type: 'crash', reason: this.fragileHit.reason, x: this.fragileHit.x, y: this.fragileHit.y });
      this.fragileHit = null;
    } else if (this.chassis.getPosition().y < this.course.killY) {
      this.crashed = true;
      const p = this.chassis.getPosition();
      this.events.push({ type: 'crash', reason: 'fall', x: p.x, y: p.y });
    }
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
