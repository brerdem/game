import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
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
  if (/\.(glb|gltf|js|css|webp|jpg|png|wasm|woff2)$/i.test(u)) {
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

await page.goto(url, { waitUntil: 'domcontentloaded' });
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

if (!info.counts?.trees || info.counts.trees < 20 || info.counts.diamonds < 20 || info.counts.trampolines < 3 || !info.counts.grass) {
  errors.push(`[assert] unexpected counts ${JSON.stringify(info.counts)}`);
}
const extras = await page.evaluate(() => {
  const i2 = game.ISLAND2 || { x: 298, z: 32, r: 78 };
  const gems = (game.diamonds || []).filter((d) => Math.hypot(d.x - i2.x, d.z - i2.z) < i2.r + 6);
  const trees = (game.treePts || []).filter((p) => Math.hypot(p.x - i2.x, p.z - i2.z) < i2.r + 6);
  const mid = game.bridge
    ? { x: (game.bridge.a.x + game.bridge.b.x) / 2, z: (game.bridge.a.z + game.bridge.b.z) / 2 }
    : null;
  const bh = mid ? game.groundHeight(mid.x, mid.z) : null;
  return {
    island2Gems: gems.length,
    island2Trees: trees.length,
    hasBridge: !!game.bridge,
    bridgeLen: game.bridge?.L || 0,
    bridgeMidH: bh,
    bridgeA: game.bridge ? { x: +game.bridge.a.x.toFixed(1), y: +game.bridge.a.y.toFixed(2), z: +game.bridge.a.z.toFixed(1) } : null,
    bridgeB: game.bridge ? { x: +game.bridge.b.x.toFixed(1), y: +game.bridge.b.y.toFixed(2), z: +game.bridge.b.z.toFixed(1) } : null,
    hudFont: getComputedStyle(document.getElementById('score-count')).fontFamily,
    loaderHidden: document.getElementById('loader').classList.contains('hidden'),
    birds: game.counts?.birds || 0,
  };
});
console.log('extras', JSON.stringify(extras));
if (!extras.hasBridge || extras.bridgeLen < 20) errors.push(`[assert] missing vine bridge ${JSON.stringify(extras)}`);
if (extras.island2Gems < 3) errors.push(`[assert] too few island-2 gems ${extras.island2Gems}`);
if (extras.island2Trees < 3) errors.push(`[assert] too few island-2 trees ${extras.island2Trees}`);
if (!extras.loaderHidden) errors.push('[assert] loader still visible after ready');
if (extras.bridgeMidH != null && extras.bridgeMidH < 3.5) errors.push(`[assert] bridge not high enough ${extras.bridgeMidH}`);
if (extras.bridgeLen > 200 || extras.bridgeLen < 24) errors.push(`[assert] unexpected bridge span ${extras.bridgeLen}`);
if (extras.birds < 6) errors.push(`[assert] missing birds ${extras.birds}`);

const cross = await page.evaluate(() => {
  const b = game.bridge;
  if (!b) return { ok: false, reason: 'no bridge' };
  const x0 = b.a.x + (b.b.x - b.a.x) * 0.2;
  const z0 = b.a.z + (b.b.z - b.a.z) * 0.2;
  game.teleport(x0, game.groundHeight(x0, z0), z0);
  game.setYaw(Math.atan2(b.b.x - b.a.x, b.b.z - b.a.z) + Math.PI);
  game.simulate(5, { KeyW: true });
  const p = game.player.pos;
  const walkY = p.y;
  const mx = (b.a.x + b.b.x) / 2, mz = (b.a.z + b.b.z) / 2;
  const sideX = -(b.b.z - b.a.z), sideZ = (b.b.x - b.a.x);
  const sl = Math.hypot(sideX, sideZ) || 1;
  game.teleport(mx + (sideX / sl) * 5, 2.4, mz + (sideZ / sl) * 5);
  for (let i = 0; i < 160; i++) game.simulate(1 / 60, {});
  const after = game.player.pos;
  return {
    ok: walkY > 0.4 && game.terrainHeight(after.x, after.z) > 0.7,
    walkY: +walkY.toFixed(2),
    drownTerrain: +game.terrainHeight(after.x, after.z).toFixed(2),
    drownY: +after.y.toFixed(2),
  };
});
console.log('cross', JSON.stringify(cross));
if (!cross.ok) errors.push(`[assert] bridge walk/drown ${JSON.stringify(cross)}`);

const shots = [];
const save = async (path) => {
  mkdirSync(dirname(path), { recursive: true });
  const dataUrl = await page.evaluate(() => {
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
    const canvas = document.getElementById('game');
    if (canvas && canvas.toDataURL) return canvas.toDataURL('image/png');
    return null;
  });
  if (dataUrl) {
    writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  } else {
    await page.screenshot({ path, timeout: 120000 });
  }
  shots.push(path);
  console.log('wrote', path);
};

await save(out);

async function lookAt(x, y, z, px, py, pz, pitch = -0.12) {
  await page.evaluate(({ x, y, z, px, py, pz, pitch }) => {
    game.teleport(px, py, pz);
    game.setYaw(Math.atan2(x - px, z - pz) + Math.PI);
    game.camera.rotation.x = pitch;
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
  }, { x, y, z, px, py, pz, pitch });
  await page.waitForTimeout(200);
}

if (extraDir) {
  mkdirSync(extraDir, { recursive: true });

  const tree = await page.evaluate(() => {
    const s = game.spawn;
    const pts = game.treePts || [];
    let best = null, bestD = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d > 6 && d < bestD) { best = p; bestD = d; }
    }
    if (!best) return { x: s.x + 8, z: s.z + 6, y: game.groundHeight(s.x + 8, s.z + 6) };
    return { x: best.x, z: best.z, y: best.y };
  });
  await lookAt(tree.x, tree.y + 6.5, tree.z, tree.x - 7.5, tree.y + 0.2, tree.z + 9.5, 0.12);
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
  await save(`${extraDir}/grass_shore.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    const y = game.groundHeight(p.x, p.z);
    game.teleport(p.x, y + 26, p.z);
    game.camera.rotation.x = -1.12;
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
  });
  await page.waitForTimeout(200);
  await save(`${extraDir}/grass_aerial.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    const y = game.groundHeight(p.x, p.z);
    game.teleport(p.x, y + 22, p.z);
    game.camera.rotation.x = -0.18;
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
  });
  await page.waitForTimeout(200);
  await save(`${extraDir}/grass_airborne.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    game.teleport(p.x, game.groundHeight(p.x, p.z), p.z);
    game.camera.rotation.x = 0.92;
    if (game.groundCover) game.groundCover.update(0, game.camera.position);
    game.renderer.render(game.scene, game.camera);
  });
  await page.waitForTimeout(250);
  await save(`${extraDir}/sky_up.png`);

  await page.evaluate(() => {
    const p = game.spawn;
    game.teleport(p.x, game.groundHeight(p.x, p.z) + 1.2, p.z);
    game.camera.rotation.x = 0.58;
    game.renderer.render(game.scene, game.camera);
  });
  await page.waitForTimeout(200);
  await save(`${extraDir}/clouds.png`);

  const gem = await page.evaluate(() => {
    const d = game.diamonds.find((g) => !g.sky) || game.diamonds[0];
    if (!d) return null;
    return { x: d.x, y: d.y, z: d.z };
  });
  if (gem) {
    await lookAt(gem.x, gem.y, gem.z, gem.x - 2.1, gem.y - 1.25, gem.z + 2.6, -0.02);
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

  const br = await page.evaluate(() => {
    const b = game.bridge;
    if (!b) return null;
    const mx = (b.a.x + b.b.x) / 2, mz = (b.a.z + b.b.z) / 2;
    return {
      ax: b.a.x, ay: b.a.y, az: b.a.z,
      bx: b.b.x, by: b.b.y, bz: b.b.z,
      mx, mz, my: game.groundHeight(mx, mz),
      L: b.L,
    };
  });
  if (br) {
    const sideX = -(br.bz - br.az), sideZ = (br.bx - br.ax);
    const sl = Math.hypot(sideX, sideZ) || 1;
    const camX = br.ax + (br.bx - br.ax) * -0.06 + (sideX / sl) * 7.2;
    const camZ = br.az + (br.bz - br.az) * -0.06 + (sideZ / sl) * 7.2;
    const lookX = br.ax + (br.bx - br.ax) * 0.62;
    const lookZ = br.az + (br.bz - br.az) * 0.62;
    await lookAt(lookX, Math.max(br.my, 1.4), lookZ, camX, br.ay + 1.35, camZ, -0.08);
    await save(`${extraDir}/vine_bridge.png`);
    await page.evaluate(() => {
      const p = game.spawn;
      game.teleport(p.x, game.groundHeight(p.x, p.z), p.z);
      game.camera.rotation.x = -0.06;
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${extraDir}/hud.png`, timeout: 60000 });
    console.log('wrote', `${extraDir}/hud.png`);

    await page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      overlay.classList.add('ready');
      overlay.classList.remove('hidden');
      document.getElementById('sub').textContent = 'Paused';
      document.getElementById('start').textContent = 'Click to resume';
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${extraDir}/pause_card.png`, timeout: 60000 });
    await page.evaluate(() => document.getElementById('overlay').classList.add('hidden'));
    console.log('wrote', `${extraDir}/pause_card.png`);

    await page.evaluate(() => {
      const canvas = document.getElementById('game');
      if (canvas) canvas.style.visibility = 'hidden';
      const l = document.getElementById('loader');
      l.classList.remove('hidden');
      document.getElementById('loader-fill').style.width = '58%';
      document.getElementById('loader-pct').textContent = '58%';
    });
    await page.screenshot({ path: `${extraDir}/loading.png`, timeout: 120000 });
    await page.evaluate(() => {
      document.getElementById('loader').classList.add('hidden');
      const canvas = document.getElementById('game');
      if (canvas) canvas.style.visibility = 'visible';
    });
    console.log('wrote', `${extraDir}/loading.png`);

    const walk = await page.evaluate(({ br }) => {
      const x0 = br.ax + (br.bx - br.ax) * 0.18;
      const z0 = br.az + (br.bz - br.az) * 0.18;
      const y0 = game.groundHeight(x0, z0);
      game.teleport(x0, y0, z0);
      const yaw = Math.atan2(br.bx - br.ax, br.bz - br.az) + Math.PI;
      game.setYaw(yaw);
      game.simulate(4.5, { KeyW: true });
      const p = game.player.pos;
      const on = game.groundHeight(p.x, p.z);
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), on: +on.toFixed(2) };
    }, { br });
    console.log('bridge walk', JSON.stringify(walk));
    if (walk.y < 0.4) errors.push(`[assert] fell off bridge while walking ${JSON.stringify(walk)}`);

    const drown = await page.evaluate(({ br }) => {
      const mx = br.mx, mz = br.mz;
      const sideX = -(br.bz - br.az), sideZ = (br.bx - br.ax);
      const sl = Math.hypot(sideX, sideZ) || 1;
      game.teleport(mx + (sideX / sl) * 4.5, 2.2, mz + (sideZ / sl) * 4.5);
      for (let i = 0; i < 180; i++) game.simulate(1 / 60, {});
      const p = game.player.pos;
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), terrain: +game.terrainHeight(p.x, p.z).toFixed(2) };
    }, { br });
    console.log('drown/respawn', JSON.stringify(drown));
    if (drown.terrain < 0.8) errors.push(`[assert] drown did not respawn on shore ${JSON.stringify(drown)}`);
  } else {
    errors.push('[assert] no bridge for shots');
  }

  console.log('placed', JSON.stringify({ shore, gem, pad, br }));
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
