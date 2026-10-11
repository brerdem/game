import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:4173/';
const out = process.argv[3] || 'screenshot.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({ counts: game.counts, pos: game.player.pos.toArray().map(v => +v.toFixed(2)), spawn: game.spawn,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden') }));
console.log(JSON.stringify(info));
if (process.argv[4] === 'move') {
  // walk forward + jump test (debug mode allows keyboard without pointer lock)
  const y0 = await page.evaluate(() => game.player.pos.y);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
  console.log('keys', JSON.stringify(await page.evaluate(() => game.keys)), 'fps', await page.evaluate(() => game.fps));
  await page.keyboard.down('Space'); await page.waitForTimeout(250);
  const yj = await page.evaluate(() => game.player.pos.y - game.groundHeight(game.player.pos.x, game.player.pos.z));
  await page.keyboard.up('Space'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const p = await page.evaluate(() => game.player.pos.toArray().map(v => +v.toFixed(2)));
  console.log('move test y0', y0.toFixed(2), 'airborne height', yj.toFixed(2), 'pos after', JSON.stringify(p));
}
await page.screenshot({ path: out });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
