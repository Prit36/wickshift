// Visual-review captures named by the spec, written to captures/review/.
//   node tools/review.mjs [name,...]      (dev server, or BASE=http://localhost:4173/ for the build)
// Runs are advanced tick by tick through the game's own step, so each frame is repeatable.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pageUrl } from './url.mjs';

const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
mkdirSync('captures/review', { recursive: true });
const only = process.argv[2]?.split(',');
const log = [];
let failed = 0;

async function scene(name, vp, query, setup, dpr = 1) {
  if (only && !only.includes(name)) return;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(pageUrl(query));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__wickshift && window.__wickshift.frameCount > 2);
  const g = (fn, arg) => page.evaluate(`(async () => { const g = window.__wickshift; const wait = (ms) => new Promise((r) => setTimeout(r, ms)); return (${fn})(g, ${JSON.stringify(arg ?? null)}); })()`);
  const info = setup ? await setup(g, page) : '';
  await page.waitForTimeout(120);
  await page.screenshot({ path: `captures/review/${name}.png` });
  if (errors.length) failed++;
  log.push(`${name.padEnd(22)} ${vp.width}×${vp.height}${dpr !== 1 ? ` @${dpr}` : ''}${query ? ` ${query}` : ''}  ${info ?? ''}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
  await ctx.close();
}

// Helpers evaluated in the page.
const fitKey = (g) => { g.selectTray('keyWheel'); const t = g.computeTargets('keyWheel').find((t) => t.res.ok); g.placeSelection(t.ref); };
const unlockAll = (g) => { for (const id of ['envelope-lip', 'ruler-rise', 'blotter-drop']) g.save.data.delivered[id] = true; g.save.flush(); };
/** Step the run `n` ticks through the game's own tick with the given keys held. */
const STEP = `(g, n, keys, until) => { g.keys.clear(); for (const k of keys) g.keys.add(k); for (let i = 0; i < n && g.sim && g.sim.outcome === 'running'; i++) { g.tick(); if (until && until(g)) break; } g.keys.clear(); }`;

const V = { w1366: { width: 1366, height: 768 }, w1280: { width: 1280, height: 720 }, w1920: { width: 1920, height: 1080 }, w844: { width: 844, height: 390 } };

// First editable frame, and the same frame with effects and labels off, as a 320×180 thumbnail.
await scene('first-1366', V.w1366, '');
await scene('thumb-plain-320', V.w1366, '?plain&nolabels', null, 320 / 1366);
await scene('thumb-full-320', V.w1366, '', null, 320 / 1366);
await scene('nolabels-1366', V.w1366, '?nolabels');

// An invalid socket mid-drag.
await scene('invalid-socket', V.w1366, '', async (g, page) => {
  const p = await g((g) => {
    const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r;
    const bad = g.computeTargets('keyWheel').find((t) => !t.res.ok);
    return { rx: (r.x + r.w / 2) * g.L.s, ry: (r.y + r.h / 2) * g.L.s, x: g.cam.sx(bad.x) * g.L.s, y: g.cam.sy(bad.y) * g.L.s, reason: bad.res.reason };
  });
  await page.mouse.move(p.rx, p.ry);
  await page.mouse.down();
  await page.mouse.move(p.rx + 20, p.ry - 40, { steps: 4 });
  await page.mouse.move(p.x, p.y + 6, { steps: 12 });
  await page.waitForTimeout(250);
  return `hovering a socket refused: "${p.reason}"`;
});

// Ruler Rise: the nose lifts with the lamp back (moth reaches), then settles once the lamp goes forward (moth grips). Muted, reduced motion.
for (const [name, extra] of [['ruler-lift', 0], ['ruler-settled', 1]]) {
  await scene(name, V.w1366, '', async (g) => g(`async (g, extra) => {
    g.setLevels(0.8, 0.5, true); g.setReducedMotion(true);
    for (const id of ['envelope-lip']) g.save.data.delivered[id] = true;
    g.openRoute(1); await wait(50);
    g.dispatch();
    const step = ${STEP};
    step(g, 900, ['Space'], (g) => g.mothPose === 'reach' && g.sim.chassisPose().x > 6);
    step(g, 10, ['Space']);
    const lifted = { pose: g.mothPose, pitch: (g.sim.chassisPose().a * 180 / Math.PI).toFixed(0), tick: g.sim.tick };
    if (!extra) return 'moth ' + lifted.pose + ', pitch ' + lifted.pitch + '° at tick ' + lifted.tick;
    step(g, 400, ['Space', 'KeyD'], (g) => g.mothPose === 'ride' && g.sim.chassisPose().x > 7);
    step(g, 30, ['Space', 'KeyD']);
    return 'lifted at tick ' + lifted.tick + ' (moth ' + lifted.pose + '); after Lamp forward: moth ' + g.mothPose + ', pitch ' + (g.sim.chassisPose().a * 180 / Math.PI).toFixed(0) + '° at tick ' + g.sim.tick;
  }`, extra));
}

// The cart on the ruler at full lean, normal motion.
await scene('ruler-climb', V.w1366, '', async (g) => g(`async (g) => {
  g.save.data.delivered['envelope-lip'] = true; g.openRoute(1); await wait(50); g.dispatch();
  const step = ${STEP};
  step(g, 900, ['Space', 'KeyD'], (g) => g.sim.chassisPose().x > 9.5);
  for (let i = 0; i < 40; i++) { await wait(16); }
  return 'x ' + g.sim.chassisPose().x.toFixed(1) + ', pitch ' + (g.sim.chassisPose().a * 180 / Math.PI).toFixed(0) + '°';
}`));

// A failure with the impact visible.
// Night Counter, key wheel at the nose and reel at the tail: a failed landing.
await scene('failure-landing', V.w1366, '', async (g) => g(`async (g) => {
  (${unlockAll})(g); g.openRoute(3); await wait(50);
  g.ws.commit({ placements: [{ id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 4, rot: 0 }, { id: 'reel-1', kind: 'reel', parent: 'chassis', socket: 0, rot: 0 }] });
  g.refreshBench(false); g.dispatch();
  const step = ${STEP};
  step(g, 1500, ['Space']);
  await wait(900);
  return g.mode + ': ' + (g.result && g.result.text) + '; chalk at ' + (g.chalk ? g.chalk.x.toFixed(1) + ',' + g.chalk.y.toFixed(1) : 'none');
}`));

// Delivered window, partway through and at the end of the beat.
for (const [name, ms] of [['delivered-200ms', 200], ['delivered-1s', 1000]]) {
  await scene(name, V.w1366, '', async (g) => g(`async (g, ms) => {
    (${fitKey})(g); g.dispatch();
    const step = ${STEP};
    step(g, 3000, ['Space']);
    await wait(ms);
    return g.mode + ' ' + (g.result && g.result.kind);
  }`, ms));
}

// The Night Counter: Scout framed on the ruler, roller, counter, shelf and flap; and hold-V.
for (const [vp, tag] of [[V.w1366, '1366'], [V.w844, '844']]) {
  await scene(`nc-scout-${tag}`, vp, '', async (g) => g(`async (g) => {
    (${unlockAll})(g); g.openRoute(3); await wait(50);
    g.enterScout();
    const rr = g.route.roller;
    g.cam.cx = rr.x + 1.2; g.cam.cy = rr.y - 1.0; g.clampScout?.();
    await wait(300);
    return 'scout ppm ' + g.cam.ppm.toFixed(0) + ', centre ' + g.cam.cx.toFixed(1) + ',' + g.cam.cy.toFixed(1);
  }`));
  await scene(`nc-peek-${tag}`, vp, '', async (g, page) => {
    await g(`async (g) => { (${unlockAll})(g); g.openRoute(3); await wait(50); }`);
    await page.keyboard.down('KeyV');
    await page.waitForTimeout(1200);
    return '';
  });
}

// The Night Counter runs at the decisive moments.
await scene('nc-long-roller', V.w1366, '', async (g) => g(`async (g) => {
  (${unlockAll})(g); g.openRoute(3); await wait(50);
  const r = g.ws.bp.placements.find((p) => p.kind === 'runner'); g.selectMounted(r.id); g.removeSelected();
  g.selectTray('spar'); g.sel.rot = 0; g.placeSelection({ parent: 'chassis', socket: 4 });
  const sp = g.ws.bp.placements.find((p) => p.kind === 'spar'); g.selectTray('reel'); g.placeSelection({ parent: sp.id, socket: 0 });
  g.dispatch();
  const step = ${STEP};
  step(g, 1200, ['Space'], (g) => g.stripePart);
  step(g, 25, ['Space']);
  for (let i = 0; i < 30; i++) await wait(16);
  return 'stripe on ' + g.stripePart + ' at tick ' + g.sim.tick;
}`));
await scene('nc-compact-under-flap', V.w1366, '', async (g) => g(`async (g) => {
  (${unlockAll})(g); g.openRoute(3); await wait(50); g.dispatch();
  const step = ${STEP};
  step(g, 1500, ['Space'], (g) => g.sim.flap && Math.abs(g.sim.flap.getAngle()) > 0.12);
  for (let i = 0; i < 30; i++) await wait(16);
  return 'flap lifted ' + (Math.abs(g.sim.flap.getAngle()) * 180 / Math.PI).toFixed(0) + '° at tick ' + g.sim.tick;
}`));

// 844: thumb controls versus the next landing on Blotter Drop, just before the lip.
await scene('blotter-lip-844', V.w844, '', async (g) => g(`async (g) => {
  for (const id of ['envelope-lip', 'ruler-rise']) g.save.data.delivered[id] = true;
  g.openRoute(2); await wait(50); g.dispatch();
  const step = ${STEP};
  step(g, 1500, ['Space'], (g) => g.sim.chassisPose().x > 11.5);
  for (let i = 0; i < 40; i++) await wait(16);
  return 'x ' + g.sim.chassisPose().x.toFixed(1);
}`));

// Viewport rows: bench, routes, finale.
for (const [vp, tag] of [[V.w1280, '1280'], [V.w1366, '1366'], [V.w1920, '1920'], [V.w844, '844']]) {
  await scene(`bench-${tag}`, vp, '');
  await scene(`routes-${tag}`, vp, '', async (g) => g(`async (g) => { g.save.data.delivered['envelope-lip'] = true; g.save.data.marks['envelope-lip'] = true; g.openRoutes(); await wait(700); return ''; }`));
  await scene(`finale-${tag}`, vp, '', async (g) => g(`async (g) => { for (const r of ['envelope-lip','ruler-rise','blotter-drop','night-counter']) g.save.data.delivered[r] = true; g.save.data.marks['night-counter'] = true; g.openRoutes(true); await wait(2500); return ''; }`));
  await scene(`pause-${tag}`, vp, '', async (g, page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); return ''; });
}

console.log(log.join('\n'));
await browser.close();
if (failed) process.exit(1);
