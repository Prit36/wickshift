// Particles, floating trick labels and screen shake. World-space positions.
import { C, FONT } from '../render/palette';
import { toScreen, type Cam } from '../render/world';

type Ctx = CanvasRenderingContext2D;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'spark' | 'dust' | 'paper' | 'glass' | 'ring';
  rot: number;
  vr: number;
  g: number;
}

interface Popup {
  text: string;
  sub: string;
  x: number;
  y: number;
  t: number;
  color: string;
  size: number;
  dur: number;
}

export class Fx {
  parts: Particle[] = [];
  pops: Popup[] = [];
  shake = 0;
  reduced = false;

  burst(x: number, y: number, n: number, kind: Particle['kind'], color: string | string[], speed = 4, size = 0.12, life = 0.7, g = 10): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const col = Array.isArray(color) ? color[i % color.length] : color;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + speed * 0.3, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color: col, kind, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, g });
    }
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  }

  ring(x: number, y: number, color: string, size = 2): void {
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size, color, kind: 'ring', rot: 0, vr: 0, g: 0 });
  }

  pop(text: string, x: number, y: number, color: string, sub = '', size = 1, dur = 1.1): void {
    // stack above existing fresh popups
    let yy = y;
    for (const p of this.pops) if (p.t < 0.35 && Math.abs(p.x - x) < 3) yy = Math.max(yy, p.y + 0.75 * p.size);
    this.pops.push({ text, sub, x, y: yy, t: 0, color, size, dur });
  }

  kick(amount: number): void {
    if (this.reduced) return;
    this.shake = Math.min(18, this.shake + amount);
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy -= p.g * dt;
      if (p.kind === 'paper') {
        p.vx *= 0.97;
        p.vy = Math.max(p.vy, -2.2);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) {
      p.t += dt;
      p.y += dt * 0.9;
    }
    this.pops = this.pops.filter((p) => p.t < p.dur);
    this.shake *= Math.pow(0.002, dt);
    if (this.shake < 0.2) this.shake = 0;
  }

  shakeOffset(t: number): { x: number; y: number } {
    if (!this.shake) return { x: 0, y: 0 };
    return { x: Math.sin(t * 91) * this.shake, y: Math.cos(t * 77) * this.shake * 0.7 };
  }

  /** Draw particles in world space (transform already set). */
  drawWorld(ctx: Ctx): void {
    for (const p of this.parts) {
      const k = Math.max(0, p.life / p.max);
      ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.7), 0, Math.PI * 2);
        ctx.lineWidth = 0.12 * k;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      } else if (p.kind === 'paper' || p.kind === 'glass') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === 'glass') {
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(0, p.size * 0.8);
          ctx.lineTo(p.size * 0.6, -p.size * 0.5);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else if (p.kind === 'dust') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Floating labels in screen space. */
  drawPops(ctx: Ctx, cam: Cam, scale: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.pops) {
      const s = toScreen(cam, p.x, p.y);
      const k = p.t / p.dur;
      const intro = Math.min(1, p.t / 0.12);
      const pop = this.reduced ? 1 : intro < 1 ? 0.4 + intro * 0.8 : 1.2 - Math.min(0.2, (p.t - 0.12) * 1.2);
      const alpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const fs = Math.round(30 * p.size * scale * pop);
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(this.reduced ? 0 : Math.sin(p.t * 9) * 0.04 * (1 - k));
      ctx.font = `700 ${fs}px ${FONT}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, fs * 0.2);
      ctx.strokeStyle = C.ink;
      ctx.strokeText(p.text.toUpperCase(), 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text.toUpperCase(), 0, 0);
      if (p.sub) {
        const fs2 = Math.round(fs * 0.62);
        ctx.font = `700 ${fs2}px ${FONT}`;
        ctx.lineWidth = Math.max(3, fs2 * 0.22);
        ctx.strokeText(p.sub, 0, fs * 0.78);
        ctx.fillStyle = C.paper;
        ctx.fillText(p.sub, 0, fs * 0.78);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.parts = [];
    this.pops = [];
    this.shake = 0;
  }
}
