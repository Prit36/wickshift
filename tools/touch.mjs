// Touch check on an emulated phone: tap the lever, hold Drive, hold Lamp forward.
// node tools/touch.mjs   (dev server on :5173, or BASE=http://localhost:4173/ for the preview)
import { chromium } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pageUrl } from './url.mjs';

const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pageUrl());
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__wickshift);
await page.waitForTimeout(400);
const cdp = await ctx.newCDPSession(page);
const g = (fn) => page.evaluate(`(() => { const g = window.__wickshift; return (${fn})(g); })()`);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);

// Fit the key wheel by tapping its recess then a rear socket (select-then-tap).
const rec = await g((g) => { const r = g.L.recesses.find((x) => x.kind === 'keyWheel').r; return [(r.x + r.w / 2) * g.L.s, (r.y + r.h / 2) * g.L.s]; });
await touch('touchStart', [rec]); await touch('touchEnd', []);
await page.waitForTimeout(150);
const sock = await g((g) => { const t = g.computeTargets('keyWheel', undefined, undefined).find((t) => t.res.ok); return [g.cam.sx(t.x) * g.L.s, g.cam.sy(t.y) * g.L.s]; });
await touch('touchStart', [sock]); await touch('touchEnd', []);
await page.waitForTimeout(200);
check('tap-select then tap-socket fits the key wheel', (await g((g) => g.ws.bp.placements.length)) === 2);
check('device switches to touch', (await g((g) => g.device)) === 'touch');

const lever = await g((g) => [(g.L.lever.x + g.L.lever.w / 2) * g.L.s, (g.L.lever.y + 40) * g.L.s]);
await touch('touchStart', [lever]); await touch('touchEnd', []);
await page.waitForTimeout(250);
check('tapping the lever dispatches', (await g((g) => g.mode)) === 'run');

const drive = await g((g) => [(g.L.drive.x + g.L.drive.w / 2) * g.L.s, (g.L.drive.y + g.L.drive.h / 2) * g.L.s]);
const fwd = await g((g) => [(g.L.lampFwd.x + g.L.lampFwd.w / 2) * g.L.s, (g.L.lampFwd.y + g.L.lampFwd.h / 2) * g.L.s]);
const x0 = await g((g) => g.sim.chassisPose().x);
const l0 = await g((g) => g.sim.rig.lampJoint.getJointTranslation());
await touch('touchStart', [drive, fwd]);
await page.waitForTimeout(1500);
const x1 = await g((g) => g.sim.chassisPose().x);
const l1 = await g((g) => g.sim.rig.lampJoint.getJointTranslation());
// Lift only the lamp finger: Drive must keep going.
// CDP releases one finger with a touchEnd that names just that point (id 1 is the lamp finger).
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: fwd[0], y: fwd[1], id: 1 }] });
await page.waitForTimeout(100);
const held = await g((g) => ({ drive: g.touchDrive.size, fwd: g.lampHold.fwd.size, w: g.sim.wind, l: g.sim.rig.lampJoint.getJointTranslation() }));
await page.waitForTimeout(400);
const held2 = await g((g) => ({ w: g.sim.wind, l: g.sim.rig.lampJoint.getJointTranslation() }));
check('releasing Lamp forward alone keeps Drive held', held.drive === 1 && held.fwd === 0 && held2.w < held.w, `drive ${held.drive}, lamp ${held.fwd}, wind ${held.w.toFixed(3)}→${held2.w.toFixed(3)}`);
await touch('touchEnd', []);
check('holding Drive drives (two-finger hold)', x1 - x0 > 1, `dx=${(x1 - x0).toFixed(2)}`);
check('holding Lamp forward moves the lamp at the same time', l1 - l0 > 0.3, `dl=${(l1 - l0).toFixed(2)}`);
await page.waitForTimeout(800);
const v = await g((g) => g.sim.rig.chassis.getLinearVelocity().x);
const wind0 = await g((g) => g.sim.wind);
await page.waitForTimeout(500);
check('releasing Drive stops spending wind', (await g((g) => g.sim.wind)) === wind0, `v=${v.toFixed(2)}`);
const sizes = await g((g) => ({ d: Math.min(g.L.drive.w, g.L.drive.h) * g.L.s, l: Math.min(g.L.lampFwd.w, g.L.lampFwd.h) * g.L.s }));
check('thumb controls at least 44 CSS px', sizes.d >= 44 && sizes.l >= 44, `drive ${sizes.d.toFixed(0)} lamp ${sizes.l.toFixed(0)}`);
console.log(results.join('\n'));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
