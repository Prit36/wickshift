// Builds the physical cart from a blueprint. Used by the run simulation and
// by the bench (to read real masses for the centre-of-mass plumb marks).
import * as planck from 'planck';
import { CHASSIS, CHASSIS_SOLID, FORK_CARRIER, FORK_TRAVEL, LAMP, PARTS, type PartKind, type Solid } from '../data/parts';
import { apply, transformSolid, type Xf } from '../core/geom';
import { CHASSIS_ID, layout, type Blueprint, type LaidPart } from '../workshop/blueprint';

export const CART_GROUP = -1;

export interface FixtureTag {
  readonly part: string; // placement id, 'chassis' or 'lamp'
  readonly kind: PartKind | 'chassis' | 'lamp' | 'carrier';
}

export interface WheelRig {
  readonly id: string;
  readonly kind: 'keyWheel' | 'reel';
  readonly body: planck.Body;
  readonly joint: planck.RevoluteJoint;
  readonly radius: number;
  readonly driven: boolean;
}

export interface ForkRig {
  readonly id: string;
  readonly carrier: planck.Body;
  readonly joint: planck.PrismaticJoint;
  /** Fork mount in the chassis frame. */
  readonly mount: readonly [number, number];
}

export interface CartRig {
  readonly chassis: planck.Body;
  readonly lamp: planck.Body;
  readonly lampJoint: planck.PrismaticJoint;
  readonly wheels: WheelRig[];
  readonly forks: ForkRig[];
  /** Which body carries each placement's drawing. */
  readonly bodyOf: Map<string, planck.Body>;
  /** Part transform relative to the body that carries it. */
  readonly localXf: Map<string, Xf>;
  readonly laid: Map<string, LaidPart>;
}

export const CART_TUNING = {
  driveSpeed: 6.5, // rad/s top speed at the key wheel (one-way)
  driveTorque: 4.6, // N·m at the hub
  drag: 0.12, // linear damping on cart bodies (air + paper drag)
  rolling: 0.1, // angular damping on wheels
  rollTorque: 0.42, // N (times wheel radius) of rolling resistance per wheel
  // Leaf fork: a soft, nearly flat-rate leaf. The preload holds the shoe fully
  // extended under any static load, so the bench pose stays exact; a landing has
  // to beat it before the leaf gives, then the travel spreads the stop out.
  forkK: 40, // N/m
  forkC: 1.5, // N·s/m while compressing (kept small: a stiff damper is a jolt)
  forkRebound: 8, // N·s/m while extending (stops the shoe pogoing)
  forkPreload: 28, // N
  carrierDensity: 6,
  lampStartX: 0,
};

/**
 * Collision shapes for a part. The runner's flat skid and curled toe become a
 * row of overlapping discs with the same underside: a flat polygon sliding
 * across the joint between two terrain pieces can snag on the next piece's
 * end vertex, a rounded skid glides over it. Layout, fitting and art keep the
 * authored outline.
 */
const RUNNER_CONTACT: readonly Solid[] = (() => {
  const out: Solid[] = [{ type: 'poly', pts: [[-0.035, 0.03], [0.035, 0.03], [0.035, -0.2], [-0.035, -0.2]] }];
  for (let x = -0.41; x <= 0.27 + 1e-9; x += 0.085) out.push({ type: 'circle', x, y: -0.25, r: 0.05 });
  out.push({ type: 'circle', x: 0.35, y: -0.248, r: 0.048 }, { type: 'circle', x: 0.41, y: -0.215, r: 0.042 });
  return out;
})();

function contactSolids(kind: PartKind, solids: readonly Solid[]): readonly Solid[] {
  return kind === 'runner' ? RUNNER_CONTACT : solids;
}

function addSolid(body: planck.Body, s: Solid, opts: planck.FixtureOpt): planck.Fixture {
  const shape =
    s.type === 'circle'
      ? new planck.Circle(new planck.Vec2(s.x, s.y), s.r)
      : new planck.Polygon(s.pts.map((p) => new planck.Vec2(p[0], p[1])));
  return body.createFixture({ shape, ...opts });
}

function fixtureOpts(kind: PartKind, part: string): planck.FixtureOpt {
  const d = PARTS[kind];
  return {
    density: d.density,
    friction: d.friction,
    restitution: d.restitution,
    filterGroupIndex: CART_GROUP,
    userData: { part, kind } satisfies FixtureTag,
  };
}

/**
 * Assemble the cart with the chassis at `pose` (world frame) and the lamp at
 * rail position `lampX` (chassis frame).
 */
export function assembleCart(world: planck.World, bp: Blueprint, pose: Xf, lampX = CART_TUNING.lampStartX): CartRig {
  const laid = layout(bp);
  const toWorld = (p: readonly [number, number]) => apply(pose, p);
  const chassis = world.createBody({
    type: 'dynamic',
    position: new planck.Vec2(pose.x, pose.y),
    angle: pose.a,
    linearDamping: CART_TUNING.drag,
    angularDamping: 0.05,
  });
  addSolid(chassis, CHASSIS_SOLID, {
    density: CHASSIS.density,
    friction: CHASSIS.friction,
    restitution: 0.02,
    filterGroupIndex: CART_GROUP,
    userData: { part: CHASSIS_ID, kind: 'chassis' } satisfies FixtureTag,
  });

  const bodyOf = new Map<string, planck.Body>();
  const localXf = new Map<string, Xf>();
  const wheels: WheelRig[] = [];
  const forks: ForkRig[] = [];
  const carriers = new Map<string, { body: planck.Body; origin: readonly [number, number] }>();

  // Parents first so carriers exist before their children.
  const ordered = [...laid.values()].sort((a, b) => a.depth - b.depth);
  for (const lp of ordered) {
    const { p } = lp;
    const def = PARTS[p.kind];
    const carrier = carriers.get(p.parent);
    if (p.kind === 'keyWheel' || p.kind === 'reel') {
      const hub = toWorld([lp.xf.x, lp.xf.y]);
      const body = world.createBody({
        type: 'dynamic',
        position: new planck.Vec2(hub[0], hub[1]),
        angle: pose.a,
        angularDamping: CART_TUNING.rolling,
        linearDamping: CART_TUNING.drag,
      });
      addSolid(body, { type: 'circle', x: 0, y: 0, r: def.radius! }, fixtureOpts(p.kind, p.id));
      const parentBody = carrier ? carrier.body : chassis;
      const joint = world.createJoint(
        new planck.RevoluteJoint(
          { enableMotor: false, maxMotorTorque: CART_TUNING.driveTorque, motorSpeed: 0 },
          parentBody,
          body,
          new planck.Vec2(hub[0], hub[1]),
        ),
      )!;
      wheels.push({ id: p.id, kind: p.kind, body, joint, radius: def.radius!, driven: p.kind === 'keyWheel' });
      bodyOf.set(p.id, body);
      localXf.set(p.id, { x: 0, y: 0, a: 0 });
    } else if (p.kind === 'fork') {
      // Tines are rigid on the chassis; the carrier slides on a sprung prismatic joint.
      for (const s of lp.solids) addSolid(chassis, s, fixtureOpts('fork', p.id));
      bodyOf.set(p.id, chassis);
      localXf.set(p.id, lp.xf);
      const c = apply(lp.xf, FORK_CARRIER);
      const cw = toWorld(c);
      const body = world.createBody({ type: 'dynamic', position: new planck.Vec2(cw[0], cw[1]), angle: pose.a });
      addSolid(
        body,
        {
          type: 'poly',
          pts: [
            [-0.07, -0.05],
            [0.07, -0.05],
            [0.07, 0.07],
            [-0.07, 0.07],
          ],
        },
        {
          density: CART_TUNING.carrierDensity,
          friction: 0.4,
          filterGroupIndex: CART_GROUP,
          userData: { part: p.id, kind: 'carrier' } satisfies FixtureTag,
        },
      );
      const axisChassis = apply({ x: 0, y: 0, a: lp.xf.a }, [0, 1]);
      const axisWorld = apply({ x: 0, y: 0, a: pose.a }, axisChassis);
      const joint = world.createJoint(
        new planck.PrismaticJoint(
          { enableLimit: true, lowerTranslation: 0, upperTranslation: FORK_TRAVEL, enableMotor: false },
          chassis,
          body,
          new planck.Vec2(cw[0], cw[1]),
          new planck.Vec2(axisWorld[0], axisWorld[1]),
        ),
      )!;
      forks.push({ id: p.id, carrier: body, joint, mount: [lp.xf.x, lp.xf.y] });
      carriers.set(p.id, { body, origin: c });
    } else {
      // Spar or runner: rigid fixtures on whatever carries the socket.
      if (carrier) {
        const rel: Xf = { x: lp.xf.x - carrier.origin[0], y: lp.xf.y - carrier.origin[1], a: lp.xf.a };
        for (const s of contactSolids(p.kind, def.solids)) addSolid(carrier.body, transformSolid(rel, s), fixtureOpts(p.kind, p.id));
        bodyOf.set(p.id, carrier.body);
        localXf.set(p.id, rel);
      } else {
        for (const s of contactSolids(p.kind, def.solids)) addSolid(chassis, transformSolid(lp.xf, s), fixtureOpts(p.kind, p.id));
        bodyOf.set(p.id, chassis);
        localXf.set(p.id, lp.xf);
      }
    }
  }

  const lampLocal: [number, number] = [lampX, CHASSIS.railY];
  const lw = toWorld(lampLocal);
  const lamp = world.createBody({
    type: 'dynamic',
    position: new planck.Vec2(lw[0], lw[1]),
    angle: pose.a,
    linearDamping: CART_TUNING.drag,
  });
  for (const s of LAMP.solids) {
    addSolid(lamp, s, {
      density: LAMP.density,
      friction: LAMP.friction,
      restitution: 0.02,
      filterGroupIndex: CART_GROUP,
      userData: { part: 'lamp', kind: 'lamp' } satisfies FixtureTag,
    });
  }
  const railAxis = apply({ x: 0, y: 0, a: pose.a }, [1, 0]);
  const lampJoint = world.createJoint(
    new planck.PrismaticJoint(
      {
        enableLimit: true,
        lowerTranslation: CHASSIS.railMin - lampX,
        upperTranslation: CHASSIS.railMax - lampX,
        enableMotor: true,
        maxMotorForce: LAMP.maxForce,
        motorSpeed: 0,
      },
      chassis,
      lamp,
      new planck.Vec2(lw[0], lw[1]),
      new planck.Vec2(railAxis[0], railAxis[1]),
    ),
  )!;

  return { chassis, lamp, lampJoint, wheels, forks, bodyOf, localXf, laid };
}

export interface MassInfo {
  readonly mass: number;
  /** Centre of mass in the chassis frame. */
  readonly cx: number;
  readonly cy: number;
}

/** Real masses from a throwaway world, so the plumb mark matches the simulation. */
export function massInfo(bp: Blueprint, lampX = CART_TUNING.lampStartX): MassInfo {
  const world = new planck.World({ gravity: new planck.Vec2(0, 0) });
  const rig = assembleCart(world, bp, { x: 0, y: 0, a: 0 }, lampX);
  let m = 0;
  let mx = 0;
  let my = 0;
  for (let b = world.getBodyList(); b; b = b.getNext()) {
    const bm = b.getMass();
    const c = b.getWorldCenter();
    m += bm;
    mx += bm * c.x;
    my += bm * c.y;
  }
  void rig;
  return { mass: m, cx: mx / m, cy: my / m };
}
