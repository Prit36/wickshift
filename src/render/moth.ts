// The courier: a moth in a folded triangular coat and a postman's cap worn
// over its bent antenna. Drawn as a posed paper puppet.
import { C } from './palette';
import { FX, printed } from './paint';

export type MothPose = 'brace' | 'stand' | 'ride' | 'reach' | 'hatCatch' | 'tip' | 'clerk';

export interface MothLook {
  /** px per metre */
  k: number;
  pose: MothPose;
  /** 0..1 blend toward the pose (eased by the caller). */
  t?: number;
  /** cosmetic time, seconds */
  time: number;
  /** silhouette only (clerks in lit windows) */
  silhouette?: boolean;
  facing?: 1 | -1;
}

interface Rig {
  lean: number; // body tilt, radians (+ leans forward/right)
  armA: number; // front arm angle from shoulder (screen radians, 0 = right)
  armB: number;
  armLen: number;
  hat: number; // hat lift (px fraction)
  crouch: number; // 0..1 lowers the body
  seated: boolean;
}

const POSES: Record<MothPose, Rig> = {
  stand: { lean: 0.05, armA: 1.9, armB: 1.3, armLen: 0.3, hat: 0, crouch: 0, seated: false },
  brace: { lean: 0.42, armA: 0.25, armB: 0.6, armLen: 0.34, hat: 0, crouch: 0.15, seated: false },
  ride: { lean: 0.12, armA: 0.6, armB: 1.1, armLen: 0.3, hat: 0, crouch: 0, seated: true },
  reach: { lean: 0.55, armA: -0.45, armB: 0.15, armLen: 0.4, hat: 0, crouch: 0, seated: true },
  hatCatch: { lean: -0.2, armA: -1.9, armB: 1.4, armLen: 0.34, hat: 0.6, crouch: 0.1, seated: true },
  tip: { lean: 0.0, armA: -1.6, armB: 1.2, armLen: 0.34, hat: 0.35, crouch: 0, seated: true },
  clerk: { lean: 0.15, armA: 0.4, armB: 0.9, armLen: 0.3, hat: 0, crouch: 0, seated: false },
};

function mix(a: Rig, b: Rig, t: number): Rig {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    lean: m(a.lean, b.lean),
    armA: m(a.armA, b.armA),
    armB: m(a.armB, b.armB),
    armLen: m(a.armLen, b.armLen),
    hat: m(a.hat, b.hat),
    crouch: m(a.crouch, b.crouch),
    seated: t < 0.5 ? a.seated : b.seated,
  };
}

let prevPose: MothPose = 'stand';
export function rigFor(from: MothPose, to: MothPose, t: number): Rig {
  prevPose = from;
  return mix(POSES[from], POSES[to], t);
}

/**
 * Draw the moth with its feet (or seat) at the origin. Screen space, y down.
 */
export function drawMoth(ctx: CanvasRenderingContext2D, look: MothLook, from: MothPose = prevPose): void {
  const k = look.k;
  const u = (k / 100) * 1.22; // art authored at 100 px per metre
  const rig = look.t === undefined ? POSES[look.pose] : mix(POSES[from], POSES[look.pose], look.t);
  const sil = look.silhouette === true;
  const ink = sil ? C.inkDeep : C.ink;
  const breathe = FX.reducedMotion || sil ? 0 : Math.sin(look.time * 2.1) * 0.6;
  ctx.save();
  if (look.facing === -1) ctx.scale(-1, 1);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Legs (thin ink) unless seated.
  const hipY = rig.seated ? -6 : -34 + rig.crouch * 8;
  const leg = sil ? ink : C.paperDeep;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  const legPass = (col: string, lw: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
  };
  legPass(ink, 5);
  if (!rig.seated) {
    ctx.beginPath();
    ctx.moveTo(-5, hipY);
    ctx.lineTo(-9 - rig.lean * 8, -12);
    ctx.lineTo(-12 - rig.lean * 10, 0);
    ctx.moveTo(5, hipY);
    ctx.lineTo(8 - rig.lean * 2, -14);
    ctx.lineTo(4 - rig.lean * 6, 0);
    ctx.stroke();
    legPass(leg, 2.4);
    ctx.stroke();
    legPass(ink, 3.4);
    // feet
    ctx.beginPath();
    ctx.moveTo(-15 - rig.lean * 10, 0);
    ctx.lineTo(-8 - rig.lean * 10, 0);
    ctx.moveTo(1 - rig.lean * 6, 0);
    ctx.lineTo(8 - rig.lean * 6, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-2, hipY);
    ctx.lineTo(12, hipY + 4);
    ctx.lineTo(14, hipY + 16);
    ctx.moveTo(4, hipY);
    ctx.lineTo(18, hipY + 2);
    ctx.lineTo(22, hipY + 13);
    ctx.stroke();
    legPass(leg, 2.4);
    ctx.stroke();
  }

  ctx.translate(0, hipY);
  ctx.rotate(rig.lean);

  // The far wing shows behind the coat: a darker, broader fold.
  const far = new Path2D();
  far.moveTo(0, -56 + breathe);
  far.quadraticCurveTo(-22, -34, -38, 2);
  far.quadraticCurveTo(-34, 10, -26, 8);
  far.lineTo(-8, 4);
  far.closePath();
  printed(ctx, far, sil ? C.inkDeep : C.petrolDeep, { lw: 2, ink, mx: 1.2, my: 0.8 });
  // Near wing folded into a long tri-cornered coat.
  const coat = new Path2D();
  coat.moveTo(4, -60 + breathe);
  coat.quadraticCurveTo(-14, -30, -30, 10);
  coat.quadraticCurveTo(-6, 17, 20, 9);
  coat.quadraticCurveTo(19, -28, 4, -60 + breathe);
  coat.closePath();
  printed(ctx, coat, sil ? C.inkDeep : C.petrol, { lw: 2.4, ink, mx: 1.6, my: 1.1 });
  if (!sil) {
    // Wing band in teal following the fold, then a scalloped hem.
    ctx.save();
    ctx.clip(coat);
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.moveTo(-30, -6);
    ctx.quadraticCurveTo(-6, -22, 24, -18);
    ctx.lineTo(24, -11);
    ctx.quadraticCurveTo(-6, -15, -30, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.petrolDeep;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-26 + i * 9, 12, 5.5, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
    // Fold line.
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1, -54);
    ctx.quadraticCurveTo(-8, -24, -14, 8);
    ctx.stroke();
    // Eye-spot on the wing: paper ring, vermilion iris, ink pupil.
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(-11, -30, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.vermilion;
    ctx.beginPath();
    ctx.arc(-11, -30, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(-11, -30, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Brass buttons down the front edge.
    ctx.fillStyle = C.brass;
    for (const y of [-38, -24, -10]) {
      ctx.beginPath();
      ctx.arc(11 + (y + 58) * 0.08, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fur collar.
    const collar = new Path2D();
    for (let i = 0; i <= 16; i++) {
      const a2 = Math.PI * (i / 16);
      const r = i % 2 ? 9 : 12;
      const x = 3 + Math.cos(a2) * r * 1.25;
      const y = -56 + Math.sin(a2) * r * 0.45;
      i ? collar.lineTo(x, y) : collar.moveTo(x, y);
    }
    collar.closePath();
    printed(ctx, collar, C.paperShade, { lw: 1.4, ink, mx: 0.6, my: 0.4 });
  }

  // Arms: front arm (towards viewer) after the head so it overlaps.
  const shoulder = { x: 6, y: -44 };
  const armSeg = (ang: number, len: number, lw: number, col: string) => {
    const L = len * 100;
    const ex = shoulder.x + Math.cos(ang) * L * 0.55;
    const ey = shoulder.y + Math.sin(ang) * L * 0.55;
    const hx = ex + Math.cos(ang + 0.35) * L * 0.5;
    const hy = ey + Math.sin(ang + 0.35) * L * 0.5;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw + 3;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
    // furry cuff and a small paper hand
    ctx.fillStyle = sil ? C.inkDeep : C.paperShade;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };
  armSeg(rig.armB, rig.armLen * 0.9, 3.4, sil ? ink : C.petrolDeep);

  // Head: fuzzy round head with big dark eyes.
  const hy = -66 + breathe;
  const head = new Path2D();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 12.5 + (i % 2 ? 1.2 : 0);
    const x = 2 + Math.cos(a) * r;
    const y = hy + Math.sin(a) * r * 0.92;
    i ? head.lineTo(x, y) : head.moveTo(x, y);
  }
  head.closePath();
  printed(ctx, head, sil ? C.inkDeep : C.paper, { lw: 2, ink, mx: 1, my: 0.8 });
  if (!sil) {
    // Ruff of fur under the head.
    ctx.fillStyle = C.paperShade;
    ctx.beginPath();
    ctx.ellipse(2, hy + 13, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Warm cheek and the big eye.
    ctx.fillStyle = 'rgba(216,93,68,0.45)';
    ctx.beginPath();
    ctx.ellipse(3, hy + 6, 4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(9, hy + 1, 5, 6.2, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(10.5, hy - 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Antennae: one feathery and straight, one bent under the cap.
  ctx.strokeStyle = sil ? ink : C.paperShade;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-2, hy - 10);
  ctx.quadraticCurveTo(-10, hy - 30, -26, hy - 36);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const t = 0.25 + i * 0.12;
    const x = -2 - 24 * t * t - 6 * t;
    const y = hy - 10 - 26 * t + 6 * t * t;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 3);
    ctx.stroke();
  }
  // The bent antenna pokes out from under the cap and kinks forward.
  const hatLift = rig.hat * 14;
  ctx.beginPath();
  ctx.moveTo(8, hy - 10);
  ctx.lineTo(14, hy - 24 - hatLift * 0.4);
  ctx.lineTo(26, hy - 26 - hatLift * 0.3);
  ctx.lineTo(30, hy - 20 - hatLift * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(30, hy - 20 - hatLift * 0.2, 2, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  // Postman's cap, slightly too big, tilted forward.
  ctx.save();
  ctx.translate(2, hy - 10 - hatLift);
  ctx.rotate(0.14 - rig.hat * 0.4);
  const cap = new Path2D();
  cap.moveTo(-14, 0);
  cap.lineTo(-12, -11);
  cap.quadraticCurveTo(0, -17, 13, -11);
  cap.lineTo(14, 0);
  cap.closePath();
  printed(ctx, cap, sil ? C.inkDeep : C.petrolDeep, { lw: 2, ink, mx: 1, my: 0.6 });
  if (!sil) {
    ctx.fillStyle = C.vermilion;
    ctx.fillRect(-13.5, -5, 27.5, 4);
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.arc(2, -9, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Peak.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.quadraticCurveTo(16, 2, 22, -1);
  ctx.lineTo(14, -3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  armSeg(rig.armA, rig.armLen, 3.8, sil ? ink : C.petrol);
  ctx.restore();
}
