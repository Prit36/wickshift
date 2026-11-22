// The kit: desk junk a moth can pin together. Each part enables something no
// other part can; there are no stat upgrades.

export type PartKind = 'stick' | 'lamp' | 'wheel' | 'key' | 'rocket' | 'lantern' | 'spring' | 'hook' | 'umbrella' | 'eraser' | 'coin' | 'balloon';

/** Grid spacing of the pins on the cork bench, in metres. */
export const GRID = 0.5;
/** Longest matchstick, in grid units (Euclidean): three across and one up fits. */
export const MAX_STICK = 3.17;
export const WHEEL_R = 0.25;
export const STICK_THICK = 0.07;
export const LAMP_W = 0.3;
export const LAMP_H = 0.42;

export type Control = 'drive' | 'rockets' | 'lanterns' | 'springs' | 'hooks' | 'umbrellas';

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
  spring: { kind: 'spring', name: 'Peg Spring', text: 'Tap SPRINGS to kick off whatever its foot touches: hop a wall or shove a book.', aims: true, dir: 6, control: 'springs', fire: false },
  hook: { kind: 'hook', name: 'Paperclip Hook', text: 'Tap HOOK to shoot a thread the way it points and snag any shelf, wall or ceiling in reach. Swing! Tap again to let go.', aims: true, dir: 2, control: 'hooks', fire: false },
  umbrella: { kind: 'umbrella', name: 'Paper Umbrella', text: 'Hold UMBRELLA to open it: it brakes against the air the way it faces, so you glide, float down or sail on draughts.', aims: true, dir: 2, control: 'umbrellas', fire: false },
  eraser: { kind: 'eraser', name: 'Rubber Eraser', text: 'A bouncy bumper. Bumps it takes don’t shake the lamp, and it springs back off walls and floors.', aims: false, dir: 0, control: null, fire: false },
  balloon: { kind: 'balloon', name: 'Party Balloon', text: 'Floats on a string and pulls up all the time, for free. Too many and you float off; thumbtacks and candle flames pop it.', aims: false, dir: 2, control: null, fire: false },
  coin: { kind: 'coin', name: 'Brass Coin', text: 'Dead weight, exactly where you pin it. Tips rulers, shoves books, steadies a top-heavy build.', aims: false, dir: 0, control: null, fire: false },
};

export const ALL_KINDS = Object.keys(PARTS) as PartKind[];

/** How far above its pin a floating part (lantern, balloon) is drawn on the bench. */
export const floatUp = (k: PartKind): number => (k === 'lantern' ? 0.72 : k === 'balloon' ? 1.37 : 0);

/** Order in the tray. */
export const TRAY_ORDER: PartKind[] = ['stick', 'lamp', 'wheel', 'key', 'coin', 'eraser', 'spring', 'hook', 'umbrella', 'balloon', 'rocket', 'lantern'];

export const CONTROL_INFO: Record<Control, { label: string; key: string; hold: boolean }> = {
  drive: { label: 'DRIVE', key: 'Space', hold: true },
  rockets: { label: 'ROCKETS', key: 'W', hold: true },
  lanterns: { label: 'LANTERNS', key: 'E', hold: true },
  springs: { label: 'SPRINGS', key: 'Q', hold: false },
  hooks: { label: 'HOOK', key: 'F', hold: false },
  umbrellas: { label: 'UMBRELLA', key: 'A', hold: true },
};

/** Order of the control pads in a run. */
export const CONTROL_ORDER: Control[] = ['drive', 'rockets', 'lanterns', 'umbrellas', 'springs', 'hooks'];

export function dirVec(dir: number): { x: number; y: number } {
  const a = (dir * Math.PI) / 4;
  return { x: Math.round(Math.cos(a) * 1e6) / 1e6, y: Math.round(Math.sin(a) * 1e6) / 1e6 };
}
