// The editable blueprint: which part sits in which socket, at what orientation.
// Pure functions only; no drawing, no physics, no storage.
import { CHASSIS, CLEARANCE, PARTS, PART_KINDS, type PartKind, type Pt, type Solid } from '../data/parts';
import { apply, overlapDepth, transformSolid, type Xf } from '../core/geom';

export const CHASSIS_ID = 'chassis';

export interface Placement {
  readonly id: string;
  readonly kind: PartKind;
  /** 'chassis' or the id of the placement that owns the socket. */
  readonly parent: string;
  readonly socket: number;
  /** Index into PARTS[kind].rotations. */
  readonly rot: number;
}

export interface Blueprint {
  readonly placements: readonly Placement[];
}

export type Kit = Readonly<Record<PartKind, number>>;

export interface SocketRef {
  readonly parent: string;
  readonly socket: number;
}

export interface LaidPart {
  readonly p: Placement;
  /** Transform of the part's local frame in the chassis frame. */
  readonly xf: Xf;
  readonly solids: readonly Solid[];
  readonly depth: number;
}

export interface SocketInfo extends SocketRef {
  readonly x: number;
  readonly y: number;
  readonly accepts: readonly PartKind[];
  readonly occupant: string | null;
}

export const EMPTY_BP: Blueprint = { placements: [] };

export function sameSocket(a: SocketRef, b: SocketRef): boolean {
  return a.parent === b.parent && a.socket === b.socket;
}

export function findPlacement(bp: Blueprint, id: string): Placement | undefined {
  return bp.placements.find((p) => p.id === id);
}

/** Socket position in the chassis frame, or null if the parent is missing. */
export function socketPos(bp: Blueprint, ref: SocketRef, laid?: Map<string, LaidPart>): Pt | null {
  if (ref.parent === CHASSIS_ID) return CHASSIS.sockets[ref.socket] ?? null;
  const L = laid ?? layout(bp);
  const parent = L.get(ref.parent);
  if (!parent) return null;
  const local = PARTS[parent.p.kind].childSockets[ref.socket];
  if (!local) return null;
  return apply(parent.xf, local);
}

/** Resolve every placement's transform in the chassis frame (parents first). */
export function layout(bp: Blueprint): Map<string, LaidPart> {
  const out = new Map<string, LaidPart>();
  const pending = [...bp.placements];
  let guard = 0;
  while (pending.length && guard++ < 64) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]!;
      let pos: Pt | null = null;
      let depth = 0;
      if (p.parent === CHASSIS_ID) pos = CHASSIS.sockets[p.socket] ?? null;
      else {
        const parent = out.get(p.parent);
        if (!parent) continue;
        const local = PARTS[parent.p.kind].childSockets[p.socket];
        pos = local ? apply(parent.xf, local) : null;
        depth = parent.depth + 1;
      }
      pending.splice(i, 1);
      if (!pos) continue;
      const def = PARTS[p.kind];
      const a = def.rotations[p.rot] ?? def.rotations[0]!;
      const xf: Xf = { x: pos[0], y: pos[1], a };
      out.set(p.id, { p, xf, solids: def.solids.map((s) => transformSolid(xf, s)), depth });
    }
  }
  return out;
}

export function allSockets(bp: Blueprint, laid?: Map<string, LaidPart>): SocketInfo[] {
  const L = laid ?? layout(bp);
  const occ = new Map<string, string>();
  for (const p of bp.placements) occ.set(`${p.parent}#${p.socket}`, p.id);
  const out: SocketInfo[] = [];
  CHASSIS.sockets.forEach((s, i) => {
    out.push({ parent: CHASSIS_ID, socket: i, x: s[0], y: s[1], accepts: CHASSIS.accepts, occupant: occ.get(`${CHASSIS_ID}#${i}`) ?? null });
  });
  for (const lp of L.values()) {
    const def = PARTS[lp.p.kind];
    def.childSockets.forEach((cs, i) => {
      const [x, y] = apply(lp.xf, cs);
      out.push({ parent: lp.p.id, socket: i, x, y, accepts: def.accepts, occupant: occ.get(`${lp.p.id}#${i}`) ?? null });
    });
  }
  return out;
}

export function descendants(bp: Blueprint, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of bp.placements) {
      if (p.parent === cur) {
        out.push(p.id);
        stack.push(p.id);
      }
    }
  }
  return out;
}

function ancestors(bp: Blueprint, id: string): string[] {
  const out: string[] = [];
  let cur = findPlacement(bp, id);
  let guard = 0;
  while (cur && cur.parent !== CHASSIS_ID && guard++ < 16) {
    out.push(cur.parent);
    cur = findPlacement(bp, cur.parent);
  }
  return out;
}

export function counts(bp: Blueprint): Record<PartKind, number> {
  const c = Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
  for (const p of bp.placements) c[p.kind]++;
  return c;
}

/** Stock left in the drawer: derived from kit and placements, never stored. */
export function stock(kit: Kit, bp: Blueprint): Record<PartKind, number> {
  const c = counts(bp);
  const s = {} as Record<PartKind, number>;
  for (const k of PART_KINDS) s[k] = Math.max(0, kit[k] - c[k]);
  return s;
}

export interface Conflict {
  readonly reason: string;
  /** Point (chassis frame) where the two solids meet. */
  readonly at: Pt;
  readonly with: string;
}

const RUBS: Record<PartKind, string> = {
  keyWheel: 'key wheel',
  reel: 'reel',
  spar: 'spar',
  fork: 'fork',
  runner: 'runner',
};

function solidCentre(s: Solid): Pt {
  if (s.type === 'circle') return [s.x, s.y];
  let x = 0;
  let y = 0;
  for (const p of s.pts) {
    x += p[0];
    y += p[1];
  }
  return [x / s.pts.length, y / s.pts.length];
}

/** Clearance between solid parts, except along intended mounts (ancestor chains). */
export function findConflicts(bp: Blueprint, focus?: string): Conflict[] {
  const L = layout(bp);
  const ids = [...L.keys()];
  const out: Conflict[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = L.get(ids[i]!)!;
      const b = L.get(ids[j]!)!;
      if (focus && a.p.id !== focus && b.p.id !== focus) continue;
      if (ancestors(bp, a.p.id).includes(b.p.id) || ancestors(bp, b.p.id).includes(a.p.id)) continue;
      // Siblings on the same parent only rub if both are wheels or runners.
      const margin = PARTS[a.p.kind].rolling && PARTS[b.p.kind].rolling ? CLEARANCE : 0.005;
      for (const sa of a.solids) {
        for (const sb of b.solids) {
          const d = overlapDepth(sa, sb);
          if (d > -margin) {
            const ca = solidCentre(sa);
            const cb = solidCentre(sb);
            const other = focus && b.p.id === focus ? a : b;
            out.push({
              reason: `Would rub the ${RUBS[other.p.kind]}`,
              at: [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2],
              with: other.p.id,
            });
          }
        }
      }
    }
  }
  return out;
}

export function nextId(bp: Blueprint, kind: PartKind): string {
  let n = 1;
  const ids = new Set(bp.placements.map((p) => p.id));
  while (ids.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

export function defaultRot(kind: PartKind, at: SocketRef): number {
  if (kind !== 'spar') return 0;
  const x = at.parent === CHASSIS_ID ? CHASSIS.sockets[at.socket]![0] : 0;
  const rots = PARTS.spar.rotations;
  // Point outward from the nearer end: forward-down at the front, back-down at the rear.
  const want = x >= 0 ? -Math.PI / 6 : -(5 * Math.PI) / 6;
  let best = 0;
  rots.forEach((r, i) => {
    if (Math.abs(r - want) < Math.abs(rots[best]! - want)) best = i;
  });
  return best;
}

export type FitResult =
  | { ok: true; bp: Blueprint; placement: Placement }
  | { ok: false; reason: string; at: Pt };

/**
 * Propose placing `kind` at `target` (moving `movingId` if given, with its branch).
 * Validates the whole resulting blueprint before returning it.
 */
export function proposeFit(
  bp: Blueprint,
  kit: Kit,
  kind: PartKind,
  target: SocketRef,
  opts: { movingId?: string; rot?: number } = {},
): FitResult {
  const moving = opts.movingId ? findPlacement(bp, opts.movingId) : undefined;
  const branch = moving ? new Set([moving.id, ...descendants(bp, moving.id)]) : new Set<string>();
  const here = socketPos(bp, target) ?? [0, 0];
  if (branch.has(target.parent)) return { ok: false, reason: 'Cannot mount a part on itself', at: here };
  const parentKind = target.parent === CHASSIS_ID ? null : findPlacement(bp, target.parent)?.kind;
  if (target.parent !== CHASSIS_ID && !parentKind) return { ok: false, reason: 'No socket here', at: here };
  const accepts = parentKind ? PARTS[parentKind].accepts : CHASSIS.accepts;
  if (!accepts.includes(kind)) {
    const reason =
      parentKind === 'spar'
        ? 'Spars do not chain'
        : parentKind === 'fork'
          ? 'Fork carrier takes a wheel or runner'
          : 'Does not fit this socket';
    return { ok: false, reason, at: here };
  }
  const occupant = bp.placements.find((p) => p.parent === target.parent && p.socket === target.socket);
  if (occupant && occupant.id !== moving?.id) {
    return { ok: false, reason: `Socket holds the ${RUBS[occupant.kind]}`, at: here };
  }
  if (!moving && stock(kit, bp)[kind] <= 0) return { ok: false, reason: 'None left in the drawer', at: here };

  const id = moving ? moving.id : nextId(bp, kind);
  const tryRots: number[] = [];
  const rots = PARTS[kind].rotations;
  const first = opts.rot ?? (moving && moving.kind === kind ? moving.rot : defaultRot(kind, target));
  tryRots.push(first);
  if (opts.rot === undefined) {
    // Fall back to the nearest orientation that clears, so the preview shows a legal fit.
    for (let d = 1; d < rots.length; d++) {
      if (first + d < rots.length) tryRots.push(first + d);
      if (first - d >= 0) tryRots.push(first - d);
    }
  }
  let lastConflict: Conflict | null = null;
  for (const rot of tryRots) {
    const placement: Placement = { id, kind, parent: target.parent, socket: target.socket, rot };
    const others = bp.placements.filter((p) => p.id !== id);
    const next: Blueprint = { placements: [...others, placement] };
    const conflicts = findConflicts(next, id).concat(
      // children of a moved branch must also clear
      [...branch].filter((b) => b !== id).flatMap((b) => findConflicts(next, b)),
    );
    if (conflicts.length === 0) return { ok: true, bp: next, placement };
    lastConflict = conflicts[0]!;
  }
  return { ok: false, reason: lastConflict?.reason ?? 'No clearance', at: lastConflict?.at ?? here };
}

/** Remove a placement and its whole branch (children go back to the drawer). */
export function removeBranch(bp: Blueprint, id: string): Blueprint {
  const gone = new Set([id, ...descendants(bp, id)]);
  return { placements: bp.placements.filter((p) => !gone.has(p.id)) };
}

export function rotatePlacement(bp: Blueprint, id: string, dir: 1 | -1): FitResult {
  const p = findPlacement(bp, id);
  if (!p) return { ok: false, reason: 'Nothing selected', at: [0, 0] };
  const n = PARTS[p.kind].rotations.length;
  if (n <= 1) return { ok: false, reason: 'This part has one orientation', at: [0, 0] };
  let firstFail: FitResult | null = null;
  for (let rot = p.rot + dir; rot >= 0 && rot < n; rot += dir) {
    const res = proposeFit(bp, { keyWheel: 9, reel: 9, spar: 9, fork: 9, runner: 9 }, p.kind, p, { movingId: id, rot });
    if (res.ok) return res;
    firstFail ??= res;
  }
  return firstFail ?? { ok: false, reason: 'At its stop', at: socketPos(bp, p) ?? [0, 0] };
}

export type LaunchCheck = { ok: true } | { ok: false; missing: string; kind?: PartKind };

export function checkLaunch(bp: Blueprint, kit: Kit): LaunchCheck {
  const c = counts(bp);
  for (const k of PART_KINDS) if (c[k] > kit[k]) return { ok: false, missing: `Too many ${RUBS[k]}s` };
  if (c.keyWheel < 1) return { ok: false, missing: 'Fit the key wheel', kind: 'keyWheel' };
  if (findConflicts(bp).length) return { ok: false, missing: 'Two parts rub' };
  return { ok: true };
}

/** Validate a loaded blueprint against the part data; returns null if corrupt. */
export function sanitize(raw: unknown, kit: Kit): Blueprint | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Blueprint).placements)) return null;
  const list = (raw as { placements: unknown[] }).placements;
  const seen = new Set<string>();
  const out: Placement[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') return null;
    const p = r as Record<string, unknown>;
    if (typeof p.id !== 'string' || seen.has(p.id)) return null;
    if (typeof p.kind !== 'string' || !(PART_KINDS as readonly string[]).includes(p.kind)) return null;
    if (typeof p.parent !== 'string' || typeof p.socket !== 'number' || typeof p.rot !== 'number') return null;
    const kind = p.kind as PartKind;
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot >= PARTS[kind].rotations.length) return null;
    if (!Number.isInteger(p.socket) || p.socket < 0) return null;
    seen.add(p.id);
    out.push({ id: p.id, kind, parent: p.parent, socket: p.socket, rot: p.rot });
  }
  const bp: Blueprint = { placements: out };
  // Every parent must exist, accept the kind, and own that socket index; no shared sockets.
  const L = layout(bp);
  if (L.size !== out.length) return null;
  const used = new Set<string>();
  for (const p of out) {
    const key = `${p.parent}#${p.socket}`;
    if (used.has(key)) return null;
    used.add(key);
    const parentKind = p.parent === CHASSIS_ID ? null : findPlacement(bp, p.parent)?.kind;
    const accepts = parentKind ? PARTS[parentKind].accepts : CHASSIS.accepts;
    if (!accepts.includes(p.kind)) return null;
    const nSockets = parentKind ? PARTS[parentKind].childSockets.length : CHASSIS.sockets.length;
    if (p.socket >= nSockets) return null;
  }
  const c = counts(bp);
  for (const k of PART_KINDS) if (c[k] > kit[k]) return null;
  if (findConflicts(bp).length) return null;
  return bp;
}
