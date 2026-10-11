import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto('http://127.0.0.1:4173/?debug');
await page.waitForFunction(() => window.__ready === true);
const r = await page.evaluate(() => {
  const g = game, P = g.player, out = {};
  const r0 = g.ramps[0];
  // stand just before ramp 0, face up the ramp (forward = -Z rotated by yaw; ramp dir = (sin yaw, cos yaw))
  const back = 3;
  P.pos.set(r0.sx - Math.sin(r0.yaw) * back, 0, r0.sz - Math.cos(r0.yaw) * back);
  P.pos.y = g.groundHeight(P.pos.x, P.pos.z); P.vel.set(0, 0, 0); P.onGround = true;
  g.setYaw(r0.yaw + Math.PI); g.camera.rotation.x = 0;
  const startY = P.pos.y;
  g.simulate(3.2, { KeyW: true });
  out.ramp = { startY: +startY.toFixed(2), afterY: +P.pos.y.toFixed(2), topY: +(r0.base + r0.rise).toFixed(2), onGround: P.onGround };
  // jump
  g.simulate(0.3, {});
  const gy = P.pos.y; let maxY = gy;
  g.keys.Space = true; g.simulate(1 / 60, {}); g.keys.Space = false;
  for (let i = 0; i < 120; i++) { g.simulate(1 / 120, {}); maxY = Math.max(maxY, P.pos.y); }
  out.jump = { peak: +(maxY - gy).toFixed(2), landed: P.onGround, endDelta: +(P.pos.y - gy).toFixed(2) };
  // walk toward the sea for 60s: must stop at the shoreline
  P.pos.set(g.spawn.x, 0, g.spawn.z); P.pos.y = g.groundHeight(P.pos.x, P.pos.z); P.vel.set(0,0,0);
  const ang = Math.atan2(g.spawn.x, g.spawn.z); g.setYaw(ang + Math.PI);
  g.simulate(60, { KeyW: true, ShiftLeft: true });
  out.shore = { pos: P.pos.toArray().map(v => +v.toFixed(1)), terrain: +g.terrainHeight(P.pos.x, P.pos.z).toFixed(2) };
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
