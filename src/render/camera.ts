// One world-to-screen conversion: metres (y up) to logical pixels (y down).
export class Camera {
  cx = 0;
  cy = 0;
  /** Logical pixels per metre. */
  ppm = 90;
  W = 1280;
  H = 720;

  sx(x: number): number {
    return this.W / 2 + (x - this.cx) * this.ppm;
  }
  sy(y: number): number {
    return this.H / 2 - (y - this.cy) * this.ppm;
  }
  wx(sx: number): number {
    return (sx - this.W / 2) / this.ppm + this.cx;
  }
  wy(sy: number): number {
    return (this.H / 2 - sy) / this.ppm + this.cy;
  }
  copy(): { cx: number; cy: number; ppm: number } {
    return { cx: this.cx, cy: this.cy, ppm: this.ppm };
  }
  set(v: { cx: number; cy: number; ppm: number }): void {
    this.cx = v.cx;
    this.cy = v.cy;
    this.ppm = v.ppm;
  }
}

/** Bench framing: chassis start at ~36% width; platform top above the drawer. */
export function benchView(W: number, H: number, startX: number, groundY: number, ppm = 100): { cx: number; cy: number; ppm: number } {
  const cartScreenX = W * 0.34;
  const groundScreenY = H - 178;
  return {
    ppm,
    cx: startX + (W / 2 - cartScreenX) / ppm,
    cy: groundY + (groundScreenY - H / 2) / ppm,
  };
}
