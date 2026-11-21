// The WICKSHIFT wordmark: nine letters cut from buff paper with scissors, each
// laid down a little off true, pasted over a torn strip of vermilion tape. The
// second I is a lamp wick with its ember.
import { mulberry32 } from '../core/geom';
import { C, FONT_STAMP } from './palette';

const WORD = 'WICKSHIFT';

/** Width of the wordmark at letter height `h`, for layout. */
export function wordmarkWidth(ctx: CanvasRenderingContext2D, h: number): number {
  ctx.save();
  ctx.font = `700 ${h}px ${FONT_STAMP}`;
  let w = 0;
  for (const ch of WORD) w += ctx.measureText(ch).width + h * 0.06;
  ctx.restore();
  return w - h * 0.06;
}

/**
 * Draw the wordmark with its baseline-left at (x, y). `h` is the cap height in px.
 * `ember` (0..1) warms the wick's spark; pass 0 where nothing is burning.
 */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, ember = 1): void {
  const rnd = mulberry32(1931);
  const total = wordmarkWidth(ctx, h);
  ctx.save();
  ctx.font = `700 ${h}px ${FONT_STAMP}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Torn tape behind the lower half of the letters.
  ctx.fillStyle = C.vermilion;
  ctx.beginPath();
  const ty = y - h * 0.46;
  const th = h * 0.5;
  ctx.moveTo(x - h * 0.22, ty + 1);
  for (let i = 0; i <= 12; i++) ctx.lineTo(x - h * 0.22 + ((total + h * 0.44) * i) / 12, ty + (rnd() - 0.5) * h * 0.06);
  ctx.lineTo(x + total + h * 0.2, ty + th);
  for (let i = 12; i >= 0; i--) ctx.lineTo(x - h * 0.22 + ((total + h * 0.44) * i) / 12, ty + th + (rnd() - 0.5) * h * 0.07);
  ctx.closePath();
  ctx.fill();
  let cx = x;
  for (let i = 0; i < WORD.length; i++) {
    const ch = WORD[i]!;
    const w = ctx.measureText(ch).width;
    const rot = (rnd() - 0.5) * 0.13;
    const dy = (rnd() - 0.5) * h * 0.07;
    ctx.save();
    ctx.translate(cx + w / 2, y + dy);
    ctx.rotate(rot);
    // Cast shadow of the pasted letter, then its ink keyline, then the paper.
    ctx.fillStyle = 'rgba(8,12,20,0.55)';
    ctx.fillText(ch, -w / 2 + h * 0.05, h * 0.07);
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2, h * 0.14);
    ctx.strokeText(ch, -w / 2, 0);
    ctx.fillStyle = C.paper;
    ctx.fillText(ch, -w / 2, 0);
    if (i === 1) {
      // The I is a wick: a dark thread on top and a honey spark.
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.beginPath();
      // Barlow's capitals stand about 0.7 of the font size.
      ctx.moveTo(0, -h * 0.72);
      ctx.quadraticCurveTo(h * 0.05, -h * 0.8, -h * 0.01, -h * 0.88);
      ctx.stroke();
      if (ember > 0) {
        ctx.fillStyle = C.honey;
        ctx.globalAlpha = 0.35 + 0.65 * ember;
        ctx.beginPath();
        ctx.ellipse(-h * 0.01, -h * 0.93, h * 0.06, h * 0.085, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    cx += w + h * 0.06;
  }
  ctx.restore();
}
