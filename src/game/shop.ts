// The Night Counter, between deliveries: two stamps, a postcard and a cart part.
// The album shows how it will fire (left to right), stamps can be moved and sold,
// and the next delivery (and its Inspector) is always in view so buying is planning.
import type { Game } from './game';
import { STAMPS, MAX_STAMPS, sellPrice, type StampDef } from '../sim/stamps';
import { PARTS } from '../sim/rules';
import { FAMILIES, FAMILY_INFO } from '../sim/tricks';
import { INSPECTORS } from '../sim/shift';
import { kindOf, targetFor, inspectorFor, KIND_NAME, priceOf, rerollCost, buyOffer, cantBuy, sellStamp, moveStamp, rollOffers, type Offer } from '../sim/night';
import { rr } from '../render/art';
import { C, BODY } from '../render/palette';
import { panel, button, text, wrapText, fmt, inside, coin, drawStamp, drawTag, drawPostcard, rarityColour, familyColour, fitSize, type Rect } from '../render/ui';
import { sfx } from '../audio/sfx';
import { routeLabel } from './hud';

type Ctx = CanvasRenderingContext2D;

const WHEN_TEXT: Record<StampDef['when'], string> = {
  trick: 'Fires as you drive: changes what tricks are worth',
  post: 'Fires when you post, in album order (left → right)',
  rule: 'Always on: bends a rule of the delivery',
  money: 'Pays pennies',
};

interface Detail {
  title: string;
  tag: string;
  tagCol: string;
  body: string;
  extra: string;
  price: number;
  i: number;
  owned?: boolean;
}

function offerSize(o: Offer, s: number): { w: number; h: number } {
  if (o.kind === 'stamp') return { w: 128 * s, h: 154 * s };
  if (o.kind === 'postcard') return { w: 170 * s, h: 154 * s };
  return { w: 220 * s, h: 120 * s };
}

export function drawShop(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  const t = g.t;
  const run = g.run;
  const portrait = W < H * 0.9;
  ctx.fillStyle = 'rgba(14,10,40,0.78)';
  ctx.fillRect(0, 0, W, H);

  // ---- header: what's next
  text(ctx, 'THE NIGHT COUNTER', W / 2, 40 * s, fitSize(ctx, 'THE NIGHT COUNTER', W - 160 * s, 44 * s), C.mustard, 'center', 8 * s);
  const kind = kindOf(run);
  const next = `Next: ${KIND_NAME[kind]} · ${routeLabel(run.route).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} · post ${fmt(targetFor(run.route, run.step))}`;
  text(ctx, next, W / 2, 74 * s, fitSize(ctx, next, W - 40 * s, 19 * s, BODY, 600), C.cream, 'center', 4 * s, BODY, 600);
  const insp = INSPECTORS[inspectorFor(run)];
  const ilabel = kind === 'inspection' ? `INSPECTOR NEXT: ${insp.name.toUpperCase()} — ${insp.text}` : `Inspector this route: ${insp.name} — ${insp.text}`;
  text(ctx, ilabel, W / 2, 98 * s, fitSize(ctx, ilabel, W - 40 * s, 16 * s, BODY, 600), kind === 'inspection' ? C.pink : 'rgba(255,159,184,0.8)', 'center', 4 * s, BODY, 600);
  // pennies
  coin(ctx, W - 120 * s, 40 * s, 16 * s);
  text(ctx, `${run.pennies}`, W - 96 * s, 42 * s, 34 * s, C.mustard, 'left', 6 * s);
  if (!portrait) {
    const interest = Math.min(5, Math.floor(run.pennies / 5));
    text(ctx, `interest next: +${interest}`, W - 30 * s, 72 * s, 14 * s, C.paper, 'right', 3 * s, BODY, 600);
  }

  // ---- offers
  const gap = 24 * s;
  const rects: Rect[] = [];
  const top = 128 * s;
  const sizes = g.offers.map((o) => offerSize(o, s));
  const rowW = sizes.reduce((a, z) => a + z.w, 0) + gap * (sizes.length - 1);
  let offersBottom = top;
  if (!portrait && rowW < W - 32 * s) {
    let x = W / 2 - rowW / 2;
    const rowH = 154 * s;
    sizes.forEach((z) => {
      rects.push({ x, y: top + (rowH - z.h) / 2, w: z.w, h: z.h });
      x += z.w + gap;
    });
    offersBottom = top + rowH + 34 * s;
  } else {
    // two rows of two
    for (let row = 0; row < 2; row++) {
      const pair = sizes.slice(row * 2, row * 2 + 2);
      const pw = pair.reduce((a, z) => a + z.w, 0) + gap * (pair.length - 1);
      let x = W / 2 - pw / 2;
      const y = top + row * (154 * s + 44 * s);
      pair.forEach((z) => {
        rects.push({ x, y: y + (154 * s - z.h) / 2, w: z.w, h: z.h });
        x += z.w + gap;
      });
    }
    offersBottom = top + 2 * (154 * s + 44 * s) - 10 * s;
  }
  let hover: Detail | null = null;
  g.offers.forEach((o, i) => {
    const r = rects[i];
    if (!r) return;
    if (o.sold) {
      text(ctx, 'SOLD', r.x + r.w / 2, r.y + r.h / 2, 30 * s, 'rgba(255,241,207,0.4)', 'center');
      return;
    }
    const sel = g.selected?.kind === 'offer' && g.selected.i === i;
    const hot = inside(r, g.input.mouse.x, g.input.mouse.y) || sel;
    const tilt = (((i * 53) % 7) / 7 - 0.5) * 0.08;
    if (o.kind === 'stamp') drawStamp(ctx, r, STAMPS[o.id], s, hot, t, tilt, { chips: true });
    else if (o.kind === 'part') drawTag(ctx, r, PARTS[o.id], s, hot, t, tilt * 0.6);
    else drawPostcard(ctx, r, o.id, run.levels[o.id], s, hot, t, tilt * 0.6);
    if (sel) {
      rr(ctx, r.x - 6 * s, r.y - 6 * s, r.w + 12 * s, r.h + 12 * s, 10 * s);
      ctx.setLineDash([8 * s, 6 * s]);
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = C.mustard;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const price = priceOf(o);
    const can = run.pennies >= price;
    coin(ctx, r.x + r.w / 2 - 14 * s, r.y + r.h + 20 * s, 12 * s);
    text(ctx, `${price}`, r.x + r.w / 2 + 2 * s, r.y + r.h + 21 * s, 24 * s, can ? C.mustard : C.fireRed, 'left', 5 * s);
    if (!g.input.touchUI) text(ctx, `${i + 1}`, r.x + 6 * s, r.y - 10 * s, 16 * s, C.paper, 'left', 4 * s);
    g.hits.push({ r, id: `offer:${i}` });
    if (inside(r, g.input.mouse.x, g.input.mouse.y)) hover = offerDetail(g, o, i);
  });

  // ---- the counter: album, trick levels, cart
  const counterY = Math.max(H * 0.69, offersBottom + 150 * s);
  ctx.fillStyle = '#7a3f2e';
  ctx.fillRect(0, counterY, W, H - counterY);
  ctx.fillStyle = '#a0583c';
  ctx.fillRect(0, counterY, W, 12 * s);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, counterY + 12 * s, W, 4 * s);
  const ay = counterY + 32 * s;
  text(ctx, `YOUR ALBUM ${run.stamps.length}/${MAX_STAMPS}  ·  fires left → right`, 24 * s, ay, 17 * s, C.cream, 'left', 4 * s);
  const slotW = 66 * s;
  const slotH = 80 * s;
  for (let i = 0; i < MAX_STAMPS; i++) {
    const r = { x: 24 * s + i * (slotW + 10 * s), y: ay + 16 * s, w: slotW, h: slotH };
    const id = run.stamps[i];
    if (i > 0) text(ctx, '›', r.x - 5 * s, r.y + slotH / 2, 18 * s, 'rgba(255,241,207,0.5)', 'center');
    if (!id) {
      rr(ctx, r.x, r.y, r.w, r.h, 6 * s);
      ctx.setLineDash([6 * s, 5 * s]);
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = 'rgba(255,241,207,0.4)';
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    const sel = g.selected?.kind === 'own' && g.selected.i === i;
    const hot = inside(r, g.input.mouse.x, g.input.mouse.y) || sel;
    drawStamp(ctx, r, STAMPS[id], s * 0.56, hot, t, i % 2 ? 0.04 : -0.04, { fire: g.fx.reduced ? 0 : g.slotFire[i] });
    if (sel) {
      rr(ctx, r.x - 4 * s, r.y - 4 * s, r.w + 8 * s, r.h + 8 * s, 8 * s);
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = C.mustard;
      ctx.stroke();
    }
    g.hits.push({ r, id: `own:${i}` });
    if (inside(r, g.input.mouse.x, g.input.mouse.y)) hover = ownDetail(g, i);
  }
  // trick levels (postcards)
  const albumRight = 24 * s + MAX_STAMPS * (slotW + 10 * s);
  const lx = portrait ? 24 * s : albumRight + 24 * s;
  const ly = portrait ? ay + slotH + 40 * s : ay;
  text(ctx, 'TRICK LEVELS', lx, ly, 17 * s, C.cream, 'left', 4 * s);
  const bw = 88 * s;
  FAMILIES.forEach((f, i) => {
    const bx = lx + (i % 4) * (bw + 6 * s);
    const by = ly + 16 * s + Math.floor(i / 4) * 28 * s;
    const lv = run.levels[f];
    rr(ctx, bx, by, bw, 24 * s, 12 * s);
    ctx.fillStyle = lv > 1 ? familyColour(f) : 'rgba(255,241,207,0.12)';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = lv > 1 ? C.ink : 'rgba(255,241,207,0.3)';
    ctx.stroke();
    const label = `${FAMILY_INFO[f].name} ${lv}`;
    text(ctx, label, bx + bw / 2, by + 12.5 * s, fitSize(ctx, label, bw - 10 * s, 15 * s), lv > 1 ? C.ink : C.paper, 'center');
  });
  const fitted = run.parts.map((p) => PARTS[p].name);
  fitted.push(`${run.glassesMax} lamp glasses`);
  const cartLine = `Cart: ${fitted.join(' · ')}`;
  const cy = ly + 16 * s + 2 * 28 * s + 16 * s;
  text(ctx, cartLine, lx, cy, fitSize(ctx, cartLine, W - lx - 24 * s, 16 * s, BODY, 600), C.paper, 'left', 0, BODY, 600);

  // ---- detail card for the hovered or selected thing
  let sel = hover as Detail | null;
  if (!sel && g.selected) {
    if (g.selected.kind === 'offer' && g.offers[g.selected.i] && !g.offers[g.selected.i].sold) sel = offerDetail(g, g.offers[g.selected.i], g.selected.i);
    else if (g.selected.kind === 'own' && run.stamps[g.selected.i]) sel = ownDetail(g, g.selected.i);
  }
  const dw = Math.min(640 * s, W - 32 * s);
  const dh = 118 * s;
  const dr = { x: W / 2 - dw / 2, y: Math.min(offersBottom + 8 * s, counterY - dh - 14 * s), w: dw, h: dh };
  if (sel) {
    panel(ctx, dr, C.paper, s, 0.004);
    const btnW = 150 * s;
    const tx = dr.x + 18 * s;
    const textW = dw - btnW - 50 * s;
    text(ctx, sel.title.toUpperCase(), tx, dr.y + 22 * s, fitSize(ctx, sel.title.toUpperCase(), textW, 24 * s), C.red);
    if (sel.tag) {
      ctx.font = `700 ${Math.round(13 * s)}px "Barlow Condensed", sans-serif`;
      const tw = Math.min(textW, ctx.measureText(sel.tag).width + 16 * s);
      rr(ctx, tx, dr.y + 36 * s, tw, 18 * s, 9 * s);
      ctx.fillStyle = sel.tagCol;
      ctx.fill();
      text(ctx, sel.tag, tx + 8 * s, dr.y + 45.5 * s, fitSize(ctx, sel.tag, tw - 12 * s, 13 * s), C.cream);
    }
    const yAfter = wrapText(ctx, sel.body, tx, dr.y + 62 * s, textW, 17 * s, C.ink);
    if (sel.extra) wrapText(ctx, sel.extra, tx, Math.max(yAfter, dr.y + 84 * s), textW, 14 * s, C.inkSoft);
    const br = { x: dr.x + dw - btnW - 16 * s, y: dr.y + 16 * s, w: btnW, h: 48 * s };
    if (sel.owned) {
      button(ctx, br, `SELL +${sel.price}`, s, inside(br, g.input.mouse.x, g.input.mouse.y), C.blue);
      g.hits.push({ r: br, id: `sell:${sel.i}` });
      const half = (btnW - 8 * s) / 2;
      const lr = { x: br.x, y: br.y + 56 * s, w: half, h: 40 * s };
      const rr2 = { x: br.x + half + 8 * s, y: br.y + 56 * s, w: half, h: 40 * s };
      button(ctx, lr, '◀', s, inside(lr, g.input.mouse.x, g.input.mouse.y), C.teal, sel.i > 0);
      button(ctx, rr2, '▶', s, inside(rr2, g.input.mouse.x, g.input.mouse.y), C.teal, sel.i < run.stamps.length - 1);
      g.hits.push({ r: lr, id: `left:${sel.i}` }, { r: rr2, id: `right:${sel.i}` });
    } else {
      const o = g.offers[sel.i];
      const why = cantBuy(run, o);
      const label = why === 'Album full: sell a stamp first' ? 'ALBUM FULL' : `BUY ${sel.price}`;
      button(ctx, br, label, s, inside(br, g.input.mouse.x, g.input.mouse.y), C.green, !why);
      g.hits.push({ r: br, id: `buy:${sel.i}` });
      if (why && why !== 'Sold') text(ctx, why, br.x + btnW / 2, br.y + 66 * s, fitSize(ctx, why, btnW + 20 * s, 13 * s, BODY, 600), C.redDark, 'center', 0, BODY, 600);
    }
  } else {
    const msg = g.input.touchUI ? 'Tap something to read it, tap again to buy.' : 'Click something to read it, click again to buy (or press 1–4).';
    text(ctx, msg, W / 2, dr.y + 50 * s, fitSize(ctx, msg, W - 40 * s, 19 * s, BODY, 600), C.paper, 'center', 4 * s, BODY, 600);
  }

  // ---- reroll and next
  const bh = 54 * s;
  const nw = 210 * s;
  const rw = 190 * s;
  const by = H - bh - 18 * s;
  const nr = { x: W - nw - 20 * s, y: by, w: nw, h: bh };
  const rr3 = { x: nr.x - rw - 14 * s, y: by, w: rw, h: bh };
  const canR = run.pennies >= rerollCost(g.rerolls);
  button(ctx, rr3, `REROLL ${rerollCost(g.rerolls)}`, s, inside(rr3, g.input.mouse.x, g.input.mouse.y), C.blue, canR, g.input.touchUI ? '' : 'R');
  g.hits.push({ r: rr3, id: 'reroll' });
  const nextLabel = kind === 'inspection' ? 'FACE INSPECTOR' : 'NEXT DELIVERY';
  button(ctx, nr, nextLabel, s, inside(nr, g.input.mouse.x, g.input.mouse.y), kind === 'inspection' ? C.pink : C.red, true, g.input.touchUI ? '' : '⏎');
  g.hits.push({ r: nr, id: 'next' });
}

function offerDetail(g: Game, o: Offer, i: number): Detail {
  const price = priceOf(o);
  if (o.kind === 'stamp') {
    const d = STAMPS[o.id];
    return { title: d.name, tag: `${d.rarity.toUpperCase()} STAMP`, tagCol: rarityColour(d.rarity), body: d.text, extra: WHEN_TEXT[d.when], price, i };
  }
  if (o.kind === 'postcard') {
    const f = FAMILY_INFO[o.id];
    const lv = g.run.levels[o.id];
    return {
      title: f.postcard,
      tag: `POSTCARD · ${f.name.toUpperCase()} ${lv} → ${lv + 1}`,
      tagCol: familyColour(o.id),
      body: `${f.name} earn +50% heat, and +1 extra spark whenever they give sparks.`,
      extra: 'Levels stack for the whole night.',
      price,
      i,
    };
  }
  const d = PARTS[o.id];
  const replacing = g.run.parts.find((p) => PARTS[p].slot === d.slot && p !== d.id);
  return { title: d.name, tag: `CART PART · ${d.slot.toUpperCase()}`, tagCol: C.redDark, body: d.text, extra: replacing ? `Replaces your ${PARTS[replacing].name}.` : '', price, i };
}

function ownDetail(g: Game, i: number): Detail {
  const d = STAMPS[g.run.stamps[i]];
  return { title: d.name, tag: `${d.rarity.toUpperCase()} · SLOT ${i + 1}`, tagCol: rarityColour(d.rarity), body: d.text, extra: WHEN_TEXT[d.when], price: sellPrice(d.id), i, owned: true };
}

export function shopHit(g: Game, id: string): void {
  const run = g.run;
  if (id === 'next') return g.leaveShop();
  if (id === 'reroll') return reroll(g);
  const [verb, n] = id.split(':');
  const i = Number(n);
  switch (verb) {
    case 'offer':
      if (g.selected?.kind === 'offer' && g.selected.i === i) buy(g, i);
      else g.selected = { kind: 'offer', i };
      return;
    case 'buy':
      return buy(g, i);
    case 'own':
      g.selected = g.selected?.kind === 'own' && g.selected.i === i ? null : { kind: 'own', i };
      return;
    case 'sell': {
      const p = sellStamp(run, i);
      if (p > 0) {
        sfx.coin(1);
        g.selected = null;
        g.slotFire = [0, 0, 0, 0, 0];
      }
      return;
    }
    case 'left':
    case 'right': {
      const dir = verb === 'left' ? -1 : 1;
      if (moveStamp(run, i, dir)) {
        g.selected = { kind: 'own', i: i + dir };
        g.slotFire[i + dir] = 0.6;
        sfx.stamp();
      } else sfx.deny();
      return;
    }
  }
}

function reroll(g: Game): void {
  const cost = rerollCost(g.rerolls);
  if (g.run.pennies < cost) return sfx.deny();
  g.run.pennies -= cost;
  g.rerolls++;
  g.offers = rollOffers(g.run, g.rerolls);
  g.selected = null;
  sfx.coin(0);
}

function buy(g: Game, i: number): void {
  const o = g.offers[i];
  if (!o || o.sold) return;
  if (!buyOffer(g.run, o)) {
    sfx.deny();
    g.fx.kick(3);
    return;
  }
  g.selected = null;
  sfx.coin(3);
  sfx.stamp();
  if (o.kind === 'stamp') {
    g.slotFire[g.run.stamps.length - 1] = 1;
  }
}

export function shopKey(g: Game, k: string): void {
  if (k === 'enter') return g.leaveShop();
  if (k === 'r') return reroll(g);
  const n = Number(k);
  if (n >= 1 && n <= g.offers.length) {
    if (g.selected?.kind === 'offer' && g.selected.i === n - 1) buy(g, n - 1);
    else g.selected = { kind: 'offer', i: n - 1 };
  }
}

