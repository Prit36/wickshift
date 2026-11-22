// The kit: desk junk a moth can pin together. Each part enables something no
// other part can; there are no stat upgrades.

export type PartKind = 'stick' | 'lamp' | 'wheel' | 'key' | 'rocket' | 'lantern' | 'spring';

/** Grid spacing of the pins on the cork bench, in metres. */
export const GRID = 0.5;
/** Longest matchstick, in grid units (Euclidean): three across and one up fits. */
export const MAX_STICK = 3.17;
export const WHEEL_R = 0.25;
export const STICK_THICK = 0.07;
export const LAMP_W = 0.3;
export const LAMP_H = 0.42;

export type Control = 'drive' | 'rockets' | 'lanterns' | 'springs';

export interface PartInfo {
  kind: PartKind;
  name: string;
  /** One sentence: what it lets you do. */
  text: string;
  /** Can be aimed (rotated in 45° steps). */
  aims: boolean;
  /** Default aim, 0 = right, 2 = up, 4 = left, 6 = down. */
  dir: number;
  control: Control | null;
  /** Burns the lamp's flame while working. */
  fire: boolean;
}

export const PARTS: Record<PartKind, PartInfo> = {
  stick: { kind: 'stick', name: 'Matchstick', text: 'Drag from pin to pin to lay a matchstick. Everything pins onto their ends.', aims: false, dir: 0, control: null, fire: false },
  lamp: { kind: 'lamp', name: 'The Lamp', text: 'Your cargo, your fuel and your light. Knocks and fire parts burn it down. Deliver it lit.', aims: false, dir: 0, control: null, fire: false },
  wheel: { kind: 'wheel', name: 'Shirt Button', text: 'A free-rolling wheel. Rolls downhill, carries weight.', aims: false, dir: 0, control: null, fire: false },
  key: { kind: 'key', name: 'Clockwork Key', text: 'A wound-up wheel that drives forward while you hold DRIVE. Costs no flame.', aims: false, dir: 0, control: 'drive', fire: false },
  rocket: { kind: 'rocket', name: 'Match Rocket', text: 'Pushes hard the way it points while you hold ROCKETS. Burns flame fast. Off-centre rockets spin you.', aims: true, dir: 0, control: 'rockets', fire: true },
  lantern: { kind: 'lantern', name: 'Sky Lantern', text: 'A paper lantern on a thread. Hold LANTERNS to heat it and it lifts; draughts push it. Burns flame slowly.', aims: false, dir: 2, control: 'lanterns', fire: true },
  spring: { kind: 'spring', name: 'Peg Spring', text: 'Tap SPRINGS to kick off whatever its foot touches: hop a wall or cushion a landing.', aims: true, dir: 6, control: 'springs', fire: false },
};

/** Order in the tray. */
export const TRAY_ORDER: PartKind[] = ['stick', 'lamp', 'wheel', 'key', 'rocket', 'lantern', 'spring'];

export const CONTROL_INFO: Record<Control, { label: string; key: string; hold: boolean }> = {
  drive: { label: 'DRIVE', key: 'Space', hold: true },
  rockets: { label: 'ROCKETS', key: 'W', hold: true },
  lanterns: { label: 'LANTERNS', key: 'E', hold: true },
  springs: { label: 'SPRINGS', key: 'Q', hold: false },
};

export function dirVec(dir: number): { x: number; y: number } {
  const a = (dir * Math.PI) / 4;
  return { x: Math.round(Math.cos(a) * 1e6) / 1e6, y: Math.round(Math.sin(a) * 1e6) / 1e6 };
}
