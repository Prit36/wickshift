// Acceptance checks for the production build, driven through the real page.
//   npm run build && npm run preview      (serves dist/ on :4173)
//   node tools/accept.mjs                 (BASE defaults to the preview server)
// Prints PASS/FAIL lines and the measured numbers the verification report cites.
import { chromium } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';

process.env.BASE ??= 'http://localhost:4173/';
const { pageUrl } = await import('./url.mjs');
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const results = [];
const notes = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
const note = (s) => notes.push(s);
const only = process.env.ONLY?.split(',');
const want = (k) => !only || only.includes(k);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

/** A page with third-party requests aborted and errors collected. */
async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 1, hasTouch: !!opts.touch });
  const page = await ctx.newPage();
  const errors = [];
  const blocked = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    blocked.push(u.href);
    return route.abort();
  });
  if (opts.init) await page.addInitScript(opts.init);
  const g = (fn, arg) => page.evaluate(`(() => { const g = window.__wickshift; const A = window.__wickaudio; return (${fn})(g, ${JSON.stringify(arg ?? null)}); })()`);
  return { ctx, page, errors, blocked, g };
}
const fresh = async (page, query = '') => {
  await page.goto(pageUrl(query));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 2);
};
const waitFor = async (page, js, timeout = 30000) => page.waitForFunction(js, null, { timeout, polling: 50 });

// ------------------------------------------------------------ 1. cold launch
if (want('launch')) {
  const { ctx, page, errors, blocked, g } = await open({ width: 1366, height: 768 });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; requests++; });
  await page.goto(pageUrl());
  await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 0 && window.__wickshift.mode === 'bench');
  const ready = await page.evaluate(() => performance.now());
  await page.waitForTimeout(500);
  check('cold load reaches an input-ready bench', ready < 3000, `${ready.toFixed(0)} ms after navigation start, ${requests} requests, ${(bytes / 1024).toFixed(0)} KiB transferred, cache disabled`);
  check('no third-party requests', blocked.length === 0, blocked.join(' ') || 'none attempted');
  check('no console errors or failed requests on load', errors.length === 0, errors.join(' | '));
  // The test handle ships only behind ?dev.
  const plain = await browser.newPage();
  await plain.goto(new URL('/', process.env.BASE).toString());
  await plain.waitForTimeout(800);
  check('production page exposes no test handle without ?dev', await plain.evaluate(() => window.__wickshift === undefined));
  await plain.close();
  // First useful click picks up a wheel.
  const rec = await g((g) => { const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r; return [(r.x + r.w / 2) * g.L.s, (r.y + r.h / 2) * g.L.s]; });
  await page.mouse.click(rec[0], rec[1]);
  check('first click on the drawer picks up the key wheel', (await g((g) => g.sel?.kind)) === 'keyWheel');
  await ctx.close();
}

// ------------------------------------------------------------ 2. keyboard-only job
if (want('keyboard')) {
  const { ctx, page, errors, g } = await open({ width: 1366, height: 768 });
  await fresh(page);
  const focused = () => page.evaluate(() => document.activeElement?.dataset?.id ?? null);
  const tabTo = async (pred, max = 40) => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      const f = await focused();
      if (f && pred(f)) return f;
    }
    return null;
  };
  const tray = await tabTo((f) => f === 'tray:keyWheel');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const sock = await focused();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const fitted = await g((g) => g.ws.bp.placements.length);
  const lever = await tabTo((f) => f === 'lever');
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const mode = await g((g) => g.mode);
  await page.keyboard.down('Space');
  let outcome = 'timeout';
  try {
    await waitFor(page, () => window.__wickshift.sim?.outcome !== 'running', 40000);
    outcome = await g((g) => g.sim.outcome);
  } catch { /* timeout */ }
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  const fNext = await focused();
  check('keyboard alone: Tab to the key wheel, Enter, Enter on a socket, Tab to the lever, Enter, hold Space', !!tray && sock?.startsWith('socket:') && fitted === 2 && !!lever && mode === 'run' && outcome === 'delivered',
    `focus ${tray} → ${sock}; fitted ${fitted}; ${mode}; ${outcome} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  check('after delivery, focus lands on Next window', fNext === 'act:next', String(fNext));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Enter on Next window opens Ruler Rise', (await g((g) => g.route.id)) === 'ruler-rise');
  check('no errors in the keyboard run', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ 3. pointer: DPR, zoom, outside release, cancel
if (want('pointer')) {
  // Browser zoom at 125% on a 1366×768 window is a 1093×614 CSS viewport at pixel ratio 1.25.
  for (const [label, vp, dpr] of [['DPR 1', { width: 1366, height: 768 }, 1], ['DPR 2', { width: 1366, height: 768 }, 2], ['125% zoom', { width: 1093, height: 614 }, 1.25]]) {
    const { ctx, page, g } = await open(vp, { dpr });
    await fresh(page);
    const rec = await g((g) => { const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r; return [(r.x + r.w / 2) * g.L.s, (r.y + r.h / 2) * g.L.s]; });
    await page.mouse.click(rec[0], rec[1]);
    const t = await g((g) => { const t = g.computeTargets('keyWheel', undefined, undefined).filter((t) => t.res.ok).pop(); return { x: g.cam.sx(t.x) * g.L.s, y: g.cam.sy(t.y) * g.L.s, socket: t.ref.socket }; });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(100);
    const kw = await g((g) => g.ws.bp.placements.find((p) => p.kind === 'keyWheel'));
    const buf = await g((g) => [g.canvas.width, g.canvas.height, g.canvas.clientWidth, g.canvas.clientHeight, devicePixelRatio]);
    check(`${label}: click the recess, then socket ${t.socket}, fits there`, kw?.socket === t.socket, `backing ${buf[0]}×${buf[1]} for ${buf[2]}×${buf[3]} CSS at ratio ${buf[4]}`);
    await ctx.close();
  }
  const { ctx, page, g } = await open({ width: 1366, height: 768 });
  await fresh(page);
  const state = () => g((g) => JSON.stringify({ bp: g.ws.bp, stock: g.ws.stock(), drag: !!g.drag }));
  const before = await state();
  const rec = await g((g) => { const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r; return [(r.x + r.w / 2) * g.L.s, (r.y + r.h / 2) * g.L.s]; });
  // Release outside the canvas (pointer captured by the canvas).
  await page.mouse.move(rec[0], rec[1]);
  await page.mouse.down();
  await page.mouse.move(rec[0] + 60, rec[1] - 200, { steps: 6 });
  await page.mouse.move(1366 + 40, 100, { steps: 6 });
  const active = await g((g) => !!g.drag?.active);
  await page.mouse.up();
  await page.waitForTimeout(100);
  check('drag released outside the canvas returns the wheel, stock unchanged', active && (await state()) === before);
  // pointercancel mid-drag.
  await page.mouse.move(rec[0], rec[1]);
  await page.mouse.down();
  await page.mouse.move(rec[0] + 80, rec[1] - 220, { steps: 8 });
  const active2 = await g((g) => !!g.drag?.active);
  await page.evaluate(() => document.getElementById('game').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true })));
  await page.mouse.up();
  await page.waitForTimeout(100);
  check('pointercancel mid-drag abandons it, stock unchanged', active2 && (await state()) === before);
  await ctx.close();
}

// ------------------------------------------------------------ 3b. moved wheel: hollow mark, cancel, peek
if (want('com')) {
  const { ctx, page, g } = await open({ width: 1366, height: 768 });
  await fresh(page);
  await g((g) => { g.selectTray('keyWheel'); g.placeSelection({ parent: 'chassis', socket: 0 }); });
  await page.waitForTimeout(150);
  const orig = await g((g) => ({ cx: g.com.cx, bp: JSON.stringify(g.ws.bp), stock: JSON.stringify(g.ws.stock()) }));
  const wheelAt = await g((g) => { const p = g.benchFrame().parts.find((p) => p.kind === 'keyWheel'); return [g.cam.sx(p.pose.x) * g.L.s, g.cam.sy(p.pose.y) * g.L.s]; });
  const s1 = await g((g) => { const t = g.computeTargets('keyWheel', 'keyWheel-1').find((t) => t.ref.socket === 1 && t.ref.parent === 'chassis'); return [g.cam.sx(t.x) * g.L.s, g.cam.sy(t.y) * g.L.s]; });
  const dragTo = async () => {
    await page.mouse.move(wheelAt[0], wheelAt[1]);
    await page.mouse.down();
    await page.mouse.move(wheelAt[0] + 10, wheelAt[1] - 30, { steps: 4 });
    await page.mouse.move(s1[0], s1[1], { steps: 10 });
    await page.waitForTimeout(50);
    return g((g) => g.proposedCom?.cx ?? null);
  };
  const hollow = await dragTo();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(100);
  const cancelled = await g((g) => ({ cx: g.com.cx, hollow: g.proposedCom, bp: JSON.stringify(g.ws.bp), stock: JSON.stringify(g.ws.stock()) }));
  check('moving a fitted wheel shows a hollow mark at a new centre; Escape cancels and keeps the original mark and stock', hollow !== null && Math.abs(hollow - orig.cx) > 0.01 && cancelled.hollow === null && cancelled.cx === orig.cx && cancelled.bp === orig.bp && cancelled.stock === orig.stock, `solid ${orig.cx.toFixed(4)} m, hollow ${hollow?.toFixed(4)} m`);
  const hollow2 = await dragTo();
  await page.mouse.up();
  await page.waitForTimeout(100);
  const fitted = await g((g) => ({ cx: g.com.cx, socket: g.ws.bp.placements.find((p) => p.kind === 'keyWheel').socket }));
  // Resize, then dispatch: the moved wheel's drawn hub, the bench frame and the simulation agree.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  const benchSide = await g((g) => {
    const f = g.benchFrame();
    const kw = f.parts.find((p) => p.kind === 'keyWheel');
    return { hub: [kw.pose.x, kw.pose.y], others: f.parts.filter((p) => p.kind === 'keyWheel').length, cam: [g.cam.cx, g.cam.cy, g.cam.ppm], chassis: [g.pose.x, g.pose.y, g.pose.a], screen: [g.cam.sx(kw.pose.x) * g.L.s, g.cam.sy(kw.pose.y) * g.L.s] };
  });
  await g((g) => g.dispatch());
  const runSide = await g((g) => {
    const w = g.sim.rig.wheels.find((w) => w.driven).body.getPosition();
    const c = g.sim.chassisPose();
    return { hub: [w.x, w.y], cam: [g.cam.cx, g.cam.cy, g.cam.ppm], chassis: [c.x, c.y, c.a], drawerOut: g.mode === 'run' };
  });
  const d = Math.hypot(benchSide.hub[0] - runSide.hub[0], benchSide.hub[1] - runSide.hub[1]);
  check('after a resize the moved wheel is drawn once, and its hub agrees with the simulated axle', benchSide.others === 1 && d < 0.002, `hub offset ${(d * 1000).toFixed(2)} mm at 1280×720 (${(d * benchSide.cam[2]).toFixed(2)} logical px)`);
  check('dispatch keeps the cart where it stood under the same camera', runSide.drawerOut && Math.hypot(benchSide.chassis[0] - runSide.chassis[0], benchSide.chassis[1] - runSide.chassis[1]) < 0.002 && benchSide.cam.every((v, i) => Math.abs(v - runSide.cam[i]) < 1e-6), `chassis moved ${(Math.hypot(benchSide.chassis[0] - runSide.chassis[0], benchSide.chassis[1] - runSide.chassis[1]) * 1000).toFixed(2)} mm; camera unchanged`);
  await g((g) => g.backToBench());
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(200);
  check('fitting it there turns the hollow mark solid at the same place', fitted.socket === 1 && Math.abs(fitted.cx - hollow2) < 1e-9, `${hollow2?.toFixed(4)} → ${fitted.cx.toFixed(4)} m`);
  // Peek: hold V with a part selected, release, same camera and selection.
  await g((g) => g.selectMounted('reel-1'));
  const before = await g((g) => JSON.stringify({ cx: g.cam.cx, cy: g.cam.cy, ppm: g.cam.ppm, sel: g.sel }));
  const selKind = await g((g) => g.sel?.kind ?? null);
  await page.keyboard.down('KeyV');
  await page.waitForTimeout(900);
  const during = await g((g) => ({ cx: g.cam.cx, peek: g.peek }));
  await page.keyboard.up('KeyV');
  await page.waitForTimeout(1200);
  const after = await g((g) => JSON.stringify({ cx: g.cam.cx, cy: g.cam.cy, ppm: g.cam.ppm, sel: g.sel }));
  check('hold V looks ahead; release restores the exact bench camera and selection', selKind === 'reel' && during.peek && during.cx > JSON.parse(before).cx + 1 && after === before, `sel ${selKind}; ${before} → ${during.cx.toFixed(2)} → ${after}`);
  await ctx.close();
}

// ------------------------------------------------------------ 3c. slop rows 5 and 6
if (want('slop')) {
  const { ctx, page, g, errors } = await open({ width: 1366, height: 768 });
  await fresh(page);
  // Log every sound the game asks for, with the time it asked.
  await page.evaluate(() => {
    window.__sounds = [];
    const A = window.__wickaudio;
    for (const k of ['pickup', 'fit', 'reject', 'stow', 'uiClick', 'latch', 'ticking', 'slide', 'endStop', 'ink', 'creak', 'rustle', 'strike', 'crack', 'puff', 'deliver']) {
      const f = A[k].bind(A);
      A[k] = (...a) => { window.__sounds.push([k, performance.now()]); return f(...a); };
    }
  });
  const rec = await g((g) => { const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r; return [(r.x + r.w / 2) * g.L.s, (r.y + r.h / 2) * g.L.s]; });
  const at = (ok, socket) => g((g, a) => { const t = g.computeTargets('keyWheel', g.ws.bp.placements.find((p) => p.kind === 'keyWheel')?.id).find((t) => t.res.ok === a[0] && (a[1] === null || t.ref.socket === a[1])); return [g.cam.sx(t.x) * g.L.s, g.cam.sy(t.y) * g.L.s]; }, [ok, socket]);
  const drag = async (from, to) => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(from[0] + 15, from[1] - 30, { steps: 4 });
    await page.mouse.move(to[0], to[1], { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const count = (k) => page.evaluate((k) => window.__sounds.filter((x) => x[0] === k).length, k);
  // Row 5: one rejection, one fit, then retry while the clamp is still opening.
  await drag(rec, await at(false, null));
  const afterReject = { reject: await count('reject'), fit: await count('fit'), n: await g((g) => g.ws.bp.placements.length) };
  await drag(rec, await at(true, 0));
  const afterFit = { reject: await count('reject'), fit: await count('fit'), n: await g((g) => g.ws.bp.placements.length) };
  await g((g) => g.dispatch());
  await page.keyboard.down('Space');
  await page.waitForTimeout(60);
  await page.keyboard.press('KeyR');
  await page.keyboard.up('Space');
  const tR = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1500);
  const late = await page.evaluate((t) => window.__sounds.filter((x) => x[1] > t).map((x) => x[0]), tR);
  const quiet = await g((g) => ({ mode: g.mode, result: g.result, fx: g.fx.length, sim: g.sim, voices: window.__wickaudio.activeVoices(true), chalk: g.chalk, stripe: g.stripePart }));
  check('slop row 5: an invalid drop rejects once, the correct drop fits once', afterReject.reject === 1 && afterReject.fit === 0 && afterReject.n === 1 && afterFit.reject === 1 && afterFit.fit === 1 && afterFit.n === 2, `reject ${afterFit.reject}, fit ${afterFit.fit}`);
  check('slop row 5: R while the clamp opens leaves no late sound, voice or overlay from that run', quiet.mode === 'bench' && quiet.result === null && quiet.fx === 0 && quiet.sim === null && quiet.voices === 0 && late.every((k) => ['uiClick', 'stow'].includes(k)), `sounds after R: ${late.join(',') || 'none'}; run voices ${quiet.voices}`);
  // Row 6: stock, its accessible label and the painted recess agree after every step.
  const look = () => g((g) => {
    const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r;
    const s = g.L.s * (g.canvas.width / g.canvas.clientWidth);
    const img = g.canvas.getContext('2d').getImageData(Math.round(r.x * s), Math.round(r.y * s), Math.round(r.w * s), Math.round(r.h * s)).data;
    let red = 0;
    for (let i = 0; i < img.length; i += 4) if (img[i] > 170 && img[i + 1] < 120 && img[i + 2] < 100) red++;
    const label = document.querySelector('.a11y-layer button[data-id="tray:keyWheel"]')?.getAttribute('aria-label') ?? '';
    const placed = g.ws.bp.placements.filter((p) => p.kind === 'keyWheel').length;
    return { stock: g.ws.stock().keyWheel, placed, label: Number((label.match(/(\d+) in the drawer/) ?? [])[1]), painted: red > 40 };
  });
  const steps = [];
  const record = async (name) => { await page.waitForTimeout(120); const l = await look(); steps.push({ name, ...l, ok: l.stock === 1 - l.placed && l.label === l.stock && l.painted === (l.stock > 0) }); };
  await record('fitted');
  const wheel = async () => g((g) => { const p = g.benchFrame().parts.find((p) => p.kind === 'keyWheel'); return [g.cam.sx(p.pose.x) * g.L.s, g.cam.sy(p.pose.y) * g.L.s]; });
  await drag(await wheel(), await at(true, 1));
  await record('moved');
  await g((g) => g.selectMounted(g.ws.bp.placements.find((p) => p.kind === 'keyWheel').id));
  await page.keyboard.press('Delete');
  await record('removed');
  await page.keyboard.press('Control+KeyZ');
  await record('undone');
  await g((g) => g.dispatch());
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyR');
  await record('relaunched and back');
  check('slop row 6: stock, its drawer label and the painted recess agree after fit, move, remove, undo and relaunch', steps.every((x) => x.ok), steps.map((x) => `${x.name}: stock ${x.stock}, label ${x.label}, painted ${x.painted}`).join('; '));
  check('no errors in the slop rows', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ 3d. one shift, played through
if (want('shift')) {
  const { ctx, page, g, errors } = await open({ width: 1366, height: 768 });
  await fresh(page);
  const reload = async () => { await page.reload(); await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 2); await page.waitForTimeout(200); };
  // Pause slip: Mute all and Reduced motion, by their own controls; they must survive a reload.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.a11y-layer button[data-id="pause:mute"]', { force: true });
  await page.click('.a11y-layer button[data-id="pause:motion"]', { force: true });
  await page.keyboard.press('Escape');
  await reload();
  const settings = await g((g) => g.save.data.settings);
  check('Mute all and Reduced motion set on the pause slip survive a reload', settings.muted === true && settings.reducedMotion === true, JSON.stringify(settings));
  const jobs = [
    { id: 'envelope-lip', keys: ['Space'], prep: async () => { await g((g) => { g.selectTray('keyWheel'); g.placeSelection({ parent: 'chassis', socket: 0 }); }); } },
    { id: 'ruler-rise', keys: ['Space', 'KeyD'] },
    { id: 'blotter-drop', keys: ['Space'] },
    { id: 'night-counter', keys: ['Space'] },
  ];
  const log = [];
  let ok = true;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const here = await g((g) => ({ route: g.route.id, mode: g.mode, nextOpen: g.save.isUnlocked(g.route.index + 1) }));
    if (j.prep) await j.prep();
    await page.keyboard.press('Tab'); // keyboard device, so focus follows the result
    await g((g) => g.dispatch());
    for (const k of j.keys) await page.keyboard.down(k);
    await waitFor(page, () => window.__wickshift.sim?.outcome !== 'running', 40000).catch(() => {});
    for (const k of j.keys) await page.keyboard.up(k);
    const res = await g((g) => ({ out: g.sim?.outcome, cracks: g.sim?.cracks, ticks: g.sim?.tick, mark: g.result?.mark, nextOpen: g.save.isUnlocked(g.route.index + 1) }));
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); // Next window
    await page.waitForTimeout(400);
    const after = await g((g) => ({ mode: g.mode, route: g.route.id, finale: g.routesUi.finale }));
    const lastJob = i === jobs.length - 1;
    const stepOk = here.route === j.id && here.mode === 'bench' && (lastJob || !here.nextOpen) && res.out === 'delivered' && (lastJob || res.nextOpen) && (lastJob ? after.mode === 'routes' && after.finale : after.route === jobs[i + 1].id);
    ok &&= stepOk;
    log.push(`${j.id}: next locked before ${!here.nextOpen || lastJob}, ${res.out} in ${(res.ticks / 60).toFixed(1)} s, cracks ${res.cracks}, mark ${res.mark}; then ${lastJob ? (after.finale ? 'finale' : after.mode) : after.route}`);
    if (!lastJob) await reload();
  }
  await reload();
  const end = await g((g) => ({ delivered: Object.values(g.save.data.delivered).filter(Boolean).length, settings: g.save.data.settings }));
  check('one shift from a cleared save: each job delivered in turn, the next window opens only after it, reloads between jobs, finale after the fourth', ok && end.delivered === 4 && end.settings.muted && end.settings.reducedMotion, log.join(' | '));
  check('no errors in the played shift', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ 4. blur during throttle
if (want('blur')) {
  const { ctx, page, g } = await open({ width: 1366, height: 768 });
  await fresh(page);
  await g((g) => { g.selectTray('keyWheel'); const t = g.computeTargets('keyWheel').find((t) => t.res.ok); g.placeSelection(t.ref); g.dispatch(); });
  await page.keyboard.down('Space');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space'); // the key-up lands while the window has no focus in real life; here it is harmless
  const s = await g((g) => ({ paused: g.paused, keys: g.keys.size, w: g.sim.wind }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const w2 = await g((g) => g.sim.wind);
  check('window blur during throttle pauses and clears held keys; drive does not resume by itself', s.paused && s.keys === 0 && w2 === s.w, `paused ${s.paused}, held ${s.keys}, wind ${s.w.toFixed(3)} → ${w2.toFixed(3)}`);
  await ctx.close();
}

// ------------------------------------------------------------ 5. Blue post, refresh during stamp, corrupt save
if (want('blue')) {
  const { ctx, page, g, errors } = await open({ width: 1366, height: 768 });
  await fresh(page);
  // Unlock the night shift's last window the way a save would after three deliveries.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wickshift.save') ?? 'null');
    const g = window.__wickshift;
    g.save.data.delivered['envelope-lip'] = g.save.data.delivered['ruler-rise'] = g.save.data.delivered['blotter-drop'] = true;
    g.save.flush();
    return s;
  });
  await g((g) => g.openRoute(3));
  // Build the long rig with player actions: remove the runner, fit a spar at the nose, the reel on its tip.
  await g((g) => { const r = g.ws.bp.placements.find((p) => p.kind === 'runner'); g.selectMounted(r.id); });
  await page.keyboard.press('Delete');
  await g((g) => g.selectTray('spar'));
  await page.keyboard.press('KeyE'); // spar rot 1 → 0, pointing out of the nose
  await g((g) => g.placeSelection({ parent: 'chassis', socket: 4 }));
  await g((g) => { g.selectTray('reel'); const sp = g.ws.bp.placements.find((p) => p.kind === 'spar'); g.placeSelection({ parent: sp.id, socket: 0 }); });
  const bp = await g((g) => g.ws.bp.placements.map((p) => `${p.kind}@${p.parent === 'chassis' ? '' : 'spar:'}${p.socket}r${p.rot}`).join(' '));
  // Run 1: ink the roller, then retry before delivering.
  await g((g) => g.dispatch());
  await page.keyboard.down('Space');
  await waitFor(page, () => window.__wickshift.stripePart !== null || window.__wickshift.sim?.outcome !== 'running', 20000);
  await page.keyboard.up('Space');
  const inked = await g((g) => ({ stripe: g.stripePart, out: g.sim.outcome }));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  const after1 = await g((g) => ({ mark: !!g.save.data.marks['night-counter'], stripe: g.stripePart, mode: g.mode, stored: JSON.parse(localStorage.getItem('wickshift.save')).marks['night-counter'] ?? false }));
  check('Night Counter: inking the roller then retrying commits no Blue post and washes the stripe', inked.stripe === 'reel-1' && inked.out === 'running' && !after1.mark && !after1.stored && after1.stripe === null && after1.mode === 'bench', `build ${bp}; stripe on ${inked.stripe}`);
  // Run 2: ink it and deliver.
  await g((g) => g.dispatch());
  await page.keyboard.down('Space');
  await waitFor(page, () => window.__wickshift.sim?.outcome !== 'running', 30000);
  await page.keyboard.up('Space');
  const run2 = await g((g) => ({ out: g.sim.outcome, stripe: g.stripePart, mark: !!g.save.data.marks['night-counter'] }));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wickshift.save')));
  check('touching the roller and delivering commits Blue post (stored before the stamp)', run2.out === 'delivered' && run2.mark && stored.marks['night-counter'] === true && stored.delivered['night-counter'] === true);
  // Refresh during the stamp.
  await page.reload();
  await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 2);
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('wickshift.save')));
  const g2 = await g((g) => ({ mode: g.mode, route: g.route.id, delivered: Object.keys(g.save.data.delivered).filter((k) => g.save.data.delivered[k]).length, marks: Object.keys(g.save.data.marks).filter((k) => g.save.data.marks[k]).join(','), keys: g.keys.size, latched: g.driveLatched }));
  check('refresh during the stamp: progress kept once, no stuck keys', g2.delivered === 4 && g2.marks === 'night-counter' && reloaded.marks['night-counter'] === true && g2.keys === 0 && !g2.latched && g2.mode === 'bench', JSON.stringify(g2));
  // One invalid blueprint, written just before the next boot (the open page flushes its own save as it unloads).
  const corrupt = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wickshift.save'));
    s.builds['night-counter'] = { placements: [{ id: 'x', kind: 'keyWheel', parent: 'nowhere', socket: 99, rot: 7 }] };
    s.builds['envelope-lip'] = { placements: [{ id: 'reel-1', kind: 'reel', parent: 'chassis', socket: 4, rot: 0 }, { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 1, rot: 0 }] };
    return JSON.stringify(s);
  });
  await page.addInitScript((payload) => {
    if (!sessionStorage.getItem('__corrupt')) {
      sessionStorage.setItem('__corrupt', '1');
      localStorage.setItem('wickshift.save', payload);
    }
  }, corrupt);
  await page.reload();
  await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 2);
  const rep = await g((g) => ({ nc: JSON.stringify(g.save.data.builds['night-counter']) ?? 'undefined', el: g.save.data.builds['envelope-lip']?.placements.find((p) => p.kind === 'keyWheel')?.socket, marks: g.save.data.marks['night-counter'], delivered: Object.values(g.save.data.delivered).filter(Boolean).length }));
  const starter = await g((g) => JSON.stringify(g.route.id === 'night-counter' ? g.route.starter : null));
  check('a save with one invalid blueprint restores that route\'s starter; its mark and the other routes survive', !rep.nc.includes('nowhere') && rep.el === 1 && rep.marks === true && rep.delivered === 4, `night-counter build ${rep.nc === 'undefined' ? 'dropped (starter on open)' : rep.nc.length > 80 ? 'repaired' : rep.nc}; envelope key wheel socket ${rep.el}; starter shown ${starter !== 'null'}`);
  check('no errors in the Blue post and save run', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ 6. twenty dispatch/rebuild cycles
if (want('cycles')) {
  const init = () => {
    // Listeners on the long-lived targets (window, document, the canvas). Buttons the
    // painted UI drops are garbage with their listeners, so they are counted as nodes.
    window.__listeners = 0;
    const add = EventTarget.prototype.addEventListener;
    const rem = EventTarget.prototype.removeEventListener;
    const lasting = (t) => t === window || t === document || t instanceof HTMLCanvasElement;
    EventTarget.prototype.addEventListener = function (...a) { if (lasting(this)) window.__listeners++; return add.apply(this, a); };
    EventTarget.prototype.removeEventListener = function (...a) { if (lasting(this)) window.__listeners--; return rem.apply(this, a); };
    window.__raf = 0;
    const tick = () => { window.__raf++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  const { ctx, page, g, errors } = await open({ width: 1366, height: 768 }, { init });
  await fresh(page);
  await g((g) => { g.selectTray('keyWheel'); const t = g.computeTargets('keyWheel').find((t) => t.res.ok); g.placeSelection(t.ref); });
  await page.waitForTimeout(200);
  const benchListeners = await page.evaluate(() => window.__listeners);
  const benchButtons = await g((g) => g.a11y.count());
  const benchIds = await page.evaluate(() => [...document.querySelectorAll('.a11y-layer button')].map((b) => b.dataset.id).join(','));
  const times = [];
  const bodies = [];
  for (let i = 0; i < 20; i++) {
    await g((g) => g.dispatch());
    bodies.push(await g((g) => g.sim.bodyCount()));
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await page.keyboard.up('Space');
    const t = await page.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r' }));
      const g = window.__wickshift;
      const f0 = g.frameCount;
      const poll = () => (g.mode === 'bench' && g.frameCount > f0 ? res(performance.now() - t0) : requestAnimationFrame(poll));
      poll();
    }));
    times.push(t);
  }
  await page.waitForTimeout(1500);
  const end = await g((g, _) => ({ sim: g.sim, voices: A.activeVoices(true), allVoices: A.activeVoices(), loops: g.loops, mode: g.mode, listeners: window.__listeners, buttons: g.a11y.count() }));
  const rate = await page.evaluate(() => new Promise((res) => {
    const g = window.__wickshift;
    const f0 = g.frameCount; const r0 = window.__raf;
    setTimeout(() => res({ frames: g.frameCount - f0, raf: window.__raf - r0 }), 1000);
  }));
  check('20 dispatch/rebuild cycles: p95 retry-to-editable-frame under 500 ms', pct(times, 95) < 500, `median ${pct(times, 50).toFixed(0)} ms, p95 ${pct(times, 95).toFixed(0)} ms, max ${Math.max(...times).toFixed(0)} ms`);
  check('every run builds the same number of bodies; none survive the rebuild', new Set(bodies).size === 1 && end.sim === null, `${bodies[0]} bodies per run`);
  check('one frame loop remains (game frames per page frame = 1)', end.loops === 1 && Math.abs(rate.frames - rate.raf) <= 1, `${rate.frames} game frames / ${rate.raf} page frames in 1 s`);
  check('listeners, focusable controls and run voices back to bench counts', end.listeners === benchListeners && end.buttons === benchButtons && end.voices === 0, `window/document/canvas listeners ${benchListeners} → ${end.listeners}; controls ${benchButtons} → ${end.buttons}; run voices ${end.voices} (room and music voices ${end.allVoices})`);
  check('no errors in the cycles', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------ 7. frame pacing (headless)
if (want('pacing')) {
  const { ctx, page, g } = await open({ width: 1366, height: 768 });
  await fresh(page);
  await g((g) => { g.selectTray('keyWheel'); const t = g.computeTargets('keyWheel').find((t) => t.res.ok); g.placeSelection(t.ref); });
  await page.waitForTimeout(3000); // warm-up
  await page.evaluate(() => {
    window.__iv = [];
    window.__work = [];
    let last = 0;
    const g = window.__wickshift;
    const orig = g.frame.bind(g);
    g.frame = (now) => { const a = performance.now(); orig(now); window.__work.push(performance.now() - a); };
    const tick = (t) => { if (last) window.__iv.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    await g((g) => { if (g.mode !== 'run') { if (g.mode === 'result') g.backToBench(); g.dispatch(); } });
    await page.keyboard.down('Space');
    await page.waitForTimeout(Math.min(5000, Math.max(0, end - Date.now())));
    await page.keyboard.up('Space');
  }
  const { iv, work } = await page.evaluate(() => ({ iv: window.__iv, work: window.__work }));
  const stalls = iv.filter((x) => x > 50).length;
  note(`Frame pacing (headless Chromium, 1366×768, ratio 1, 30 s of driving): ${iv.length} frames, median interval ${pct(iv, 50).toFixed(1)} ms, p95 ${pct(iv, 95).toFixed(1)} ms, stalls over 50 ms: ${stalls}. Game work per frame: median ${pct(work, 50).toFixed(2)} ms, p95 ${pct(work, 95).toFixed(2)} ms, max ${Math.max(...work).toFixed(1)} ms.`);
  // Headless Chromium does not lock rAF to a display, so the interval says nothing
  // about a 60 Hz panel. What it can show: no stalls, and the game's own work per
  // frame against the 16.7 ms budget.
  check('headless driving: no stall over 50 ms; game work p95 well inside a 16.7 ms frame', stalls === 0 && pct(work, 95) < 8, `interval median ${pct(iv, 50).toFixed(1)} ms (unlocked rAF), work p95 ${pct(work, 95).toFixed(2)} ms`);
  await ctx.close();
}

console.log(results.join('\n'));
if (notes.length) console.log('\n' + notes.join('\n'));
await browser.close();
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
