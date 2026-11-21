// Night backdrop: three parallax layers (window wall, pigeonhole rack, the
// desk ledge) cached once per viewport size, plus an edge falloff.
import { mulberry32 } from '../core/geom';
import type { Camera } from './camera';
import { C } from './palette';
import { FX, makeCanvas } from './paint';

export interface Backdrop {
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
  tileW: number;
  nearW: number;
  H: number;
  res: number;
}

/** Night backdrop tiles, rendered once per viewport size. */
export function buildBackdrop(W: number, H: number, res: number): Backdrop {
  const tileW = 1400;
  const nearW = 1900;
  const far = makeCanvas(tileW * res, H * res);
  const mid = makeCanvas(tileW * res, H * res);
  const near = makeCanvas(nearW * res, H * res);
  paintFar(far.getContext('2d')!, tileW, H, res);
  paintMid(mid.getContext('2d')!, tileW, H, res);
  paintNear(near.getContext('2d')!, nearW, H, res);
  return { far, mid, near, vignette: paintVignette(W, H), tileW, nearW, H, res };
}

function paintFar(g: CanvasRenderingContext2D, W: number, H: number, res: number): void {
  g.scale(res, res);
  // Wall: carbon indigo with a faint petrol wash toward the floor.
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#111d2c');
  wall.addColorStop(0.65, '#16263a');
  wall.addColorStop(1, '#1b2f45');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  const rnd = mulberry32(3);
  // Two tall arched seaside windows per tile.
  for (const wx of [210, 910]) {
    const ww = 280;
    const top = 40;
    const bot = H * 0.62;
    const frame = new Path2D();
    frame.moveTo(wx, bot);
    frame.lineTo(wx, top + ww / 2);
    frame.arc(wx + ww / 2, top + ww / 2, ww / 2, Math.PI, 0);
    frame.lineTo(wx + ww, bot);
    frame.closePath();
    // Night sky and sea seen through the glass.
    g.save();
    g.clip(frame);
    const sky = g.createLinearGradient(0, top, 0, bot);
    sky.addColorStop(0, '#203750');
    sky.addColorStop(0.7, '#2e4d63');
    g.fillStyle = sky;
    g.fillRect(wx, top, ww, bot - top);
    const horizon = bot - 70;
    g.fillStyle = '#26404f';
    g.fillRect(wx, horizon, ww, bot - horizon);
    // Moon (buff paper disc) and its broken path on the water.
    const mx = wx + ww * (wx < 500 ? 0.66 : 0.3);
    g.fillStyle = C.paper;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(mx, top + 120, 30, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) {
      const y = horizon + 6 + i * 7;
      const w = 34 - i * 2 + rnd() * 10;
      g.fillRect(mx - w / 2 + (rnd() - 0.5) * 10, y, w, 2);
    }
    g.globalAlpha = 1;
    // Distant headland and a dark lighthouse (no light: honey is reserved).
    g.fillStyle = '#1a2c3d';
    g.beginPath();
    g.moveTo(wx, horizon + 2);
    g.lineTo(wx + ww * 0.25, horizon - 16);
    g.lineTo(wx + ww * 0.45, horizon - 8);
    g.lineTo(wx + ww * 0.45, horizon + 2);
    g.closePath();
    g.fill();
    g.fillRect(wx + ww * 0.18, horizon - 52, 9, 38);
    g.restore();
    // Mullions and the frame in ink.
    g.strokeStyle = C.inkDeep;
    g.lineWidth = 7;
    g.stroke(frame);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(wx + ww / 2, top);
    g.lineTo(wx + ww / 2, bot);
    for (let y = top + ww / 2; y < bot; y += 90) {
      g.moveTo(wx, y);
      g.lineTo(wx + ww, y);
    }
    g.stroke();
    // Sill.
    g.fillStyle = '#22364d';
    g.fillRect(wx - 16, bot, ww + 32, 12);
  }
  // A thumbprint in the printing ink, nearly as large as the courier, faint on the wall.
  g.save();
  g.translate(620, 170);
  g.rotate(-0.3);
  g.strokeStyle = 'rgba(121,166,157,0.08)';
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.ellipse(0, 0, 12 + i * 7, 9 + i * 5.5, 0, 0.3 + i * 0.07, Math.PI * 2 - 0.4);
    g.stroke();
  }
  g.restore();
  if (FX.grain) {
    const pat = g.createPattern(grainCanvasCached(), 'repeat');
    if (pat) {
      g.globalAlpha = 0.8;
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}

let grainCache: HTMLCanvasElement | null = null;
function grainCanvasCached(): HTMLCanvasElement {
  if (!grainCache) {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d')!;
    const rnd = mulberry32(21);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(243,222,174,0.05)';
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd(), 1 + rnd());
    }
    grainCache = c;
  }
  return grainCache;
}


/** Pigeonhole rack: rows of sleeping houses, each a little different, kept dark. */
function paintMid(g: CanvasRenderingContext2D, W: number, H: number, res: number): void {
  g.scale(res, res);
  const rnd = mulberry32(9);
  const base = H * 0.56;
  const rows = [
    { y: base - 132, h: 118, tone: ['#1b2e42', '#1d3146', '#192b3e'] },
    { y: base - 270, h: 122, tone: ['#172839', '#192b3d', '#152536'] },
    { y: base - 404, h: 118, tone: ['#132232', '#142435', '#122030'] },
  ];
  rows.forEach((row, ri) => {
    let x = -20 + ri * 37;
    while (x < W + 20) {
      const cell = [92, 118, 104, 132, 98, 112][Math.floor(rnd() * 6)]!;
      const h = row.h - Math.floor(rnd() * 3) * 8;
      const y0 = row.y + (row.h - h);
      const roof = 20 + rnd() * 22;
      const house = new Path2D();
      house.moveTo(x + 3, y0 + h);
      house.lineTo(x + 3, y0 + roof);
      house.lineTo(x + cell / 2, y0);
      house.lineTo(x + cell - 3, y0 + roof);
      house.lineTo(x + cell - 3, y0 + h);
      house.closePath();
      g.fillStyle = row.tone[Math.floor(rnd() * 3)]!;
      g.fill(house);
      g.strokeStyle = '#0d1724';
      g.lineWidth = 2;
      g.stroke(house);
      // Sleeping window: a dark arched slot, sometimes a pair.
      const pair = cell > 120 && rnd() < 0.6;
      const slots = pair ? [x + cell * 0.32, x + cell * 0.68] : [x + cell / 2];
      const ww = pair ? 24 : 30 + rnd() * 8;
      const wy = y0 + roof + 14;
      const wh = h - roof - 34;
      for (const cx of slots) {
        const win = new Path2D();
        win.moveTo(cx - ww / 2, wy + wh);
        win.lineTo(cx - ww / 2, wy + ww / 2);
        win.arc(cx, wy + ww / 2, ww / 2, Math.PI, 0);
        win.lineTo(cx + ww / 2, wy + wh);
        win.closePath();
        g.fillStyle = '#0a121b';
        g.fill(win);
        const r = rnd();
        if (r < 0.4) {
          // A letter asleep in the slot.
          g.fillStyle = 'rgba(243,222,174,0.16)';
          const lw = ww * 0.9;
          g.save();
          g.translate(cx, wy + wh - 6);
          g.rotate((rnd() - 0.5) * 0.4);
          g.fillRect(-lw / 2, -9, lw, 10);
          g.restore();
        } else if (r < 0.55) {
          // A parcel tied with string.
          g.fillStyle = 'rgba(184,154,99,0.2)';
          g.fillRect(cx - ww * 0.4, wy + wh - 20, ww * 0.8, 20);
          g.fillStyle = 'rgba(216,93,68,0.22)';
          g.fillRect(cx - 1, wy + wh - 20, 2, 20);
        } else if (r < 0.62) {
          // A brass key on a nail.
          g.fillStyle = 'rgba(201,164,87,0.3)';
          g.beginPath();
          g.arc(cx, wy + ww * 0.55, 3, 0, Math.PI * 2);
          g.fill();
          g.fillRect(cx - 0.75, wy + ww * 0.55, 1.5, 12);
        }
      }
      g.fillStyle = 'rgba(201,164,87,0.14)';
      g.fillRect(x + cell / 2 - 8, y0 + h - 14, 16, 8);
      x += cell;
    }
    g.fillStyle = '#24394d';
    g.fillRect(0, row.y + row.h, W, 8);
    g.fillStyle = '#0d1724';
    g.fillRect(0, row.y + row.h + 8, W, 3);
  });
  // Ceiling shadow: the rack sinks into darkness above.
  const shade = g.createLinearGradient(0, 0, 0, base);
  shade.addColorStop(0, 'rgba(10,16,26,0.92)');
  shade.addColorStop(0.55, 'rgba(10,16,26,0.45)');
  shade.addColorStop(1, 'rgba(10,16,26,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, base);
  g.fillStyle = '#16253a';
  g.fillRect(0, base + 11, W, H - base);
  if (FX.grain) {
    const pat = g.createPattern(grainCanvasCached(), 'repeat');
    if (pat) {
      g.globalAlpha = 0.6;
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}

/** Back of the sorting desk: a ledge of clutter between the rack and the bench. */
function paintNear(g: CanvasRenderingContext2D, W: number, H: number, res: number): void {
  g.scale(res, res);
  const rnd = mulberry32(17);
  const ledge = H * 0.665;
  g.fillStyle = '#231e29';
  g.fillRect(0, ledge, W, H - ledge);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += 150 + Math.floor(rnd() * 3) * 20) {
    g.beginPath();
    g.moveTo(x, ledge + 10);
    g.lineTo(x, H);
    g.stroke();
  }
  g.fillStyle = '#3a3036';
  g.fillRect(0, ledge - 8, W, 10);
  g.fillStyle = 'rgba(243,222,174,0.12)';
  g.fillRect(0, ledge - 8, W, 2);
  g.fillStyle = '#0d1724';
  g.fillRect(0, ledge + 2, W, 3);
  let x = 40;
  let i = 0;
  while (x < W - 120) {
    const kind = [0, 1, 2, 3, 4, 5, 0, 2][i % 8]!;
    const w = drawClutter(g, kind, x, ledge - 8, rnd);
    x += w + 60 + rnd() * 140;
    i++;
  }
  // Push it back a step with a thin wash of the night.
  g.fillStyle = 'rgba(13,23,36,0.38)';
  g.fillRect(0, 0, W, H);
  if (FX.grain) {
    const pat = g.createPattern(grainCanvasCached(), 'repeat');
    if (pat) {
      g.globalAlpha = 0.5;
      g.fillStyle = pat;
      g.fillRect(0, ledge - 160, W, H - ledge + 160);
      g.globalAlpha = 1;
    }
  }
}

function drawClutter(g: CanvasRenderingContext2D, kind: number, x: number, y: number, rnd: () => number): number {
  const ink = '#0d1724';
  g.lineWidth = 2;
  g.strokeStyle = ink;
  if (kind === 0) {
    // A bundle of letters tied with red string.
    const n = 4 + Math.floor(rnd() * 3);
    let yy = y;
    for (let j = 0; j < n; j++) {
      const w = 74 + rnd() * 16;
      const off = (rnd() - 0.5) * 8;
      g.fillStyle = j % 2 ? '#8e7f62' : '#a08f6d';
      g.fillRect(x + off, yy - 9, w, 9);
      g.strokeRect(x + off, yy - 9, w, 9);
      yy -= 9;
    }
    g.fillStyle = '#7c3a2e';
    g.fillRect(x + 36, yy, 3, y - yy);
    return 92;
  }
  if (kind === 1) {
    // Inkwell with a pen.
    g.fillStyle = '#121c28';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6, y - 30);
    g.lineTo(x + 40, y - 30);
    g.lineTo(x + 46, y);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#2a4352';
    g.fillRect(x + 15, y - 40, 16, 10);
    g.fillStyle = 'rgba(121,166,157,0.5)';
    g.fillRect(x + 10, y - 26, 3, 18);
    g.strokeStyle = '#5e5240';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + 24, y - 38);
    g.lineTo(x + 52, y - 96);
    g.stroke();
    return 56;
  }
  if (kind === 2) {
    // Stacked ledgers.
    const cols = ['#3c4d5c', '#4e3b3a', '#40514a'];
    let yy = y;
    for (let j = 0; j < 3; j++) {
      const h = 14 + rnd() * 8;
      const w = 110 - j * 10;
      g.fillStyle = cols[j % 3]!;
      g.fillRect(x + j * 4, yy - h, w, h);
      g.strokeRect(x + j * 4, yy - h, w, h);
      g.fillStyle = 'rgba(201,164,87,0.35)';
      g.fillRect(x + j * 4 + 10, yy - h / 2 - 1, 30, 2);
      yy -= h;
    }
    return 110;
  }
  if (kind === 3) {
    // Desk bell on a block.
    g.fillStyle = '#2e2a2f';
    g.fillRect(x, y - 8, 54, 8);
    g.strokeRect(x, y - 8, 54, 8);
    g.fillStyle = '#6d5a35';
    g.beginPath();
    g.moveTo(x + 6, y - 8);
    g.quadraticCurveTo(x + 8, y - 38, x + 27, y - 38);
    g.quadraticCurveTo(x + 46, y - 38, x + 48, y - 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillRect(x + 25, y - 46, 4, 8);
    g.fillStyle = 'rgba(255,243,207,0.25)';
    g.fillRect(x + 14, y - 30, 4, 14);
    return 54;
  }
  if (kind === 4) {
    // Receipt spike.
    g.fillStyle = '#2e2a2f';
    g.beginPath();
    g.ellipse(x + 22, y - 3, 22, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7a7466';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 22, y - 6);
    g.lineTo(x + 22, y - 80);
    g.stroke();
    for (let j = 0; j < 5; j++) {
      g.save();
      g.translate(x + 22, y - 14 - j * 7);
      g.rotate((rnd() - 0.5) * 0.8);
      g.fillStyle = j % 2 ? '#8e7f62' : '#9c8c6c';
      g.fillRect(-18, -3, 36, 6);
      g.restore();
    }
    return 44;
  }
  // Rubber stamps in a rack.
  g.fillStyle = '#3a3036';
  g.fillRect(x, y - 12, 90, 12);
  g.strokeStyle = ink;
  g.strokeRect(x, y - 12, 90, 12);
  for (let j = 0; j < 4; j++) {
    const sx = x + 10 + j * 20;
    g.fillStyle = '#4e3b3a';
    g.fillRect(sx, y - 34, 10, 22);
    g.fillStyle = '#2e2a2f';
    g.beginPath();
    g.arc(sx + 5, y - 38, 7, 0, Math.PI * 2);
    g.fill();
  }
  return 90;
}

/** Edge falloff that holds the eye on the cart (shading, not a light). */
function paintVignette(W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
  const g = c.getContext('2d')!;
  g.scale(0.5, 0.5);
  const v = g.createRadialGradient(W * 0.45, H * 0.52, Math.min(W, H) * 0.35, W * 0.45, H * 0.52, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(6,10,16,0)');
  v.addColorStop(1, 'rgba(6,10,16,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, cam: Camera, bd: Backdrop, still: boolean): void {
  const layer = (img: HTMLCanvasElement, tileW: number, f: number, dy: number) => {
    const shift = still ? 0 : cam.cx * cam.ppm * f;
    let ox = -(((shift % tileW) + tileW) % tileW);
    const oy = Math.max(-120, Math.min(120, (cam.cy - 2) * cam.ppm * f)) + dy;
    for (; ox < cam.W; ox += tileW) ctx.drawImage(img, ox, oy, tileW, bd.H);
  };
  ctx.fillStyle = '#0d1724';
  ctx.fillRect(0, 0, cam.W, cam.H);
  layer(bd.far, bd.tileW, 0.08, -10);
  layer(bd.mid, bd.tileW, 0.25, 0);
  layer(bd.near, bd.nearW, 0.55, 0);
}

export function drawVignette(ctx: CanvasRenderingContext2D, bd: Backdrop, W: number, H: number): void {
  ctx.drawImage(bd.vignette, 0, 0, W, H);
}
