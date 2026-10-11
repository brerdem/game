import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/game-gpu/?debug';
const extraDir = process.argv[3] || '/opt/cursor/artifacts';

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-webgpu',
    '--enable-webgpu-developer-features',
    '--enable-features=Vulkan,UseSkiaRenderer',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (req) => {
  const u = req.url();
  if (/\.(glb|gltf|js|css|webp|jpg|png|wasm|woff2)$/i.test(u)) {
    errors.push(`[requestfailed] ${u} ${req.failure()?.errorText || ''}`);
  }
});
page.on('response', (res) => {
  const u = res.url();
  if (/\.(webp|jpg|png|js|css|woff2)$/i.test(u) && res.status() >= 400) {
    errors.push(`[http ${res.status()}] ${u}`);
  }
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true && window.game?.modelsLoaded === true, null, { timeout: 180000 });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => ({
  counts: game.counts,
  backend: game.backend?.label || game.counts?.backend || document.getElementById('gpu-backend')?.textContent,
  pos: game.player.pos.toArray().map((v) => +v.toFixed(2)),
  spawn: game.spawn,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  hud: {
    gems: document.getElementById('diamond-count')?.textContent,
    score: document.getElementById('score-count')?.textContent,
    timer: document.getElementById('timer')?.textContent,
  },
}));
console.log(JSON.stringify(info, null, 2));

if (!info.counts?.trees || info.counts.trees < 20 || info.counts.diamonds < 20 || info.counts.trampolines < 3 || !info.counts.grass) {
  errors.push(`[assert] unexpected counts ${JSON.stringify(info.counts)}`);
}
if (info.counts?.quality === 'high') {
  if (info.counts.grass !== 24000) errors.push(`[assert] grass count ${info.counts.grass} expected 24000`);
  if (info.counts.grassRadius !== 20) errors.push(`[assert] grass radius ${info.counts.grassRadius} expected 20`);
}
if (!info.backend || !/WebGPU|WebGL2 fallback/i.test(info.backend)) {
  errors.push(`[assert] missing backend badge ${info.backend}`);
}

mkdirSync(extraDir, { recursive: true });
const save = async (path) => {
  mkdirSync(dirname(path), { recursive: true });
  const dataUrl = await page.evaluate(() => {
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
    const canvas = document.getElementById('game');
    if (canvas && canvas.toDataURL) return canvas.toDataURL('image/png');
    return null;
  });
  if (dataUrl) writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  else await page.screenshot({ path, timeout: 120000 });
  console.log('wrote', path);
};

await page.evaluate(() => {
  const p = game.spawn;
  game.teleport(p.x, game.groundHeight(p.x, p.z), p.z);
  game.camera.rotation.x = -0.08;
  if (game.groundCover) game.groundCover.update(0, game.camera.position);
  game.renderer.render(game.scene, game.camera);
});
await page.waitForTimeout(300);
await save(`${extraDir}/gpu_gameplay.png`);

await page.evaluate(() => {
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  game.showMenu('land');
  game.applyMenuCamera(1.4);
  game.renderer.render(game.scene, game.camera);
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${extraDir}/gpu_landing.png`, timeout: 60000 });
console.log('wrote', `${extraDir}/gpu_landing.png`);

const br = await page.evaluate(() => {
  const b = game.bridge;
  if (!b) return null;
  const mx = (b.a.x + b.b.x) / 2, mz = (b.a.z + b.b.z) / 2;
  return { ax: b.a.x, ay: b.a.y, az: b.a.z, bx: b.b.x, by: b.b.y, bz: b.b.z, mx, mz, my: game.groundHeight(mx, mz) };
});
if (br) {
  const sideX = -(br.bz - br.az), sideZ = (br.bx - br.ax);
  const sl = Math.hypot(sideX, sideZ) || 1;
  await page.evaluate(({ lookX, lookZ, camX, camY, camZ }) => {
    document.getElementById('overlay').classList.add('hidden');
    document.body.classList.add('playing');
    game.teleport(camX, camY, camZ);
    game.setYaw(Math.atan2(lookX - camX, lookZ - camZ) + Math.PI);
    game.camera.rotation.x = -0.08;
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
  }, {
    lookX: br.ax + (br.bx - br.ax) * 0.62,
    lookZ: br.az + (br.bz - br.az) * 0.62,
    camX: br.ax + (br.bx - br.ax) * -0.06 + (sideX / sl) * 7.2,
    camY: br.ay + 1.35,
    camZ: br.az + (br.bz - br.az) * -0.06 + (sideZ / sl) * 7.2,
  });
  await page.waitForTimeout(250);
  await save(`${extraDir}/gpu_bridge.png`);
} else {
  errors.push('[assert] missing vine bridge');
}

console.log('errors:', errors.length ? errors.join('\n') : 'none');
if (errors.length) process.exitCode = 1;
await browser.close();
