// Dev capture: node tools/shot.mjs <name> [w] [h] [query] [js-before-shot]
// Env: CLIP="x,y,w,h" crops, DPR=2 for detail. Exits non-zero on any page error.
import { chromium } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pageUrl } from './url.mjs';

const [name = 'bench', w = '1366', h = '768', query = '', js = ''] = process.argv.slice(2);
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(pageUrl(query));
await page.waitForFunction(() => window.__wickshift);
await page.waitForTimeout(400);
if (js) {
  await page.evaluate(`(async () => { const g = window.__wickshift; const wait = (ms) => new Promise(r => setTimeout(r, ms)); ${js} })()`);
}
const clip = process.env.CLIP ? (([x, y, cw, ch]) => ({ x, y, width: cw, height: ch }))(process.env.CLIP.split(',').map(Number)) : undefined;
await page.screenshot({ path: `captures/${name}.png`, clip });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
console.log('ok', name);
if (errors.length) process.exit(1);
