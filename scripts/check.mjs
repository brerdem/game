import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/?debug';
const out = process.argv[3] || 'screenshot.png';
const extraDir = process.argv[4] || '';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failed = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (req) => {
  const u = req.url();
  if (/\.(glb|gltf|js|css|webp|jpg|png|wasm)$/i.test(u)) {
    errors.push(`[requestfailed] ${u} ${req.failure()?.errorText || ''}`);
    failed.push(u);
  }
});
page.on('response', (res) => {
  const u = res.url();
  if (/\.(webp|jpg|png|js|css)$/i.test(u) && res.status() >= 400) {
    errors.push(`[http ${res.status()}] ${u}`);
  }
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.game?.modelsLoaded === true, null, { timeout: 180000 });
await page.waitForTimeout(2200);

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
}));
console.log(JSON.stringify(info, null, 2));

if (!info.counts?.trees || info.counts.trees < 20 || info.counts.diamonds < 20 || info.counts.trampolines < 4 || !info.counts.grass) {
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

async function lookAt(x, y, z, px, py, pz, pitch = -0.12) {
  await page.evaluate(({ x, y, z, px, py, pz, pitch }) => {
    game.teleport(px, py, pz);
    game.setYaw(Math.atan2(x - game.player.pos.x, z - game.player.pos.z) + Math.PI);
    game.camera.rotation.x = pitch;
  }, { x, y, z, px, py, pz, pitch });
  await page.waitForTimeout(450);
}

if (extraDir) {
  mkdirSync(extraDir, { recursive: true });

  const tree = await page.evaluate(() => {
    const p = game.counts && window.game;
    const pts = [];
    // walk a ring around spawn and pick a high grass point near a trunk-ish location
    const s = game.spawn;
    return { x: s.x + 8, z: s.z + 6, y: game.groundHeight(s.x + 8, s.z + 6) };
  });
  await lookAt(tree.x, tree.y + 4, tree.z, tree.x - 3.2, tree.y, tree.z + 5.4, -0.18);
  await save(`${extraDir}/tree_and_grass.png`);

  const shore = await page.evaluate(() => {
    const s = game.spawn;
    let best = null;
    for (let i = 0; i < 360; i += 4) {
      const a = i * Math.PI / 180;
      for (let r = 40; r < 280; r += 8) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = game.terrainHeight(x, z);
        if (h > 0.15 && h < 1.4) {
          const nx = Math.cos(a) * (r + 10), nz = Math.sin(a) * (r + 10);
          if (game.terrainHeight(nx, nz) < 0) {
            best = { x, z, y: h, lookX: nx, lookZ: nz };
            break;
          }
        }
      }
      if (best) break;
    }
    return best || { x: s.x, z: s.z + 80, y: 2, lookX: s.x, lookZ: s.z + 120 };
  });
  await lookAt(shore.lookX, 0.2, shore.lookZ, shore.x - 2, Math.max(shore.y, 1.2), shore.z - 6, -0.08);
  await save(`${extraDir}/sea_and_shore.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    game.teleport(p.x, game.groundHeight(p.x, p.z) + 2.2, p.z);
    game.camera.rotation.x = 0.42;
  });
  await page.waitForTimeout(400);
  await save(`${extraDir}/clouds.png`);

  const gem = await page.evaluate(() => {
    const d = game.diamonds.find((g) => !g.sky) || game.diamonds[0];
    if (!d) return null;
    return { x: d.x, y: d.y, z: d.z };
  });
  if (gem) {
    await lookAt(gem.x, gem.y, gem.z, gem.x - 1.6, gem.y - 0.15, gem.z + 2.4, -0.08);
    await save(`${extraDir}/red_gems.png`);
  }

  const pad = await page.evaluate(() => {
    const t = game.trampolines[0];
    if (!t) return null;
    return { x: t.x, z: t.z, padY: t.padY };
  });
  if (pad) {
    await lookAt(pad.x, pad.padY, pad.z, pad.x - 3.4, pad.padY, pad.z + 4.2, -0.18);
    await save(`${extraDir}/trampoline_and_hud.png`);
  }

  await page.evaluate(() => {
    const p = game.spawn;
    const y = game.groundHeight(p.x, p.z);
    game.teleport(p.x, y, p.z);
    game.camera.rotation.x = -0.08;
  });
  await page.waitForTimeout(350);
  await save(`${extraDir}/spawn_forest.png`);
  console.log('placed', JSON.stringify({ shore, gem, pad }));
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
