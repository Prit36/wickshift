/** Fixed-step accumulator: one rAF loop drives presentation, physics advances in 1/60 s ticks. */
export const TICK = 1 / 60;
export const MAX_STEPS = 5;

export class FixedStepper {
  private acc = 0;
  private last: number | null = null;

  /** Feed a timestamp (ms). Returns how many ticks to run and the render alpha. */
  advance(nowMs: number): { steps: number; alpha: number } {
    if (this.last === null) {
      this.last = nowMs;
      return { steps: 0, alpha: 1 };
    }
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (dt < 0) dt = 0;
    this.acc += dt;
    let steps = Math.floor(this.acc / TICK + 1e-9);
    if (steps > MAX_STEPS) {
      steps = MAX_STEPS;
      this.acc = 0; // discard excess backlog
    } else {
      this.acc -= steps * TICK;
    }
    return { steps, alpha: Math.min(1, Math.max(0, this.acc / TICK)) };
  }

  reset(): void {
    this.acc = 0;
    this.last = null;
  }
}
