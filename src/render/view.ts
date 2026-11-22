// Camera: world metres (y up) <-> screen CSS pixels (y down).

export interface Cam {
  /** World point at the centre of the screen. */
  x: number;
  y: number;
  /** Pixels per metre. */
  scale: number;
  W: number;
  H: number;
}

export const toScreen = (c: Cam, x: number, y: number) => ({ x: c.W / 2 + (x - c.x) * c.scale, y: c.H / 2 - (y - c.y) * c.scale });
export const toWorld = (c: Cam, sx: number, sy: number) => ({ x: c.x + (sx - c.W / 2) / c.scale, y: c.y - (sy - c.H / 2) / c.scale });

/** Set the context to draw in world metres (y up). `dpr` is the canvas pixel ratio. */
export function worldTransform(ctx: CanvasRenderingContext2D, c: Cam, dpr: number, shake = { x: 0, y: 0 }): void {
  ctx.setTransform(c.scale * dpr, 0, 0, -c.scale * dpr, (c.W / 2 - c.x * c.scale + shake.x) * dpr, (c.H / 2 + c.y * c.scale + shake.y) * dpr);
}

/** Frame a world rectangle inside a screen rectangle. */
export function frame(W: number, H: number, world: { x0: number; x1: number; y0: number; y1: number }, box: { x: number; y: number; w: number; h: number }, maxScale = 200): Cam {
  const scale = Math.min(maxScale, box.w / (world.x1 - world.x0), box.h / (world.y1 - world.y0));
  const cx = (world.x0 + world.x1) / 2;
  const cy = (world.y0 + world.y1) / 2;
  // put the world centre at the box centre
  const bx = box.x + box.w / 2;
  const by = box.y + box.h / 2;
  return { x: cx - (bx - W / 2) / scale, y: cy + (by - H / 2) / scale, scale, W, H };
}

export function lerpCam(a: Cam, b: Cam, k: number): Cam {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, scale: a.scale + (b.scale - a.scale) * k, W: b.W, H: b.H };
}
