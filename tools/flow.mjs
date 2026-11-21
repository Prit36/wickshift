// Drives the real page with mouse and keyboard and reports what happened.
// node tools/flow.mjs   (dev server on :5173, or BASE=http://localhost:4173/ for the preview)
import { chromium } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pageUrl } from './url.mjs';

const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(pageUrl());
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__wickshift);
await page.waitForTimeout(300);
const g = (fn) => page.evaluate(`(() => { const g = window.__wickshift; return (${fn})(g); })()`);
const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);

// 1. Drag the key wheel from its recess onto a rear socket.
const rec = await g((g) => {
  const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r;
  return { x: (r.x + r.w / 2) * g.L.s, y: (r.y + r.h / 2) * g.L.s };
});
await page.mouse.move(rec.x, rec.y);
await page.mouse.down();
await page.mouse.move(rec.x + 20, rec.y - 20, { steps: 4 });
const sockets = await g((g) => {
  const ts = g.computeTargets('keyWheel', undefined, undefined);
  return ts.map((t) => ({ ok: t.res.ok, x: g.cam.sx(t.x) * g.L.s, y: g.cam.sy(t.y) * g.L.s, socket: t.ref.socket }));
});
check('rear sockets revealed while holding the wheel', sockets.filter((s) => s.ok).length >= 2, `${sockets.filter((s) => s.ok).length} legal`);
const target = sockets.find((s) => s.ok && s.socket === 1) ?? sockets.find((s) => s.ok);
await page.mouse.move(target.x, target.y, { steps: 12 });
const hollow = await g((g) => !!g.proposedCom);
check('hollow plumb mark shown for proposed fit', hollow);
await page.mouse.up();
const after = await g((g) => ({ n: g.ws.bp.placements.length, legal: g.legal, moth: g.mothPose }));
check('drag-to-fit commits the wheel', after.n === 2, `placements=${after.n}`);
check('launch legal after fit, moth lets go', after.legal && after.moth === 'stand', after.moth);

// 2. Pull the lever with the mouse (acts on press).
const lever = await g((g) => ({ x: (g.L.lever.x + g.L.lever.w / 2) * g.L.s, y: (g.L.lever.y + 40) * g.L.s }));
const t0 = Date.now();
await page.mouse.move(lever.x, lever.y);
await page.mouse.down();
const mode1 = await g((g) => g.mode);
await page.mouse.up();
check('lever dispatches on press', mode1 === 'run', mode1);

// 3. Hold Space to drive for 2 s, then R restores the exact pre-run state.
const pre = await g((g) => JSON.stringify(g.preRun.bp));
await page.keyboard.down('Space');
await page.waitForTimeout(2000);
const moved = await g((g) => g.sim.chassisPose().x);
check('Space drives the cart', moved > 0.5, `x=${moved.toFixed(2)}`);
await page.keyboard.up('Space');
const r0 = Date.now();
await page.keyboard.press('KeyR');
const back = await g((g) => ({ mode: g.mode, bp: JSON.stringify(g.ws.bp), sim: !!g.sim }));
const dt = Date.now() - r0;
check('R returns to bench', back.mode === 'bench' && !back.sim, back.mode);
check('pre-run build restored exactly', back.bp === pre);
check('retry within 0.5 s', dt < 500, `${dt} ms`);
void t0;

// 4. Undo removes the wheel; redo puts it back.
await page.keyboard.press('Control+KeyZ');
const undone = await g((g) => g.ws.bp.placements.length);
await page.keyboard.press('Control+Shift+KeyZ');
const redone = await g((g) => g.ws.bp.placements.length);
check('undo / redo', undone === 1 && redone === 2, `${undone}/${redone}`);

// 5. Locked lever names the missing part.
await page.keyboard.press('Control+KeyZ');
await page.mouse.move(lever.x, lever.y);
await page.mouse.down();
await page.mouse.up();
const locked = await g((g) => ({ mode: g.mode, note: g.leverNote > 0 }));
check('locked lever refuses and explains', locked.mode === 'bench' && locked.note);

// 6. Invalid fit: drop the key wheel on the occupied reel socket area → hatched reason.
await page.mouse.move(rec.x, rec.y);
await page.mouse.down();
await page.mouse.move(rec.x + 30, rec.y - 30, { steps: 4 });
const occupied = await g((g) => {
  const s = g.computeTargets('keyWheel', undefined, undefined).find((t) => !t.res.ok);
  return s ? { x: g.cam.sx(s.x) * g.L.s, y: g.cam.sy(s.y) * g.L.s, reason: s.res.reason } : null;
});
if (occupied) {
  await page.mouse.move(occupied.x, occupied.y, { steps: 10 });
  await page.mouse.up();
  const rej = await g((g) => ({ n: g.ws.bp.placements.length, reason: g.rejectAt?.reason ?? null }));
  check('invalid fit rejected with a reason', rej.n === 1 && !!rej.reason, rej.reason ?? '');
} else {
  await page.mouse.up();
  check('invalid fit rejected with a reason', false, 'no invalid socket found');
}

// 7. Escape pauses; the pause slip has focusable named controls.
await page.keyboard.press('Escape');
const paused = await g((g) => ({ p: g.paused, n: g.a11y.count(), f: g.a11y.focused() }));
await page.waitForTimeout(50);
const focus = await g((g) => g.a11y.focused());
check('Escape opens pause with focus on Resume', paused.p && focus === 'pause:resume', `${focus}`);
await page.keyboard.press('Escape');

// ------------------------------------------------ Ruler Rise: spar editing
await g((g) => {
  g.save.data.delivered['envelope-lip'] = true;
  g.openRoute(1);
});
await page.waitForTimeout(200);
const ga = (fn, arg) => page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.__wickshift, a), [fn.toString(), arg]);
const recess = (kind) =>
  ga((g, kind) => {
    const r = g.L.recesses.find((x) => x.kind === kind).r;
    return { x: (r.x + r.w / 2) * g.L.s, y: (r.y + r.h / 2) * g.L.s };
  }, kind);
const targets = (kind, moving, rot) =>
  ga((g, [kind, moving, rot]) => g.computeTargets(kind, moving ?? undefined, rot ?? undefined).map((t) => ({ ok: t.res.ok, reason: t.res.ok ? '' : t.res.reason, parent: t.ref.parent, socket: t.ref.socket, x: g.cam.sx(t.x) * g.L.s, y: g.cam.sy(t.y) * g.L.s })), [kind, moving ?? null, rot ?? null]);

// a) Select-then-click a spar, rotate it in the tray selection, then place it.
const sparRec = await recess('spar');
await page.mouse.click(sparRec.x, sparRec.y);
await page.keyboard.press('KeyE');
await page.keyboard.press('KeyE');
const wrapped = await g((g) => g.sel?.rot);
await page.keyboard.press('KeyQ');
await page.keyboard.press('KeyQ');
const selRot = await g((g) => ({ sel: g.sel?.kind, rot: g.sel?.rot }));
check('tray spar selection rotates with Q/E (wraps)', selRot.sel === 'spar' && wrapped === 6 && selRot.rot === 1, `1→${wrapped}→${selRot.rot}`);
// Clear and pick up again with the default orientation, which tries the nearest fit that clears.
await page.keyboard.press('Escape');
await page.mouse.click(sparRec.x, sparRec.y);
let ts = await targets('spar');
const sparSock = ts.find((t) => t.ok && t.parent === 'chassis');
await page.mouse.click(sparSock.x, sparSock.y);
let bp = await g((g) => g.ws.bp.placements);
const spar1 = bp.find((p) => p.kind === 'spar');
check('select-then-click fits a spar', !!spar1, spar1 ? `socket ${spar1.socket} rot ${spar1.rot}` : 'none');

// b) Drag the second spar, rotate in mid-air away from any socket (the old crash), then drop it.
await page.mouse.move(sparRec.x, sparRec.y);
await page.mouse.down();
await page.mouse.move(sparRec.x + 40, sparRec.y - 300, { steps: 6 });
await page.keyboard.press('KeyQ');
await page.keyboard.press('KeyE');
await page.keyboard.press('KeyE');
const midAir = await g((g) => ({ rot: g.drag?.rot, active: g.drag?.active }));
check('Q/E while dragging in mid-air does not crash', midAir.active === true && Number.isInteger(midAir.rot), `rot=${midAir.rot}`);
// c) Spars do not chain: hover the first spar's tip.
ts = await targets('spar');
const tip = ts.find((t) => t.parent === spar1.id);
if (tip) {
  await page.mouse.move(tip.x, tip.y, { steps: 8 });
  const reason = await g((g) => (g.target && !g.target.res.ok ? g.target.res.reason : null));
  check('spar on a spar tip is refused', reason === 'Spars do not chain', reason ?? 'no target');
}
await page.mouse.move(10, 10, { steps: 4 });
await page.mouse.up();
const afterAbort = await g((g) => g.ws.bp.placements.length);
check('dropping in empty space changes nothing', afterAbort === bp.length, `${afterAbort}`);

// d) Move the mounted reel onto the spar tip.
const reelNow = await g((g) => {
  const f = g.benchFrame().parts.find((p) => p.kind === 'reel');
  return { x: g.cam.sx(f.pose.x) * g.L.s, y: g.cam.sy(f.pose.y) * g.L.s, id: f.id };
});
ts = await targets('reel', reelNow.id);
const reelTip = ts.find((t) => t.parent === spar1.id);
await page.mouse.move(reelNow.x, reelNow.y);
await page.mouse.down();
await page.mouse.move(reelNow.x + 10, reelNow.y - 10, { steps: 3 });
await page.mouse.move(reelTip.x, reelTip.y, { steps: 10 });
const reelTarget = await g((g) => (g.target ? (g.target.res.ok ? 'ok' : g.target.res.reason) : 'none'));
await page.mouse.up();
bp = await g((g) => g.ws.bp.placements);
const reelP = bp.find((p) => p.kind === 'reel');
check('reel moves onto the spar tip', reelP.parent === spar1.id, `${reelTarget}; parent=${reelP.parent}`);

// e) Drop the spar (carrying the reel) on the drawer: one edit removes the branch; one undo restores it.
const sparNow = await g((g) => {
  const f = g.benchFrame().parts.find((p) => p.kind === 'spar');
  const d = g.L.drawer;
  const def = { x: 0.39, y: 0 };
  const [x, y] = [f.pose.x + Math.cos(f.pose.a) * def.x, f.pose.y + Math.sin(f.pose.a) * def.x];
  return { x: g.cam.sx(x) * g.L.s, y: g.cam.sy(y) * g.L.s, dx: (d.x + d.w / 2) * g.L.s, dy: (d.y + d.h / 2) * g.L.s };
});
const before = bp.length;
await page.mouse.move(sparNow.x, sparNow.y);
await page.mouse.down();
await page.mouse.move(sparNow.x + 10, sparNow.y + 10, { steps: 3 });
await page.mouse.move(sparNow.dx, sparNow.dy, { steps: 12 });
await page.mouse.up();
const removed = await g((g) => g.ws.bp.placements.length);
await page.keyboard.press('Control+KeyZ');
const restored = await g((g) => g.ws.bp.placements.length);
check('drawer drop removes spar + reel as one edit, undo restores both', removed === before - 2 && restored === before, `${before}→${removed}→${restored}`);

// f) Q/E on a mounted, selected spar.
const sparSel = await g((g) => {
  const f = g.benchFrame().parts.find((p) => p.kind === 'spar');
  return f.id;
});
await ga((g, id) => g.selectMounted(id), sparSel);
const rot0 = await g((g) => g.ws.bp.placements.find((p) => p.kind === 'spar').rot);
await page.keyboard.press('KeyE');
const rot1 = await g((g) => ({ rot: g.ws.bp.placements.find((p) => p.kind === 'spar').rot, rej: g.rejectAt?.reason ?? null }));
check('Q/E rotates a mounted spar (or explains why not)', rot1.rot !== rot0 || !!rot1.rej, `${rot0}→${rot1.rot} ${rot1.rej ?? ''}`);

console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
if (failed || errors.length) process.exit(1);
