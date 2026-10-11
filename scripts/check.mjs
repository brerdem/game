import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/?debug';
const out = process.argv[3] || 'screenshot.png';
const extraDir = process.argv[4] || '';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (req) => {
  const u = req.url();
  if (/\.(glb|gltf|js|css)$/i.test(u)) errors.push(`[requestfailed] ${u} ${req.failure()?.errorText || ''}`);
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.game?.modelsLoaded === true, null, { timeout: 90000 });
await page.waitForTimeout(1800);

const info = await page.evaluate(() => ({
  counts: game.counts,
  pos: game.player.pos.toArray().map((v) => +v.toFixed(2)),
  spawn: game.spawn,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  hud: {
    gems: document.getElementById('diamond-count')?.textContent,
    score: document.getElementById('score-count')?.textContent,
    timer: document.getElementById('timer')?.textContent,
  },
  models: [...document.querySelectorAll('script, link')].length,
}));
console.log(JSON.stringify(info, null, 2));

if (!info.counts?.models || info.counts.diamonds < 20 || info.counts.trampolines < 4) {
  errors.push(`[assert] unexpected counts ${JSON.stringify(info.counts)}`);
}

const shots = [];
const save = async (path) => {
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path });
  shots.push(path);
  console.log('wrote', path);
};

await save(out);

if (extraDir) {
  mkdirSync(extraDir, { recursive: true });
  const pad = await page.evaluate(() => {
    const t = game.trampolines[0];
    if (!t) return null;
    game.teleport(t.x - 3.4, t.padY, t.z + 4.2);
    game.setYaw(Math.atan2(t.x - game.player.pos.x, t.z - game.player.pos.z) + Math.PI);
    game.camera.rotation.x = -0.18;
    return { x: t.x, z: t.z, padY: t.padY };
  });
  await page.waitForTimeout(400);
  await save(`${extraDir}/trampoline_and_hud.png`);

  const gem = await page.evaluate(() => {
    const d = game.diamonds.find((g) => !g.sky) || game.diamonds[0];
    if (!d) return null;
    game.teleport(d.x - 2.2, d.y - 0.2, d.z + 3.1);
    game.setYaw(Math.atan2(d.x - game.player.pos.x, d.z - game.player.pos.z) + Math.PI);
    game.camera.rotation.x = -0.12;
    return { x: d.x, y: d.y, z: d.z };
  });
  await page.waitForTimeout(400);
  await save(`${extraDir}/diamond_and_plants.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    const y = game.groundHeight(p.x, p.z);
    game.teleport(p.x, y, p.z);
    game.camera.rotation.x = -0.08;
  });
  await page.waitForTimeout(350);
  await save(`${extraDir}/spawn_forest.png`);
  console.log('placed', JSON.stringify({ pad, gem }));
}

if (process.argv.includes('move')) {
  const y0 = await page.evaluate(() => game.player.pos.y);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
  console.log('keys', JSON.stringify(await page.evaluate(() => game.keys)), 'fps', await page.evaluate(() => game.fps));
  await page.keyboard.down('Space'); await page.waitForTimeout(250);
  const yj = await page.evaluate(() => game.player.pos.y - game.groundHeight(game.player.pos.x, game.player.pos.z));
  await page.keyboard.up('Space'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const p = await page.evaluate(() => game.player.pos.toArray().map((v) => +v.toFixed(2)));
  console.log('move test y0', y0.toFixed(2), 'airborne height', yj.toFixed(2), 'pos after', JSON.stringify(p));
}

console.log('errors:', errors.length ? errors.join('\n') : 'none');
if (errors.length) process.exitCode = 1;
await browser.close();
