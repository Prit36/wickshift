// The run simulation. No DOM, no wall clock, no Math.random: everything is a
// function of the blueprint, the route and tick-numbered input.
import * as planck from 'planck';
import { CHASSIS, LAMP, PARTS, type Pt } from '../data/parts';
import type { RouteDef } from '../data/routeTypes';
import { TICK } from '../core/clock';
import { apply, invApply, type Xf } from '../core/geom';
import type { Blueprint } from '../workshop/blueprint';
import { CART_TUNING, assembleCart, type CartRig, type FixtureTag } from './cart';
import { benchPose } from './seat';

export const GRAVITY = -10;

export const SIM_TUNING = {
  windTicks: 60 * 16, // ticks of drive in a full spring
  knockDv: 1.6, // windowed Δv at the lamp that rings a strike (m/s)
  crackDv: 3.0, // windowed Δv that cracks the glass
  rearmDv: 1.0, // a supported lamp reads ~0.83 (g over the window); quiet means no knock-level load
  rearmTicks: 10,
  window: 5,
  restSpeed: 0.05,
  restTicks: 80,
  maxTicks: 60 * 120,
};

export interface RunInput {
  drive: boolean;
  /** -1 toward the back, +1 toward the nose, 0 hold. */
  lamp: -1 | 0 | 1;
}

export type SimEvent =
  | { type: 'knock'; x: number; y: number; power: number; part: string; kind: string }
  | { type: 'crack'; x: number; y: number; power: number; part: string }
  | { type: 'snuff'; x: number; y: number; power: number; part: string }
  | { type: 'deliver'; x: number; y: number }
  | { type: 'fall'; x: number; y: number }
  | { type: 'roller'; part: string; x: number; y: number }
  | { type: 'endstop'; side: -1 | 1 }
  | { type: 'windOut' }
  | { type: 'rest' }
  | { type: 'liftStart' }
  | { type: 'liftEnd' };

export type Outcome = 'running' | 'delivered' | 'failed';

export interface ContactNote {
  part: string;
  kind: string;
  terrain: string;
  x: number;
  y: number;
  impulse: number;
  nx: number;
  ny: number;
}

export interface PartPose {
  x: number;
  y: number;
  a: number;
}

function tagOf(f: planck.Fixture): FixtureTag | null {
  const u = f.getUserData() as FixtureTag | { terrain: string } | { sensor: string } | null;
  return u && 'part' in u ? u : null;
}
function terrainOf(f: planck.Fixture): string | null {
  const u = f.getUserData() as { terrain?: string } | null;
  return u && typeof u.terrain === 'string' ? u.terrain : null;
}

export class Sim {
  readonly world: planck.World;
  readonly rig: CartRig;
  readonly route: RouteDef;
  tick = 0;
  wind = 1;
  cracks = 0;
  lit = true;
  outcome: Outcome = 'running';
  failReason = '';
  /** Part that touched the ink roller's upper half, if any. */
  rollerPart: string | null = null;
  rollerAt: [number, number] | null = null;
  /** The blow that cracked or snuffed the lamp; `head` when it came along the rail (a wall), not from below. */
  decisive: { x: number; y: number; part: string; head?: boolean; terrain?: string } | null = null;
  seesaw: planck.Body | null = null;
  roller: planck.Body | null = null;
  flap: planck.Body | null = null;
  /** Runner contact speed this tick (for the paper hiss). */
  scrape = 0;
  /** Front support is lifted while the rear bears weight (debounced). */
  frontLifted = false;
  everLifted = false;
  atRest = false;
  readonly arch: planck.Fixture;

  private prevLampV: planck.Vec2;
  /** Rail position the brake holds while no lamp input is given. */
  private lampHold: number | null = null;
  private dvWindow: { x: number; y: number }[] = [];
  private tickContacts: ContactNote[] = [];
  private recentContacts: { tick: number; note: ContactNote }[] = [];
  private touchingPrev = new Set<string>();
  private liftCount = 0;
  private settleCount = 0;
  private restCount = 0;
  private lastLampDir = 0;
  private bellyTicks = 0;
  private spinTicks = 0;
  private windOutAnnounced = false;
  /** Supports (wheels and runners) sorted by chassis-frame x. */
  private supports: { id: string; x: number }[] = [];
  private comX = 0;

  constructor(route: RouteDef, bp: Blueprint, pose?: Xf, lampX = route.lampStart) {
    this.route = route;
    this.world = new planck.World({ gravity: new planck.Vec2(0, GRAVITY) });
    this.buildTerrain();
    const seat = pose ?? benchPose(bp, route);
    this.rig = assembleCart(this.world, bp, seat, lampX);
    const archBody = this.world.createBody({ type: 'static' });
    const a = route.arch;
    this.arch = archBody.createFixture({
      shape: new planck.Box(a.w / 2, a.h / 2, new planck.Vec2(a.x, a.y), 0),
      isSensor: true,
      userData: { sensor: 'arch' },
    });
    this.prevLampV = this.seatVelocity();

    for (const lp of this.rig.laid.values()) {
      const k = lp.p.kind;
      if (k === 'keyWheel' || k === 'reel' || k === 'runner') this.supports.push({ id: lp.p.id, x: lp.xf.x });
    }
    let m = 0;
    let mx = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic() || b === this.seesaw || b === this.roller || b === this.flap) continue;
      const c = invApply(seat, [b.getWorldCenter().x, b.getWorldCenter().y]);
      m += b.getMass();
      mx += b.getMass() * c[0];
    }
    this.comX = mx / m;

    this.world.on('post-solve', (contact, impulse) => this.onPostSolve(contact, impulse));
  }

  private buildTerrain(): void {
    const ground = this.world.createBody({ type: 'static' });
    for (const piece of this.route.pieces) {
      const verts = piece.pts.map((p) => new planck.Vec2(p[0], p[1]));
      ground.createFixture({
        shape: new planck.Chain(verts, true),
        friction: piece.friction ?? 0.8,
        userData: { terrain: piece.name },
      });
    }
    const ss = this.route.seesaw;
    if (ss) {
      const c = apply({ x: ss.pivot[0], y: ss.pivot[1], a: ss.angle0 }, [ss.offset, ss.thickness / 2]);
      const body = this.world.createBody({ type: 'dynamic', position: new planck.Vec2(c[0], c[1]), angle: ss.angle0, angularDamping: ss.damping ?? 0 });
      body.createFixture({
        shape: new planck.Box(ss.length / 2, ss.thickness / 2),
        density: ss.density,
        friction: 0.7,
        userData: { terrain: ss.name },
      });
      this.world.createJoint(
        new planck.RevoluteJoint(
          { enableLimit: true, lowerAngle: ss.lowerAngle - ss.angle0, upperAngle: ss.upperAngle - ss.angle0 },
          ground,
          body,
          new planck.Vec2(ss.pivot[0], ss.pivot[1]),
        ),
      );
      this.seesaw = body;
    }
    const r = this.route.roller;
    if (r) {
      // A free-spinning ink roller on a fixed axle: whatever crosses it turns it.
      const body = this.world.createBody({ type: 'dynamic', position: new planck.Vec2(r.x, r.y), angularDamping: 0.4 });
      body.createFixture({ shape: new planck.Circle(r.r), density: 2, friction: 0.9, userData: { terrain: 'ink roller', roller: true } });
      this.world.createJoint(new planck.RevoluteJoint({}, ground, body, new planck.Vec2(r.x, r.y)));
      this.roller = body;
    }
    const fl = this.route.flap;
    if (fl) {
      const body = this.world.createBody({ type: 'dynamic', position: new planck.Vec2(fl.hinge[0], fl.hinge[1]), angularDamping: 0.6 });
      for (const quad of flapQuads(fl)) {
        body.createFixture({ shape: new planck.Polygon(quad.map((q) => new planck.Vec2(q[0], q[1]))), density: fl.density, friction: 0.7, userData: { terrain: fl.name } });
      }
      this.world.createJoint(new planck.RevoluteJoint({ enableLimit: true, lowerAngle: 0, upperAngle: fl.maxLift }, ground, body, new planck.Vec2(fl.hinge[0], fl.hinge[1])));
      this.flap = body;
    }
  }

  private onPostSolve(contact: planck.Contact, impulse: planck.ContactImpulse): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    let cart = tagOf(fa);
    let other = fb;
    if (!cart) {
      cart = tagOf(fb);
      other = fa;
    }
    if (!cart) return;
    const terrain = terrainOf(other);
    if (!terrain) return;
    const wm = contact.getWorldManifold(null);
    const n = contact.getManifold().pointCount;
    let imp = 0;
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      const j = impulse.normalImpulses[i] ?? 0;
      imp += j;
      const p = wm?.points[i];
      if (p) {
        px += p.x / n;
        py += p.y / n;
      }
    }
    const nx = wm?.normal.x ?? 0;
    const ny = wm?.normal.y ?? 1;
    // Copy plain values only; act on them after the step.
    this.tickContacts.push({ part: cart.part, kind: cart.kind, terrain, x: px, y: py, impulse: imp, nx, ny });
  }

  chassisPose(): Xf {
    const p = this.rig.chassis.getPosition();
    return { x: p.x, y: p.y, a: this.rig.chassis.getAngle() };
  }

  lampRailX(): number {
    const lp = this.rig.lamp.getPosition();
    return invApply(this.chassisPose(), [lp.x, lp.y])[0];
  }

  step(input: RunInput): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.outcome !== 'running') return ev;
    const rig = this.rig;

    // Lamp slide: motor at speed 0 is the brake.
    // Buffered stops: the slide eases off over the last few centimetres of rail,
    // so running the lamp to either end is a firm clunk, never a blow to the glass.
    const dir = input.lamp;
    const tr0 = rig.lampJoint.getJointTranslation();
    const left = dir > 0 ? rig.lampJoint.getUpperLimit() - tr0 : tr0 - rig.lampJoint.getLowerLimit();
    if (dir !== 0) {
      this.lampHold = null;
      rig.lampJoint.setMotorSpeed(dir * Math.min(LAMP.slideSpeed, LAMP.stopSpeed + LAMP.buffer * Math.max(0, left)));
    } else {
      // Brake: a speed-0 motor alone drifts a few mm per second on a slope, so it
      // also steers back to where the lamp was released (same 60 N limit).
      this.lampHold ??= tr0;
      const back = (this.lampHold - tr0) * 10;
      rig.lampJoint.setMotorSpeed(Math.max(-0.3, Math.min(0.3, back)));
    }
    // Drive: torque at the key wheel hub while wind remains.
    const driving = input.drive && this.wind > 0;
    for (const w of rig.wheels) {
      if (!w.driven) continue;
      // One-way drive: the clockwork pushes forward but never brakes a faster wheel.
      const overspeed = w.joint.getJointSpeed() < -CART_TUNING.driveSpeed;
      w.joint.enableMotor(driving && !overspeed);
      w.joint.setMotorSpeed(-CART_TUNING.driveSpeed);
      w.joint.setMaxMotorTorque(CART_TUNING.driveTorque);
    }
    // Leaf fork springs: explicit spring + damper along each carrier axis.
    for (const f of rig.forks) {
      const t = f.joint.getJointTranslation();
      const v = f.joint.getJointSpeed();
      const F = CART_TUNING.forkPreload + CART_TUNING.forkK * t + (v > 0 ? CART_TUNING.forkC : CART_TUNING.forkRebound) * v;
      if (F > 0) {
        const axis = f.joint.getLocalAxisA();
        const wa = rig.chassis.getWorldVector(axis);
        const force = new planck.Vec2(-wa.x * F, -wa.y * F);
        f.carrier.applyForce(force, f.carrier.getWorldCenter(), true);
        const anchor = rig.chassis.getWorldPoint(new planck.Vec2(f.mount[0], f.mount[1]));
        rig.chassis.applyForce(new planck.Vec2(-force.x, -force.y), anchor, true);
      }
    }

    // Rolling resistance: a small torque against each wheel's spin, never reversing it.
    for (const w of rig.wheels) {
      const rel = w.joint.getJointSpeed();
      const inertia = w.body.getInertia();
      const tau = Math.min(CART_TUNING.rollTorque * w.radius, (inertia * Math.abs(rel)) / TICK);
      if (tau > 0 && rel !== 0) w.body.applyTorque(-Math.sign(rel) * tau, true);
    }

    this.tickContacts.length = 0;
    this.world.step(TICK, 10, 4);
    this.tick++;

    let engaged = false;
    for (const w of rig.wheels) if (w.driven && w.joint.isMotorEnabled()) engaged = true;
    if (engaged) {
      this.wind = Math.max(0, this.wind - 1 / (this.route.windTicks ?? SIM_TUNING.windTicks));
      if (this.wind === 0 && !this.windOutAnnounced) {
        this.windOutAnnounced = true;
        ev.push({ type: 'windOut' });
      }
    }

    // Lamp end stops.
    const tr = rig.lampJoint.getJointTranslation();
    const atLo = tr <= rig.lampJoint.getLowerLimit() + 0.01;
    const atHi = tr >= rig.lampJoint.getUpperLimit() - 0.01;
    if (dir !== 0 && dir !== this.lastLampDir) this.lastLampDir = 0;
    if (dir < 0 && atLo && this.lastLampDir !== -1) {
      ev.push({ type: 'endstop', side: -1 });
      this.lastLampDir = -1;
    }
    if (dir > 0 && atHi && this.lastLampDir !== 1) {
      ev.push({ type: 'endstop', side: 1 });
      this.lastLampDir = 1;
    }
    if (dir === 0) this.lastLampDir = 0;

    this.processContacts(ev);
    this.processLamp(ev);
    this.processState(ev, input);
    return ev;
  }

  private strongestRecent(): ContactNote | null {
    let best: ContactNote | null = null;
    for (const { tick, note } of this.recentContacts) {
      if (this.tick - tick > 8) continue;
      if (!best || note.impulse > best.impulse) best = note;
    }
    return best;
  }

  private processContacts(ev: SimEvent[]): void {
    const touching = new Set<string>();
    const byPart = new Map<string, ContactNote>();
    let scrape = 0;
    for (const c of this.tickContacts) {
      touching.add(c.part);
      const prev = byPart.get(c.part);
      if (!prev || c.impulse > prev.impulse) byPart.set(c.part, c);
      // Blue post: a touch on the roller's upper half. A nose or frame brushing
      // its flank or underside on the way down the dip does not ink.
      if (c.terrain === 'ink roller' && !this.rollerPart && c.kind !== 'lamp' && this.route.roller && c.y > this.route.roller.y + this.route.roller.r * 0.5) {
        this.rollerPart = c.part;
        this.rollerAt = [c.x, c.y];
        ev.push({ type: 'roller', part: c.part, x: c.x, y: c.y });
      }
    }
    for (const note of byPart.values()) {
      this.recentContacts.push({ tick: this.tick, note });
      // Fresh landing on a part that was airborne last tick: one knock per landing.
      if (!this.touchingPrev.has(note.part) && note.impulse > 0.35 && note.kind !== 'lamp') {
        ev.push({ type: 'knock', x: note.x, y: note.y, power: note.impulse, part: note.part, kind: note.kind });
      }
    }
    this.recentContacts = this.recentContacts.filter((r) => this.tick - r.tick <= 12);
    // Runner hiss scaled by contact speed.
    for (const lp of this.rig.laid.values()) {
      if (lp.p.kind !== 'runner' || !touching.has(lp.p.id)) continue;
      const body = this.rig.bodyOf.get(lp.p.id)!;
      scrape = Math.max(scrape, body.getLinearVelocity().length());
    }
    this.scrape = scrape;
    this.touchingPrev = touching;

    // Belly grounding and front lift for observations and the moth's pose.
    if (touching.has('chassis')) this.bellyTicks++;
    else this.bellyTicks = 0;
    const front = this.supports.filter((s) => s.x > this.comX + 0.05);
    const rear = this.supports.filter((s) => s.x <= this.comX + 0.05);
    const frontDown = front.some((s) => touching.has(s.id));
    const rearDown = rear.some((s) => touching.has(s.id));
    const lifted = front.length > 0 && !frontDown && rearDown && this.rig.chassis.getAngle() > 0.05;
    // Debounce brief contact chatter both ways.
    if (lifted) {
      this.liftCount++;
      this.settleCount = 0;
    } else {
      this.settleCount++;
      this.liftCount = 0;
    }
    if (!this.frontLifted && this.liftCount >= 6) {
      this.frontLifted = true;
      this.everLifted = true;
      ev.push({ type: 'liftStart' });
    } else if (this.frontLifted && this.settleCount >= 8) {
      this.frontLifted = false;
      ev.push({ type: 'liftEnd' });
    }
    // Key wheel spinning with nothing under it.
    const key = this.rig.wheels.find((w) => w.driven);
    if (key && !touching.has(key.id) && Math.abs(key.body.getAngularVelocity()) > 4) this.spinTicks++;
    else this.spinTicks = Math.max(0, this.spinTicks - 1);
  }

  private processLamp(ev: SimEvent[]): void {
    const lamp = this.rig.lamp;
    // The glass feels the frame under it: the rail's own slide (and its reversal)
    // is the moth's doing, not a blow, so it is measured at the seat, not the lamp.
    const v = this.seatVelocity();
    // Velocity change not explained by gravity: the load transmitted to the lamp.
    const dvx = v.x - this.prevLampV.x;
    const dvy = v.y - this.prevLampV.y - GRAVITY * TICK;
    this.prevLampV = v.clone();
    this.dvWindow.push({ x: dvx, y: dvy });
    if (this.dvWindow.length > SIM_TUNING.window) this.dvWindow.shift();
    let sx = 0;
    let sy = 0;
    for (const d of this.dvWindow) {
      sx += d.x;
      sy += d.y;
    }
    const s = Math.hypot(sx, sy);
    // One landing is one impact group: it opens on the first knock and stays open
    // until the lamp has been quiet for a spell, so a rear slap that follows the
    // front touchdown, or a runner scraping along, is judged with it, once.
    let g = this.impact;
    if (!g && s > SIM_TUNING.knockDv) {
      const where = this.strongestRecent();
      const lp = lamp.getPosition();
      g = this.impact = { s, x: where?.x ?? lp.x, y: where?.y ?? lp.y, part: where?.part ?? 'lamp', terrain: where?.terrain, head: this.headOn(sx, sy), age: 0, quiet: 0, judged: false };
    } else if (g) {
      g.age++;
      if (s > g.s) {
        const where = this.strongestRecent();
        g.s = s;
        g.head = this.headOn(sx, sy);
        if (where) {
          g.x = where.x;
          g.y = where.y;
          g.part = where.part;
          g.terrain = where.terrain;
        }
      }
    }
    if (!g) return;
    // Crack the moment the group's load crosses the line; otherwise ring a knock
    // once the opening window has passed.
    if (!g.judged && (g.s >= SIM_TUNING.crackDv || g.age >= SIM_TUNING.window)) {
      g.judged = true;
      this.resolveImpact(g, ev);
    } else if (g.judged && g.s >= SIM_TUNING.crackDv && !g.cracked) {
      // A knock that grew into a hard hit within the same landing.
      this.resolveImpact(g, ev);
    }
    if (g.s >= SIM_TUNING.crackDv) g.cracked = true;
    if (s < SIM_TUNING.rearmDv) g.quiet++;
    else g.quiet = 0;
    if (g.quiet >= SIM_TUNING.rearmTicks && g.age >= SIM_TUNING.window) this.impact = null;
  }

  /**
   * What the glass feels: across the rail, the frame point it sits on; along the
   * rail, the whole cart's centre of mass. The rail motor pushes lamp and frame
   * apart along the rail, which is internal to the cart and no blow at all.
   */
  private seatVelocity(): planck.Vec2 {
    const seat = this.rig.chassis.getLinearVelocityFromWorldPoint(this.rig.lamp.getPosition());
    let m = 0;
    let vx = 0;
    let vy = 0;
    for (const b of this.cartBodies()) {
      const bm = b.getMass();
      const v = b.getLinearVelocity();
      m += bm;
      vx += bm * v.x;
      vy += bm * v.y;
    }
    const a = this.rig.chassis.getAngle();
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    const along = (vx / m) * ax + (vy / m) * ay;
    const across = -seat.x * ay + seat.y * ax;
    return new planck.Vec2(along * ax - across * ay, along * ay + across * ax);
  }

  private cartBodyList: planck.Body[] | null = null;
  private cartBodies(): planck.Body[] {
    if (!this.cartBodyList) {
      this.cartBodyList = [];
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (b.isDynamic() && b !== this.seesaw && b !== this.roller && b !== this.flap) this.cartBodyList.push(b);
      }
    }
    return this.cartBodyList;
  }

  private impact: { s: number; x: number; y: number; part: string; terrain?: string; head: boolean; age: number; quiet: number; judged: boolean; cracked?: boolean } | null = null;

  /** A blow mostly along the frame (a wall, a stack) rather than across it (a landing). */
  private headOn(sx: number, sy: number): boolean {
    const a = this.rig.chassis.getAngle();
    const along = Math.abs(sx * Math.cos(a) + sy * Math.sin(a));
    const across = Math.abs(-sx * Math.sin(a) + sy * Math.cos(a));
    return along > across * 1.5;
  }

  private resolveImpact(pk: { s: number; x: number; y: number; part: string; head?: boolean; terrain?: string }, ev: SimEvent[]): void {
    if (pk.s >= SIM_TUNING.crackDv && this.lit) {
      this.decisive = { x: pk.x, y: pk.y, part: pk.part, head: pk.head, terrain: pk.terrain };
      if (this.cracks === 0) {
        this.cracks = 1;
        ev.push({ type: 'crack', x: pk.x, y: pk.y, power: pk.s, part: pk.part });
      } else {
        this.cracks = 2;
        this.lit = false;
        ev.push({ type: 'snuff', x: pk.x, y: pk.y, power: pk.s, part: pk.part });
      }
    } else {
      ev.push({ type: 'knock', x: pk.x, y: pk.y, power: pk.s, part: pk.part, kind: 'lamp' });
    }
  }

  private processState(ev: SimEvent[], input: RunInput): void {
    const lamp = this.rig.lamp;
    const lp = lamp.getPosition();
    const g = this.impact;
    if (g && !g.judged && this.lampTouchesArch()) {
      // Resolve the lamp condition for this tick before granting a delivery.
      g.judged = true;
      if (g.s >= SIM_TUNING.crackDv) g.cracked = true;
      this.resolveImpact(g, ev);
    }
    if (!this.lit) {
      this.outcome = 'failed';
      this.failReason = this.describeSnuff();
      return;
    }
    if (this.lampTouchesArch()) {
      this.outcome = 'delivered';
      ev.push({ type: 'deliver', x: lp.x, y: lp.y });
      return;
    }
    if (lp.y < this.route.killY) {
      this.outcome = 'failed';
      this.lit = false;
      this.decisive = { x: lp.x, y: this.route.killY + 0.3, part: 'lamp' };
      this.failReason = 'Lamp fell into the drawer';
      ev.push({ type: 'fall', x: lp.x, y: lp.y });
      return;
    }
    const v = this.rig.chassis.getLinearVelocity().length();
    const w = Math.abs(this.rig.chassis.getAngularVelocity());
    const stillDriving = input.drive && this.wind > 0;
    if (v < SIM_TUNING.restSpeed && w < 0.08 && (!stillDriving || this.spinTicks > 30 || this.restCount > 0)) this.restCount++;
    else {
      this.restCount = 0;
      if (this.atRest && v > SIM_TUNING.restSpeed * 3) this.atRest = false;
    }
    if (!this.atRest && this.restCount >= SIM_TUNING.restTicks) {
      this.atRest = true;
      ev.push({ type: 'rest' });
    }
    if (this.tick >= SIM_TUNING.maxTicks) {
      this.outcome = 'failed';
      this.failReason = 'Shift clock ran out';
    }
  }

  private lampTouchesArch(): boolean {
    for (let ce = this.rig.lamp.getContactList(); ce; ce = ce.next ?? null) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      if (c.getFixtureA() === this.arch || c.getFixtureB() === this.arch) return true;
    }
    return false;
  }

  partLabel(part: string, withSide = true): string {
    if (part === 'lamp') return 'lamp';
    if (part === 'chassis') return 'frame';
    const lp = this.rig.laid.get(part);
    if (!lp) return 'cart';
    const name = PARTS[lp.p.kind].label.toLowerCase();
    if (!withSide) return name;
    const sameKind = [...this.rig.laid.values()].filter((o) => o.p.kind === lp.p.kind);
    if (sameKind.length < 2 && lp.p.kind !== 'runner') return name;
    return `${lp.xf.x >= this.comX ? 'front' : 'rear'} ${name}`;
  }

  private describeSnuff(): string {
    const d = this.decisive;
    if (!d) return 'The flame went out';
    if (d.part === 'lamp') return 'Lamp struck the paper and went out';
    if (d.part === 'chassis') return 'Frame slammed down and the flame went out';
    const name = this.partLabel(d.part);
    const Name = `${name[0]!.toUpperCase()}${name.slice(1)}`;
    if (d.head && d.terrain) return `${Name} ran into the ${d.terrain}`;
    return `${Name} took a hard landing`;
  }

  /** Measured observation for a cart that came to rest short of the window. */
  /** Distance still to go, in cart lengths (the frame is the ruler the player knows). */
  shortBy(): string {
    const d = Math.max(0, this.route.arch.x - this.rig.chassis.getPosition().x) / (CHASSIS.halfLength * 2);
    const r = Math.max(0.5, Math.round(d * 2) / 2);
    return `${r % 1 ? r.toFixed(1) : r} cart length${r === 1 ? '' : 's'}`;
  }

  describeRest(): string {
    const pct = Math.round(this.wind * 100);
    const a = this.rig.chassis.getAngle();
    if (this.wind <= 0) {
      if (this.frontLifted || a > 0.35) return `Nose reared up ${Math.round((a * 180) / Math.PI)}° and the spring ran down`;
      return `Spring ran down ${this.shortBy()} from the window`;
    }
    if (Math.abs(a) > 1.9) return 'Cart rolled onto its back';
    if (a > 0.9) return `Tipped back ${Math.round((a * 180) / Math.PI)}° on the climb`;
    if (this.bellyTicks > 30) return `Belly grounded on the crest, ${pct}% wind left`;
    if (this.spinTicks > 20) return 'Key wheel spun with nothing under it';
    // A support pressing into a steep face: a caught lip.
    let caught: ContactNote | null = null;
    for (const { note } of this.recentContacts) {
      if (Math.abs(note.nx) > 0.6 && (!caught || note.impulse > caught.impulse)) caught = note;
    }
    if (caught) {
      const name = this.partLabel(caught.part);
      return `${name[0]!.toUpperCase()}${name.slice(1)} caught the ${caught.terrain}`;
    }
    return `Rolled to a stop ${this.shortBy()} short, ${pct}% wind unspent`;
  }

  /** World pose of a placement's drawing frame. */
  partPose(id: string): PartPose | null {
    const body = this.rig.bodyOf.get(id);
    const lx = this.rig.localXf.get(id);
    if (!body || !lx) return null;
    const p = body.getPosition();
    const a = body.getAngle();
    const [x, y] = apply({ x: p.x, y: p.y, a }, [lx.x, lx.y]);
    return { x, y, a: a + lx.a };
  }

  bodyCount(): number {
    let n = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) n++;
    return n;
  }

  dispose(): void {
    // Release every run-owned body and joint so nothing outlives the attempt.
    for (let j = this.world.getJointList(); j; ) {
      const next = j.getNext();
      this.world.destroyJoint(j);
      j = next;
    }
    for (let b = this.world.getBodyList(); b; ) {
      const next = b.getNext();
      this.world.destroyBody(b);
      b = next;
    }
  }
}

export { CHASSIS };

/** Convex quads along a flap's centreline, each `thickness` deep (top face on the line's upper side). */
export function flapQuads(fl: { line: readonly Pt[]; thickness: number }): Pt[][] {
  const out: Pt[][] = [];
  const t = fl.thickness / 2;
  for (let i = 0; i + 1 < fl.line.length; i++) {
    const a = fl.line[i]!;
    const b = fl.line[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    // Overlap neighbours slightly so the joints between quads have no seam.
    const ex = ((b[0] - a[0]) / len) * 0.02;
    const ey = ((b[1] - a[1]) / len) * 0.02;
    out.push([
      [a[0] - nx * t - ex, a[1] - ny * t - ey],
      [b[0] - nx * t + ex, b[1] - ny * t + ey],
      [b[0] + nx * t + ex, b[1] + ny * t + ey],
      [a[0] + nx * t - ex, a[1] + ny * t - ey],
    ]);
  }
  return out;
}
