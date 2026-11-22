// A build: matchsticks between pins, and parts pinned onto stick ends.
// Pure data, shared by the bench (editing) and the run (physics).
import { ALL_KINDS, GRID, MAX_STICK, PARTS, type PartKind } from './parts';

export type Pin = [number, number];

export interface Stick {
  a: Pin;
  b: Pin;
}

export interface Placed {
  kind: Exclude<PartKind, 'stick'>;
  at: Pin;
  dir: number;
}

export interface Blueprint {
  sticks: Stick[];
  parts: Placed[];
}

export type Kit = Partial<Record<PartKind, number>>;

export const emptyBlueprint = (): Blueprint => ({ sticks: [], parts: [] });

export const clone = (b: Blueprint): Blueprint => ({
  sticks: b.sticks.map((s) => ({ a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]] })),
  parts: b.parts.map((p) => ({ kind: p.kind, at: [p.at[0], p.at[1]], dir: p.dir })),
});

export const samePin = (a: Pin, b: Pin): boolean => a[0] === b[0] && a[1] === b[1];
export const pinKey = (p: Pin): string => `${p[0]},${p[1]}`;
export const stickLen = (s: Stick): number => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
export const pinPos = (p: Pin): { x: number; y: number } => ({ x: p[0] * GRID, y: p[1] * GRID });

/** Pins that are the end of at least one matchstick: where parts can go. */
export function nodes(b: Blueprint): Set<string> {
  const out = new Set<string>();
  for (const s of b.sticks) {
    out.add(pinKey(s.a));
    out.add(pinKey(s.b));
  }
  return out;
}

export function used(b: Blueprint): Record<PartKind, number> {
  const u = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
  u.stick = b.sticks.length;
  for (const p of b.parts) u[p.kind]++;
  return u;
}

export function left(b: Blueprint, kit: Kit, kind: PartKind): number {
  return (kit[kind] ?? 0) - used(b)[kind];
}

export interface Area {
  cols: number;
  rows: number;
}

export const inArea = (p: Pin, a: Area): boolean => p[0] >= 0 && p[1] >= 0 && p[0] <= a.cols && p[1] <= a.rows;

/** Why a new matchstick can't go here, or null. */
export function stickProblem(b: Blueprint, kit: Kit, area: Area, s: Stick): string | null {
  if (samePin(s.a, s.b)) return 'Too short';
  if (!inArea(s.a, area) || !inArea(s.b, area)) return 'Off the bench';
  if (stickLen(s) > MAX_STICK) return 'Too long for a matchstick';
  if (b.sticks.some((o) => (samePin(o.a, s.a) && samePin(o.b, s.b)) || (samePin(o.a, s.b) && samePin(o.b, s.a)))) return 'Already there';
  if (left(b, kit, 'stick') <= 0) return 'No matchsticks left';
  return null;
}

/** Why a part can't be pinned here, or null. `ignore` is a part being moved. */
export function partProblem(b: Blueprint, kit: Kit, kind: Placed['kind'], at: Pin, ignore?: Placed): string | null {
  if (!nodes(b).has(pinKey(at))) return 'Pin it to the end of a matchstick';
  if (b.parts.some((p) => p !== ignore && samePin(p.at, at))) return 'That pin is taken';
  if (!ignore && left(b, kit, kind) <= 0) return `No ${PARTS[kind].name.toLowerCase()}s left`;
  return null;
}

/** Why this build can't be launched, or null. */
export function launchProblem(b: Blueprint): string | null {
  const lamps = b.parts.filter((p) => p.kind === 'lamp');
  if (lamps.length === 0) return 'Pin the lamp on first';
  if (!b.sticks.length) return 'Lay some matchsticks';
  // connected: every stick reachable from the lamp's pin
  const adj = new Map<string, string[]>();
  for (const s of b.sticks) {
    const a = pinKey(s.a);
    const c = pinKey(s.b);
    adj.set(a, [...(adj.get(a) ?? []), c]);
    adj.set(c, [...(adj.get(c) ?? []), a]);
  }
  const seen = new Set<string>([pinKey(lamps[0].at)]);
  const q = [pinKey(lamps[0].at)];
  while (q.length) for (const n of adj.get(q.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), q.push(n));
  if ([...adj.keys()].some((k) => !seen.has(k))) return 'Some matchsticks aren’t joined to the lamp';
  return null;
}

/** Remove a stick, and any parts left without a stick under them. */
export function removeStick(b: Blueprint, i: number): void {
  b.sticks.splice(i, 1);
  const n = nodes(b);
  b.parts = b.parts.filter((p) => n.has(pinKey(p.at)));
}
